import { MAX_BATCH_SIZE, type AnalyticsEvent } from '../../shared/analyticsEvent';
import type { EventQueueStorage } from '../../core/storage/EventQueueStorage';
import type { AnalyticsSink } from './AnalyticsSink';

type HttpBatchSinkOptions = {
  endpoint: string;
  storage: EventQueueStorage;
  /** How long to wait for more events before sending a batch. */
  flushIntervalMs?: number;
  /** Send immediately once this many events are waiting. */
  maxBatchSize?: number;
  /** Oldest events are dropped beyond this, so a dead backend cannot grow storage forever. */
  maxQueueSize?: number;
  maxRetryDelayMs?: number;
  /** A request that takes longer is aborted and treated as a failure, so a stalled network cannot block the queue. */
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sendBeacon?: (url: string, data: Blob) => boolean;
};

const IMMEDIATE_EVENTS: ReadonlySet<AnalyticsEvent['name']> = new Set(['run_end']);

/**
 * Queues events, persists the queue, and sends it in batches. Normal sends
 * remove an event only after the server has accepted it, so a failed request
 * delays events instead of losing them. The page-hide path (`flush`) is the
 * exception: a beacon is removed once the browser accepts it, which does not
 * confirm the server received it. A closed tab can still lose those events.
 * The backend de-duplicates on eventId, which makes resending safe.
 */
export class HttpBatchSink implements AnalyticsSink {
  private queue: AnalyticsEvent[];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt = 0;
  private sending = false;
  private failures = 0;

  private readonly endpoint: string;
  private readonly storage: EventQueueStorage;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly maxRetryDelayMs: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sendBeacon: ((url: string, data: Blob) => boolean) | null;

  constructor(options: HttpBatchSinkOptions) {
    this.endpoint = options.endpoint;
    this.storage = options.storage;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.maxBatchSize = Math.min(MAX_BATCH_SIZE, options.maxBatchSize ?? 20);
    this.maxQueueSize = options.maxQueueSize ?? 500;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 60_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.sendBeacon =
      options.sendBeacon ??
      (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
        ? (url, data) => navigator.sendBeacon(url, data)
        : null);

    // Events left over from a previous page load that never made it out.
    this.queue = this.storage.load();
    if (this.queue.length > 0) this.schedule(0);
  }

  track(event: AnalyticsEvent): void {
    this.queue.push(event);
    if (this.queue.length > this.maxQueueSize) this.queue.splice(0, this.queue.length - this.maxQueueSize);
    this.storage.save(this.queue);

    // While retrying after a failure, the backoff timer owns the next attempt. Moving it
    // earlier on every new event would hammer a server that is already failing.
    if (this.failures > 0) return;

    if (IMMEDIATE_EVENTS.has(event.name) || this.queue.length >= this.maxBatchSize) {
      this.schedule(0);
    } else {
      this.schedule(this.flushIntervalMs);
    }
  }

  /** Synchronous best-effort send for page hide; nothing else is guaranteed to run afterwards. */
  flush(): void {
    if (this.queue.length === 0) return;
    this.clearTimer();

    if (this.sendBeacon) {
      const batch = this.queue.slice(0, MAX_BATCH_SIZE);
      try {
        if (this.sendBeacon(this.endpoint, this.toBlob(batch))) {
          this.remove(batch);
          return;
        }
      } catch {
        // Fall through to a keepalive fetch.
      }
    }

    void this.send(true);
  }

  /** Number of events waiting to be delivered. */
  get pending(): number {
    return this.queue.length;
  }

  private schedule(delayMs: number): void {
    if (this.sending) return;
    const dueAt = Date.now() + delayMs;
    // A sooner flush request replaces a later pending timer, never the reverse.
    if (this.timer !== null && this.timerDueAt <= dueAt) return;
    this.clearTimer();
    this.timerDueAt = dueAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send(false);
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async send(keepalive: boolean): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    this.sending = true;
    const batch = this.queue.slice(0, this.maxBatchSize);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        // text/plain keeps this a "simple" request, so no CORS preflight is needed.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ events: batch }),
        keepalive,
        signal: abort.signal
      });

      if (response.ok || this.isPermanentRejection(response.status)) {
        // A permanently rejected batch will never succeed; drop it rather than retry forever.
        this.remove(batch);
        this.failures = 0;
      } else {
        this.failures += 1;
      }
    } catch {
      this.failures += 1;
    } finally {
      clearTimeout(timeout);
      this.sending = false;
    }

    if (this.queue.length === 0) return;
    if (this.failures > 0) {
      this.schedule(Math.min(this.maxRetryDelayMs, this.flushIntervalMs * 2 ** (this.failures - 1)));
    } else {
      this.schedule(this.queue.length >= this.maxBatchSize ? 0 : this.flushIntervalMs);
    }
  }

  private isPermanentRejection(status: number): boolean {
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }

  private remove(sent: AnalyticsEvent[]): void {
    const sentIds = new Set(sent.map((event) => event.eventId));
    this.queue = this.queue.filter((event) => !sentIds.has(event.eventId));
    this.storage.save(this.queue);
  }

  private toBlob(batch: AnalyticsEvent[]): Blob {
    return new Blob([JSON.stringify({ events: batch })], { type: 'text/plain;charset=UTF-8' });
  }
}

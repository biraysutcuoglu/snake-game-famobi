import { MAX_BATCH_SIZE, validateAnalyticsEvent, type AnalyticsEvent } from './shared/analyticsEvent';

export type SaveResult = { stored: number; duplicates: number };

/** Persistence port, so the request logic can be tested without Firestore. */
export type EventStore = {
  save(events: AnalyticsEvent[]): Promise<SaveResult>;
};

export type CollectRequest = { method: string; body: unknown };
export type CollectResponse = { status: number; body: Record<string, unknown> };

/**
 * The game sends text/plain (to avoid a CORS preflight and to work with
 * sendBeacon), so the body may arrive as a string or as parsed JSON.
 */
const parseBody = (body: unknown): unknown => {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

export const handleCollectEvents = async (
  request: CollectRequest,
  store: EventStore,
  now: number = Date.now()
): Promise<CollectResponse> => {
  if (request.method !== 'POST') {
    return { status: 405, body: { error: 'Use POST' } };
  }

  const payload = parseBody(request.body);
  const events = (payload as { events?: unknown } | undefined)?.events;
  if (!Array.isArray(events)) {
    return { status: 400, body: { error: 'Body must be {"events": [...]}' } };
  }
  if (events.length === 0) {
    return { status: 200, body: { accepted: 0, rejected: 0, duplicates: 0 } };
  }
  if (events.length > MAX_BATCH_SIZE) {
    return { status: 413, body: { error: `At most ${MAX_BATCH_SIZE} events per request` } };
  }

  const valid: AnalyticsEvent[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  events.forEach((item, index) => {
    const result = validateAnalyticsEvent(item, now);
    if (result.ok) valid.push(result.event);
    else errors.push({ index, error: result.error });
  });

  const { stored, duplicates } = valid.length > 0 ? await store.save(valid) : { stored: 0, duplicates: 0 };

  // Invalid events are reported but never fail the batch; retrying cannot fix them.
  return {
    status: 200,
    body: { accepted: stored, duplicates, rejected: errors.length, ...(errors.length > 0 ? { errors } : {}) }
  };
};

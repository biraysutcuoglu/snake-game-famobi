import type { AnalyticsEvent, RunOutcome } from '../../shared/analyticsEvent';
import type { GameController } from '../GameController';
import type { AnalyticsSink } from './AnalyticsSink';

type ActiveRun = {
  runId: string;
  level: number;
  startedAt: number;
  score: number;
  progress: number;
  paused: boolean;
};

type CollectorOptions = {
  now?: () => number;
  createId?: () => string;
};

const defaultCreateId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Translates controller events into analytics events. It only observes the
 * controller; a failing sink can never affect gameplay.
 */
export class AnalyticsCollector {
  readonly sessionId: string;

  private activeRun: ActiveRun | null = null;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(
    private readonly sink: AnalyticsSink,
    options: CollectorOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? defaultCreateId;
    this.sessionId = this.createId();
  }

  connect(controller: GameController): () => void {
    const subscriptions = [
      controller.events.on('ready', (event) => {
        this.track({ name: 'session_start', timestamp: event.occurredAt });
      }),
      controller.events.on('runStarted', (event) => {
        this.activeRun = {
          runId: `${this.sessionId}-${event.runNumber}`,
          level: event.level,
          startedAt: event.occurredAt,
          score: 0,
          progress: 0,
          paused: false
        };
        this.track({
          name: 'run_start',
          timestamp: event.occurredAt,
          runId: this.activeRun.runId,
          level: event.level
        });
      }),
      controller.events.on('scoreChanged', (event) => {
        const run = this.activeRun;
        if (!run) return;
        run.score = event.score;
        // Score resets to 0 when a run begins; only record gains.
        if (event.delta <= 0) return;
        this.track({ name: 'score_update', runId: run.runId, level: event.level, score: event.score });
      }),
      controller.events.on('progressChanged', (event) => {
        if (this.activeRun) this.activeRun.progress = event.progress;
      }),
      controller.events.on('pauseChanged', (event) => {
        const run = this.activeRun;
        if (!run || run.paused === event.paused) return;
        run.paused = event.paused;
        this.track({
          name: event.paused ? 'run_pause' : 'run_resume',
          runId: run.runId,
          level: run.level,
          ...(event.source ? { pauseSource: event.source } : {})
        });
      }),
      controller.events.on('runEnded', (event) => {
        const run = this.activeRun;
        this.activeRun = null;
        this.track({
          name: 'run_end',
          timestamp: event.occurredAt,
          runId: run?.runId,
          level: event.level,
          outcome: event.reason,
          ...(event.failureReason ? { failureReason: event.failureReason } : {}),
          score: event.score,
          progress: event.progress,
          durationMs: event.durationMs
        });
      })
    ];

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }

  /**
   * Call when the page is going away. If a run is in progress the controller
   * will never report its end, so record it as quit here.
   */
  abandonActiveRun(): void {
    const run = this.activeRun;
    if (!run) return;
    this.activeRun = null;
    const timestamp = this.now();
    this.track({
      name: 'run_end',
      timestamp,
      runId: run.runId,
      level: run.level,
      outcome: 'quit' satisfies RunOutcome,
      score: run.score,
      progress: run.progress,
      durationMs: Math.max(0, timestamp - run.startedAt)
    });
  }

  private track(
    partial: Omit<AnalyticsEvent, 'eventId' | 'sessionId' | 'timestamp'> & { timestamp?: number }
  ): void {
    const event: AnalyticsEvent = {
      ...partial,
      eventId: this.createId(),
      sessionId: this.sessionId,
      timestamp: partial.timestamp ?? this.now()
    };
    try {
      this.sink.track(event);
    } catch (error) {
      console.error('Analytics sink failed', error);
    }
  }
}

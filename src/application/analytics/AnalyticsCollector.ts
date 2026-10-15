import type { RunDocument, RunStatus, SessionDocument } from '../../shared/analyticsDocument';
import type { GameSnapshot } from '../../game/types';
import type { GameController } from '../GameController';
import type { AnalyticsClient } from './AnalyticsClient';

type CollectorOptions = {
  now?: () => number;
  createId?: () => string;
};

const defaultCreateId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        const value = character === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
      });

const statusFor = (
  outcome: 'complete' | 'fail' | 'quit',
  failureReason: GameSnapshot['failureReason']
): RunStatus => {
  if (outcome === 'complete') return 'SUCCESS';
  if (outcome === 'quit' || failureReason === 'external') return 'QUIT';
  if (failureReason === 'snake') return 'FAIL_SELF';
  // Static obstacles are treated as walls by the new storage contract.
  return 'FAIL_WALL';
};

/**
 * Observes controller events and projects them into Firestore-ready session
 * and run documents. A failing analytics client can never affect gameplay.
 */
export class AnalyticsCollector {
  readonly sessionId: string;

  private session: SessionDocument | null = null;
  private activeRun: RunDocument | null = null;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(
    private readonly client: AnalyticsClient,
    options: CollectorOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? defaultCreateId;
    this.sessionId = this.createId();
  }

  connect(controller: GameController): () => void {
    const subscriptions = [
      controller.events.on('ready', (event) => {
        if (this.session) return;
        this.session = {
          sessionId: this.sessionId,
          startTime: event.occurredAt,
          endTime: null,
          runsPlayed: 0
        };
        this.emitSession(this.session);
      }),
      controller.events.on('runStarted', (event) => {
        this.activeRun = {
          sessionId: this.sessionId,
          runId: this.createId(),
          level: event.level,
          startTime: event.occurredAt,
          endTime: null,
          score: event.score,
          status: 'IN_PROGRESS'
        };
        this.emitRun(this.activeRun);
      }),
      controller.events.on('scoreChanged', (event) => {
        if (this.activeRun) this.activeRun.score = event.score;
      }),
      // Keep observing the full game lifecycle. These events do not add fields
      // to the current Firestore document shapes.
      controller.events.on('progressChanged', () => {}),
      controller.events.on('pauseChanged', () => {}),
      controller.events.on('runEnded', (event) => {
        this.finishRun(event.occurredAt, event.score, statusFor(event.reason, event.failureReason));
      })
    ];

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }

  /** Finalizes an active run and the session when the page is going away. */
  endSession(): void {
    const endTime = this.now();
    if (this.activeRun) this.finishRun(endTime, this.activeRun.score, 'QUIT');
    if (!this.session || this.session.endTime !== null) return;

    this.session.endTime = endTime;
    this.emitSession(this.session);
  }

  private finishRun(endTime: number, score: number, status: RunStatus): void {
    const run = this.activeRun;
    if (!run) return;

    this.activeRun = null;
    run.endTime = endTime;
    run.score = score;
    run.status = status;
    this.emitRun(run);

    if (this.session) {
      this.session.runsPlayed += 1;
      this.emitSession(this.session);
    }
  }

  private emitSession(session: SessionDocument): void {
    try {
      this.client.trackSession({ ...session });
    } catch (error) {
      console.error('Analytics client failed', error);
    }
  }

  private emitRun(run: RunDocument): void {
    try {
      this.client.trackRun({ ...run });
    } catch (error) {
      console.error('Analytics client failed', error);
    }
  }
}

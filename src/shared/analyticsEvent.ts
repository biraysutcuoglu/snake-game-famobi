// Shared by the game and the analytics backend. Keep this file free of imports.

export const ANALYTICS_EVENT_NAMES = [
  'session_start',
  'run_start',
  'run_end',
  'run_pause',
  'run_resume',
  'score_update'
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type RunOutcome = 'complete' | 'fail' | 'quit';
export type FailureReason = 'wall' | 'snake' | 'obstacle' | 'external';

export type AnalyticsEvent = {
  /** Unique per event; the backend uses it as the document id so retries are idempotent. */
  eventId: string;
  name: AnalyticsEventName;
  /** Epoch ms on the player's clock, when the activity happened. */
  timestamp: number;
  /** One per page load. */
  sessionId: string;
  /** Links run_start to run_end. Absent for session-level events. */
  runId?: string;
  level?: number;
  /** run_end only. */
  outcome?: RunOutcome;
  failureReason?: FailureReason;
  /** run_end and score_update. */
  score?: number;
  /** 0..1, run_end only. */
  progress?: number;
  /** Elapsed time of the run, run_end only. */
  durationMs?: number;
  /** run_pause and run_resume. */
  pauseSource?: 'player' | 'system';
};

export type AnalyticsEventBatch = { events: AnalyticsEvent[] };

export const MAX_BATCH_SIZE = 100;

const OUTCOMES: readonly string[] = ['complete', 'fail', 'quit'];
const FAILURES: readonly string[] = ['wall', 'snake', 'obstacle', 'external'];
const PAUSE_SOURCES: readonly string[] = ['player', 'system'];

const isString = (value: unknown, maxLength = 128): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export type ValidationResult = { ok: true; event: AnalyticsEvent } | { ok: false; error: string };

/** Validates untrusted input and returns a copy containing only known fields. */
export const validateAnalyticsEvent = (input: unknown): ValidationResult => {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'event must be an object' };
  const raw = input as Record<string, unknown>;

  if (!isString(raw.eventId)) return { ok: false, error: 'eventId is required' };
  if (!ANALYTICS_EVENT_NAMES.includes(raw.name as AnalyticsEventName)) {
    return { ok: false, error: 'unknown event name' };
  }
  if (!isFiniteNumber(raw.timestamp) || raw.timestamp <= 0) return { ok: false, error: 'invalid timestamp' };
  if (!isString(raw.sessionId)) return { ok: false, error: 'sessionId is required' };

  const event: AnalyticsEvent = {
    eventId: raw.eventId,
    name: raw.name as AnalyticsEventName,
    timestamp: raw.timestamp,
    sessionId: raw.sessionId
  };

  if (raw.runId !== undefined) {
    if (!isString(raw.runId)) return { ok: false, error: 'invalid runId' };
    event.runId = raw.runId;
  }
  if (raw.level !== undefined) {
    if (!isFiniteNumber(raw.level) || !Number.isInteger(raw.level) || raw.level < 1) {
      return { ok: false, error: 'invalid level' };
    }
    event.level = raw.level;
  }
  if (raw.outcome !== undefined) {
    if (!OUTCOMES.includes(raw.outcome as string)) return { ok: false, error: 'invalid outcome' };
    event.outcome = raw.outcome as RunOutcome;
  }
  if (raw.failureReason !== undefined) {
    if (!FAILURES.includes(raw.failureReason as string)) return { ok: false, error: 'invalid failureReason' };
    event.failureReason = raw.failureReason as FailureReason;
  }
  if (raw.score !== undefined) {
    if (!isFiniteNumber(raw.score) || raw.score < 0) return { ok: false, error: 'invalid score' };
    event.score = raw.score;
  }
  if (raw.progress !== undefined) {
    if (!isFiniteNumber(raw.progress) || raw.progress < 0 || raw.progress > 1) {
      return { ok: false, error: 'invalid progress' };
    }
    event.progress = raw.progress;
  }
  if (raw.durationMs !== undefined) {
    if (!isFiniteNumber(raw.durationMs) || raw.durationMs < 0) return { ok: false, error: 'invalid durationMs' };
    event.durationMs = raw.durationMs;
  }
  if (raw.pauseSource !== undefined) {
    if (!PAUSE_SOURCES.includes(raw.pauseSource as string)) return { ok: false, error: 'invalid pauseSource' };
    event.pauseSource = raw.pauseSource as 'player' | 'system';
  }

  return { ok: true, event };
};

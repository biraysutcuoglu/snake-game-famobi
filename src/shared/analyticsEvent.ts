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

/** Queued events may be sent long after they happened, but not indefinitely. */
export const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Tolerated player clock skew into the future. */
export const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;

const OUTCOMES: readonly string[] = ['complete', 'fail', 'quit'];
const FAILURES: readonly string[] = ['wall', 'snake', 'obstacle', 'external'];
const PAUSE_SOURCES: readonly string[] = ['player', 'system'];

/**
 * Ids end up in Firestore document ids, so '/', '.', '..' and '__x__' must
 * never get through. A conservative charset covers UUIDs and the fallback ids.
 */
const ID_PATTERN = /^(?!__.*__$)[A-Za-z0-9_-]{1,128}$/;
const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export type ValidationResult = { ok: true; event: AnalyticsEvent } | { ok: false; error: string };

type OptionalField = Exclude<keyof AnalyticsEvent, 'eventId' | 'name' | 'timestamp' | 'sessionId'>;

const OPTIONAL_FIELDS: readonly OptionalField[] = [
  'runId',
  'level',
  'outcome',
  'failureReason',
  'score',
  'progress',
  'durationMs',
  'pauseSource'
];

/** Which optional fields each event must carry and which it may carry. */
const FIELD_RULES: Record<AnalyticsEventName, { required: OptionalField[]; allowed: OptionalField[] }> = {
  session_start: { required: [], allowed: [] },
  run_start: { required: ['runId', 'level'], allowed: [] },
  run_end: {
    required: ['runId', 'level', 'outcome', 'score', 'progress', 'durationMs'],
    allowed: ['failureReason']
  },
  run_pause: { required: ['runId', 'level'], allowed: ['pauseSource'] },
  run_resume: { required: ['runId', 'level'], allowed: ['pauseSource'] },
  score_update: { required: ['runId', 'level', 'score'], allowed: [] }
};

const checkConsistency = (event: AnalyticsEvent): string | null => {
  const rules = FIELD_RULES[event.name];
  for (const field of rules.required) {
    if (event[field] === undefined) return `${field} is required for ${event.name}`;
  }
  for (const field of OPTIONAL_FIELDS) {
    if (event[field] !== undefined && !rules.required.includes(field) && !rules.allowed.includes(field)) {
      return `${field} is not allowed for ${event.name}`;
    }
  }
  if (event.failureReason !== undefined && event.outcome !== 'fail') {
    return 'failureReason requires outcome "fail"';
  }
  return null;
};

/**
 * Validates untrusted input and returns a copy containing only known fields.
 * `now` anchors the timestamp window; pass it to keep a batch consistent.
 */
export const validateAnalyticsEvent = (input: unknown, now: number = Date.now()): ValidationResult => {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'event must be an object' };
  const raw = input as Record<string, unknown>;

  if (!isId(raw.eventId)) return { ok: false, error: 'invalid eventId' };
  if (!ANALYTICS_EVENT_NAMES.includes(raw.name as AnalyticsEventName)) {
    return { ok: false, error: 'unknown event name' };
  }
  if (!isFiniteNumber(raw.timestamp)) return { ok: false, error: 'invalid timestamp' };
  if (raw.timestamp < now - MAX_EVENT_AGE_MS || raw.timestamp > now + MAX_FUTURE_SKEW_MS) {
    return { ok: false, error: 'timestamp out of range' };
  }
  if (!isId(raw.sessionId)) return { ok: false, error: 'invalid sessionId' };

  const event: AnalyticsEvent = {
    eventId: raw.eventId,
    name: raw.name as AnalyticsEventName,
    timestamp: raw.timestamp,
    sessionId: raw.sessionId
  };

  if (raw.runId !== undefined) {
    if (!isId(raw.runId)) return { ok: false, error: 'invalid runId' };
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

  const inconsistency = checkConsistency(event);
  if (inconsistency) return { ok: false, error: inconsistency };

  return { ok: true, event };
};

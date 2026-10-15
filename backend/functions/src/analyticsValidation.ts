import type { AnalyticsRequest, TerminalRunStatus } from './shared/analyticsRequest';

const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES: readonly TerminalRunStatus[] = [
  'SUCCESS',
  'FAIL_WALL',
  'FAIL_SELF',
  'QUIT'
];

export type ValidationResult =
  | { ok: true; request: AnalyticsRequest }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactly = (value: Record<string, unknown>, fields: readonly string[]): boolean => {
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
};

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_V4.test(value);
const isTimestamp = (value: unknown, now: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= now + MAX_FUTURE_SKEW_MS;
const isScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isLevel = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const isTerminalStatus = (value: unknown): value is TerminalRunStatus =>
  TERMINAL_STATUSES.includes(value as TerminalRunStatus);

export const validateAnalyticsRequest = (input: unknown, now: number = Date.now()): ValidationResult => {
  if (!isRecord(input)) return { ok: false, error: 'Body must be an object' };
  if (typeof input.type !== 'string') return { ok: false, error: 'type is required' };

  if (!isUuid(input.sessionId)) return { ok: false, error: 'sessionId must be a UUID v4' };

  switch (input.type) {
    case 'SESSION_STARTED': {
      if (!hasExactly(input, ['type', 'sessionId', 'startTime'])) {
        return { ok: false, error: 'Invalid fields for SESSION_STARTED' };
      }
      if (!isTimestamp(input.startTime, now)) return { ok: false, error: 'Invalid startTime' };
      return { ok: true, request: { type: input.type, sessionId: input.sessionId, startTime: input.startTime } };
    }

    case 'SESSION_ENDED': {
      if (!hasExactly(input, ['type', 'sessionId', 'startTime', 'endTime'])) {
        return { ok: false, error: 'Invalid fields for SESSION_ENDED' };
      }
      if (!isTimestamp(input.startTime, now)) return { ok: false, error: 'Invalid startTime' };
      if (!isTimestamp(input.endTime, now) || input.endTime < input.startTime) {
        return { ok: false, error: 'endTime must be at or after startTime' };
      }
      return {
        ok: true,
        request: {
          type: input.type,
          sessionId: input.sessionId,
          startTime: input.startTime,
          endTime: input.endTime
        }
      };
    }

    case 'RUN_STARTED': {
      if (!hasExactly(input, ['type', 'sessionId', 'sessionStartTime', 'runId', 'level', 'startTime', 'score'])) {
        return { ok: false, error: 'Invalid fields for RUN_STARTED' };
      }
      if (!isUuid(input.runId)) return { ok: false, error: 'runId must be a UUID v4' };
      if (!isLevel(input.level)) return { ok: false, error: 'Invalid level' };
      if (!isTimestamp(input.sessionStartTime, now)) return { ok: false, error: 'Invalid sessionStartTime' };
      if (!isTimestamp(input.startTime, now) || input.startTime < input.sessionStartTime) {
        return { ok: false, error: 'run startTime must be at or after sessionStartTime' };
      }
      if (!isScore(input.score)) return { ok: false, error: 'Invalid score' };
      return {
        ok: true,
        request: {
          type: input.type,
          sessionId: input.sessionId,
          sessionStartTime: input.sessionStartTime,
          runId: input.runId,
          level: input.level,
          startTime: input.startTime,
          score: input.score
        }
      };
    }

    case 'RUN_ENDED': {
      if (
        !hasExactly(input, [
          'type',
          'sessionId',
          'sessionStartTime',
          'runId',
          'level',
          'startTime',
          'endTime',
          'score',
          'status'
        ])
      ) {
        return { ok: false, error: 'Invalid fields for RUN_ENDED' };
      }
      if (!isUuid(input.runId)) return { ok: false, error: 'runId must be a UUID v4' };
      if (!isLevel(input.level)) return { ok: false, error: 'Invalid level' };
      if (!isTimestamp(input.sessionStartTime, now)) return { ok: false, error: 'Invalid sessionStartTime' };
      if (!isTimestamp(input.startTime, now) || input.startTime < input.sessionStartTime) {
        return { ok: false, error: 'run startTime must be at or after sessionStartTime' };
      }
      if (!isTimestamp(input.endTime, now) || input.endTime < input.startTime) {
        return { ok: false, error: 'endTime must be at or after startTime' };
      }
      if (!isScore(input.score)) return { ok: false, error: 'Invalid score' };
      if (!isTerminalStatus(input.status)) return { ok: false, error: 'Invalid terminal status' };
      return {
        ok: true,
        request: {
          type: input.type,
          sessionId: input.sessionId,
          sessionStartTime: input.sessionStartTime,
          runId: input.runId,
          level: input.level,
          startTime: input.startTime,
          endTime: input.endTime,
          score: input.score,
          status: input.status
        }
      };
    }

    default:
      return { ok: false, error: 'Unknown analytics event type' };
  }
};

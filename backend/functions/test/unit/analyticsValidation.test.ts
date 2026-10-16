import { describe, expect, it } from 'vitest';

import { validateAnalyticsRequest } from '../../src/analyticsValidation';

const NOW = 2_000_000;
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';

describe('validateAnalyticsRequest', () => {
  it.each([
    { type: 'SESSION_STARTED', sessionId: SESSION_ID, startTime: 100 },
    { type: 'SESSION_ENDED', sessionId: SESSION_ID, startTime: 100, endTime: 200 },
    {
      type: 'RUN_STARTED',
      sessionId: SESSION_ID,
      sessionStartTime: 100,
      runId: RUN_ID,
      level: 2,
      startTime: 120,
      score: 0
    },
    {
      type: 'RUN_ENDED',
      sessionId: SESSION_ID,
      sessionStartTime: 100,
      runId: RUN_ID,
      level: 2,
      startTime: 120,
      endTime: 200,
      score: 10,
      status: 'SUCCESS'
    }
  ])('accepts $type', (request) => {
    expect(validateAnalyticsRequest(request, NOW)).toEqual({ ok: true, request });
  });

  it.each([
    [{}, 'type is required'],
    [{ type: 'OTHER', sessionId: SESSION_ID }, 'Unknown analytics event type'],
    [{ type: 'SESSION_STARTED', sessionId: 'not-a-uuid', startTime: 100 }, 'sessionId must be a UUID v4'],
    [{ type: 'SESSION_STARTED', sessionId: SESSION_ID, startTime: 100, extra: true }, 'Invalid fields'],
    [{ type: 'SESSION_ENDED', sessionId: SESSION_ID, startTime: 200, endTime: 100 }, 'endTime'],
    [
      {
        type: 'RUN_STARTED',
        sessionId: SESSION_ID,
        sessionStartTime: 200,
        runId: RUN_ID,
        level: 2,
        startTime: 100,
        score: 0
      },
      'run startTime'
    ],
    [
      {
        type: 'RUN_ENDED',
        sessionId: SESSION_ID,
        sessionStartTime: 100,
        runId: RUN_ID,
        level: 2,
        startTime: 120,
        endTime: 200,
        score: 10,
        status: 'IN_PROGRESS'
      },
      'terminal status'
    ]
  ])('rejects invalid input', (request, error) => {
    const result = validateAnalyticsRequest(request, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(error);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { AnalyticsConflictError, handleCollectAnalytics, type AnalyticsStore } from './handler';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const request = { type: 'SESSION_STARTED' as const, sessionId: SESSION_ID, startTime: 100 };

describe('handleCollectAnalytics', () => {
  it('rejects non-POST requests without touching the store', async () => {
    const store: AnalyticsStore = { apply: vi.fn() };
    expect(await handleCollectAnalytics({ method: 'GET', body: request }, store, 1000)).toEqual({
      status: 405,
      body: { error: 'Use POST' }
    });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('parses text/plain JSON and returns created', async () => {
    const store: AnalyticsStore = { apply: vi.fn().mockResolvedValue('created') };
    const response = await handleCollectAnalytics(
      { method: 'POST', body: JSON.stringify(request) },
      store,
      1000
    );
    expect(response).toEqual({ status: 201, body: { accepted: true, result: 'created' } });
    expect(store.apply).toHaveBeenCalledWith(request);
  });

  it('returns 400 for malformed input', async () => {
    const store: AnalyticsStore = { apply: vi.fn() };
    const response = await handleCollectAnalytics({ method: 'POST', body: '{' }, store, 1000);
    expect(response.status).toBe(400);
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('returns 409 for storage conflicts', async () => {
    const store: AnalyticsStore = {
      apply: vi.fn().mockRejectedValue(new AnalyticsConflictError('conflicting session'))
    };
    expect(await handleCollectAnalytics({ method: 'POST', body: request }, store, 1000)).toEqual({
      status: 409,
      body: { accepted: false, error: 'conflicting session' }
    });
  });

  it('lets unexpected failures reach the function error handler', async () => {
    const store: AnalyticsStore = { apply: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(handleCollectAnalytics({ method: 'POST', body: request }, store, 1000)).rejects.toThrow(
      'offline'
    );
  });
});

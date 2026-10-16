import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunDocument, SessionDocument } from '../../../src/shared/analyticsDocument';
import { HttpAnalyticsClient } from '../../../src/application/analytics/AnalyticsClient';

const endpoint = 'http://localhost/collectAnalytics';
const session: SessionDocument = {
  sessionId: '132be1f4-02bb-4534-8488-f6d29bc4ab79',
  startTime: 100,
  endTime: null,
  runsPlayed: 0
};
const run: RunDocument = {
  sessionId: session.sessionId,
  runId: 'f27645e8-05b9-4b1c-b56c-27e726482df4',
  level: 2,
  startTime: 200,
  endTime: null,
  score: 0,
  status: 'IN_PROGRESS'
};

const setup = () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
  return { client: new HttpAnalyticsClient({ endpoint, fetchImpl }), fetchImpl };
};

const requestAt = (fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, index: number) => {
  const [url, init] = fetchImpl.mock.calls[index];
  return { url, init, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HttpAnalyticsClient', () => {
  it('calls the default browser fetch with the global object as its receiver', () => {
    const fetchImpl = vi.fn(function (this: unknown): Promise<Response> {
      return Promise.resolve(new Response(null, { status: 201 }));
    });
    vi.stubGlobal('fetch', fetchImpl);
    const client = new HttpAnalyticsClient({ endpoint });

    client.trackSession(session);

    expect(fetchImpl.mock.contexts[0]).toBe(globalThis);
  });

  it('maps session snapshots to start and end commands', () => {
    const { client, fetchImpl } = setup();

    client.trackSession(session);
    client.trackSession({ ...session, endTime: 900 });

    expect(requestAt(fetchImpl, 0).body).toEqual({
      type: 'SESSION_STARTED',
      sessionId: session.sessionId,
      startTime: 100
    });
    expect(requestAt(fetchImpl, 1).body).toEqual({
      type: 'SESSION_ENDED',
      sessionId: session.sessionId,
      startTime: 100,
      endTime: 900
    });
  });

  it('maps run snapshots to start and end commands with their parent session start', () => {
    const { client, fetchImpl } = setup();
    client.trackSession(session);

    client.trackRun(run);
    client.trackRun({ ...run, endTime: 800, score: 40, status: 'SUCCESS' });

    expect(requestAt(fetchImpl, 1).body).toEqual({
      type: 'RUN_STARTED',
      sessionId: session.sessionId,
      sessionStartTime: 100,
      runId: run.runId,
      level: 2,
      startTime: 200,
      score: 0
    });
    expect(requestAt(fetchImpl, 2).body).toEqual({
      type: 'RUN_ENDED',
      sessionId: session.sessionId,
      sessionStartTime: 100,
      runId: run.runId,
      level: 2,
      startTime: 200,
      endTime: 800,
      score: 40,
      status: 'SUCCESS'
    });
  });

  it('uses an unload-safe request without triggering a CORS preflight', () => {
    const { client, fetchImpl } = setup();

    client.trackSession(session);

    const request = requestAt(fetchImpl, 0);
    expect(request.url).toBe(endpoint);
    expect(request.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true
    });
  });

  it('does not resend session-start commands for runsPlayed-only snapshots', () => {
    const { client, fetchImpl } = setup();

    client.trackSession(session);
    client.trackSession({ ...session, runsPlayed: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not send a run if its session has not been observed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, fetchImpl } = setup();

    client.trackRun(run);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Cannot send analytics run before its session', run.runId);
  });
});

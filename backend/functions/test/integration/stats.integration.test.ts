import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-neon-snake';
const BASE = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_ONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_TWO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sessionStartTime = Date.now() - 60_000;

const post = (body: unknown) =>
  fetch(`${BASE}/collectAnalytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body)
  });

describe('getStats (emulator)', () => {
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    const db = getFirestore(initializeApp({ projectId: PROJECT }, 'stats-it'));
    const documents = await Promise.all([
      db.collection('sessions').listDocuments(),
      db.collection('runs').listDocuments()
    ]);
    await Promise.all(documents.flat().map((document) => document.delete()));

    await post({ type: 'SESSION_STARTED', sessionId: SESSION_ID, startTime: sessionStartTime });
    await post({
      type: 'RUN_ENDED',
      sessionId: SESSION_ID,
      sessionStartTime,
      runId: RUN_ONE,
      level: 1,
      startTime: sessionStartTime + 1000,
      endTime: sessionStartTime + 21_000,
      score: 120,
      status: 'SUCCESS'
    });
    await post({
      type: 'RUN_ENDED',
      sessionId: SESSION_ID,
      sessionStartTime,
      runId: RUN_TWO,
      level: 2,
      startTime: sessionStartTime + 30_000,
      endTime: sessionStartTime + 40_000,
      score: 40,
      status: 'FAIL_SELF'
    });
    await post({
      type: 'SESSION_ENDED',
      sessionId: SESSION_ID,
      startTime: sessionStartTime,
      endTime: sessionStartTime + 50_000
    });
  });

  it('aggregates the session and run collections', async () => {
    const response = await fetch(`${BASE}/getStats?days=7`);
    expect(response.status).toBe(200);

    const stats = await response.json();
    expect(stats.totals).toMatchObject({
      sessions: 1,
      runs: 2,
      avgRunsPerSession: 2,
      finishedRuns: 2,
      completionRate: 0.5,
      avgSessionDurationMs: 50_000,
      avgScore: 80
    });
    expect(stats.byLevel).toMatchObject([
      { level: 1, avgRunDurationMs: 20_000 },
      { level: 2, avgRunDurationMs: 10_000 }
    ]);
    expect(stats.failureReasons).toEqual({ wall: 0, self: 1 });
    expect(stats.byDay).toHaveLength(7);
    expect(stats.truncated).toBe(false);
  });

  it('rejects invalid ranges and answers CORS preflight', async () => {
    expect((await fetch(`${BASE}/getStats?days=0`)).status).toBe(400);
    const response = await fetch(`${BASE}/getStats`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' }
    });
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});

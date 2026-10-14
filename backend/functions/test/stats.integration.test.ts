// Runs against the Firebase Local Emulator Suite (npm run test:integration).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-neon-snake';
const BASE = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const post = (events: unknown[]) =>
  fetch(`${BASE}/collectEvents`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ events })
  });

const base = { sessionId: 'stats-session', timestamp: Date.now() };

describe('getStats (emulator)', () => {
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    const db = getFirestore(initializeApp({ projectId: PROJECT }, 'stats-it'));
    const existing = await db.collection('analytics_events').listDocuments();
    await Promise.all(existing.map((doc) => doc.delete()));

    await post([
      { ...base, eventId: 'st-1', name: 'run_start', runId: 'st-r1', level: 1 },
      { ...base, eventId: 'st-2', name: 'run_end', runId: 'st-r1', level: 1, outcome: 'complete', score: 120, progress: 1, durationMs: 20_000 },
      { ...base, eventId: 'st-3', name: 'run_start', runId: 'st-r2', level: 2 },
      { ...base, eventId: 'st-4', name: 'run_end', runId: 'st-r2', level: 2, outcome: 'fail', failureReason: 'snake', score: 40, progress: 0.3, durationMs: 10_000 }
    ]);
  });

  it('aggregates events stored through collectEvents', async () => {
    const response = await fetch(`${BASE}/getStats?days=7`);
    expect(response.status).toBe(200);

    const stats = await response.json();
    expect(stats.totals).toMatchObject({ sessions: 1, runs: 2, finishedRuns: 2, completionRate: 0.5, avgScore: 80 });
    expect(stats.byLevel.map((l: { level: number }) => l.level)).toEqual([1, 2]);
    expect(stats.failureReasons.snake).toBe(1);
    expect(stats.byDay).toHaveLength(7);
    expect(stats.truncated).toBe(false);
  });

  it('rejects an invalid range', async () => {
    expect((await fetch(`${BASE}/getStats?days=0`)).status).toBe(400);
  });

  it('answers the CORS preflight', async () => {
    const response = await fetch(`${BASE}/getStats`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' }
    });
    expect(response.status).toBeLessThan(300);
  });
});

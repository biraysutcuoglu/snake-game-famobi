// Runs against the Firebase Local Emulator Suite (npm run test:integration).
// Exercises the real function over HTTP and reads back from the Firestore emulator.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-neon-snake';
const ENDPOINT = `http://127.0.0.1:5001/${PROJECT}/us-central1/collectEvents`;

const post = (events: unknown[], contentType = 'text/plain;charset=UTF-8') =>
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': contentType }, body: JSON.stringify({ events }) });

const runEnd = (id: string) => ({
  eventId: id,
  name: 'run_end',
  timestamp: Date.now(),
  sessionId: 'it-session',
  runId: 'it-session-1',
  level: 3,
  outcome: 'complete',
  score: 90,
  progress: 1,
  durationMs: 31_000
});

describe('collectEvents (emulator)', () => {
  const db = (() => {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    return getFirestore(initializeApp({ projectId: PROJECT }));
  })();

  beforeAll(async () => {
    const existing = await db.collection('analytics_events').listDocuments();
    await Promise.all(existing.map((doc) => doc.delete()));
  });

  it('writes events to Firestore with a server receivedAt', async () => {
    const response = await post([runEnd('it-1'), { ...runEnd('it-2'), outcome: 'fail', failureReason: 'wall' }]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: 2, duplicates: 0, rejected: 0 });

    const snapshot = await db.collection('analytics_events').doc('it-2').get();
    expect(snapshot.data()).toMatchObject({ name: 'run_end', level: 3, outcome: 'fail', failureReason: 'wall' });
    expect(snapshot.data()?.receivedAt).toBeDefined();
  });

  it('is idempotent when the same event is sent again', async () => {
    const first = await db.collection('analytics_events').doc('it-1').get();
    const response = await post([runEnd('it-1')]);

    expect(await response.json()).toMatchObject({ accepted: 0, duplicates: 1 });
    const second = await db.collection('analytics_events').doc('it-1').get();
    expect(second.data()?.receivedAt.isEqual(first.data()?.receivedAt)).toBe(true);
  });

  it('answers the CORS preflight for application/json clients', async () => {
    const response = await fetch(ENDPOINT, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' }
    });
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('rejects a malformed request', async () => {
    const response = await fetch(ENDPOINT, { method: 'POST', body: 'nope' });
    expect(response.status).toBe(400);
  });
});

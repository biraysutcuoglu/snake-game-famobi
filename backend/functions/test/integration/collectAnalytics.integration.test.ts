import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-neon-snake';
const ENDPOINT = `http://127.0.0.1:5001/${PROJECT}/us-central1/collectAnalytics`;
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_RUN_ID = '33333333-3333-4333-8333-333333333333';
const sessionStartTime = Date.now() - 10_000;

const post = (body: unknown) =>
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body)
  });

const endedRun = (runId = RUN_ID) => ({
  type: 'RUN_ENDED',
  sessionId: SESSION_ID,
  sessionStartTime,
  runId,
  level: 2,
  startTime: sessionStartTime + 1000,
  endTime: sessionStartTime + 5000,
  score: 50,
  status: 'SUCCESS'
});

describe('collectAnalytics (emulator)', () => {
  const db = (() => {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    return getFirestore(initializeApp({ projectId: PROJECT }));
  })();

  beforeAll(async () => {
    const documents = await Promise.all([
      db.collection('sessions').listDocuments(),
      db.collection('runs').listDocuments()
    ]);
    await Promise.all(documents.flat().map((document) => document.delete()));
  });

  it('recovers when RUN_ENDED arrives before both start commands', async () => {
    const response = await post(endedRun());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accepted: true, result: 'created' });

    expect((await db.collection('runs').doc(RUN_ID).get()).data()).toEqual({
      sessionId: SESSION_ID,
      runId: RUN_ID,
      level: 2,
      startTime: sessionStartTime + 1000,
      endTime: sessionStartTime + 5000,
      score: 50,
      status: 'SUCCESS'
    });
    expect((await db.collection('sessions').doc(SESSION_ID).get()).data()).toEqual({
      sessionId: SESSION_ID,
      startTime: sessionStartTime,
      endTime: null,
      runsPlayed: 1
    });
  });

  it('treats duplicate terminal events and late starts as no-ops', async () => {
    expect(await (await post(endedRun())).json()).toMatchObject({ result: 'duplicate' });
    expect(
      await (
        await post({
          type: 'RUN_STARTED',
          sessionId: SESSION_ID,
          sessionStartTime,
          runId: RUN_ID,
          level: 2,
          startTime: sessionStartTime + 1000,
          score: 0
        })
      ).json()
    ).toMatchObject({ result: 'duplicate' });
    expect((await db.collection('sessions').doc(SESSION_ID).get()).data()?.runsPlayed).toBe(1);

    // If a parent was removed independently, a late start repairs it without
    // regressing the already-finalized run.
    await db.collection('sessions').doc(SESSION_ID).delete();
    expect(
      await (
        await post({
          type: 'RUN_STARTED',
          sessionId: SESSION_ID,
          sessionStartTime,
          runId: RUN_ID,
          level: 2,
          startTime: sessionStartTime + 1000,
          score: 0
        })
      ).json()
    ).toMatchObject({ result: 'updated' });
    expect((await db.collection('sessions').doc(SESSION_ID).get()).data()?.runsPlayed).toBe(1);
  });

  it('increments concurrent terminal runs exactly once each', async () => {
    const [first, second] = await Promise.all([post(endedRun(SECOND_RUN_ID)), post(endedRun(SECOND_RUN_ID))]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect((await db.collection('sessions').doc(SESSION_ID).get()).data()?.runsPlayed).toBe(2);
  });

  it('finalizes a session and rejects conflicting terminal history', async () => {
    const endTime = sessionStartTime + 9000;
    expect(
      await (
        await post({ type: 'SESSION_ENDED', sessionId: SESSION_ID, startTime: sessionStartTime, endTime })
      ).json()
    ).toMatchObject({ result: 'updated' });

    const conflict = await post({
      type: 'SESSION_ENDED',
      sessionId: SESSION_ID,
      startTime: sessionStartTime,
      endTime: endTime + 1
    });
    expect(conflict.status).toBe(409);
    expect((await db.collection('sessions').doc(SESSION_ID).get()).data()?.endTime).toBe(endTime);
  });

  it('answers CORS preflight and rejects malformed input', async () => {
    const preflight = await fetch(ENDPOINT, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' }
    });
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy();
    expect((await post({ nope: true })).status).toBe(400);
  });
});

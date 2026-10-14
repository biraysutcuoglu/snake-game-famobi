import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

import { createFirestoreEventSource, createFirestoreStore } from './firestoreStore';
import { handleCollectEvents } from './handler';
import { handleGetStats } from './statsHandler';

initializeApp();
const db = getFirestore();
const store = createFirestoreStore(db);
const eventSource = createFirestoreEventSource(db);

/**
 * POST {"events": [...]} -> {"accepted", "duplicates", "rejected"}.
 * CORS is open because the endpoint only accepts validated analytics events
 * and the browser has no credentials to protect.
 */
export const collectEvents = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  try {
    const { status, body } = await handleCollectEvents({ method: req.method, body: req.body }, store);
    res.status(status).json(body);
  } catch (error) {
    console.error('collectEvents failed', error);
    // 5xx makes the game keep the events and retry.
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET ?days=7 -> aggregated StatsResponse (see src/shared/analyticsStats.ts).
 * Returns aggregates only, never raw events or session ids. Open like
 * collectEvents; add authentication before pointing it at real data.
 */
export const getStats = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  try {
    const { status, body } = await handleGetStats({ method: req.method, query: req.query }, eventSource);
    // Short cache keeps a refreshing dashboard from re-reading thousands of documents.
    if (status === 200) res.set('Cache-Control', 'public, max-age=60');
    res.status(status).json(body);
  } catch (error) {
    console.error('getStats failed', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

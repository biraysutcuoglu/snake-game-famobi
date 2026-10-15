import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

import { createFirestoreAnalyticsStore } from './firestoreStore';
import { createFirestoreStatsSource } from './firestoreStatsSource';
import { handleCollectAnalytics } from './handler';
import { handleGetStats } from './statsHandler';

initializeApp();
const db = getFirestore();
const store = createFirestoreAnalyticsStore(db);
const statsSource = createFirestoreStatsSource(db);

/** Accepts one session/run lifecycle command per request. */
export const collectAnalytics = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  const contentLength = Number(req.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    res.status(413).json({ accepted: false, error: 'Request body is too large' });
    return;
  }

  try {
    const response = await handleCollectAnalytics({ method: req.method, body: req.body }, store);
    res.status(response.status).json(response.body);
  } catch (error) {
    console.error('collectAnalytics failed', error);
    res.status(500).json({ accepted: false, error: 'Internal error' });
  }
});

/** Returns dashboard aggregates, never raw session or run documents. */
export const getStats = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  try {
    const response = await handleGetStats({ method: req.method, query: req.query }, statsSource);
    if (response.status === 200) res.set('Cache-Control', 'public, max-age=60');
    res.status(response.status).json(response.body);
  } catch (error) {
    console.error('getStats failed', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

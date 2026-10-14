import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

import { createFirestoreStore } from './firestoreStore';
import { handleCollectEvents } from './handler';

initializeApp();
const store = createFirestoreStore(getFirestore());

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

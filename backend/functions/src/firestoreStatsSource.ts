import type { Firestore } from 'firebase-admin/firestore';

import { RUNS_COLLECTION, SESSIONS_COLLECTION } from './firestoreStore';
import type { RunDocument, SessionDocument } from './shared/analyticsDocument';
import type { StatsSource } from './statsHandler';

export const createFirestoreStatsSource = (db: Firestore): StatsSource => ({
  async load(from, to, limit) {
    const [sessionSnapshot, runSnapshot] = await Promise.all([
      db
        .collection(SESSIONS_COLLECTION)
        .where('startTime', '>=', from)
        .where('startTime', '<=', to)
        .orderBy('startTime', 'desc')
        .limit(limit + 1)
        .get(),
      db
        .collection(RUNS_COLLECTION)
        .where('startTime', '>=', from)
        .where('startTime', '<=', to)
        .orderBy('startTime', 'desc')
        .limit(limit + 1)
        .get()
    ]);

    const truncated = sessionSnapshot.size > limit || runSnapshot.size > limit;
    return {
      sessions: sessionSnapshot.docs.slice(0, limit).map((document) => document.data() as SessionDocument),
      runs: runSnapshot.docs.slice(0, limit).map((document) => document.data() as RunDocument),
      truncated
    };
  }
});

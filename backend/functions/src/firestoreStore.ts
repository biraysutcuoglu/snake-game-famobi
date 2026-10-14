import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import type { EventStore } from './handler';
import type { EventSource } from './statsHandler';
import type { AnalyticsEvent } from './shared/analyticsEvent';

export const EVENTS_COLLECTION = 'analytics_events';

const ALREADY_EXISTS = 6;

/**
 * Each event is stored under its eventId with create(), so a resent event
 * fails with ALREADY_EXISTS and keeps its original receivedAt.
 */
export const createFirestoreStore = (db: Firestore): EventStore => ({
  async save(events: AnalyticsEvent[]) {
    const writer = db.bulkWriter();
    let stored = 0;
    let duplicates = 0;

    const writes = events.map((event) =>
      writer
        .create(db.collection(EVENTS_COLLECTION).doc(event.eventId), {
          ...event,
          receivedAt: FieldValue.serverTimestamp()
        })
        .then(() => {
          stored += 1;
        })
        .catch((error: { code?: number }) => {
          if (error.code !== ALREADY_EXISTS) throw error;
          duplicates += 1;
        })
    );

    // Write promises only settle once the writer flushes, so close() first.
    await writer.close();
    await Promise.all(writes);

    return { stored, duplicates };
  }
});

/**
 * Range query on the single field `timestamp`, which Firestore indexes
 * automatically. One extra document is requested to detect truncation. Only
 * the fields the aggregation needs are read.
 */
export const createFirestoreEventSource = (db: Firestore): EventSource => ({
  async load(from, to, limit) {
    const snapshot = await db
      .collection(EVENTS_COLLECTION)
      .where('timestamp', '>=', from)
      .where('timestamp', '<=', to)
      .orderBy('timestamp', 'desc')
      .select('eventId', 'name', 'timestamp', 'sessionId', 'runId', 'level', 'outcome', 'failureReason', 'score', 'durationMs')
      .limit(limit + 1)
      .get();

    const truncated = snapshot.size > limit;
    const docs = truncated ? snapshot.docs.slice(0, limit) : snapshot.docs;
    return { events: docs.map((doc) => doc.data() as AnalyticsEvent), truncated };
  }
});

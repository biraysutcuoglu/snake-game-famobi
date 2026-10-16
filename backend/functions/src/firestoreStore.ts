import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';

import type { AnalyticsStore } from './handler';
import { AnalyticsConflictError } from './handler';
import type { RunDocument, SessionDocument } from './shared/analyticsDocument';
import type { AnalyticsRequest, AnalyticsWriteResult } from './shared/analyticsRequest';

export const SESSIONS_COLLECTION = 'sessions';
export const RUNS_COLLECTION = 'runs';

const conflict = (message: string): never => {
  throw new AnalyticsConflictError(message);
};

const readSession = (snapshot: DocumentSnapshot): SessionDocument | null => {
  if (!snapshot.exists) return null;
  const value = snapshot.data() as Partial<SessionDocument>;
  if (
    typeof value.sessionId !== 'string' ||
    typeof value.startTime !== 'number' ||
    (value.endTime !== null && typeof value.endTime !== 'number') ||
    !Number.isSafeInteger(value.runsPlayed) ||
    (value.runsPlayed ?? -1) < 0
  ) {
    return conflict('Stored session is invalid');
  }
  return value as SessionDocument;
};

const readRun = (snapshot: DocumentSnapshot): RunDocument | null => {
  if (!snapshot.exists) return null;
  const value = snapshot.data() as Partial<RunDocument>;
  if (
    typeof value.sessionId !== 'string' ||
    typeof value.runId !== 'string' ||
    !Number.isSafeInteger(value.level) ||
    (value.level ?? 0) < 1 ||
    typeof value.startTime !== 'number' ||
    (value.endTime !== null && typeof value.endTime !== 'number') ||
    typeof value.score !== 'number' ||
    !['IN_PROGRESS', 'SUCCESS', 'FAIL_WALL', 'FAIL_SELF', 'QUIT'].includes(value.status ?? '') ||
    (value.status === 'IN_PROGRESS' ? value.endTime !== null : typeof value.endTime !== 'number')
  ) {
    return conflict('Stored run is invalid');
  }
  return value as RunDocument;
};

const assertSessionIdentity = (session: SessionDocument, sessionId: string, startTime: number): void => {
  if (session.sessionId !== sessionId || session.startTime !== startTime) {
    conflict('sessionId is already associated with different session data');
  }
};

const assertRunIdentity = (
  run: RunDocument,
  request: { sessionId: string; runId: string; level: number; startTime: number }
): void => {
  if (
    run.runId !== request.runId ||
    run.sessionId !== request.sessionId ||
    run.level !== request.level ||
    run.startTime !== request.startTime
  ) {
    conflict('runId is already associated with different run data');
  }
};

const assertRunInsideSession = (session: SessionDocument, startTime: number, endTime?: number): void => {
  if (startTime < session.startTime) conflict('Run starts before its session');
  if (session.endTime !== null && (startTime > session.endTime || (endTime !== undefined && endTime > session.endTime))) {
    conflict('Run falls outside the finalized session');
  }
};

const applySessionStarted = async (
  db: Firestore,
  request: Extract<AnalyticsRequest, { type: 'SESSION_STARTED' }>
): Promise<AnalyticsWriteResult> =>
  db.runTransaction(async (transaction) => {
    const reference = db.collection(SESSIONS_COLLECTION).doc(request.sessionId);
    const existing = readSession(await transaction.get(reference));
    if (existing) {
      assertSessionIdentity(existing, request.sessionId, request.startTime);
      return 'duplicate';
    }

    transaction.create(reference, {
      sessionId: request.sessionId,
      startTime: request.startTime,
      endTime: null,
      runsPlayed: 0
    } satisfies SessionDocument);
    return 'created';
  });

const applySessionEnded = async (
  db: Firestore,
  request: Extract<AnalyticsRequest, { type: 'SESSION_ENDED' }>
): Promise<AnalyticsWriteResult> =>
  db.runTransaction(async (transaction) => {
    const reference = db.collection(SESSIONS_COLLECTION).doc(request.sessionId);
    const existing = readSession(await transaction.get(reference));
    if (!existing) {
      transaction.create(reference, {
        sessionId: request.sessionId,
        startTime: request.startTime,
        endTime: request.endTime,
        runsPlayed: 0
      } satisfies SessionDocument);
      return 'created';
    }

    assertSessionIdentity(existing, request.sessionId, request.startTime);
    if (existing.endTime === request.endTime) return 'duplicate';
    if (existing.endTime !== null) conflict('Session is already finalized with a different endTime');

    transaction.update(reference, { endTime: request.endTime });
    return 'updated';
  });

const readRunContext = async (
  db: Firestore,
  transaction: Transaction,
  request: Extract<AnalyticsRequest, { type: 'RUN_STARTED' | 'RUN_ENDED' }>
) => {
  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(request.sessionId);
  const runRef = db.collection(RUNS_COLLECTION).doc(request.runId);
  const [sessionSnapshot, runSnapshot] = await Promise.all([
    transaction.get(sessionRef),
    transaction.get(runRef)
  ]);
  return {
    sessionRef,
    runRef,
    session: readSession(sessionSnapshot),
    run: readRun(runSnapshot)
  };
};

const createMissingSession = (
  transaction: Transaction,
  reference: DocumentReference,
  request: { sessionId: string; sessionStartTime: number },
  runsPlayed: number
): void => {
  transaction.create(reference, {
    sessionId: request.sessionId,
    startTime: request.sessionStartTime,
    endTime: null,
    runsPlayed
  } satisfies SessionDocument);
};

const applyRunStarted = async (
  db: Firestore,
  request: Extract<AnalyticsRequest, { type: 'RUN_STARTED' }>
): Promise<AnalyticsWriteResult> =>
  db.runTransaction(async (transaction) => {
    const context = await readRunContext(db, transaction, request);
    if (context.session) {
      assertSessionIdentity(context.session, request.sessionId, request.sessionStartTime);
      assertRunInsideSession(context.session, request.startTime);
    }
    if (context.run) {
      assertRunIdentity(context.run, request);
      if (context.run.status === 'IN_PROGRESS' && context.run.score !== request.score) {
        conflict('Active run already exists with a different starting score');
      }
      if (!context.session) {
        createMissingSession(transaction, context.sessionRef, request, context.run.status === 'IN_PROGRESS' ? 0 : 1);
      }
      return context.session ? 'duplicate' : 'updated';
    }

    if (!context.session) createMissingSession(transaction, context.sessionRef, request, 0);
    transaction.create(context.runRef, {
      sessionId: request.sessionId,
      runId: request.runId,
      level: request.level,
      startTime: request.startTime,
      endTime: null,
      score: request.score,
      status: 'IN_PROGRESS'
    } satisfies RunDocument);
    return 'created';
  });

const applyRunEnded = async (
  db: Firestore,
  request: Extract<AnalyticsRequest, { type: 'RUN_ENDED' }>
): Promise<AnalyticsWriteResult> =>
  db.runTransaction(async (transaction) => {
    const context = await readRunContext(db, transaction, request);
    if (context.session) {
      assertSessionIdentity(context.session, request.sessionId, request.sessionStartTime);
      assertRunInsideSession(context.session, request.startTime, request.endTime);
    }
    if (context.run) assertRunIdentity(context.run, request);

    const sameTerminalRun =
      context.run !== null &&
      context.run.status !== 'IN_PROGRESS' &&
      context.run.endTime === request.endTime &&
      context.run.score === request.score &&
      context.run.status === request.status;

    if (context.run && context.run.status !== 'IN_PROGRESS' && !sameTerminalRun) {
      conflict('Run is already finalized with different terminal data');
    }

    if (sameTerminalRun) {
      if (!context.session) {
        createMissingSession(transaction, context.sessionRef, request, 1);
        return 'updated';
      }
      return 'duplicate';
    }

    const terminalRun: RunDocument = {
      sessionId: request.sessionId,
      runId: request.runId,
      level: request.level,
      startTime: request.startTime,
      endTime: request.endTime,
      score: request.score,
      status: request.status
    };
    if (context.run) transaction.update(context.runRef, terminalRun);
    else transaction.create(context.runRef, terminalRun);

    if (context.session) {
      transaction.update(context.sessionRef, { runsPlayed: context.session.runsPlayed + 1 });
    } else {
      createMissingSession(transaction, context.sessionRef, request, 1);
    }
    return context.run ? 'updated' : 'created';
  });

export const createFirestoreAnalyticsStore = (db: Firestore): AnalyticsStore => ({
  apply(request) {
    switch (request.type) {
      case 'SESSION_STARTED':
        return applySessionStarted(db, request);
      case 'SESSION_ENDED':
        return applySessionEnded(db, request);
      case 'RUN_STARTED':
        return applyRunStarted(db, request);
      case 'RUN_ENDED':
        return applyRunEnded(db, request);
    }
  }
});

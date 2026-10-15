/** Firestore-ready analytics documents. All timestamps are epoch milliseconds. */

export type SessionDocument = {
  sessionId: string;
  startTime: number;
  endTime: number | null;
  runsPlayed: number;
};

export type RunStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAIL_WALL' | 'FAIL_SELF' | 'QUIT';

export type RunDocument = {
  /** References the owning document in the top-level `sessions` collection. */
  sessionId: string;
  runId: string;
  level: number;
  startTime: number;
  endTime: number | null;
  score: number;
  status: RunStatus;
};

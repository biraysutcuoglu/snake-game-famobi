import type { RunStatus } from './analyticsDocument';

export type TerminalRunStatus = Exclude<RunStatus, 'IN_PROGRESS'>;

/** One lifecycle command per request; no batching. */
export type AnalyticsRequest =
  | {
      type: 'SESSION_STARTED';
      sessionId: string;
      startTime: number;
    }
  | {
      type: 'SESSION_ENDED';
      sessionId: string;
      startTime: number;
      endTime: number;
    }
  | {
      type: 'RUN_STARTED';
      sessionId: string;
      sessionStartTime: number;
      runId: string;
      level: number;
      startTime: number;
      score: number;
    }
  | {
      type: 'RUN_ENDED';
      sessionId: string;
      sessionStartTime: number;
      runId: string;
      level: number;
      startTime: number;
      endTime: number;
      score: number;
      status: TerminalRunStatus;
    };

export type AnalyticsWriteResult = 'created' | 'updated' | 'duplicate';

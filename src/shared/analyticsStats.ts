// Response contract of the getStats endpoint, shared by the backend and the
// dashboard. Keep this file free of imports.

export type FailureReasonKey = 'wall' | 'self';

export type StatsTotals = {
  /** Sessions whose startTime is in the range. */
  sessions: number;
  /** Runs whose startTime is in the range. */
  runs: number;
  /** Runs with a terminal status; the base for the rates below. */
  finishedRuns: number;
  /** complete / finishedRuns, 0..1. Null when no run has ended. */
  completionRate: number | null;
  avgDurationMs: number | null;
  avgScore: number | null;
};

export type StatsDay = {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  sessions: number;
  runs: number;
};

export type StatsLevel = {
  level: number;
  starts: number;
  complete: number;
  fail: number;
  quit: number;
  /** complete / (complete + fail + quit), 0..1. Null when no run has ended. */
  completionRate: number | null;
  avgScore: number | null;
};

export type StatsResponse = {
  range: { from: number; to: number; days: number };
  totals: StatsTotals;
  /** One entry per UTC day in the range, zero-filled. */
  byDay: StatsDay[];
  /** Ascending by level. */
  byLevel: StatsLevel[];
  /** Counts of failed runs by reason; runs without a reason are not counted. */
  failureReasons: Record<FailureReasonKey, number>;
  /** True when a collection read cap was hit, so numbers cover only part of the range. */
  truncated: boolean;
};

import type { RunDocument, SessionDocument } from './shared/analyticsDocument';
import type { FailureReasonKey, StatsDay, StatsLevel, StatsResponse } from './shared/analyticsStats';

const DAY_MS = 24 * 60 * 60 * 1000;

export type StatsRange = { from: number; to: number };

const dayKey = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);
const average = (sum: number, count: number): number | null => (count === 0 ? null : sum / count);

type LevelAcc = {
  starts: number;
  complete: number;
  fail: number;
  quit: number;
  scoreSum: number;
  finished: number;
};

/** Pure aggregation over session/run documents whose starts fall in the range. */
export const computeStats = (
  allSessions: readonly SessionDocument[],
  allRuns: readonly RunDocument[],
  range: StatsRange,
  truncated = false
): StatsResponse => {
  const sessions = allSessions.filter(
    (session) => session.startTime >= range.from && session.startTime <= range.to
  );
  const runs = allRuns.filter((run) => run.startTime >= range.from && run.startTime <= range.to);
  const finishedRuns = runs.filter((run) => run.status !== 'IN_PROGRESS' && run.endTime !== null);
  const daySessions = new Map<string, number>();
  const dayRuns = new Map<string, number>();
  const levels = new Map<number, LevelAcc>();

  for (const session of sessions) {
    const day = dayKey(session.startTime);
    daySessions.set(day, (daySessions.get(day) ?? 0) + 1);
  }

  for (const run of runs) {
    const day = dayKey(run.startTime);
    dayRuns.set(day, (dayRuns.get(day) ?? 0) + 1);
    let level = levels.get(run.level);
    if (!level) {
      level = { starts: 0, complete: 0, fail: 0, quit: 0, scoreSum: 0, finished: 0 };
      levels.set(run.level, level);
    }
    level.starts += 1;
    if (run.status === 'IN_PROGRESS') continue;

    level.finished += 1;
    level.scoreSum += run.score;
    if (run.status === 'SUCCESS') level.complete += 1;
    else if (run.status === 'QUIT') level.quit += 1;
    else level.fail += 1;
  }

  let completed = 0;
  let scoreSum = 0;
  let durationSum = 0;
  const failureReasons: Record<FailureReasonKey, number> = { wall: 0, self: 0 };
  for (const run of finishedRuns) {
    if (run.status === 'SUCCESS') completed += 1;
    if (run.status === 'FAIL_WALL') failureReasons.wall += 1;
    if (run.status === 'FAIL_SELF') failureReasons.self += 1;
    scoreSum += run.score;
    durationSum += Math.max(0, run.endTime! - run.startTime);
  }

  const byLevel: StatsLevel[] = [...levels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, value]) => ({
      level,
      starts: value.starts,
      complete: value.complete,
      fail: value.fail,
      quit: value.quit,
      completionRate: average(value.complete, value.finished),
      avgScore: average(value.scoreSum, value.finished)
    }));

  const byDay: StatsDay[] = [];
  for (let timestamp = Date.parse(dayKey(range.from)); timestamp <= range.to; timestamp += DAY_MS) {
    const date = dayKey(timestamp);
    byDay.push({ date, sessions: daySessions.get(date) ?? 0, runs: dayRuns.get(date) ?? 0 });
  }

  return {
    range: { from: range.from, to: range.to, days: byDay.length },
    totals: {
      sessions: sessions.length,
      runs: runs.length,
      finishedRuns: finishedRuns.length,
      completionRate: average(completed, finishedRuns.length),
      avgDurationMs: average(durationSum, finishedRuns.length),
      avgScore: average(scoreSum, finishedRuns.length)
    },
    byDay,
    byLevel,
    failureReasons,
    truncated
  };
};

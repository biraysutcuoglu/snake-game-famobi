import type { AnalyticsEvent } from './shared/analyticsEvent';
import type { FailureReasonKey, StatsDay, StatsLevel, StatsResponse } from './shared/analyticsStats';

const DAY_MS = 24 * 60 * 60 * 1000;

export type StatsRange = { from: number; to: number };

const dayKey = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

const average = (sum: number, count: number): number | null => (count === 0 ? null : sum / count);

type LevelAcc = {
  starts: Set<string>;
  ended: Map<string, { outcome: 'complete' | 'fail' | 'quit'; score: number }>;
};

/**
 * Pure aggregation over validated events. Runs are counted by runId so a
 * duplicate delivery or a repeated run_end cannot inflate the numbers.
 * Events outside [from, to] are ignored.
 */
export const computeStats = (
  events: readonly AnalyticsEvent[],
  range: StatsRange,
  truncated = false
): StatsResponse => {
  const sessions = new Set<string>();
  const startedRuns = new Set<string>();
  const endedRuns = new Map<string, AnalyticsEvent>();
  const levels = new Map<number, LevelAcc>();
  const daySessions = new Map<string, Set<string>>();
  const dayRuns = new Map<string, Set<string>>();

  const levelAcc = (level: number): LevelAcc => {
    let acc = levels.get(level);
    if (!acc) {
      acc = { starts: new Set(), ended: new Map() };
      levels.set(level, acc);
    }
    return acc;
  };
  const addTo = (map: Map<string, Set<string>>, key: string, value: string) => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(value);
  };

  for (const event of events) {
    if (event.timestamp < range.from || event.timestamp > range.to) continue;

    const day = dayKey(event.timestamp);
    sessions.add(event.sessionId);
    addTo(daySessions, day, event.sessionId);

    if (event.name === 'run_start' && event.runId !== undefined && event.level !== undefined) {
      startedRuns.add(event.runId);
      addTo(dayRuns, day, event.runId);
      levelAcc(event.level).starts.add(event.runId);
    } else if (
      event.name === 'run_end' &&
      event.runId !== undefined &&
      event.level !== undefined &&
      event.outcome !== undefined
    ) {
      if (!endedRuns.has(event.runId)) {
        endedRuns.set(event.runId, event);
        levelAcc(event.level).ended.set(event.runId, {
          outcome: event.outcome,
          score: event.score ?? 0
        });
      }
    }
  }

  let completed = 0;
  let scoreSum = 0;
  let durationSum = 0;
  const failureReasons: Record<FailureReasonKey, number> = { wall: 0, snake: 0, obstacle: 0, external: 0 };
  for (const end of endedRuns.values()) {
    if (end.outcome === 'complete') completed += 1;
    scoreSum += end.score ?? 0;
    durationSum += end.durationMs ?? 0;
    if (end.outcome === 'fail' && end.failureReason !== undefined) failureReasons[end.failureReason] += 1;
  }

  const byLevel: StatsLevel[] = [...levels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, acc]) => {
      let complete = 0;
      let fail = 0;
      let quit = 0;
      let levelScore = 0;
      for (const { outcome, score } of acc.ended.values()) {
        if (outcome === 'complete') complete += 1;
        else if (outcome === 'fail') fail += 1;
        else quit += 1;
        levelScore += score;
      }
      const ended = acc.ended.size;
      return {
        level,
        starts: acc.starts.size,
        complete,
        fail,
        quit,
        completionRate: average(complete, ended),
        avgScore: average(levelScore, ended)
      };
    });

  // Zero-filled so a quiet day shows up as 0 instead of a gap in the chart.
  const byDay: StatsDay[] = [];
  for (let t = Date.parse(dayKey(range.from)); t <= range.to; t += DAY_MS) {
    const date = dayKey(t);
    byDay.push({ date, sessions: daySessions.get(date)?.size ?? 0, runs: dayRuns.get(date)?.size ?? 0 });
  }

  return {
    range: { from: range.from, to: range.to, days: byDay.length },
    totals: {
      sessions: sessions.size,
      runs: startedRuns.size,
      finishedRuns: endedRuns.size,
      completionRate: average(completed, endedRuns.size),
      avgDurationMs: average(durationSum, endedRuns.size),
      avgScore: average(scoreSum, endedRuns.size)
    },
    byDay,
    byLevel,
    failureReasons,
    truncated
  };
};

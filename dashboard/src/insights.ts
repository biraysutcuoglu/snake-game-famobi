import type { StatsResponse } from './api/stats';
import { formatCount, formatPercent } from './format';

/** A level needs this many finished runs before it can be called "hardest". */
export const MIN_RUNS_FOR_RANKING = 5;

export const hardestLevel = (stats: StatsResponse) => {
  const ranked = stats.byLevel
    .filter((level) => level.complete + level.fail + level.quit >= MIN_RUNS_FOR_RANKING)
    .filter((level) => level.completionRate !== null);
  if (ranked.length < 2) return null;
  return ranked.reduce((worst, level) => (level.completionRate! < worst.completionRate! ? level : worst));
};

/** The headline sentence of the overview; plain facts, no judgement beyond the data. */
export const summarize = (stats: StatsResponse): string => {
  const { sessions, runs, completionRate, finishedRuns } = stats.totals;
  const days = stats.range.days;
  const parts = [
    `In the last ${days} days ${formatCount(sessions)} ${sessions === 1 ? 'session' : 'sessions'} started ` +
      `${formatCount(runs)} ${runs === 1 ? 'run' : 'runs'}.`
  ];

  if (finishedRuns > 0) {
    parts.push(`${formatPercent(completionRate)} of finished runs cleared their level.`);
  }

  const hardest = hardestLevel(stats);
  if (hardest) {
    parts.push(
      `Level ${hardest.level} is the hardest: only ${formatPercent(hardest.completionRate)} of its runs are cleared.`
    );
  }
  return parts.join(' ');
};

import type { StatsResponse } from '../api/stats';
import { formatCount, formatDuration, formatPercent, formatScore } from '../format';
import { summarize } from '../insights';
import { StatTile } from './StatTile';

export const Overview = ({ stats }: { stats: StatsResponse }) => {
  const { totals } = stats;
  return (
    <section aria-label="Overview">
      <p className="summary">{summarize(stats)}</p>
      <dl className="tiles">
        <StatTile label="Sessions" value={formatCount(totals.sessions)} hint="page loads with activity" />
        <StatTile label="Runs started" value={formatCount(totals.runs)} />
        <StatTile
          label="Completion rate"
          value={formatPercent(totals.completionRate)}
          hint={`of ${formatCount(totals.finishedRuns)} finished runs`}
        />
        <StatTile label="Avg run length" value={formatDuration(totals.avgDurationMs)} />
        <StatTile label="Avg score" value={formatScore(totals.avgScore)} />
      </dl>
    </section>
  );
};

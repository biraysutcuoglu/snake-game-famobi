import type { StatsResponse } from '../api/stats';
import { formatCount, formatDuration, formatPercent, formatRunsPerSession, formatScore } from '../format';
import { StatTile } from './StatTile';

export const Overview = ({ stats }: { stats: StatsResponse }) => {
  const { totals } = stats;
  const runFinishRate = totals.runs === 0 ? null : totals.finishedRuns / totals.runs;

  return (
    <section aria-label="Overview">
      <div className="overview-groups">
        <section className="metric-group">
          <h2>Activity</h2>
          <dl className="metric-list">
            <StatTile label="Sessions" value={formatCount(totals.sessions)} hint="visits started" />
            <StatTile
              label="Run finish rate"
              value={formatPercent(runFinishRate)}
              hint={`${formatCount(totals.finishedRuns)} of ${formatCount(totals.runs)} started runs`}
            />
          </dl>
        </section>

        <section className="metric-group">
          <h2>Engagement</h2>
          <dl className="metric-list">
            <StatTile
              label="Runs per session"
              value={formatRunsPerSession(totals.avgRunsPerSession)}
              hint="attempts in selected visits"
            />
            <StatTile
              label="Avg session length"
              value={formatDuration(totals.avgSessionDurationMs)}
              hint="finished sessions only"
            />
          </dl>
        </section>

        <section className="metric-group">
          <h2>Performance</h2>
          <dl className="metric-list">
            <StatTile
              label="Run success rate"
              value={formatPercent(totals.completionRate)}
              hint="successful / finished runs"
            />
            <StatTile label="Avg score" value={formatScore(totals.avgScore)} hint="successful or failed runs" />
          </dl>
        </section>
      </div>
    </section>
  );
};

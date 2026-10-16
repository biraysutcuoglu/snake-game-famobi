import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StatsResponse } from '../api/stats';
import { formatPercent } from '../format';
import { ChartCard } from './ChartCard';
import { AXIS_TICK, GRID, SERIES, TOOLTIP_STYLE, legendLabel } from './chartParts';

export const LevelOutcomes = ({ stats }: { stats: StatsResponse }) => {
  const data = stats.byLevel.map((level) => ({
    ...level,
    label: `Level ${level.level} (${level.complete + level.fail + level.quit} runs)`
  }));

  return (
    <ChartCard
      title="How runs end, by level"
      question="Where do players get stuck or give up?"
      table={{
        columns: ['Level', 'Started', 'Cleared', 'Failed', 'Quit', 'Clear rate'],
        rows: stats.byLevel.map((level) => [
          String(level.level),
          String(level.starts),
          String(level.complete),
          String(level.fail),
          String(level.quit),
          formatPercent(level.completionRate)
        ])
      }}
    >
      {data.length === 0 ? (
        <p className="muted">No runs have ended in this period.</p>
      ) : (
        <div className="chart" role="img" aria-label="Stacked bar chart of run outcomes per level">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} stackOffset="expand" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} {...GRID} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
              <Legend formatter={legendLabel} />
              {/* 2px surface strokes keep touching segments visually separate. */}
              <Bar dataKey="complete" name="Cleared" stackId="o" fill={SERIES.one} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
              <Bar dataKey="fail" name="Failed" stackId="o" fill={SERIES.two} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
              <Bar dataKey="quit" name="Quit" stackId="o" fill={SERIES.three} stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};

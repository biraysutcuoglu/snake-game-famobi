import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StatsResponse } from '../api/stats';
import { formatDuration } from '../format';
import { ChartCard } from './ChartCard';
import { AXIS_TICK, GRID, SERIES, TOOLTIP_STYLE } from './chartParts';

export const RunDurationByLevel = ({ stats }: { stats: StatsResponse }) => {
  const data = stats.byLevel
    .filter((level) => level.avgRunDurationMs !== null)
    .map((level) => ({ level: `Level ${level.level}`, duration: level.avgRunDurationMs! }));

  return (
    <ChartCard
      title="Average run length by level"
      question="How long does a finished attempt last at each level? Includes successful, failed and quit runs."
      table={{
        columns: ['Level', 'Average run length'],
        rows: data.map((row) => [row.level, formatDuration(row.duration)])
      }}
    >
      {data.length === 0 ? (
        <p className="muted">No finished runs in this period.</p>
      ) : (
        <div className="chart" role="img" aria-label="Bar chart of average run length by level">
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid horizontal={false} {...GRID} />
              <XAxis
                type="number"
                tickFormatter={(value: number) => formatDuration(value)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis type="category" dataKey="level" tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                formatter={(value) => formatDuration(Number(value))}
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: 'var(--grid)', opacity: 0.4 }}
              />
              <Bar dataKey="duration" name="Average run length" fill={SERIES.two} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};

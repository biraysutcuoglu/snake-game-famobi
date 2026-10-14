import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { FailureReasonKey, StatsResponse } from '../api/stats';
import { ChartCard } from './ChartCard';
import { AXIS_TICK, GRID, SERIES, TOOLTIP_STYLE } from './chartParts';

const LABELS: Record<FailureReasonKey, string> = {
  wall: 'Hit a wall',
  snake: 'Hit own tail',
  obstacle: 'Hit an obstacle',
  external: 'Interrupted'
};

export const FailureReasons = ({ stats }: { stats: StatsResponse }) => {
  const data = (Object.keys(LABELS) as FailureReasonKey[])
    .map((key) => ({ reason: LABELS[key], count: stats.failureReasons[key] }))
    .sort((a, b) => b.count - a.count);
  const total = data.reduce((sum, row) => sum + row.count, 0);

  return (
    <ChartCard
      title="Why runs fail"
      question="What kills players? A dominant cause hints at unfair design or a control problem."
      table={{ columns: ['Reason', 'Failed runs'], rows: data.map((row) => [row.reason, String(row.count)]) }}
    >
      {total === 0 ? (
        <p className="muted">No failed runs in this period.</p>
      ) : (
        <div className="chart" role="img" aria-label="Bar chart of failed runs by reason">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid horizontal={false} {...GRID} />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="reason" tick={AXIS_TICK} tickLine={false} axisLine={false} width={110} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
              <Bar dataKey="count" name="Failed runs" fill={SERIES.one} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};

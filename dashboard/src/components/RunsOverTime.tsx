import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StatsResponse } from '../api/stats';
import { formatDay } from '../format';
import { ChartCard } from './ChartCard';
import { AXIS_TICK, GRID, SERIES, TOOLTIP_STYLE, legendLabel } from './chartParts';

export const RunsOverTime = ({ stats }: { stats: StatsResponse }) => {
  const data = stats.byDay.map((day) => ({ ...day, label: formatDay(day.date) }));
  return (
    <ChartCard
      title="Activity per day"
      question="Is play growing or fading? Sessions are visits, runs are attempts."
      table={{
        columns: ['Day (UTC)', 'Sessions', 'Runs'],
        rows: stats.byDay.map((day) => [day.date, String(day.sessions), String(day.runs)])
      }}
    >
      <div className="chart" role="img" aria-label="Line chart of sessions and runs per day">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} {...GRID} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend iconType="plainline" formatter={legendLabel} />
            <Line
              type="monotone"
              dataKey="runs"
              name="Runs"
              stroke={SERIES.one}
              strokeWidth={2}
              dot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: SERIES.one }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="sessions"
              name="Sessions"
              stroke={SERIES.two}
              strokeWidth={2}
              dot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: SERIES.two }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

import type { CSSProperties } from 'react';

// Series colours are CSS variables (see style.css) so light and dark mode swap in one place.
export const SERIES = {
  one: 'var(--series-1)',
  two: 'var(--series-2)',
  three: 'var(--series-3)'
} as const;

export const AXIS_TICK = { fill: 'var(--text-secondary)', fontSize: 12 } as const;
export const GRID = { stroke: 'var(--grid)', strokeDasharray: '' } as const;

export const TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 13
};

/** Legend text stays in ink; the coloured swatch beside it carries identity. */
export const legendLabel = (value: string) => <span style={{ color: 'var(--text-primary)' }}>{value}</span>;

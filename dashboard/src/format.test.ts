import { describe, expect, it } from 'vitest';

import { formatDay, formatDuration, formatPercent, formatScore } from './format';

describe('format', () => {
  it('shows a dash when there is no data', () => {
    expect(formatPercent(null)).toBe('–');
    expect(formatDuration(null)).toBe('–');
    expect(formatScore(null)).toBe('–');
  });

  it('keeps a real 0% distinct from no data', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.456)).toBe('46%');
  });

  it('formats durations', () => {
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(125_000)).toBe('2m 05s');
  });

  it('formats a UTC day without shifting it', () => {
    expect(formatDay('2025-10-14')).toBe('Oct 14');
  });
});

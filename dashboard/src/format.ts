export const formatCount = (value: number): string => value.toLocaleString('en-US');

/** `null` means "no finished runs yet", which is not the same as 0%. */
export const formatPercent = (ratio: number | null): string =>
  ratio === null ? '–' : `${Math.round(ratio * 100)}%`;

export const formatDuration = (ms: number | null): string => {
  if (ms === null) return '–';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
};

export const formatScore = (score: number | null): string => (score === null ? '–' : String(Math.round(score)));

export const formatRunsPerSession = (value: number | null): string => (value === null ? '–' : value.toFixed(1));

/** "2025-10-14" -> "Oct 14", read as UTC so it matches the backend's day buckets. */
export const formatDay = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

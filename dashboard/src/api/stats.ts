import type { StatsResponse } from '../../../src/shared/analyticsStats';

export type { FailureReasonKey, StatsLevel, StatsResponse } from '../../../src/shared/analyticsStats';

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The endpoint is ours, so this is a cheap shape check rather than full
 * validation: enough to fail with a clear message if the backend and the
 * dashboard drift apart, instead of crashing somewhere in a chart.
 */
export const isStatsResponse = (value: unknown): value is StatsResponse => {
  if (!isObject(value)) return false;
  const { range, totals, byDay, byLevel, failureReasons, truncated } = value;
  return (
    isObject(range) &&
    isObject(totals) &&
    typeof totals.sessions === 'number' &&
    typeof totals.runs === 'number' &&
    (totals.avgRunsPerSession === null || typeof totals.avgRunsPerSession === 'number') &&
    Array.isArray(byDay) &&
    Array.isArray(byLevel) &&
    isObject(failureReasons) &&
    typeof truncated === 'boolean'
  );
};

export class StatsError extends Error {}

export type FetchStatsOptions = {
  days: RangeDays;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export const fetchStats = async ({
  days,
  signal,
  baseUrl = import.meta.env.VITE_STATS_URL,
  fetchImpl = fetch
}: FetchStatsOptions): Promise<StatsResponse> => {
  if (!baseUrl) throw new StatsError('VITE_STATS_URL is not configured.');

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}?days=${days}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new StatsError('Could not reach the analytics backend.');
  }

  if (!response.ok) throw new StatsError(`The analytics backend answered with status ${response.status}.`);

  const body: unknown = await response.json().catch(() => undefined);
  if (!isStatsResponse(body)) throw new StatsError('The analytics backend returned an unexpected response.');
  return body;
};

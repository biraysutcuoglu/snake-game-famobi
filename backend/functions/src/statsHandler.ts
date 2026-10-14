import type { AnalyticsEvent } from './shared/analyticsEvent';
import { computeStats } from './stats';

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90;
/** Upper bound on documents read per request; keeps cost and latency bounded. */
export const MAX_EVENTS_READ = 20_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type EventSource = {
  /**
   * Events with from <= timestamp <= to, newest first, at most `limit`.
   * `truncated` is true when more matched than `limit`.
   */
  load(from: number, to: number, limit: number): Promise<{ events: AnalyticsEvent[]; truncated: boolean }>;
};

export type StatsRequest = { method: string; query: Record<string, unknown> };
export type StatsHttpResponse = { status: number; body: Record<string, unknown> };

const parseDays = (raw: unknown): number | null => {
  if (raw === undefined) return DEFAULT_DAYS;
  if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 1 && days <= MAX_DAYS ? days : null;
};

/**
 * The range covers `days` whole UTC days ending with today, so the daily
 * buckets are exact and today's partial day is shown as such.
 */
export const handleGetStats = async (
  request: StatsRequest,
  source: EventSource,
  now: number = Date.now()
): Promise<StatsHttpResponse> => {
  if (request.method !== 'GET') {
    return { status: 405, body: { error: 'Use GET' } };
  }

  const days = parseDays(request.query.days);
  if (days === null) {
    return { status: 400, body: { error: `days must be an integer from 1 to ${MAX_DAYS}` } };
  }

  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
  const range = { from: startOfToday - (days - 1) * DAY_MS, to: now };

  const { events, truncated } = await source.load(range.from, range.to, MAX_EVENTS_READ);
  return { status: 200, body: computeStats(events, range, truncated) };
};

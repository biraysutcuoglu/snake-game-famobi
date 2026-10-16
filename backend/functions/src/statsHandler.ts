import type { RunDocument, SessionDocument } from './shared/analyticsDocument';
import { computeStats } from './stats';

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90;
/** Maximum documents read from each collection per request. */
export const MAX_DOCUMENTS_PER_COLLECTION = 20_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StatsSource = {
  load(
    from: number,
    to: number,
    limit: number
  ): Promise<{ sessions: SessionDocument[]; runs: RunDocument[]; truncated: boolean }>;
};

export type StatsRequest = { method: string; query: Record<string, unknown> };
export type StatsHttpResponse = { status: number; body: Record<string, unknown> };

const parseDays = (raw: unknown): number | null => {
  if (raw === undefined) return DEFAULT_DAYS;
  if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 1 && days <= MAX_DAYS ? days : null;
};

export const handleGetStats = async (
  request: StatsRequest,
  source: StatsSource,
  now: number = Date.now()
): Promise<StatsHttpResponse> => {
  if (request.method !== 'GET') return { status: 405, body: { error: 'Use GET' } };

  const days = parseDays(request.query.days);
  if (days === null) {
    return { status: 400, body: { error: `days must be an integer from 1 to ${MAX_DAYS}` } };
  }

  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
  const range = { from: startOfToday - (days - 1) * DAY_MS, to: now };
  const { sessions, runs, truncated } = await source.load(
    range.from,
    range.to,
    MAX_DOCUMENTS_PER_COLLECTION
  );
  return { status: 200, body: computeStats(sessions, runs, range, truncated) };
};

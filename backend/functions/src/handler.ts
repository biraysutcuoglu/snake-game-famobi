import { validateAnalyticsRequest } from './analyticsValidation';
import type { AnalyticsRequest, AnalyticsWriteResult } from './shared/analyticsRequest';

export class AnalyticsConflictError extends Error {}

export type AnalyticsStore = {
  apply(request: AnalyticsRequest): Promise<AnalyticsWriteResult>;
};

export type CollectRequest = { method: string; body: unknown };
export type CollectResponse = { status: number; body: Record<string, unknown> };

const parseBody = (body: unknown): unknown => {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

export const handleCollectAnalytics = async (
  request: CollectRequest,
  store: AnalyticsStore,
  now: number = Date.now()
): Promise<CollectResponse> => {
  if (request.method !== 'POST') return { status: 405, body: { error: 'Use POST' } };

  const validation = validateAnalyticsRequest(parseBody(request.body), now);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };

  try {
    const result = await store.apply(validation.request);
    return { status: result === 'created' ? 201 : 200, body: { accepted: true, result } };
  } catch (error) {
    if (error instanceof AnalyticsConflictError) {
      return { status: 409, body: { accepted: false, error: error.message } };
    }
    throw error;
  }
};

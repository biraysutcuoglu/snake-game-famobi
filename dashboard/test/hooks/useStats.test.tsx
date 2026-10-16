// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchStats } from '../../src/api/stats';
import { statsFixture } from '../fixtures/statsFixture';
import { POLL_INTERVAL_MS, useStats } from '../../src/useStats';

vi.mock('../../src/api/stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/stats')>();
  return { ...actual, fetchStats: vi.fn() };
});

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  setHidden(false);
});

describe('useStats', () => {
  it('loads the selected range immediately', async () => {
    vi.mocked(fetchStats).mockResolvedValue(statsFixture);

    const { result } = renderHook(() => useStats(30));

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchStats).toHaveBeenCalledWith(expect.objectContaining({ days: 30 }));
  });

  it('polls only while the dashboard tab is visible', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchStats).mockResolvedValue(statsFixture);
    setHidden(true);

    const { result } = renderHook(() => useStats(7));
    await act(async () => Promise.resolve());
    expect(result.current.state.status).toBe('ready');

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(fetchStats).toHaveBeenCalledTimes(1);

    setHidden(false);
    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(fetchStats).toHaveBeenCalledTimes(2);
  });

  it('keeps the current data when a background refresh fails', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchStats)
      .mockResolvedValueOnce(statsFixture)
      .mockRejectedValueOnce(new Error('temporary failure'));

    const { result } = renderHook(() => useStats(7));
    await act(async () => Promise.resolve());
    expect(result.current.state).toEqual({ status: 'ready', stats: statsFixture });

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(result.current.state).toEqual({ status: 'ready', stats: statsFixture });
  });
});

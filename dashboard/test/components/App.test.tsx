// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { statsFixture } from '../fixtures/statsFixture';
import { useStats } from '../../src/useStats';

vi.mock('../../src/useStats', () => ({ useStats: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App rendering', () => {
  it('renders loading state and requests a newly selected range', () => {
    vi.mocked(useStats).mockReturnValue({ state: { status: 'loading' }, reload: vi.fn() });

    render(<App />);
    expect(screen.getByRole('status').textContent).toContain('Loading');

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(useStats).toHaveBeenLastCalledWith(30);
  });

  it('renders an error and lets the user retry', () => {
    const reload = vi.fn();
    vi.mocked(useStats).mockReturnValue({
      state: { status: 'error', message: 'Could not reach the analytics backend.' },
      reload
    });

    render(<App />);
    expect(screen.getByRole('alert').textContent).toContain('Could not reach');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders overview metrics and every chart section', () => {
    vi.mocked(useStats).mockReturnValue({ state: { status: 'ready', stats: statsFixture }, reload: vi.fn() });

    render(<App />);

    expect(screen.getByText('Run finish rate').parentElement?.textContent).toContain('80%');
    expect(screen.getByText('Runs per session').parentElement?.textContent).toContain('2.5');
    expect(screen.getByText('Avg session length').parentElement?.textContent).toContain('1m 15s');
    expect(screen.getByText('Run success rate').parentElement?.textContent).toContain('25%');
    expect(screen.getByRole('region', { name: 'Activity per day' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'How runs end, by level' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Why runs fail' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Average run length by level' })).toBeTruthy();
  });
});

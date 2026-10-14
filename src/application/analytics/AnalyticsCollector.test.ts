import { describe, expect, it } from 'vitest';

import { EventBus } from '../../core/events/EventBus';
import type { AnalyticsEvent } from '../../shared/analyticsEvent';
import type { GameController } from '../GameController';
import type { GameEventMap } from '../gameEvents';
import { AnalyticsCollector } from './AnalyticsCollector';
import type { AnalyticsSink } from './AnalyticsSink';

const setup = () => {
  const events: AnalyticsEvent[] = [];
  const sink: AnalyticsSink = { track: (event) => events.push(event), flush: () => {} };
  const bus = new EventBus<GameEventMap>();
  const controller = { events: bus } as unknown as GameController;
  let id = 0;
  let clock = 1000;
  const collector = new AnalyticsCollector(sink, {
    createId: () => `id-${id++}`,
    now: () => clock
  });
  const disconnect = collector.connect(controller);
  return { events, bus, collector, disconnect, setClock: (value: number) => (clock = value) };
};

describe('AnalyticsCollector', () => {
  it('records a completed run with level, outcome, score and timing', () => {
    const { events, bus } = setup();

    bus.emit('runStarted', { level: 2, runNumber: 3, score: 0, progress: 0, occurredAt: 100 });
    bus.emit('scoreChanged', { level: 2, score: 10, delta: 10 });
    bus.emit('runEnded', {
      level: 2,
      score: 30,
      progress: 1,
      reason: 'complete',
      failureReason: null,
      durationMs: 5000,
      occurredAt: 5100
    });

    expect(events.map((event) => event.name)).toEqual(['run_start', 'score_update', 'run_end']);
    expect(events[0]).toMatchObject({ runId: 'id-0-3', level: 2, timestamp: 100 });
    expect(events[2]).toMatchObject({
      runId: 'id-0-3',
      level: 2,
      outcome: 'complete',
      score: 30,
      progress: 1,
      durationMs: 5000,
      timestamp: 5100
    });
    expect(new Set(events.map((event) => event.eventId)).size).toBe(3);
  });

  it('records the failure reason for failed runs', () => {
    const { events, bus } = setup();
    bus.emit('runStarted', { level: 1, runNumber: 1, score: 0, progress: 0, occurredAt: 1 });
    bus.emit('runEnded', {
      level: 1,
      score: 5,
      progress: 0.4,
      reason: 'fail',
      failureReason: 'wall',
      durationMs: 10,
      occurredAt: 11
    });
    expect(events.at(-1)).toMatchObject({ outcome: 'fail', failureReason: 'wall' });
  });

  it('ignores the score reset at the start of a run', () => {
    const { events, bus } = setup();
    bus.emit('runStarted', { level: 1, runNumber: 1, score: 0, progress: 0, occurredAt: 1 });
    bus.emit('scoreChanged', { level: 1, score: 0, delta: -20 });
    expect(events.map((event) => event.name)).toEqual(['run_start']);
  });

  it('records pause and resume once per transition', () => {
    const { events, bus } = setup();
    bus.emit('runStarted', { level: 1, runNumber: 1, score: 0, progress: 0, occurredAt: 1 });
    bus.emit('pauseChanged', { paused: true, source: 'player' });
    bus.emit('pauseChanged', { paused: true, source: 'system' });
    bus.emit('pauseChanged', { paused: false, source: null });
    expect(events.map((event) => event.name)).toEqual(['run_start', 'run_pause', 'run_resume']);
    expect(events[1]).toMatchObject({ pauseSource: 'player' });
  });

  it('records a quit run_end with last known score when the page goes away mid-run', () => {
    const { events, bus, collector, setClock } = setup();
    bus.emit('runStarted', { level: 3, runNumber: 1, score: 0, progress: 0, occurredAt: 1000 });
    bus.emit('scoreChanged', { level: 3, score: 20, delta: 10 });
    bus.emit('progressChanged', { level: 3, progress: 0.5, collected: 5, target: 10 });
    setClock(4000);

    collector.abandonActiveRun();
    collector.abandonActiveRun();

    const ends = events.filter((event) => event.name === 'run_end');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({
      outcome: 'quit',
      level: 3,
      score: 20,
      progress: 0.5,
      durationMs: 3000,
      timestamp: 4000
    });
  });

  it('does nothing on page hide when no run is active', () => {
    const { events, collector } = setup();
    collector.abandonActiveRun();
    expect(events).toEqual([]);
  });

  it('stops recording after disconnect', () => {
    const { events, bus, disconnect } = setup();
    disconnect();
    bus.emit('runStarted', { level: 1, runNumber: 1, score: 0, progress: 0, occurredAt: 1 });
    expect(events).toEqual([]);
  });
});

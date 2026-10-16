import { describe, expect, it } from 'vitest';

import type { GameController } from '../../../src/application/GameController';
import { AnalyticsCollector } from '../../../src/application/analytics/AnalyticsCollector';
import type { AnalyticsClient } from '../../../src/application/analytics/AnalyticsClient';
import type { GameEventMap } from '../../../src/application/gameEvents';
import { EventBus } from '../../../src/core/events/EventBus';
import type { RunDocument, SessionDocument } from '../../../src/shared/analyticsDocument';

const setup = () => {
  const sessions: SessionDocument[] = [];
  const runs: RunDocument[] = [];
  const client: AnalyticsClient = {
    trackSession: (session) => sessions.push(session),
    trackRun: (run) => runs.push(run)
  };
  const bus = new EventBus<GameEventMap>();
  const controller = { events: bus } as unknown as GameController;
  let id = 0;
  let clock = 1000;
  const collector = new AnalyticsCollector(client, {
    createId: () => `id-${id++}`,
    now: () => clock
  });
  const disconnect = collector.connect(controller);
  return {
    sessions,
    runs,
    bus,
    collector,
    disconnect,
    setClock: (value: number) => (clock = value)
  };
};

const ready = (bus: EventBus<GameEventMap>, occurredAt = 100): void => {
  bus.emit('ready', { occurredAt });
};

const startRun = (bus: EventBus<GameEventMap>, occurredAt = 200): void => {
  bus.emit('runStarted', { level: 2, runNumber: 3, score: 0, progress: 0, occurredAt });
};

describe('AnalyticsCollector', () => {
  it('creates a session document when the game becomes ready', () => {
    const { sessions, bus } = setup();

    ready(bus);

    expect(sessions).toEqual([
      { sessionId: 'id-0', startTime: 100, endTime: null, runsPlayed: 0 }
    ]);
  });

  it('creates and finalizes a successful run with an independent UUID', () => {
    const { sessions, runs, bus } = setup();
    ready(bus);
    startRun(bus);
    bus.emit('scoreChanged', { level: 2, score: 10, delta: 10 });
    bus.emit('runEnded', {
      level: 2,
      score: 30,
      progress: 1,
      reason: 'complete',
      failureReason: null,
      durationMs: 5000,
      occurredAt: 5200
    });

    expect(runs).toEqual([
      {
        sessionId: 'id-0',
        runId: 'id-1',
        level: 2,
        startTime: 200,
        endTime: null,
        score: 0,
        status: 'IN_PROGRESS'
      },
      {
        sessionId: 'id-0',
        runId: 'id-1',
        level: 2,
        startTime: 200,
        endTime: 5200,
        score: 30,
        status: 'SUCCESS'
      }
    ]);

    expect(sessions.at(-1)?.runsPlayed).toBe(1);
  });

  it.each([
    ['wall', 'FAIL_WALL'],
    ['obstacle', 'FAIL_WALL'],
    ['snake', 'FAIL_SELF'],
    ['external', 'QUIT']
  ] as const)('maps %s failures to %s', (failureReason, expectedStatus) => {
    const { runs, bus } = setup();
    ready(bus);
    startRun(bus);
    bus.emit('runEnded', {
      level: 2,
      score: 5,
      progress: 0.4,
      reason: 'fail',
      failureReason,
      durationMs: 10,
      occurredAt: 210
    });

    expect(runs.at(-1)?.status).toBe(expectedStatus);
  });

  it('finalizes an active run and its session when the page goes away', () => {
    const { sessions, runs, bus, collector, setClock } = setup();
    ready(bus, 1000);
    startRun(bus, 1100);
    bus.emit('scoreChanged', { level: 2, score: 20, delta: 20 });
    setClock(4000);

    collector.endSession();
    collector.endSession();

    expect(runs.at(-1)).toEqual({
      sessionId: 'id-0',
      runId: 'id-1',
      level: 2,
      startTime: 1100,
      endTime: 4000,
      score: 20,
      status: 'QUIT'
    });
    expect(sessions.at(-1)).toEqual({
      sessionId: 'id-0',
      startTime: 1000,
      endTime: 4000,
      runsPlayed: 1
    });
    expect(sessions).toHaveLength(3);
    expect(runs).toHaveLength(2);
  });

  it('ends a session with no runs played', () => {
    const { sessions, bus, collector, setClock } = setup();
    ready(bus, 1000);
    setClock(1500);

    collector.endSession();

    expect(sessions.at(-1)).toMatchObject({ endTime: 1500, runsPlayed: 0 });
  });

  it('stops observing after disconnect', () => {
    const { sessions, runs, bus, disconnect } = setup();
    disconnect();
    ready(bus);
    startRun(bus);

    expect(sessions).toEqual([]);
    expect(runs).toEqual([]);
  });
});

import type { RunDocument, SessionDocument } from '../../shared/analyticsDocument';
import type { AnalyticsRequest } from '../../shared/analyticsRequest';

export type AnalyticsClient = {
  trackSession(session: SessionDocument): void;
  trackRun(run: RunDocument): void;
};

export class NoopAnalyticsClient implements AnalyticsClient {
  trackSession(): void {}
  trackRun(): void {}
}

export class ConsoleAnalyticsClient implements AnalyticsClient {
  trackSession(session: SessionDocument): void {
    console.debug('[analytics] session', session);
  }

  trackRun(run: RunDocument): void {
    console.debug('[analytics] run', run);
  }
}

export type HttpAnalyticsClientOptions = {
  endpoint: string;
  fetchImpl?: typeof fetch;
};

/** Sends one lifecycle command per request without persistence or batching. */
export class HttpAnalyticsClient implements AnalyticsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sessionStartTimes = new Map<string, number>();

  constructor(private readonly options: HttpAnalyticsClientOptions) {
    if (!options.endpoint) throw new Error('Analytics endpoint is required');
    // Some browser implementations require native fetch to be called with the
    // global object as its receiver. Storing it on this client and invoking it
    // as a method would otherwise make the client instance the receiver.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  trackSession(session: SessionDocument): void {
    const knownStartTime = this.sessionStartTimes.get(session.sessionId);
    if (knownStartTime !== undefined && knownStartTime !== session.startTime) {
      console.error('Analytics session has conflicting start times', session.sessionId);
      return;
    }

    this.sessionStartTimes.set(session.sessionId, session.startTime);
    if (session.endTime === null) {
      // The collector may publish an updated in-memory runsPlayed count. The
      // backend increments that count transactionally from RUN_ENDED instead.
      if (knownStartTime !== undefined) return;
      this.post({
        type: 'SESSION_STARTED',
        sessionId: session.sessionId,
        startTime: session.startTime
      });
      return;
    }

    this.post({
      type: 'SESSION_ENDED',
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime
    });
  }

  trackRun(run: RunDocument): void {
    const sessionStartTime = this.sessionStartTimes.get(run.sessionId);
    if (sessionStartTime === undefined) {
      console.error('Cannot send analytics run before its session', run.runId);
      return;
    }

    if (run.endTime === null) {
      this.post({
        type: 'RUN_STARTED',
        sessionId: run.sessionId,
        sessionStartTime,
        runId: run.runId,
        level: run.level,
        startTime: run.startTime,
        score: run.score
      });
      return;
    }

    if (run.status === 'IN_PROGRESS') {
      console.error('Cannot send an ended analytics run with an in-progress status', run.runId);
      return;
    }

    this.post({
      type: 'RUN_ENDED',
      sessionId: run.sessionId,
      sessionStartTime,
      runId: run.runId,
      level: run.level,
      startTime: run.startTime,
      endTime: run.endTime,
      score: run.score,
      status: run.status
    });
  }

  private post(request: AnalyticsRequest): void {
    // text/plain avoids a CORS preflight, while keepalive lets these small
    // requests finish when pagehide ends the run and session.
    void this.fetchImpl(this.options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(request),
      keepalive: true
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`Analytics endpoint rejected ${request.type} with status ${response.status}`);
        }
      })
      .catch((error: unknown) => {
        console.error(`Analytics request failed for ${request.type}`, error);
      });
  }
}

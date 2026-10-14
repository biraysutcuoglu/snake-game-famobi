import type { AnalyticsEvent } from '../../shared/analyticsEvent';

export type AnalyticsSink = {
  track(event: AnalyticsEvent): void;
  /** Push anything buffered out as soon as possible, e.g. while the page is hiding. */
  flush(): void;
};

export class NoopSink implements AnalyticsSink {
  track(): void {}
  flush(): void {}
}

export class ConsoleSink implements AnalyticsSink {
  track(event: AnalyticsEvent): void {
    console.debug('[analytics]', event.name, event);
  }
  flush(): void {}
}

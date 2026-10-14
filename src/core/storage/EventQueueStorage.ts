import { validateAnalyticsEvent, type AnalyticsEvent } from '../../shared/analyticsEvent';

export interface EventQueueStorage {
  load(): AnalyticsEvent[];
  save(events: AnalyticsEvent[]): void;
}

export class LocalEventQueueStorage implements EventQueueStorage {
  private readonly storageKey = 'neon-snake:analytics-queue';

  load(): AnalyticsEvent[] {
    try {
      const stored = window.localStorage.getItem(this.storageKey);
      if (!stored) return [];
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value)) return [];
      return value.flatMap((item) => {
        const result = validateAnalyticsEvent(item);
        return result.ok ? [result.event] : [];
      });
    } catch {
      return [];
    }
  }

  save(events: AnalyticsEvent[]): void {
    try {
      if (events.length === 0) window.localStorage.removeItem(this.storageKey);
      else window.localStorage.setItem(this.storageKey, JSON.stringify(events));
    } catch {
      // Analytics must never break the game; the in-memory queue still works.
    }
  }
}

export class MemoryEventQueueStorage implements EventQueueStorage {
  private events: AnalyticsEvent[] = [];

  load(): AnalyticsEvent[] {
    return [...this.events];
  }

  save(events: AnalyticsEvent[]): void {
    this.events = [...events];
  }
}

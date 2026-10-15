import type { GameController } from '../GameController';
import type { PlatformSdk } from './PlatformSdk';

type EventParams = {
  metrics?: Record<string, number | string | boolean | null>;
};

type GameInterface = {
  init(load: Array<string | (() => void)>): Promise<void>;
  gameReady(isPlayerReady?: boolean): void;
  gameStart(level?: number, params?: EventParams): Promise<void>;
  gameEnd(reason: 'complete' | 'fail' | 'quit', params?: EventParams): Promise<void>;
  gamePause(params?: EventParams): Promise<void>;
  gameResume(params?: EventParams): Promise<void>;
  sendScore(score: number, params?: { type?: 'live' | 'total' | 'level' | 'stage'; level?: number }): void;
  sendProgress(progress: number): void;
  onPauseStateChange(callback: (isPaused: boolean) => void): void;
};

declare global {
  interface Window {
    GameInterface?: GameInterface;
  }
}

const getGameInterface = (): GameInterface => {
  const gameInterface = window.GameInterface;
  if (!gameInterface) {
    throw new Error('Famobi GameInterface is unavailable. Load the Famobi SDK before the game.');
  }
  return gameInterface;
};

const reportSdkError = (operation: string, error: unknown): void => {
  console.error(`Famobi SDK operation failed: ${operation}`, error);
};

export class FamobiPlatformAdapter implements PlatformSdk {
  private unsubscribers: Array<() => void> = [];

  // GameInterface.init() is called by the page (index.html), which loads the game bundle
  // through it. By the time this adapter exists, the SDK is initialised.
  connect(controller: GameController): () => void {
    const gameInterface = getGameInterface();

    const subscriptions = [
      controller.events.on('ready', () => {
        gameInterface.gameReady();
      }),
      controller.events.on('runStarted', (event) => {
        void gameInterface.gameStart(event.level, {
          metrics: { runNumber: event.runNumber }
        }).catch((error) => reportSdkError('gameStart', error));
      }),
      controller.events.on('runEnded', (event) => {
        void gameInterface.gameEnd(event.reason, {
          metrics: {
            level: event.level,
            score: event.score,
            progress: event.progress,
            durationMs: event.durationMs
          }
        }).catch((error) => reportSdkError('gameEnd', error));
      }),
      controller.events.on('scoreChanged', (event) => {
        gameInterface.sendScore(event.score, { type: 'level', level: event.level });
      }),
      controller.events.on('progressChanged', (event) => {
        gameInterface.sendProgress(event.progress);
      }),
      controller.events.on('pauseChanged', (event) => {
        const operation = event.paused ? gameInterface.gamePause() : gameInterface.gameResume();
        void operation.catch((error) => reportSdkError(event.paused ? 'gamePause' : 'gameResume', error));
      })
    ];

    gameInterface.onPauseStateChange((paused) => controller.setSystemPaused(paused));

    const unsubscribe = (): void => {
      subscriptions.forEach((subscription) => subscription());
      this.unsubscribers = this.unsubscribers.filter((item) => item !== unsubscribe);
    };
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  dispose(): void {
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }
}

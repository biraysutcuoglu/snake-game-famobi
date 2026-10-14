import type { GameController } from '../GameController';
import type { GameEventMap } from '../gameEvents';

export type PlatformEventName = keyof GameEventMap;

export type PlatformSdk = {
  initialize(): Promise<void>;
  connect(controller: GameController): () => void;
  dispose(): void;
};

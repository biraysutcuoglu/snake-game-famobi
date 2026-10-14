# Neon Snake

A compact browser game built with Phaser 3, TypeScript, Vite, and a DOM-based interface.

This repository is intentionally a small game only. It does not contain a
bundled Famobi SDK package, analytics backend, or dashboard.

The game integrates Famobi's `GameInterface` through
[`FamobiPlatformAdapter`](src/application/platform/FamobiPlatformAdapter.ts).
The Famobi host script is loaded from `https://api.games.famobi.com/init.js`.
When running outside the Famobi host, SDK initialization reports an error in the
browser console and the game remains available for local development.

When a run starts, the event flow is:

```text
SnakeGame changes phase to "playing"
        ↓
SnakeGame.emit()
        ↓
GameController.handleSnapshot(snapshot)
        ↓
GameController emits "runStarted"
        ↓
FamobiPlatformAdapter calls gameInterface.gameStart()
```

## Gameplay

- Clear three increasingly fast levels.
- Eat the required number of fruit to advance.
- Avoid walls, your own trail, and level obstacles.
- Pause, resume, retry, or return to the main menu.
- Unlock levels, retain a best score, and restore mute preferences between sessions.
- Hear lightweight procedural sound effects without external audio assets.
- Play with arrow keys, WASD, swipe gestures, or the on-screen direction pad.

## Run locally

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by Vite.

## Checks

```bash
pnpm check
pnpm build
pnpm preview
```

## Project structure

```text
src/
├── application/
│   ├── GameController.ts
│   └── gameEvents.ts
├── core/
│   ├── audio/
│   │   └── GameAudio.ts
│   ├── events/
│   │   └── EventBus.ts
│   └── storage/
│       └── GameStorage.ts
├── game/
│   ├── input.ts
│   ├── levels.ts
│   ├── scenes/
│   │   └── SnakeScene.ts
│   ├── snakeGame.ts
│   └── types.ts
├── main.ts
└── style.css
```

The game simulation remains independent from Phaser. An application controller coordinates commands, persistence, audio, and domain events. The Phaser scene adapts simulation state into graphics and input, while the HUD and menus remain accessible DOM elements.

Player preferences, the best score, completed runs, and unlocked levels are saved locally. Audio is generated in the browser without external media files.

The included workflow builds and deploys the game whenever the default branch is updated.

## License

MIT

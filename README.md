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

## Analytics

Gameplay is recorded as small events (`session_start`, `run_start`, `run_end`,
`run_pause`, `run_resume`, `score_update`). Every event carries a timestamp, the
level, and for `run_end` the outcome (`complete`, `fail`, `quit`), score,
progress, and duration. The contract lives in
[`src/shared/analyticsEvent.ts`](src/shared/analyticsEvent.ts) and is shared by
the game and the backend.

```text
GameController events
        ↓
AnalyticsCollector  (maps to analytics events)
        ↓
HttpBatchSink       (persisted queue, batching, retry, sendBeacon on page hide)
        ↓  POST {"events": [...]}
collectEvents       (Cloud Function: validate, de-duplicate on eventId)
        ↓
Firestore           (collection analytics_events)
```

Events stay in `localStorage` until the server acknowledges them, so a closed
tab or an offline backend delays events instead of losing them. A run that is
still active when the page is hidden is recorded as `quit`.

### Run the backend locally (Firebase Local Emulator Suite)

No Firebase account or real project is needed. Everything runs against the
emulators with the demo project id `demo-neon-snake`, configured in
[`backend/firebase.json`](backend/firebase.json).

Requirements: Node.js 22, and Java 11 or newer (the Firestore emulator is a JVM
process).

```bash
pnpm install
pnpm backend:install     # one-time: installs backend/functions (incl. firebase-tools)
pnpm emulators           # builds the function, starts Functions + Firestore + UI
pnpm dev                 # in another terminal
```

`pnpm dev` reads [`.env.development`](.env.development), which points the game
at the emulated function. Play a few runs, then open the Emulator UI at
<http://127.0.0.1:4000/firestore> and look at the `analytics_events`
collection.

| Service        | Address                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| Emulator UI    | <http://127.0.0.1:4000>                                                    |
| Function       | `http://127.0.0.1:5001/demo-neon-snake/us-central1/collectEvents`          |
| Firestore      | `127.0.0.1:8080`                                                           |

Try the endpoint directly:

```bash
curl -X POST http://127.0.0.1:5001/demo-neon-snake/us-central1/collectEvents \
  -H 'Content-Type: text/plain' \
  -d '{"events":[{"eventId":"demo-1","name":"run_end","timestamp":1760000000000,"sessionId":"s","runId":"s-1","level":2,"outcome":"fail","failureReason":"wall","score":140,"progress":0.6,"durationMs":42000}]}'
```

Firestore security rules deny all client access; only the function writes, and
it stamps each event with a server `receivedAt` next to the player's
`timestamp`. A resent event is detected by its `eventId` and ignored.

### Tests

```bash
pnpm test                       # game: collector and sink
pnpm backend:test               # backend: request handling, no emulator needed
pnpm backend:test:integration   # backend: function + Firestore inside the emulators
```

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

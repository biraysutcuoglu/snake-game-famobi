# Neon Snake

A browser snake game built with Phaser 3, TypeScript, and Vite, with Famobi SDK integration.

## Install and run

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm backend:install
pnpm dashboard:install
pnpm dev
```

`pnpm dev` type-checks and builds the page and standalone `game.js` bundle, injects the bundle size into `boot.js`, and starts Vite preview.

Other commands:

```bash
pnpm check
pnpm test
pnpm build
pnpm preview
```

## Analytics backend

The Firebase backend exposes `collectAnalytics` for writes and `getStats` for dashboard aggregates. It stores data in the parallel top-level `sessions` and `runs` Firestore collections. Start it locally with:

```bash
pnpm emulators
pnpm dashboard:dev
```

The local endpoints are:

```text
http://127.0.0.1:5001/demo-neon-snake/us-central1/collectAnalytics
http://127.0.0.1:5001/demo-neon-snake/us-central1/getStats
```

It accepts one lifecycle command per `POST`: `SESSION_STARTED`, `SESSION_ENDED`, `RUN_STARTED`, or `RUN_ENDED`. The shared request contract is in [`src/shared/analyticsRequest.ts`](src/shared/analyticsRequest.ts). Responses report `created`, `updated`, or `duplicate`; malformed requests return `400`, state conflicts return `409`, and unexpected failures return `500`.

Run backend checks with:

```bash
pnpm backend:test
pnpm backend:build
pnpm backend:test:integration
pnpm dashboard:test
pnpm dashboard:build
```

The Firestore transaction layer tolerates duplicate and out-of-order lifecycle commands. A terminal run can reconstruct missing run/session start documents, and `runsPlayed` is incremented only when a run becomes terminal for the first time. Firestore client access is denied; the Admin SDK function is the write boundary.

## Famobi SDK integration

The page loads the Famobi SDK (`init.js`) in `index.html`. [`public/boot.js`](public/boot.js) passes the generated `game.js` bundle to `GameInterface.init()`, and the game starts only after initialization resolves.

To verify the integration, run the game with browser DevTools open:

| Test | Steps | Expected result |
| --- | --- | --- |
| SDK loaded | Inspect Network and Console. | `init.js` and `game-interface.js` load and the SDK logs startup. |
| SDK initialized | Inspect Console during startup. | `GameInterface.init()` is called before the game starts. |
| SDK controls loading | Open with `?holdInit=1`, then click **START** on the SDK overlay. | `game.js` loads only after clicking **START**. |
| Game waits for SDK | Open with `?holdInit=1`. | Gameplay starts only after initialization is released. |

The loading overlay and retry button belong to the game. Loading progress is reported through `GameInterface.sendPreloadProgress`.

## Analytics extension point

`GameController` emits typed gameplay events. `AnalyticsCollector` subscribes to them and projects the lifecycle into the session and run documents defined in [`src/shared/analyticsDocument.ts`](src/shared/analyticsDocument.ts).

- Sessions are created when the game is ready and finalized when the page closes.
- Runs are created with `IN_PROGRESS` and finalized as `SUCCESS`, `FAIL_WALL`, `FAIL_SELF`, or `QUIT`.
- Each run carries its parent `sessionId`; session documents count finalized runs.

The collector sends each document snapshot immediately through `HttpAnalyticsClient`, which maps it to one of the four backend lifecycle commands. Each command is an independent unload-safe HTTP request. There is no local storage, batching, or client-side retry queue. Set `VITE_ANALYTICS_URL` at build time for deployed environments; `.env.development` already targets the local Functions emulator.

Analytics transport failures are logged and remain isolated from gameplay by `AnalyticsCollector`.

## Project structure

- `src/game/` — snake simulation, levels, and Phaser scene
- `src/application/GameController.ts` — gameplay orchestration and typed events
- `src/application/platform/` — Famobi SDK adapter
- `src/application/analytics/` — analytics event listener and client boundary
- `backend/functions/` — validated Firebase HTTP endpoint and transactional Firestore store
- `dashboard/` — React dashboard backed by aggregated session and run data
- `src/core/` — event bus, audio, and game-progress storage
- `public/boot.js` — Famobi-controlled game bundle loader

## License

MIT

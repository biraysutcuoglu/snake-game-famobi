import { expect, test, type APIRequestContext } from '@playwright/test';

const PROJECT = 'demo-neon-snake';
const FIRESTORE = `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
const STATS = `http://127.0.0.1:5001/${PROJECT}/us-central1/getStats?days=7`;

type Totals = {
  sessions: number;
  runs: number;
  finishedRuns: number;
  avgSessionDurationMs: number | null;
};

const loadTotals = async (request: APIRequestContext): Promise<Totals> => {
  const response = await request.get(STATS);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { totals: Totals };
  return body.totals;
};

const famobiStub = `
  window.GameInterface = {
    init(files) {
      return Promise.all(files.map((file) => {
        if (typeof file === 'function') return file();
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = file;
          script.onload = () => resolve();
          script.onerror = reject;
          document.head.appendChild(script);
        });
      })).then(() => undefined);
    },
    sendPreloadProgress() {},
    gameReady() {},
    gameStart() { return Promise.resolve(); },
    gameEnd() { return Promise.resolve(); },
    gamePause() { return Promise.resolve(); },
    gameResume() { return Promise.resolve(); },
    sendScore() {},
    sendProgress() {},
    onPauseStateChange() {}
  };
`;

test('records a browser run and shows it in the dashboard', async ({ browser, request }) => {
  const cleared = await request.delete(FIRESTORE);
  expect(cleared.ok()).toBeTruthy();

  const gameContext = await browser.newContext();
  const game = await gameContext.newPage();
  await game.route('https://api.games.famobi.com/init.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: famobiStub })
  );

  await game.goto('http://127.0.0.1:4173');
  await game.getByRole('button', { name: 'Start game' }).click();
  await expect(game.getByRole('heading', { name: 'Game over' })).toBeVisible();

  await expect
    .poll(() => loadTotals(request))
    .toMatchObject({ sessions: 1, runs: 1, finishedRuns: 1 });

  await game.goto('about:blank');
  await expect.poll(async () => (await loadTotals(request)).avgSessionDurationMs).not.toBeNull();
  await gameContext.close();

  const dashboard = await browser.newPage();
  await dashboard.goto('http://127.0.0.1:4174');
  await expect(dashboard.getByRole('heading', { name: 'Neon Snake analytics' })).toBeVisible();
  await expect(dashboard.getByText('Run finish rate').locator('..')).toContainText('100%');
  await expect(dashboard.getByText('Run success rate').locator('..')).toContainText('0%');

  const failures = dashboard.getByRole('region', { name: 'Why runs fail' });
  await failures.getByText('Show as table').click();
  await expect(failures.getByRole('cell', { name: 'Hit a wall' })).toBeVisible();
  await expect(failures.getByRole('cell', { name: '1', exact: true })).toBeVisible();
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'pnpm emulators',
      url: 'http://127.0.0.1:5001/demo-neon-snake/us-central1/getStats?days=1',
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: 'pnpm e2e:game',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: 'pnpm --dir dashboard dev --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});

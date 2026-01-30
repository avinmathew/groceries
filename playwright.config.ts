import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 10_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001/groceries/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'npx prisma db push --skip-generate --force-reset && npm run dev',
    url: 'http://localhost:3001/groceries',
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: 'file:./e2e.db',
      NODE_ENV: 'test',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_DISABLE_SW: '1',
      PORT: '3001',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

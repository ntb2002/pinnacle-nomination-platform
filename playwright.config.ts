import { defineConfig, devices } from "@playwright/test";

// E2E runs against the production build (`npm run build` first; CI does).
// The server uses the e2e database, which global setup resets and migrates.
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
export const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? "postgresql://pinnacle:pinnacle@localhost:5432/pinnacle_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node .next/standalone/server.js",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      APP_URL: baseURL,
      DATABASE_URL: e2eDatabaseUrl,
      BETTER_AUTH_SECRET: "test-only-secret-not-for-production-000000",
      EMAIL_TRANSPORT: "outbox",
      DEMO_MODE: "true",
    },
  },
});

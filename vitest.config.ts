import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests (tests/unit) are pure. Integration tests (tests/integration) run against
// a real Postgres at TEST_DATABASE_URL; files run one at a time so they can reset tables.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://pinnacle:pinnacle@localhost:5432/pinnacle_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server Components; tests are server code.
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    globalSetup: ["tests/support/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: testDatabaseUrl,
    },
  },
});

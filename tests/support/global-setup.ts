import { execFileSync } from "node:child_process";

/** Resets the test database and applies all migrations once per test run. */
export default function setup() {
  execFileSync("npx", ["tsx", "scripts/db-reset.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://pinnacle:pinnacle@localhost:5432/pinnacle_test",
    },
  });
}

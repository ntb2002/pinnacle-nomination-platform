import { execFileSync } from "node:child_process";
import { e2eDatabaseUrl } from "../../playwright.config";

/** Fresh e2e database for every run: reset schema and apply migrations. */
export default function globalSetup() {
  execFileSync("npx", ["tsx", "scripts/db-reset.ts"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: e2eDatabaseUrl },
  });
}

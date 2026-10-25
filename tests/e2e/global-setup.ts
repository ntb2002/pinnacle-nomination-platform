import { execFileSync } from "node:child_process";
import { e2eDatabaseUrl } from "../../playwright.config";

/** Fresh e2e database for every run: reset, migrate, and seed demo data with the window open. */
export default function globalSetup() {
  const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: e2eDatabaseUrl };
  execFileSync("npx", ["tsx", "scripts/db-reset.ts"], { stdio: "inherit", env });
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--open-now"], { stdio: "inherit", env });
}

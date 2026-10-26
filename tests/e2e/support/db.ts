import { Pool } from "pg";
import { e2eDatabaseUrl } from "../../../playwright.config";

let pool: Pool | undefined;
/** Direct access to the e2e database, for reading the email outbox and asserting state. */
export function e2eDb(): Pool {
  pool ??= new Pool({ connectionString: e2eDatabaseUrl, max: 2 });
  return pool;
}

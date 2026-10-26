/**
 * Destructive scripts (db:reset, db:seed --reset) only run against a local database
 * whose name ends in _dev, _test or _e2e, unless ALLOW_DB_RESET=1 is set explicitly.
 * NODE_ENV alone is not trusted: a copied .env can say "development" anywhere.
 */
export function assertSafeToReset(databaseUrl: string, env: Record<string, string | undefined>) {
  if (env.ALLOW_DB_RESET === "1") return;
  if (env.NODE_ENV === "production") throw new Error("Refused: NODE_ENV=production.");
  const url = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const dbName = url.pathname.replace(/^\//, "");
  if (!localHosts.has(url.hostname) || !/_(dev|test|e2e)$/.test(dbName)) {
    throw new Error(
      `Refused to reset ${url.hostname}/${dbName}: only local *_dev, *_test or *_e2e databases. ` +
        "Set ALLOW_DB_RESET=1 to override deliberately.",
    );
  }
}

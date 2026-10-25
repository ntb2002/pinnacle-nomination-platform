// Next's standalone output omits static assets; copy them in so
// `node .next/standalone/server.js` serves a complete app.
// Next also copies a local .env into the output: remove it so secrets never ship.
import { cpSync, existsSync, rmSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
for (const f of [".env", ".env.local", ".env.production"]) {
  rmSync(`.next/standalone/${f}`, { force: true });
}
console.log("Standalone output prepared.");

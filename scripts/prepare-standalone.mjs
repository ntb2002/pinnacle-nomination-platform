// Next's standalone output omits static assets; copy them in so
// `node .next/standalone/server.js` serves a complete app (also used by the Dockerfile).
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
console.log("Standalone output prepared.");

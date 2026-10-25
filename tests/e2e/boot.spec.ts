import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

test("the server exits at boot when configuration is invalid", async () => {
  const child = spawn("node", [".next/standalone/server.js"], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      PORT: "3190",
      APP_URL: "",
      DATABASE_URL: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 20_000);
    child.on("exit", (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  expect(code, "server should exit, not keep serving").not.toBeNull();
  expect(code).not.toBe(0);
  expect(stderr).toMatch(/Invalid environment configuration/);
});

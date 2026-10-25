// Runs once when the server starts. Validating config here makes a misconfigured
// deploy fail at boot with a readable message instead of on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
  }
}

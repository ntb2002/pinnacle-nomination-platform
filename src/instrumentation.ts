// Runs once when the server starts. Validating config here makes a misconfigured
// deploy exit at boot with a readable message instead of serving errors.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env, paymentConfigProblems } = await import("@/lib/env");
    try {
      env();
      const problems = paymentConfigProblems();
      if (problems.length > 0) {
        throw new Error(
          `Invalid payment configuration (see .env.example):\n${problems.join("\n")}`,
        );
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
    // Retries emails the mail server refused (no-op unless EMAIL_TRANSPORT=smtp).
    const { startEmailRetryLoop } = await import("@/server/email/retry");
    startEmailRetryLoop();
  }
}

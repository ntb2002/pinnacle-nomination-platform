import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Config is read only through src/lib/env.ts (AGENTS.md).
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Read config through src/lib/env.ts." },
      ],
      // Next 16.4: a bound server action used with useActionState never answers a
      // no-JavaScript submission that returns state (React retries a stack overflow
      // forever, pinning a CPU core). Pass ids as hidden inputs instead.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='useActionState'] > CallExpression.arguments[callee.property.name='bind']",
          message:
            "Do not bind arguments into a useActionState action; pass ids as hidden form inputs (AGENTS.md).",
        },
      ],
    },
  },
  {
    files: [
      "src/lib/env.ts",
      "src/instrumentation.ts",
      "next.config.ts",
      "drizzle.config.ts",
      "playwright.config.ts",
      "vitest.config.ts",
      "scripts/**",
      "tests/**",
    ],
    rules: { "no-restricted-properties": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a complete configuration", () => {
    expect(parseEnv(valid)).toMatchObject({ NODE_ENV: "development", APP_URL: valid.APP_URL });
  });

  it("rejects a missing DATABASE_URL with a readable message", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(EnvError);
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("defaults to local file storage and requires a bucket and region for S3", () => {
    expect(parseEnv(valid)).toMatchObject({ STORAGE_DRIVER: "local", STORAGE_DIR: "./storage" });
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
    expect(
      parseEnv({ ...valid, STORAGE_DRIVER: "s3", S3_BUCKET: "uploads", S3_REGION: "us-east-1" }),
    ).toMatchObject({ STORAGE_DRIVER: "s3" });
  });

  it("rejects an invalid APP_URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not a url" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ ...valid, APP_URL: "ftp://example.com" })).toThrow(/APP_URL/);
  });

  it("rejects a trailing slash and plain http in production", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "http://localhost:3000/" })).toThrow(/APP_URL/);
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: "production", APP_URL: "http://pinnacle.example.edu" }),
    ).toThrow(/https/);
    expect(parseEnv({ ...valid, NODE_ENV: "production" })).toMatchObject({
      APP_URL: valid.APP_URL,
    });
    expect(
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        APP_URL: "https://pinnacle.example.edu",
        EMAIL_TRANSPORT: "smtp",
        SMTP_URL: "smtps://u:p@smtp.example.edu:465",
        EMAIL_FROM: "Pinnacle Awards <pinnacle@example.edu>",
      }),
    ).toMatchObject({ NODE_ENV: "production" });
  });

  it("requires SMTP in real production and a strong auth secret", () => {
    const prod = { ...valid, NODE_ENV: "production", APP_URL: "https://pinnacle.example.edu" };
    expect(() => parseEnv(prod)).toThrow(/EMAIL_TRANSPORT/);
    expect(() => parseEnv({ ...prod, EMAIL_TRANSPORT: "smtp" })).toThrow(/SMTP_URL/);
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });
});

describe("production-only rules", () => {
  const prod = {
    ...valid,
    NODE_ENV: "production",
    APP_URL: "https://pinnacle.example.edu",
    EMAIL_TRANSPORT: "smtp",
    SMTP_URL: "smtps://u:p@smtp.example.edu:465",
    EMAIL_FROM: "Pinnacle Awards <pinnacle@example.edu>",
  };
  it("requires a sender and implicit-TLS SMTP", () => {
    expect(parseEnv(prod)).toMatchObject({ EMAIL_TRANSPORT: "smtp" });
    expect(() => parseEnv({ ...prod, EMAIL_FROM: undefined })).toThrow(/EMAIL_FROM/);
    expect(() => parseEnv({ ...prod, SMTP_URL: "smtp://u:p@smtp.example.edu:587" })).toThrow(
      /smtps/,
    );
  });
  it("refuses BETTER_AUTH_TRUSTED_ORIGINS", () => {
    expect(() =>
      parseEnv({ ...valid, BETTER_AUTH_TRUSTED_ORIGINS: "https://evil.example" }),
    ).toThrow(/BETTER_AUTH_TRUSTED_ORIGINS/);
  });
  it("tells real production from a local production build", async () => {
    const { isRealProduction } = await import("@/lib/env");
    expect(isRealProduction(parseEnv(prod))).toBe(true);
    expect(isRealProduction(parseEnv({ ...valid, NODE_ENV: "production" }))).toBe(false);
  });
});

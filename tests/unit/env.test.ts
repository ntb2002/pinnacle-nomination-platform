import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
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

  it("rejects an invalid APP_URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not a url" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ ...valid, APP_URL: "ftp://example.com" })).toThrow(/APP_URL/);
  });

  it("rejects a trailing slash and plain http in production", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "http://localhost:3000/" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(/https/);
    expect(
      parseEnv({ ...valid, NODE_ENV: "production", APP_URL: "https://pinnacle.example.edu" }),
    ).toMatchObject({ NODE_ENV: "production" });
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });
});

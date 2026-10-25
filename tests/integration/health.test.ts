import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { closeDb } from "@/server/db";

afterAll(async () => {
  await closeDb();
});

describe("GET /api/health", () => {
  it("reports ok when the database is reachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });
});

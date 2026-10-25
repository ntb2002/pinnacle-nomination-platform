import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: { execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED db.internal:5432")) },
}));

describe("GET /api/health when the database is down", () => {
  it("returns 503 without leaking error details", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(JSON.stringify({ status: "degraded", db: "unavailable" }));
  });
});

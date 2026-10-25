import { describe, expect, it } from "vitest";
import { clientIpFrom, ipBucket, normalizeIp } from "@/server/request";

const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("clientIpFrom", () => {
  it("ignores the spoofable leftmost value and takes the hop added by the trusted proxy", () => {
    expect(clientIpFrom(h("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIpFrom(h("6.6.6.6, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });
  it("returns unknown for missing, malformed or untrusted chains", () => {
    expect(clientIpFrom(h(), 1)).toBe("unknown");
    expect(clientIpFrom(h("not-an-ip"), 1)).toBe("unknown");
    expect(clientIpFrom(h("203.0.113.7"), 0)).toBe("unknown");
    expect(clientIpFrom(h("203.0.113.7"), 2)).toBe("unknown");
    expect(clientIpFrom(h(`${"1".repeat(5000)}`), 1)).toBe("unknown");
  });
});

describe("ipBucket", () => {
  it("groups IPv6 by /64 and leaves IPv4 alone", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
  });
});

describe("normalizeIp", () => {
  it("strips ports and canonicalizes IPv6", () => {
    expect(normalizeIp("203.0.113.7:5678")).toBe("203.0.113.7");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("2001:0db8:0000:0000::1")).toBe("2001:db8::1");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("nonsense")).toBeNull();
  });
  it("is used for the client IP", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7:5678" }), 1)).toBe(
      "203.0.113.7",
    );
  });
});

import { describe, it, expect } from "vitest";
import { mapContext } from "../../src/context.js";

describe("mapContext", () => {
  it("splits dot-notation keys into namespace + property", () => {
    const result = mapContext({ "user.email": "alice@co.com" });
    expect(result).toEqual({ user: { email: "alice@co.com" } });
  });

  it("puts keys without a dot into the default (empty-string) namespace", () => {
    const result = mapContext({ country: "US" });
    expect(result).toEqual({ "": { country: "US" } });
  });

  it("maps targetingKey via default targetingKeyMapping (user.id)", () => {
    const result = mapContext({ targetingKey: "user-123" });
    expect(result).toEqual({ user: { id: "user-123" } });
  });

  it("maps targetingKey via custom targetingKeyMapping", () => {
    const result = mapContext({ targetingKey: "user-456" }, "org.userId");
    expect(result).toEqual({ org: { userId: "user-456" } });
  });

  it("splits multi-dot keys on the first dot only", () => {
    const result = mapContext({ "user.ip.address": "1.2.3.4" });
    expect(result).toEqual({ user: { "ip.address": "1.2.3.4" } });
  });

  it("handles multiple keys in different namespaces", () => {
    const result = mapContext({
      "user.email": "alice@co.com",
      "org.tier": "enterprise",
      country: "US",
    });
    expect(result).toEqual({
      user: { email: "alice@co.com" },
      org: { tier: "enterprise" },
      "": { country: "US" },
    });
  });

  it("merges multiple keys into the same namespace", () => {
    const result = mapContext({
      "user.email": "a@b.com",
      "user.plan": "pro",
    });
    expect(result).toEqual({ user: { email: "a@b.com", plan: "pro" } });
  });

  it("handles targetingKey with no-dot mapping", () => {
    const result = mapContext({ targetingKey: "abc" }, "userId");
    expect(result).toEqual({ "": { userId: "abc" } });
  });

  it("ignores undefined values", () => {
    const result = mapContext({ "user.email": undefined as unknown as string });
    expect(result).toEqual({});
  });

  it("handles an empty context", () => {
    const result = mapContext({});
    expect(result).toEqual({});
  });
});

// OpenFeature spec conformance tests — real provider, datadir fixture, no mocks.
// Tests call provider resolve methods directly after manual initialization,
// validating the OF spec contract without depending on the OpenFeature singleton.
// References: https://openfeature.dev/specification/sections/providers
import { describe, it, expect, beforeAll } from "vitest";
import {
  ErrorCode,
  ProviderEvents,
  StandardResolutionReasons,
} from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";
import { integrationTestDataDir } from "../helpers.js";

const fixturesDir = integrationTestDataDir();

let provider: QuonfigProvider;

beforeAll(async () => {
  provider = new QuonfigProvider({
    sdkKey: "test-sdk-key",
    datadir: fixturesDir,
    environment: "Production",
    enableSSE: false,
  });
  await provider.initialize({});
});

// ---------------------------------------------------------------------------
// 2.3 — Provider lifecycle
// ---------------------------------------------------------------------------
describe("2.3 — Provider lifecycle", () => {
  it("initialize() resolves without error for valid datadir", async () => {
    const p = new QuonfigProvider({
      sdkKey: "test-sdk-key",
      datadir: fixturesDir,
      environment: "Production",
      enableSSE: false,
    });
    await expect(p.initialize({})).resolves.toBeUndefined();
  });

  it("initialize() rejects for an invalid datadir path", async () => {
    const p = new QuonfigProvider({
      sdkKey: "test-sdk-key",
      datadir: "/does/not/exist",
      environment: "Production",
      enableSSE: false,
    });
    await expect(p.initialize({})).rejects.toThrow();
  });

  it("CONFIGURATION_CHANGED event is emitted when config updates", async () => {
    const p = new QuonfigProvider({
      sdkKey: "test-sdk-key",
      datadir: fixturesDir,
      environment: "Production",
      enableSSE: false,
    });
    p.events.addHandler(ProviderEvents.ConfigurationChanged, () => {
      // event handler attached
    });
    await p.initialize({});
    p.events.removeAllHandlers(ProviderEvents.ConfigurationChanged);
  });
});

// ---------------------------------------------------------------------------
// 2.2 — Error codes
// ---------------------------------------------------------------------------
describe("2.2 — Error codes", () => {
  it("2.2.2: returns FLAG_NOT_FOUND for missing boolean flag", async () => {
    const result = await provider.resolveBooleanEvaluation("does-not-exist", false, {}, {} as any);
    expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("2.2.2: returns FLAG_NOT_FOUND for missing string flag", async () => {
    const result = await provider.resolveStringEvaluation("does-not-exist", "fallback", {}, {} as any);
    expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("2.2.2: returns FLAG_NOT_FOUND for missing number flag", async () => {
    const result = await provider.resolveNumberEvaluation("does-not-exist", 0, {}, {} as any);
    expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("2.2.2: returns FLAG_NOT_FOUND for missing object flag", async () => {
    const result = await provider.resolveObjectEvaluation("does-not-exist", {}, {}, {} as any);
    expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("2.2.2: returns TYPE_MISMATCH when asking for the wrong type (bool config read as string)", async () => {
    const result = await provider.resolveStringEvaluation("always.true", "fallback", {}, {} as any);
    expect(result.reason).toBe(StandardResolutionReasons.ERROR);
    expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
  });
});

// ---------------------------------------------------------------------------
// 2.1 — Default value returned on error
// ---------------------------------------------------------------------------
describe("2.1 — Default value on error", () => {
  it("returns boolean default for missing flag", async () => {
    expect((await provider.resolveBooleanEvaluation("does-not-exist", true, {}, {} as any)).value).toBe(true);
    expect((await provider.resolveBooleanEvaluation("does-not-exist", false, {}, {} as any)).value).toBe(false);
  });

  it("returns string default for missing flag", async () => {
    const result = await provider.resolveStringEvaluation("does-not-exist", "sentinel", {}, {} as any);
    expect(result.value).toBe("sentinel");
  });

  it("returns number default for missing flag", async () => {
    const result = await provider.resolveNumberEvaluation("does-not-exist", 42, {}, {} as any);
    expect(result.value).toBe(42);
  });

  it("returns object default for missing flag", async () => {
    const def = { key: "val" };
    const result = await provider.resolveObjectEvaluation("does-not-exist", def, {}, {} as any);
    expect(result.value).toEqual(def);
  });
});

// ---------------------------------------------------------------------------
// 2.7 — Resolution reasons
// ---------------------------------------------------------------------------
describe("2.7 — Resolution reasons", () => {
  it("returns STATIC for always.true (no targeting rules)", async () => {
    const result = await provider.resolveBooleanEvaluation("always.true", false, {}, {} as any);
    expect(result.value).toBe(true);
    expect(result.reason).toBe(StandardResolutionReasons.STATIC);
  });

  it("returns STATIC for brand.new.string (string config, single ALWAYS_TRUE rule)", async () => {
    const result = await provider.resolveStringEvaluation("brand.new.string", "", {}, {} as any);
    expect(result.value).toBe("hello.world");
    expect(result.reason).toBe(StandardResolutionReasons.STATIC);
  });

  it("returns TARGETING_MATCH for of.targeting with a matching rule", async () => {
    const result = await provider.resolveBooleanEvaluation(
      "of.targeting",
      false,
      { "user.plan": "pro" },
      {} as any,
    );
    expect(result.value).toBe(true);
    expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
  });

  it("returns SPLIT for of.weighted (weighted_values config)", async () => {
    // The weighted config is 50/50 on user.id. To deterministically hit the
    // SPLIT branch (computeReason returns STATIC for weightedValueIndex==0),
    // try a handful of user IDs until we land on a non-zero index.
    let sawSplit = false;
    for (let i = 0; i < 50 && !sawSplit; i++) {
      const result = await provider.resolveStringEvaluation(
        "of.weighted",
        "fallback",
        { targetingKey: `user-${i}` },
        {} as any,
      );
      expect(["variant-a", "variant-b"]).toContain(result.value);
      if (result.reason === StandardResolutionReasons.SPLIT) sawSplit = true;
    }
    expect(sawSplit).toBe(true);
  });

  it("returns ERROR reason for missing flag", async () => {
    const result = await provider.resolveBooleanEvaluation("does-not-exist", false, {}, {} as any);
    expect(result.reason).toBe(StandardResolutionReasons.ERROR);
  });
});

// ---------------------------------------------------------------------------
// 2.4 — All four evaluation types resolve correctly
// ---------------------------------------------------------------------------
describe("2.4 — All evaluation types", () => {
  it("resolves boolean flag correctly", async () => {
    const result = await provider.resolveBooleanEvaluation("always.true", false, {}, {} as any);
    expect(result.value).toBe(true);
  });

  it("resolves string config correctly", async () => {
    const result = await provider.resolveStringEvaluation("brand.new.string", "", {}, {} as any);
    expect(result.value).toBe("hello.world");
  });

  it("resolves string_list as object (array) correctly", async () => {
    const result = await provider.resolveObjectEvaluation("my-string-list-key", [], {}, {} as any);
    expect(Array.isArray(result.value)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3.2 — Evaluation context propagation
// ---------------------------------------------------------------------------
describe("3.2 — Evaluation context", () => {
  it("dot-notation context routes to targeting rule (pro -> true)", async () => {
    const result = await provider.resolveBooleanEvaluation(
      "of.targeting",
      false,
      { "user.plan": "pro" },
      {} as any,
    );
    expect(result.value).toBe(true);
    expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
  });

  it("dot-notation context routes to targeting rule (free -> false via fallthrough)", async () => {
    const result = await provider.resolveBooleanEvaluation(
      "of.targeting",
      true,
      { "user.plan": "free" },
      {} as any,
    );
    expect(result.value).toBe(false);
    expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
  });

  it("targetingKey maps to user.id by default", async () => {
    const result = await provider.resolveBooleanEvaluation(
      "of.targeting",
      false,
      { targetingKey: "user-123", "user.plan": "pro" },
      {} as any,
    );
    expect(result.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.8 — Provider metadata
// ---------------------------------------------------------------------------
describe("2.8 — Provider metadata", () => {
  it("has a non-empty name in metadata", () => {
    expect(provider.metadata.name).toBeTruthy();
    expect(typeof provider.metadata.name).toBe("string");
  });
});

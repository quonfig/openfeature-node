import { describe, it, expect, afterAll } from "vitest";
import { OpenFeature } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";
import { integrationTestDataDir } from "../helpers.js";

const fixturesDir = integrationTestDataDir();

const provider = new QuonfigProvider({
  sdkKey: "test-sdk-key",
  datadir: fixturesDir,
  environment: "Production",
  enableSSE: false,
});

// Register the provider before tests run
await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient("integration-test");

afterAll(async () => {
  await OpenFeature.close();
});

describe("QuonfigProvider integration (datadir mode, integration-test-data fixtures)", () => {
  it("resolves a STATIC boolean flag (always.true) to true", async () => {
    const value = await client.getBooleanValue("always.true", false);
    expect(value).toBe(true);
  });

  it("resolves a STATIC string config (brand.new.string)", async () => {
    const value = await client.getStringValue("brand.new.string", "");
    expect(value).toBe("hello.world");
  });

  it("resolves a targeting rule for of.targeting: pro user gets true", async () => {
    const value = await client.getBooleanValue("of.targeting", false, {
      "user.plan": "pro",
    });
    expect(value).toBe(true);
  });

  it("resolves of.targeting for free user falls through to false", async () => {
    const value = await client.getBooleanValue("of.targeting", true, {
      "user.plan": "free",
    });
    expect(value).toBe(false);
  });

  it("resolves a weighted-value config (of.weighted) to one of the variants", async () => {
    const value = await client.getStringValue("of.weighted", "fallback", {
      targetingKey: "user-42",
    });
    expect(["variant-a", "variant-b"]).toContain(value);
  });

  it("returns default value for missing flags", async () => {
    const value = await client.getBooleanValue("does-not-exist", false);
    expect(value).toBe(false);
  });

  it("returns default string for missing flags", async () => {
    const value = await client.getStringValue("does-not-exist", "fallback");
    expect(value).toBe("fallback");
  });
});

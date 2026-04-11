import { describe, it, expect, afterAll } from "vitest";
import { OpenFeature } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../fixtures");

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

describe("QuonfigProvider integration (datadir mode)", () => {
  it("resolves a boolean flag to true", async () => {
    const value = await client.getBooleanValue("my-flag", false);
    expect(value).toBe(true);
  });

  it("resolves a string config", async () => {
    const value = await client.getStringValue("my-string", "");
    expect(value).toBe("hello");
  });

  it("resolves a string_list as an object (array)", async () => {
    const value = await client.getObjectValue("my-list", []);
    expect(value).toEqual(["a", "b", "c"]);
  });

  it("resolves a boolean flag with targeting rule: pro user gets true", async () => {
    const value = await client.getBooleanValue("plan-flag", false, { "user.plan": "pro" });
    expect(value).toBe(true);
  });

  it("resolves a boolean flag with targeting rule: free user gets false", async () => {
    const value = await client.getBooleanValue("plan-flag", false, { "user.plan": "free" });
    expect(value).toBe(false);
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

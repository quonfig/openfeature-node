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

  describe("variant + flagMetadata (qfg-9dbl)", () => {
    it("STATIC: variant='static', flagMetadata has configId/configType/environment", async () => {
      const details = await client.getBooleanDetails("always.true", false);
      expect(details.value).toBe(true);
      expect(details.reason).toBe("STATIC");
      expect(details.variant).toBe("static");
      const md = details.flagMetadata as Record<string, unknown>;
      expect(typeof md.configId).toBe("string");
      expect(md.configType).toBe("FEATURE_FLAG");
      expect(md.environment).toBe("Production");
      expect(md.ruleIndex).toBeUndefined();
      expect(md.weightedValueIndex).toBeUndefined();
    });

    it("TARGETING_MATCH: variant='targeting:0', flagMetadata.ruleIndex=0", async () => {
      const details = await client.getBooleanDetails("of.targeting", false, {
        "user.plan": "pro",
      });
      expect(details.value).toBe(true);
      expect(details.reason).toBe("TARGETING_MATCH");
      expect(details.variant).toBe("targeting:0");
      const md = details.flagMetadata as Record<string, unknown>;
      expect(md.configId).toBe("18000000000000001");
      expect(md.configType).toBe("CONFIG");
      expect(md.ruleIndex).toBe(0);
      expect(md.weightedValueIndex).toBeUndefined();
    });

    it("SPLIT: variant='split:<n>' matches flagMetadata.weightedValueIndex", async () => {
      let saw: { variant?: string; md?: Record<string, unknown> } | undefined;
      for (let i = 0; i < 100; i++) {
        const d = await client.getStringDetails("of.weighted", "fallback", {
          targetingKey: `user-${i}`,
        });
        if (d.reason === "SPLIT") {
          saw = { variant: d.variant, md: d.flagMetadata as Record<string, unknown> };
          break;
        }
      }
      expect(saw).toBeDefined();
      expect(saw!.variant).toMatch(/^split:[0-9]+$/);
      expect(saw!.md!.weightedValueIndex).toBe(Number(saw!.variant!.split(":")[1]));
      expect(typeof saw!.md!.ruleIndex).toBe("number");
    });

    it("ERROR FLAG_NOT_FOUND: errorMessage set (OF client strips variant on error)", async () => {
      // Note: the OpenFeature JS server-sdk strips `variant` from the
      // EvaluationDetails on the error path (see getErrorEvaluationDetails
      // in @openfeature/server-sdk). The provider does set variant='default'
      // on its ResolutionDetails — see the unit test in test/unit/provider.test.ts.
      const details = await client.getBooleanDetails("does-not-exist", false);
      expect(details.reason).toBe("ERROR");
      expect(details.errorCode).toBe("FLAG_NOT_FOUND");
      expect(typeof details.errorMessage).toBe("string");
    });

    it("ERROR FLAG_NOT_FOUND: provider's ResolutionDetails has variant='default'", async () => {
      // Direct provider call — bypass the OF client error-wrapping so we can
      // assert the provider does forward the variant.
      const result = await provider.resolveBooleanEvaluation(
        "does-not-exist",
        false,
        {},
        {} as never
      );
      expect(result.reason).toBe("ERROR");
      expect(result.errorCode).toBe("FLAG_NOT_FOUND");
      expect(result.variant).toBe("default");
      expect(typeof result.errorMessage).toBe("string");
    });
  });
});

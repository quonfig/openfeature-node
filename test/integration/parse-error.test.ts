// PARSE_ERROR vs TYPE_MISMATCH (qfg-9xsl), mirroring integration-test-data
// tests/openfeature/openfeature.yaml Case 6 and the malformed-duration case of
// Case 2.
//
// A value that has the requested type but cannot be parsed (a stored int
// "twelve", an int provided by an env var set to "twelve", a stored duration
// "30s") returns the caller's default with reason ERROR and errorCode
// PARSE_ERROR. Reading a config with the method for another type stays
// TYPE_MISMATCH.
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { ErrorCode, OpenFeature, StandardResolutionReasons } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";
import { integrationTestDataDir } from "../helpers.js";

// Env vars the provided.* fixtures read, and the values these tests give them.
const ENV_VARS: Record<string, string> = {
  QUONFIG_ITD_GETTER_INT: "twelve",
  QUONFIG_ITD_DURATION_PT1_5S: "PT1.5S",
  QUONFIG_ITD_DURATION_30S: "30s",
};
const previousEnv = Object.fromEntries(Object.keys(ENV_VARS).map((k) => [k, process.env[k]]));

const provider = new QuonfigProvider({
  sdkKey: "test-sdk-key",
  datadir: integrationTestDataDir(),
  environment: "Production",
  enableSSE: false,
});

await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient("parse-error");

beforeAll(() => {
  Object.assign(process.env, ENV_VARS);
});

afterAll(async () => {
  for (const [k, v] of Object.entries(previousEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await OpenFeature.close();
});

function expectError(
  details: { value: unknown; reason?: string; errorCode?: ErrorCode },
  defaultValue: unknown,
  errorCode: ErrorCode
) {
  expect(details.value).toEqual(defaultValue);
  expect(details.reason).toBe(StandardResolutionReasons.ERROR);
  expect(details.errorCode).toBe(errorCode);
}

describe("Case 6: a malformed value is PARSE_ERROR; a wrong-type read is TYPE_MISMATCH", () => {
  it("malformed stored int via resolveNumberValue returns default with PARSE_ERROR", async () => {
    const details = await client.getNumberDetails("getter.contract.int.malformed", 7);
    expectError(details, 7, ErrorCode.PARSE_ERROR);
  });

  it("malformed stored double via resolveNumberValue returns default with PARSE_ERROR", async () => {
    const details = await client.getNumberDetails("getter.contract.double.malformed", 1.5);
    expectError(details, 1.5, ErrorCode.PARSE_ERROR);
  });

  it("env-var-provided malformed int via resolveNumberValue returns default with PARSE_ERROR", async () => {
    const details = await client.getNumberDetails("getter.contract.provided.int.malformed", 7);
    expectError(details, 7, ErrorCode.PARSE_ERROR);
  });

  it("int config via resolveBooleanValue returns default with TYPE_MISMATCH", async () => {
    const details = await client.getBooleanDetails("getter.contract.int", false);
    expectError(details, false, ErrorCode.TYPE_MISMATCH);
  });
});

// ITD Case 2 (qfg-177f): OpenFeature has no duration type, so a duration
// config reads through getStringValue() as its stored ISO 8601 text, unchanged.
// A stored duration that is not valid ISO 8601 is PARSE_ERROR.
describe("Case 2: durations via resolveStringValue", () => {
  it("duration via resolveStringValue returns the stored ISO string, not re-normalized", async () => {
    const details = await client.getStringDetails("test.duration.PT90S", "PT0S");
    expect(details.value).toBe("PT90S");
    expect(details.reason).toBe(StandardResolutionReasons.STATIC);
    expect(details.errorCode).toBeUndefined();
  });

  it("malformed stored duration via resolveStringValue returns default with PARSE_ERROR", async () => {
    const details = await client.getStringDetails("test.duration.malformed.30s", "PT0S");
    expectError(details, "PT0S", ErrorCode.PARSE_ERROR);
  });

  it("well-formed duration via resolveStringValue returns the stored ISO string", async () => {
    const details = await client.getStringDetails("test.duration.P1DT6H2M1.5S", "PT0S");
    expect(details.value).toBe("P1DT6H2M1.5S");
    expect(details.reason).toBe(StandardResolutionReasons.STATIC);
    expect(details.variant).toBe("static");
  });

  it("weighted duration via resolveStringValue returns the stored text with SPLIT", async () => {
    const details = await client.getStringDetails("weighted.variant.duration", "PT0S", {
      targetingKey: "u1",
    });
    expect(details.value).toBe("PT90S");
    expect(details.reason).toBe(StandardResolutionReasons.SPLIT);
    expect(details.variant).toBe("split:0");
    expect(details.flagMetadata.weightedValueIndex).toBe(0);
  });

  it("ENV_VAR-provided duration via resolveStringValue returns the env var's text", async () => {
    const details = await client.getStringDetails("provided.duration.PT1.5S", "PT0S");
    expect(details.value).toBe("PT1.5S");
    expect(details.reason).toBe(StandardResolutionReasons.STATIC);
    expect(details.errorCode).toBeUndefined();
  });

  it("malformed ENV_VAR duration via resolveStringValue returns default with PARSE_ERROR", async () => {
    const details = await client.getStringDetails("provided.duration.malformed.30s", "PT0S");
    expectError(details, "PT0S", ErrorCode.PARSE_ERROR);
  });

  it("duration via resolveNumberValue stays TYPE_MISMATCH", async () => {
    const details = await client.getNumberDetails("test.duration.PT90S", 0);
    expectError(details, 0, ErrorCode.TYPE_MISMATCH);
  });
});

// One evaluation per string resolution (qfg-177f): evaluateDetails() is the
// only read for a string, log_level or duration config, so each resolution is
// counted once in telemetry. Its result matches the typed getter's.
describe("string reads evaluate once, through evaluateDetails", () => {
  const native = provider.getClient();

  it.each(["getter.contract.string", "basic.rule.config", "log-level.struct-logger-example"])(
    "%s matches getStringDetails' value, reason, variant and flagMetadata",
    async (key) => {
      const expected = native.getStringDetails(key);
      expect(expected.value).toBeTypeOf("string");
      const got = await provider.resolveStringEvaluation(key, "fallback", {}, console as never);
      expect(got.value).toBe(expected.value);
      expect(got.reason).toBe(expected.reason);
      expect(got.variant).toBe(expected.variant);
      expect(got.flagMetadata).toEqual(expected.flagMetadata);
      expect(got.errorCode).toBeUndefined();
    }
  );

  it.each(["getter.contract.string", "test.duration.PT90S", "test.duration.malformed.30s"])(
    "%s is evaluated once, with no typed re-read",
    async (key) => {
      const untyped = vi.spyOn(native, "evaluateDetails");
      const typed = vi.spyOn(native, "getStringDetails");
      try {
        await client.getStringDetails(key, "fallback");
        expect(untyped).toHaveBeenCalledTimes(1);
        expect(typed).not.toHaveBeenCalled();
      } finally {
        untyped.mockRestore();
        typed.mockRestore();
      }
    }
  );
});

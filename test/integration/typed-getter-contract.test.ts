// Typed-getter contract (qfg-zvyy), driven through the real provider and the
// OpenFeature client against the integration-test-data `getter.contract.*`
// fixtures. No mocks: this pins what provider users inherit from
// @quonfig/node 2.0.0.
//
// The rule: a flag read with the method for another type returns the caller's
// default with reason ERROR and errorCode TYPE_MISMATCH. Strings are never
// coerced (a stored "false" is not a bool, "3" is not a number). Numbers
// convert only when exact; OpenFeature has a single number getter, which reads
// int and double configs.
import { describe, it, expect, afterAll } from "vitest";
import { ErrorCode, OpenFeature, StandardResolutionReasons } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";
import { integrationTestDataDir } from "../helpers.js";

const provider = new QuonfigProvider({
  sdkKey: "test-sdk-key",
  datadir: integrationTestDataDir(),
  environment: "Production",
  enableSSE: false,
});

await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient("typed-getter-contract");

afterAll(async () => {
  await OpenFeature.close();
});

function expectTypeMismatch(
  details: { value: unknown; reason?: string; errorCode?: ErrorCode },
  defaultValue: unknown
) {
  expect(details.value).toEqual(defaultValue);
  expect(details.reason).toBe(StandardResolutionReasons.ERROR);
  expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
}

describe("typed-getter contract: wrong type -> default + TYPE_MISMATCH", () => {
  it('boolean on a stored string "false" returns the default, not true', async () => {
    const details = await client.getBooleanDetails("getter.contract.string.false", false);
    expectTypeMismatch(details, false);
  });

  it('boolean on a stored string "true" returns the default, not true', async () => {
    const details = await client.getBooleanDetails("getter.contract.string.true", false);
    expectTypeMismatch(details, false);
  });

  it('number on a stored string "3" returns the default', async () => {
    const details = await client.getNumberDetails("getter.contract.string.number", 7);
    expectTypeMismatch(details, 7);
  });

  it("string on a stored int returns the default, not its text", async () => {
    const details = await client.getStringDetails("getter.contract.int", "fallback");
    expectTypeMismatch(details, "fallback");
  });

  it("string on a stored bool returns the default", async () => {
    const details = await client.getStringDetails("getter.contract.bool", "fallback");
    expectTypeMismatch(details, "fallback");
  });

  it("boolean on a stored int returns the default", async () => {
    const details = await client.getBooleanDetails("getter.contract.int", true);
    expectTypeMismatch(details, true);
  });

  // Malformed stored and ENV_VAR values are PARSE_ERROR, not TYPE_MISMATCH:
  // see parse-error.test.ts (qfg-9xsl).

  it("number on a duration config returns the default", async () => {
    const details = await client.getNumberDetails("getter.contract.duration", 5);
    expectTypeMismatch(details, 5);
  });

  it("object on a stored string returns the default", async () => {
    const details = await client.getObjectDetails("getter.contract.string", { d: true });
    expectTypeMismatch(details, { d: true });
  });

  it("object on a stored bool returns the default", async () => {
    const details = await client.getObjectDetails("getter.contract.bool", { d: true });
    expectTypeMismatch(details, { d: true });
  });
});

describe("typed-getter contract: matching and safely convertible types resolve", () => {
  it("boolean on a bool config", async () => {
    const details = await client.getBooleanDetails("getter.contract.bool", false);
    expect(details.value).toBe(true);
    expect(details.reason).toBe(StandardResolutionReasons.STATIC);
    expect(details.errorCode).toBeUndefined();
  });

  it("string on a string config", async () => {
    expect(await client.getStringValue("getter.contract.string", "")).toBe("fast");
  });

  it("number on an int config", async () => {
    expect(await client.getNumberValue("getter.contract.int", 0)).toBe(30);
  });

  it("number on a double config (no truncation)", async () => {
    expect(await client.getNumberValue("getter.contract.double", 0)).toBe(3.9);
  });

  it("object on a json config returns the decoded value", async () => {
    expect(await client.getObjectValue("getter.contract.json", {})).toEqual({ a: 1 });
  });

  it("object on a string_list config returns the list", async () => {
    expect(await client.getObjectValue("getter.contract.string_list", [])).toEqual(["a", "b"]);
  });
});

describe("typed-getter contract: resolution errors return the default", () => {
  it("boolean on an unset ENV_VAR returns the default with GENERAL", async () => {
    const details = await client.getBooleanDetails("getter.contract.provided.bool.missing", true);
    expect(details.value).toBe(true);
    expect(details.reason).toBe(StandardResolutionReasons.ERROR);
    expect(details.errorCode).toBe(ErrorCode.GENERAL);
  });
});

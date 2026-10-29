// PARSE_ERROR vs TYPE_MISMATCH (qfg-9xsl), mirroring integration-test-data
// tests/openfeature/openfeature.yaml Case 6 and the malformed-duration case of
// Case 2.
//
// A value that has the requested type but cannot be parsed (a stored int
// "twelve", an int provided by an env var set to "twelve", a stored duration
// "30s") returns the caller's default with reason ERROR and errorCode
// PARSE_ERROR. Reading a config with the method for another type stays
// TYPE_MISMATCH.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { ErrorCode, OpenFeature, StandardResolutionReasons } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";
import { integrationTestDataDir } from "../helpers.js";

const ENV_VAR = "QUONFIG_ITD_GETTER_INT";
const previousEnv = process.env[ENV_VAR];

const provider = new QuonfigProvider({
  sdkKey: "test-sdk-key",
  datadir: integrationTestDataDir(),
  environment: "Production",
  enableSSE: false,
});

await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient("parse-error");

beforeAll(() => {
  process.env[ENV_VAR] = "twelve";
});

afterAll(async () => {
  if (previousEnv === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = previousEnv;
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
});

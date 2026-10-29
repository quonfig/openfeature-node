import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";

// Mock @quonfig/node so we can control the client without a real server.
// The provider talks to the SDK via the *Details methods, so those are what
// we mock here.
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockGetBoolDetails = vi.fn();
const mockGetStringDetails = vi.fn();
const mockGetNumberDetails = vi.fn();
const mockGetStringListDetails = vi.fn();
const mockGetJSONDetails = vi.fn();
const mockRawConfig = vi.fn();
const mockEvaluateDetails = vi.fn();

const mockClientInstance = {
  init: mockInit,
  close: mockClose,
  isReady: vi.fn(() => true),
  waitForReady: vi.fn().mockResolvedValue(undefined),
  getBoolDetails: mockGetBoolDetails,
  getStringDetails: mockGetStringDetails,
  getNumberDetails: mockGetNumberDetails,
  getStringListDetails: mockGetStringListDetails,
  getJSONDetails: mockGetJSONDetails,
  rawConfig: mockRawConfig,
  evaluateDetails: mockEvaluateDetails,
};

vi.mock("@quonfig/node", () => {
  return {
    // `function` (not an arrow) so vitest 4 can call it with `new`.
    Quonfig: vi.fn(function () {
      return mockClientInstance;
    }),
  };
});

describe("QuonfigProvider", () => {
  let provider: QuonfigProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
    mockRawConfig.mockReturnValue(undefined);
    provider = new QuonfigProvider({ sdkKey: "test-key", datadir: "/fake" });
  });

  describe("initialize", () => {
    it("calls client.init()", async () => {
      await provider.initialize({});
      expect(mockInit).toHaveBeenCalled();
    });

    it("propagates init errors", async () => {
      mockInit.mockRejectedValue(new Error("init failed"));
      await expect(provider.initialize({})).rejects.toThrow("init failed");
    });
  });

  describe("shutdown", () => {
    it("calls client.close()", async () => {
      await provider.shutdown();
      expect(mockClose).toHaveBeenCalled();
    });

    // qfg-vrfm: shutdown() must await client.close() so the SDK's drain
    // (close-drains-telemetry, qfg-vrfm + qfg-q3cx) actually completes
    // before OpenFeature.close() resolves. If shutdown() returned before
    // close() finished, buffered telemetry would still be dropped.
    it("awaits client.close() before resolving (qfg-vrfm)", async () => {
      let resolveClose!: () => void;
      const closePromise = new Promise<void>((r) => {
        resolveClose = r;
      });
      mockClose.mockReturnValueOnce(closePromise);

      let shutdownResolved = false;
      const shutdownPromise = provider.shutdown().then(() => {
        shutdownResolved = true;
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockClose).toHaveBeenCalled();
      expect(shutdownResolved).toBe(false);

      resolveClose();
      await shutdownPromise;
      expect(shutdownResolved).toBe(true);
    });
  });

  describe("resolveBooleanEvaluation", () => {
    it("returns STATIC reason when SDK reports STATIC", async () => {
      mockGetBoolDetails.mockReturnValue({ value: true, reason: "STATIC" });
      const result = await provider.resolveBooleanEvaluation("my-flag", false, {}, {} as any);
      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it("returns TARGETING_MATCH when SDK reports TARGETING_MATCH", async () => {
      mockGetBoolDetails.mockReturnValue({ value: true, reason: "TARGETING_MATCH" });
      const result = await provider.resolveBooleanEvaluation("my-flag", false, {}, {} as any);
      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns SPLIT when SDK reports SPLIT", async () => {
      mockGetBoolDetails.mockReturnValue({ value: false, reason: "SPLIT" });
      const result = await provider.resolveBooleanEvaluation("my-flag", true, {}, {} as any);
      expect(result.value).toBe(false);
      expect(result.reason).toBe(StandardResolutionReasons.SPLIT);
    });

    it("returns DEFAULT and defaultValue when SDK reports DEFAULT", async () => {
      mockGetBoolDetails.mockReturnValue({ value: undefined, reason: "DEFAULT" });
      const result = await provider.resolveBooleanEvaluation("missing-flag", false, {}, {} as any);
      expect(result.value).toBe(false);
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns ERROR + FLAG_NOT_FOUND when SDK reports FLAG_NOT_FOUND", async () => {
      mockGetBoolDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
      });
      const result = await provider.resolveBooleanEvaluation("bad-flag", false, {}, {} as any);
      expect(result.value).toBe(false);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    });

    it("returns ERROR + TYPE_MISMATCH when SDK reports TYPE_MISMATCH", async () => {
      mockGetBoolDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
      });
      const result = await provider.resolveBooleanEvaluation("bad-flag", false, {}, {} as any);
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });

    it("returns ERROR + GENERAL when SDK reports GENERAL", async () => {
      mockGetBoolDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "GENERAL",
      });
      const result = await provider.resolveBooleanEvaluation("bad-flag", false, {}, {} as any);
      expect(result.errorCode).toBe(ErrorCode.GENERAL);
    });
  });

  // A string read evaluates once, through evaluateDetails() (qfg-177f): a
  // string or log_level config's stored form is the answer.
  describe("resolveStringEvaluation", () => {
    it("returns value and TARGETING_MATCH when SDK reports it", async () => {
      mockEvaluateDetails.mockReturnValue({
        value: "hello",
        reason: "TARGETING_MATCH",
        valueType: "string",
      });
      const result = await provider.resolveStringEvaluation("my-string", "", {}, {} as any);
      expect(result.value).toBe("hello");
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(mockGetStringDetails).not.toHaveBeenCalled();
    });

    it("returns DEFAULT when SDK reports DEFAULT", async () => {
      mockEvaluateDetails.mockReturnValue({
        value: undefined,
        reason: "DEFAULT",
        valueType: "string",
      });
      const result = await provider.resolveStringEvaluation(
        "missing",
        "default-str",
        {},
        {} as any
      );
      expect(result.value).toBe("default-str");
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns ERROR + FLAG_NOT_FOUND for missing flag", async () => {
      mockEvaluateDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
      });
      const result = await provider.resolveStringEvaluation("flag", "fallback", {}, {} as any);
      expect(result.value).toBe("fallback");
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
      expect(mockGetStringDetails).not.toHaveBeenCalled();
    });

    it("returns a numeric log_level as its text, like getStringDetails", async () => {
      mockEvaluateDetails.mockReturnValue({ value: 5, reason: "STATIC", valueType: "log_level" });
      const result = await provider.resolveStringEvaluation("lvl", "", {}, {} as any);
      expect(result.value).toBe("5");
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it("reports another type through the typed getter's TYPE_MISMATCH", async () => {
      mockEvaluateDetails.mockReturnValue({ value: 3, reason: "STATIC", valueType: "int" });
      mockGetStringDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
        errorMessage: "int is not a string",
        variant: "default",
        flagMetadata: { configId: "c1", configType: "CONFIG" },
      });
      mockRawConfig.mockReturnValue({ valueType: "int" });
      const result = await provider.resolveStringEvaluation("n", "fallback", {}, {} as any);
      expect(result.value).toBe("fallback");
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
      expect(result.errorMessage).toBe("int is not a string");
    });
  });

  // A duration config reads as its ISO 8601 text (qfg-177f). The stored-text,
  // STATIC, SPLIT, ENV_VAR and PARSE_ERROR cases also run against real
  // fixtures in test/integration/parse-error.test.ts.
  describe("resolveStringEvaluation on a duration config", () => {
    const details = (extra: object) => ({ valueType: "duration", ...extra });

    it("returns the stored text with the evaluation's reason, variant and metadata", async () => {
      mockEvaluateDetails.mockReturnValue(
        details({
          value: "PT5M",
          reason: "TARGETING_MATCH",
          variant: "targeting:0",
          flagMetadata: { configId: "c1", configType: "CONFIG", ruleIndex: 0 },
        })
      );
      const result = await provider.resolveStringEvaluation("d", "PT0S", {}, {} as any);
      expect(result.value).toBe("PT5M");
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(result.variant).toBe("targeting:0");
      expect(result.flagMetadata).toEqual({ configId: "c1", configType: "CONFIG", ruleIndex: 0 });
      expect(mockGetStringDetails).not.toHaveBeenCalled();
    });

    it("returns a malformed stored duration as the default with PARSE_ERROR", async () => {
      mockEvaluateDetails.mockReturnValue(
        details({
          value: "30s",
          reason: "STATIC",
          variant: "static",
          flagMetadata: { configId: "c1", configType: "CONFIG" },
        })
      );
      const result = await provider.resolveStringEvaluation("d", "PT0S", {}, {} as any);
      expect(result.value).toBe("PT0S");
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
      expect(result.variant).toBe("default");
      expect(result.flagMetadata).toEqual({ configId: "c1", configType: "CONFIG" });
    });

    it("maps a malformed ENV_VAR duration (TYPE_MISMATCH, no valueType) to PARSE_ERROR", async () => {
      mockEvaluateDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
        variant: "default",
        flagMetadata: { configId: "c1", configType: "CONFIG" },
      });
      mockRawConfig.mockReturnValue({ valueType: "duration" });
      const result = await provider.resolveStringEvaluation("d", "PT0S", {}, {} as any);
      expect(result.value).toBe("PT0S");
      expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
      expect(mockGetStringDetails).not.toHaveBeenCalled();
    });

    it("keeps GENERAL when an ENV_VAR duration does not resolve", async () => {
      mockEvaluateDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "GENERAL",
        variant: "default",
      });
      mockRawConfig.mockReturnValue({ valueType: "duration" });
      const result = await provider.resolveStringEvaluation("d", "PT0S", {}, {} as any);
      expect(result.value).toBe("PT0S");
      expect(result.errorCode).toBe(ErrorCode.GENERAL);
    });

    it("returns the default with DEFAULT when no rule matches", async () => {
      mockEvaluateDetails.mockReturnValue(
        details({ value: undefined, reason: "DEFAULT", variant: "default" })
      );
      const result = await provider.resolveStringEvaluation("d", "PT0S", {}, {} as any);
      expect(result.value).toBe("PT0S");
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });
  });

  describe("resolveNumberEvaluation", () => {
    it("returns value and TARGETING_MATCH when SDK reports it", async () => {
      mockGetNumberDetails.mockReturnValue({ value: 42, reason: "TARGETING_MATCH" });
      const result = await provider.resolveNumberEvaluation("my-number", 0, {}, {} as any);
      expect(result.value).toBe(42);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns DEFAULT when SDK reports DEFAULT", async () => {
      mockGetNumberDetails.mockReturnValue({ value: undefined, reason: "DEFAULT" });
      const result = await provider.resolveNumberEvaluation("missing", 99, {}, {} as any);
      expect(result.value).toBe(99);
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns ERROR + GENERAL for general SDK errors", async () => {
      mockGetNumberDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "GENERAL",
      });
      const result = await provider.resolveNumberEvaluation("bad", 0, {}, {} as any);
      expect(result.value).toBe(0);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.GENERAL);
    });
  });

  describe("resolveObjectEvaluation", () => {
    it("returns string_list value when getStringListDetails resolves", async () => {
      mockGetStringListDetails.mockReturnValue({
        value: ["a", "b", "c"],
        reason: "TARGETING_MATCH",
      });
      const result = await provider.resolveObjectEvaluation("my-list", [], {}, {} as any);
      expect(result.value).toEqual(["a", "b", "c"]);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("falls back to JSON when string_list is TYPE_MISMATCH", async () => {
      mockGetStringListDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
      });
      mockGetJSONDetails.mockReturnValue({
        value: { key: "value" },
        reason: "TARGETING_MATCH",
      });
      const result = await provider.resolveObjectEvaluation("my-json", {}, {}, {} as any);
      expect(result.value).toEqual({ key: "value" });
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns DEFAULT when both branches return DEFAULT", async () => {
      mockGetStringListDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
      });
      mockGetJSONDetails.mockReturnValue({ value: undefined, reason: "DEFAULT" });
      const result = await provider.resolveObjectEvaluation(
        "missing",
        { default: true },
        {},
        {} as any
      );
      expect(result.value).toEqual({ default: true });
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns ERROR + FLAG_NOT_FOUND when both branches report FLAG_NOT_FOUND", async () => {
      mockGetStringListDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
      });
      mockGetJSONDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
      });
      const result = await provider.resolveObjectEvaluation("bad", [], {}, {} as any);
      expect(result.value).toEqual([]);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    });
  });

  describe("context mapping", () => {
    it("passes mapped context to getBoolDetails", async () => {
      mockGetBoolDetails.mockReturnValue({ value: true, reason: "TARGETING_MATCH" });
      await provider.resolveBooleanEvaluation(
        "my-flag",
        false,
        { targetingKey: "user-123", "user.plan": "pro" },
        {} as any
      );
      expect(mockGetBoolDetails).toHaveBeenCalledWith("my-flag", {
        user: { id: "user-123", plan: "pro" },
      });
    });
  });

  describe("getClient", () => {
    it("returns the underlying Quonfig client", () => {
      const client = provider.getClient();
      expect(client).toBeDefined();
      expect(typeof client.getBoolDetails).toBe("function");
    });
  });

  describe("variant + flagMetadata forwarding (qfg-9dbl)", () => {
    it("forwards variant + flagMetadata from SDK on STATIC", async () => {
      mockGetBoolDetails.mockReturnValue({
        value: true,
        reason: "STATIC",
        variant: "static",
        flagMetadata: {
          configId: "abc",
          configType: "FEATURE_FLAG",
          environment: "Production",
        },
      });
      const result = await provider.resolveBooleanEvaluation("k", false, {}, {} as any);
      expect(result.variant).toBe("static");
      expect(result.flagMetadata).toEqual({
        configId: "abc",
        configType: "FEATURE_FLAG",
        environment: "Production",
      });
    });

    it("forwards variant + flagMetadata + ruleIndex on TARGETING_MATCH", async () => {
      mockEvaluateDetails.mockReturnValue({
        valueType: "string",
        value: "v",
        reason: "TARGETING_MATCH",
        variant: "targeting:0",
        flagMetadata: { configId: "id1", configType: "CONFIG", ruleIndex: 0 },
      });
      const result = await provider.resolveStringEvaluation("k", "", {}, {} as any);
      expect(result.variant).toBe("targeting:0");
      expect((result.flagMetadata as Record<string, unknown>).ruleIndex).toBe(0);
    });

    it("forwards variant + weightedValueIndex on SPLIT", async () => {
      mockEvaluateDetails.mockReturnValue({
        valueType: "string",
        value: "variant-b",
        reason: "SPLIT",
        variant: "split:1",
        flagMetadata: {
          configId: "id1",
          configType: "CONFIG",
          ruleIndex: 0,
          weightedValueIndex: 1,
        },
      });
      const result = await provider.resolveStringEvaluation("k", "", {}, {} as any);
      expect(result.variant).toBe("split:1");
      const md = result.flagMetadata as Record<string, unknown>;
      expect(md.weightedValueIndex).toBe(1);
      expect(md.ruleIndex).toBe(0);
    });

    it("forwards errorMessage + variant='default' on ERROR", async () => {
      mockGetBoolDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
        errorMessage: "No config found",
        variant: "default",
        flagMetadata: {},
      });
      const result = await provider.resolveBooleanEvaluation("missing", false, {}, {} as any);
      expect(result.variant).toBe("default");
      expect(result.errorMessage).toBe("No config found");
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    });
  });

  // qfg-wg1n: newer sdk-node reports a malformed value (a stored int "twelve",
  // an ENV_VAR int set to "twelve") as PARSE_ERROR itself. The provider passes
  // it straight through on every read, whatever the declared valueType. Here
  // rawConfig() knows nothing about the key, so the TYPE_MISMATCH workaround
  // cannot be what produces the PARSE_ERROR.
  describe("SDK PARSE_ERROR passthrough (qfg-wg1n)", () => {
    const parseError = {
      value: undefined,
      reason: "ERROR",
      errorCode: "PARSE_ERROR",
      errorMessage: 'Config "k" value "twelve" cannot be converted to int',
      variant: "default",
      flagMetadata: { configId: "c1", configType: "CONFIG" },
    };

    const expectParseError = (result: {
      reason?: string;
      errorCode?: ErrorCode;
      errorMessage?: string;
      variant?: string;
    }) => {
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
      expect(result.errorMessage).toBe(parseError.errorMessage);
      expect(result.variant).toBe("default");
    };

    it("boolean read", async () => {
      mockGetBoolDetails.mockReturnValue(parseError);
      const result = await provider.resolveBooleanEvaluation("k", true, {}, {} as any);
      expect(result.value).toBe(true);
      expectParseError(result);
    });

    it("number read", async () => {
      mockGetNumberDetails.mockReturnValue(parseError);
      const result = await provider.resolveNumberEvaluation("k", 7, {}, {} as any);
      expect(result.value).toBe(7);
      expectParseError(result);
    });

    it("string read through evaluateDetails", async () => {
      mockEvaluateDetails.mockReturnValue(parseError);
      const result = await provider.resolveStringEvaluation("k", "dflt", {}, {} as any);
      expect(result.value).toBe("dflt");
      expectParseError(result);
    });

    it("string read on another type, through getStringDetails", async () => {
      mockEvaluateDetails.mockReturnValue({ value: 3, reason: "STATIC", valueType: "int" });
      mockGetStringDetails.mockReturnValue(parseError);
      const result = await provider.resolveStringEvaluation("k", "dflt", {}, {} as any);
      expect(result.value).toBe("dflt");
      expectParseError(result);
    });

    it("duration read as a string", async () => {
      mockEvaluateDetails.mockReturnValue({ ...parseError, valueType: "duration" });
      const result = await provider.resolveStringEvaluation("k", "PT0S", {}, {} as any);
      expect(result.value).toBe("PT0S");
      expectParseError(result);
      expect(mockGetStringDetails).not.toHaveBeenCalled();
    });

    it("object read on a string_list", async () => {
      mockGetStringListDetails.mockReturnValue(parseError);
      mockGetJSONDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
      });
      const result = await provider.resolveObjectEvaluation("k", ["d"], {}, {} as any);
      expect(result.value).toEqual(["d"]);
      expectParseError(result);
    });

    it("object read on a json config", async () => {
      mockGetStringListDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
      });
      mockGetJSONDetails.mockReturnValue(parseError);
      const result = await provider.resolveObjectEvaluation("k", { d: 1 }, {}, {} as any);
      expect(result.value).toEqual({ d: 1 });
      expectParseError(result);
    });

    it("still reports TYPE_MISMATCH for a wrong-type read", async () => {
      mockGetBoolDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "TYPE_MISMATCH",
      });
      mockRawConfig.mockReturnValue({ valueType: "int" });
      const result = await provider.resolveBooleanEvaluation("k", false, {}, {} as any);
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";

// Mock @quonfig/node so we can control the client without a real server.
// The provider talks to the SDK via the *Details methods, so those are what
// we mock here.
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockGetBoolDetails = vi.fn();
const mockGetStringDetails = vi.fn();
const mockGetNumberDetails = vi.fn();
const mockGetStringListDetails = vi.fn();
const mockGetJSONDetails = vi.fn();

const mockClientInstance = {
  init: mockInit,
  close: mockClose,
  getBoolDetails: mockGetBoolDetails,
  getStringDetails: mockGetStringDetails,
  getNumberDetails: mockGetNumberDetails,
  getStringListDetails: mockGetStringListDetails,
  getJSONDetails: mockGetJSONDetails,
};

vi.mock("@quonfig/node", () => {
  return {
    Quonfig: vi.fn(() => mockClientInstance),
  };
});

describe("QuonfigProvider", () => {
  let provider: QuonfigProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
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

  describe("resolveStringEvaluation", () => {
    it("returns value and TARGETING_MATCH when SDK reports it", async () => {
      mockGetStringDetails.mockReturnValue({ value: "hello", reason: "TARGETING_MATCH" });
      const result = await provider.resolveStringEvaluation("my-string", "", {}, {} as any);
      expect(result.value).toBe("hello");
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns DEFAULT when SDK reports DEFAULT", async () => {
      mockGetStringDetails.mockReturnValue({ value: undefined, reason: "DEFAULT" });
      const result = await provider.resolveStringEvaluation("missing", "default-str", {}, {} as any);
      expect(result.value).toBe("default-str");
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns ERROR + FLAG_NOT_FOUND for missing flag", async () => {
      mockGetStringDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
      });
      const result = await provider.resolveStringEvaluation("flag", "fallback", {}, {} as any);
      expect(result.value).toBe("fallback");
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
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
        {} as any,
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
        {} as any,
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
});

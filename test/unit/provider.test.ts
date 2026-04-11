import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";

// Mock @quonfig/node so we can control the client without a real server
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockGetBool = vi.fn();
const mockGetString = vi.fn();
const mockGetNumber = vi.fn();
const mockGetStringList = vi.fn();
const mockGetJSON = vi.fn();

const mockClientInstance = {
  init: mockInit,
  close: mockClose,
  getBool: mockGetBool,
  getString: mockGetString,
  getNumber: mockGetNumber,
  getStringList: mockGetStringList,
  getJSON: mockGetJSON,
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
    it("returns value and TARGETING_MATCH when flag found", async () => {
      mockGetBool.mockReturnValue(true);
      const result = await provider.resolveBooleanEvaluation("my-flag", false, {}, {} as any);
      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns defaultValue and DEFAULT when flag returns undefined", async () => {
      mockGetBool.mockReturnValue(undefined);
      const result = await provider.resolveBooleanEvaluation("missing-flag", false, {}, {} as any);
      expect(result.value).toBe(false);
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns defaultValue and ERROR when client throws", async () => {
      mockGetBool.mockImplementation(() => {
        throw new Error("not found");
      });
      const result = await provider.resolveBooleanEvaluation("bad-flag", false, {}, {} as any);
      expect(result.value).toBe(false);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    });
  });

  describe("resolveStringEvaluation", () => {
    it("returns value and TARGETING_MATCH when flag found", async () => {
      mockGetString.mockReturnValue("hello");
      const result = await provider.resolveStringEvaluation("my-string", "", {}, {} as any);
      expect(result.value).toBe("hello");
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns defaultValue and DEFAULT when flag returns undefined", async () => {
      mockGetString.mockReturnValue(undefined);
      const result = await provider.resolveStringEvaluation("missing", "default-str", {}, {} as any);
      expect(result.value).toBe("default-str");
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns defaultValue and ERROR when client throws", async () => {
      mockGetString.mockImplementation(() => {
        throw new Error("not initialized");
      });
      const result = await provider.resolveStringEvaluation("flag", "fallback", {}, {} as any);
      expect(result.value).toBe("fallback");
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.PROVIDER_NOT_READY);
    });
  });

  describe("resolveNumberEvaluation", () => {
    it("returns value and TARGETING_MATCH when flag found", async () => {
      mockGetNumber.mockReturnValue(42);
      const result = await provider.resolveNumberEvaluation("my-number", 0, {}, {} as any);
      expect(result.value).toBe(42);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns defaultValue and DEFAULT when flag returns undefined", async () => {
      mockGetNumber.mockReturnValue(undefined);
      const result = await provider.resolveNumberEvaluation("missing", 99, {}, {} as any);
      expect(result.value).toBe(99);
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns defaultValue and ERROR when client throws", async () => {
      mockGetNumber.mockImplementation(() => {
        throw new Error("some error");
      });
      const result = await provider.resolveNumberEvaluation("bad", 0, {}, {} as any);
      expect(result.value).toBe(0);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.GENERAL);
    });
  });

  describe("resolveObjectEvaluation", () => {
    it("returns string_list value when getStringList succeeds", async () => {
      mockGetStringList.mockReturnValue(["a", "b", "c"]);
      const result = await provider.resolveObjectEvaluation("my-list", [], {}, {} as any);
      expect(result.value).toEqual(["a", "b", "c"]);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("falls back to getJSON when getStringList returns undefined", async () => {
      mockGetStringList.mockReturnValue(undefined);
      mockGetJSON.mockReturnValue({ key: "value" });
      const result = await provider.resolveObjectEvaluation("my-json", {}, {}, {} as any);
      expect(result.value).toEqual({ key: "value" });
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it("returns defaultValue and DEFAULT when both return undefined", async () => {
      mockGetStringList.mockReturnValue(undefined);
      mockGetJSON.mockReturnValue(undefined);
      const result = await provider.resolveObjectEvaluation(
        "missing",
        { default: true },
        {},
        {} as any,
      );
      expect(result.value).toEqual({ default: true });
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });

    it("returns defaultValue and ERROR when client throws", async () => {
      mockGetStringList.mockImplementation(() => {
        throw new Error("type mismatch");
      });
      const result = await provider.resolveObjectEvaluation("bad", [], {}, {} as any);
      expect(result.value).toEqual([]);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });
  });

  describe("context mapping", () => {
    it("passes mapped context to getBool", async () => {
      mockGetBool.mockReturnValue(true);
      await provider.resolveBooleanEvaluation(
        "my-flag",
        false,
        { targetingKey: "user-123", "user.plan": "pro" },
        {} as any,
      );
      expect(mockGetBool).toHaveBeenCalledWith("my-flag", {
        user: { id: "user-123", plan: "pro" },
      });
    });
  });

  describe("getClient", () => {
    it("returns the underlying Quonfig client", () => {
      const client = provider.getClient();
      expect(client).toBeDefined();
      expect(typeof client.getBool).toBe("function");
    });
  });
});

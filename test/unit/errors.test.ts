import { describe, it, expect } from "vitest";
import { ErrorCode } from "@openfeature/server-sdk";
import { toErrorCode } from "../../src/errors.js";

describe("toErrorCode", () => {
  it("maps 'not found' message to FLAG_NOT_FOUND", () => {
    expect(toErrorCode(new Error("No value found for key \"my-flag\""))).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("maps 'flag not found' message to FLAG_NOT_FOUND", () => {
    expect(toErrorCode(new Error("flag not found: my-flag"))).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("maps 'type mismatch' message to TYPE_MISMATCH", () => {
    expect(toErrorCode(new Error("type mismatch: expected boolean"))).toBe(ErrorCode.TYPE_MISMATCH);
  });

  it("maps 'not initialized' message to PROVIDER_NOT_READY", () => {
    expect(toErrorCode(new Error("[quonfig] Not initialized. Call init() first."))).toBe(
      ErrorCode.PROVIDER_NOT_READY,
    );
  });

  it("maps 'provider not ready' message to PROVIDER_NOT_READY", () => {
    expect(toErrorCode(new Error("provider not ready"))).toBe(ErrorCode.PROVIDER_NOT_READY);
  });

  it("maps unknown errors to GENERAL", () => {
    expect(toErrorCode(new Error("some unexpected failure"))).toBe(ErrorCode.GENERAL);
  });

  it("handles non-Error values", () => {
    expect(toErrorCode("not found")).toBe(ErrorCode.FLAG_NOT_FOUND);
    expect(toErrorCode("type mismatch here")).toBe(ErrorCode.TYPE_MISMATCH);
    expect(toErrorCode("random string")).toBe(ErrorCode.GENERAL);
  });

  it("is case-insensitive", () => {
    expect(toErrorCode(new Error("Flag NOT FOUND"))).toBe(ErrorCode.FLAG_NOT_FOUND);
    expect(toErrorCode(new Error("TYPE MISMATCH"))).toBe(ErrorCode.TYPE_MISMATCH);
  });
});

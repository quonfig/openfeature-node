import { ErrorCode } from "@openfeature/server-sdk";

/**
 * Maps a native SDK error to an OpenFeature ErrorCode.
 *
 * The native SDK throws Error instances with message strings. We map by inspecting
 * the lowercased message.
 */
export function toErrorCode(err: unknown): ErrorCode {
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (
    msg.includes("not found") ||
    msg.includes("flag not found") ||
    msg.includes("no value found") ||
    msg.includes("value found for key")
  ) {
    return ErrorCode.FLAG_NOT_FOUND;
  }
  if (msg.includes("type mismatch")) {
    return ErrorCode.TYPE_MISMATCH;
  }
  if (msg.includes("not initialized") || msg.includes("provider not ready")) {
    return ErrorCode.PROVIDER_NOT_READY;
  }
  return ErrorCode.GENERAL;
}

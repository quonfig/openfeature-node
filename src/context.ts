import type { EvaluationContext } from "@openfeature/server-sdk";
import type { Contexts, ContextValue } from "@quonfig/node";

/**
 * Maps an OpenFeature flat EvaluationContext to Quonfig's nested Contexts format.
 *
 * Rules:
 * - `targetingKey` maps to the namespace+property specified by `targetingKeyMapping` (default: "user.id")
 * - Keys with a dot are split on the first dot: "user.email" -> namespace "user", key "email"
 * - Keys without a dot go to the default (empty-string) namespace: "country" -> { "": { country: ... } }
 * - Multi-dot keys split on first dot only: "user.ip.address" -> { user: { "ip.address": ... } }
 */
export function mapContext(
  ofContext: EvaluationContext,
  targetingKeyMapping = "user.id",
): Contexts {
  const result: Record<string, Record<string, ContextValue>> = {};

  for (const [key, value] of Object.entries(ofContext)) {
    if (value === undefined) continue;

    // Cast to ContextValue -- OpenFeature allows arbitrary nesting but Quonfig
    // contexts accept primitives and string arrays. Callers should pass only
    // primitive or string[] values for keys they want evaluated.
    const ctxValue = value as ContextValue;

    if (key === "targetingKey") {
      const dotIdx = targetingKeyMapping.indexOf(".");
      const ns = dotIdx === -1 ? "" : targetingKeyMapping.slice(0, dotIdx);
      const prop = dotIdx === -1 ? targetingKeyMapping : targetingKeyMapping.slice(dotIdx + 1);
      result[ns] ??= {};
      result[ns][prop] = ctxValue;
      continue;
    }

    const dotIdx = key.indexOf(".");
    if (dotIdx === -1) {
      result[""] ??= {};
      result[""][key] = ctxValue;
    } else {
      const ns = key.slice(0, dotIdx);
      const prop = key.slice(dotIdx + 1);
      result[ns] ??= {};
      result[ns][prop] = ctxValue;
    }
  }

  return result;
}

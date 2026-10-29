// Since 3.2.0 the provider reads a duration's stored text through sdk-node's
// public evaluateDetails() (qfg-177f). Guard against the pre-2.1.0 workaround
// coming back: a copy of sdk-node's private reason logic, or evaluating a
// duration through getRawMatch() and getDuration().
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../src/provider.ts"),
  "utf8"
);

describe("provider source", () => {
  it.each(["hasTargetingRules", "getRawMatch", "getDuration", "RawMatch", "configRowIndex"])(
    "does not use %s",
    (name) => {
      expect(src).not.toContain(name);
    }
  );

  it("reads string values through evaluateDetails", () => {
    expect(src).toContain("evaluateDetails(");
  });
});

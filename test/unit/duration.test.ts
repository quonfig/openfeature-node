// The provider's ISO 8601 duration check against the shared grammar fixture,
// integration-test-data tests/duration/grammar.yaml (qfg-2agi.29): every valid
// value is accepted and every invalid one rejected.
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import { isIsoDuration } from "../../src/duration.js";

const grammarPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../integration-test-data/tests/duration/grammar.yaml"
);

/**
 * Read the fixture's two lists. Entries are `- { value: "<s>", millis: <n> }`
 * under `valid:` and `- "<s>"` under `invalid:`; the strings are double-quoted
 * YAML scalars, whose escapes (`\n`, `٥`) JSON.parse reads the same way.
 */
function loadGrammar(): { valid: string[]; invalid: string[] } {
  const lists: { valid: string[]; invalid: string[] } = { valid: [], invalid: [] };
  let section: keyof typeof lists | undefined;
  for (const line of readFileSync(grammarPath, "utf8").split("\n")) {
    if (line === "valid:" || line === "invalid:") {
      section = line.slice(0, -1) as keyof typeof lists;
      continue;
    }
    const m = /^\s+- (?:\{ value: )?("(?:[^"\\]|\\.)*")/.exec(line);
    if (m && section) lists[section].push(JSON.parse(m[1]));
  }
  return lists;
}

const grammar = loadGrammar();

describe("isIsoDuration (integration-test-data duration grammar)", () => {
  it("loads the fixture", () => {
    expect(grammar.valid.length).toBeGreaterThan(15);
    expect(grammar.invalid.length).toBeGreaterThan(30);
  });

  it.each(grammar.valid)("accepts %j", (value) => {
    expect(isIsoDuration(value)).toBe(true);
  });

  it.each(grammar.invalid)("rejects %j", (value) => {
    expect(isIsoDuration(value)).toBe(false);
  });
});

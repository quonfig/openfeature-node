// Test helpers — shared across conformance, integration, and unit tests.
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Returns the absolute path to the shared integration-test-data datadir.
 *
 * Mirrors the Go provider's helper (openfeature-go/provider_test.go) and the
 * sdk-node setup pattern: the integration-test-data repo is checked out as a
 * sibling directory at the same depth as the SDK / provider repo.
 *
 * Throws a clear error if the directory is missing — these tests intentionally
 * do not run against hand-rolled local fixtures.
 */
export function integrationTestDataDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(__dirname, "../../integration-test-data/data/integration-tests");
  if (!existsSync(dir)) {
    throw new Error(
      `[openfeature-node tests] integration-test-data not found at ${dir}. ` +
        `Clone the integration-test-data repo as a sibling directory ` +
        `to openfeature-node, mirroring the sdk-node test setup.`,
    );
  }
  // Sanity: the datadir must contain quonfig.json
  if (!existsSync(join(dir, "quonfig.json"))) {
    throw new Error(`[openfeature-node tests] missing quonfig.json in ${dir}`);
  }
  return dir;
}

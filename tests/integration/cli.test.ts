// ABOUTME: Integration tests for statelint CLI.
// ABOUTME: Tests full end-to-end execution with various configurations.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DIR = join(import.meta.dir, "../fixtures/integration-test");
const CLI = join(import.meta.dir, "../../src/cli.ts");

beforeAll(async () => {
  await mkdir(join(TEST_DIR, "src"), { recursive: true });

  // Create test files
  await writeFile(
    join(TEST_DIR, "src/Button.tsx"),
    `export const Button = () => (
      <button className="hover:bg-blue-500 focus:ring-2 active:scale-95 disabled:opacity-50">
        Click
      </button>
    );`,
  );

  await writeFile(
    join(TEST_DIR, "src/Link.tsx"),
    `export const Link = () => (
      <a href="#" className="hover:underline">Link</a>
    );`,
  );

  await writeFile(
    join(TEST_DIR, "src/styles.css"),
    `.btn:hover { background: blue; }
     .btn:focus { outline: 2px solid blue; }
     .btn:active { transform: scale(0.98); }
     .btn:disabled { opacity: 0.5; }`,
  );
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("CLI integration", () => {
  test("exits 0 when coverage meets threshold", async () => {
    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx" --min-coverage 50`.quiet().nothrow();
    expect(result.exitCode).toBe(0);
  });

  test("exits 1 when coverage below threshold", async () => {
    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx" --min-coverage 100`.quiet().nothrow();
    expect(result.exitCode).toBe(1);
  });

  test("outputs valid JSON with -o json", async () => {
    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx" -o json`.quiet();
    const json = JSON.parse(result.stdout.toString());

    expect(json).toHaveProperty("coverage");
    expect(json).toHaveProperty("analyses");
    expect(json).toHaveProperty("passed");
  });

  test("outputs markdown with -o markdown", async () => {
    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx" -o markdown`.quiet();
    const output = result.stdout.toString();

    expect(output).toContain("# statelint");
    expect(output).toContain("Coverage");
  });

  test("analyzes CSS files", async () => {
    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.css" -o json`.quiet();
    const json = JSON.parse(result.stdout.toString());

    expect(json.elements).toBeGreaterThan(0);
  });

  test("uses config file when present", async () => {
    await writeFile(
      join(TEST_DIR, "statelint.config.json"),
      JSON.stringify({ minCoverage: 100 }),
    );

    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx"`.cwd(TEST_DIR).quiet().nothrow();

    // Should fail because config sets minCoverage to 100
    expect(result.exitCode).toBe(1);

    await rm(join(TEST_DIR, "statelint.config.json"));
  });

  test("CLI options override config file", async () => {
    await writeFile(
      join(TEST_DIR, "statelint.config.json"),
      JSON.stringify({ minCoverage: 100 }),
    );

    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx" --min-coverage 0`.cwd(TEST_DIR).quiet().nothrow();

    // Should pass because CLI overrides to 0
    expect(result.exitCode).toBe(0);

    await rm(join(TEST_DIR, "statelint.config.json"));
  });

  test("reports correct element count", async () => {
    const result = await $`bun ${CLI} "${TEST_DIR}/src/**/*.tsx" -o json`.quiet();
    const json = JSON.parse(result.stdout.toString());

    // Button.tsx has 1 button, Link.tsx has 1 anchor
    expect(json.elements).toBe(2);
  });
});

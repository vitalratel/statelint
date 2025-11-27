// ABOUTME: Unit tests for config loader.
// ABOUTME: Tests config file discovery and merging with defaults.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";

const TEST_DIR = join(import.meta.dir, "fixtures/config-test");

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("returns defaults when no config file", async () => {
    const config = await loadConfig({ cwd: TEST_DIR });

    expect(config.minCoverage).toBe(0);
    expect(config.output).toBe("terminal");
    expect(config.include).toContain("**/*.{css,tsx,jsx,vue,svelte}");
  });

  test("loads statelint.config.json", async () => {
    await writeFile(
      join(TEST_DIR, "statelint.config.json"),
      JSON.stringify({ minCoverage: 75 }),
    );

    const config = await loadConfig({ cwd: TEST_DIR });
    expect(config.minCoverage).toBe(75);

    await rm(join(TEST_DIR, "statelint.config.json"));
  });

  test("loads .statelintrc", async () => {
    await writeFile(
      join(TEST_DIR, ".statelintrc"),
      JSON.stringify({ output: "json" }),
    );

    const config = await loadConfig({ cwd: TEST_DIR });
    expect(config.output).toBe("json");

    await rm(join(TEST_DIR, ".statelintrc"));
  });

  test("merges config with defaults", async () => {
    await writeFile(
      join(TEST_DIR, "statelint.config.json"),
      JSON.stringify({ minCoverage: 80 }),
    );

    const config = await loadConfig({ cwd: TEST_DIR });
    expect(config.minCoverage).toBe(80);
    expect(config.output).toBe("terminal"); // default preserved

    await rm(join(TEST_DIR, "statelint.config.json"));
  });

  test("CLI options override config file", async () => {
    await writeFile(
      join(TEST_DIR, "statelint.config.json"),
      JSON.stringify({ minCoverage: 80, output: "json" }),
    );

    const config = await loadConfig({
      cwd: TEST_DIR,
      cliOptions: { minCoverage: 90, output: "terminal" },
    });

    expect(config.minCoverage).toBe(90);
    expect(config.output).toBe("terminal");

    await rm(join(TEST_DIR, "statelint.config.json"));
  });

  test("handles custom requiredStates", async () => {
    await writeFile(
      join(TEST_DIR, "statelint.config.json"),
      JSON.stringify({
        requiredStates: {
          button: ["hover", "focus"],
        },
      }),
    );

    const config = await loadConfig({ cwd: TEST_DIR });
    expect(config.requiredStates.button).toEqual(["hover", "focus"]);

    await rm(join(TEST_DIR, "statelint.config.json"));
  });
});

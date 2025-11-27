// ABOUTME: Unit tests for file scanner.
// ABOUTME: Tests glob pattern matching and file categorization.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { scanFiles } from "../src/scanner.ts";

const TEST_DIR = join(import.meta.dir, "fixtures/scanner-test");

beforeAll(async () => {
  await mkdir(join(TEST_DIR, "components"), { recursive: true });
  await mkdir(join(TEST_DIR, "styles"), { recursive: true });
  await mkdir(join(TEST_DIR, "node_modules/pkg"), { recursive: true });

  await writeFile(join(TEST_DIR, "styles/button.css"), ".btn {}");
  await writeFile(join(TEST_DIR, "components/Button.tsx"), "<button />");
  await writeFile(join(TEST_DIR, "components/Input.jsx"), "<input />");
  await writeFile(join(TEST_DIR, "components/Button.test.tsx"), "test()");
  await writeFile(join(TEST_DIR, "components/Card.vue"), "<template><div /></template>");
  await writeFile(join(TEST_DIR, "components/Modal.svelte"), "<div />");
  await writeFile(join(TEST_DIR, "node_modules/pkg/index.js"), "module");
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("scanFiles", () => {
  test("finds CSS files", async () => {
    const result = await scanFiles({
      include: ["**/*.css"],
      exclude: [],
      cwd: TEST_DIR,
    });

    expect(result.css).toHaveLength(1);
    expect(result.css[0]).toContain("button.css");
  });

  test("finds JSX/TSX files", async () => {
    const result = await scanFiles({
      include: ["**/*.{tsx,jsx}"],
      exclude: [],
      cwd: TEST_DIR,
    });

    expect(result.jsx.length).toBeGreaterThanOrEqual(2);
  });

  test("excludes node_modules by default", async () => {
    const result = await scanFiles({
      include: ["**/*.{js,jsx,tsx}"],
      exclude: ["**/node_modules/**"],
      cwd: TEST_DIR,
    });

    const hasNodeModules = result.jsx.some(f => f.includes("node_modules"));
    expect(hasNodeModules).toBe(false);
  });

  test("excludes test files when specified", async () => {
    const result = await scanFiles({
      include: ["**/*.{tsx,jsx}"],
      exclude: ["**/*.test.*"],
      cwd: TEST_DIR,
    });

    const hasTestFiles = result.jsx.some(f => f.includes(".test."));
    expect(hasTestFiles).toBe(false);
  });

  test("finds Vue files", async () => {
    const result = await scanFiles({
      include: ["**/*.vue"],
      exclude: [],
      cwd: TEST_DIR,
    });

    expect(result.vue).toHaveLength(1);
    expect(result.vue[0]).toContain("Card.vue");
  });

  test("finds Svelte files", async () => {
    const result = await scanFiles({
      include: ["**/*.svelte"],
      exclude: [],
      cwd: TEST_DIR,
    });

    expect(result.svelte).toHaveLength(1);
    expect(result.svelte[0]).toContain("Modal.svelte");
  });

  test("returns empty arrays for no matches", async () => {
    const result = await scanFiles({
      include: ["**/*.md"],
      exclude: [],
      cwd: TEST_DIR,
    });

    expect(result.css).toHaveLength(0);
    expect(result.jsx).toHaveLength(0);
    expect(result.vue).toHaveLength(0);
    expect(result.svelte).toHaveLength(0);
  });
});

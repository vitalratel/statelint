// ABOUTME: Unit tests for CSS parser.
// ABOUTME: Tests pseudo-class extraction from CSS selectors.

import { describe, expect, test } from "bun:test";
import { parseCss } from "../../src/parsers/css.ts";

describe("parseCss", () => {
  test("extracts :hover from selector", () => {
    const css = `.btn:hover { background: blue; }`;
    const result = parseCss(css, "test.css");

    expect(result.selectors).toHaveLength(1);
    expect(result.selectors[0]!.selector).toBe(".btn");
    expect(result.selectors[0]!.states).toContain("hover");
  });

  test("extracts multiple states from same selector", () => {
    const css = `.btn:hover, .btn:focus { outline: none; }`;
    const result = parseCss(css, "test.css");

    const btnSelectors = result.selectors.filter(s => s.selector === ".btn");
    const allStates = btnSelectors.flatMap(s => s.states);
    expect(allStates).toContain("hover");
    expect(allStates).toContain("focus");
  });

  test("extracts :disabled state", () => {
    const css = `button:disabled { opacity: 0.5; }`;
    const result = parseCss(css, "test.css");

    expect(result.selectors[0]!.selector).toBe("button");
    expect(result.selectors[0]!.states).toContain("disabled");
  });

  test("extracts :invalid and ::placeholder", () => {
    const css = `
      input:invalid { border-color: red; }
      input::placeholder { color: gray; }
    `;
    const result = parseCss(css, "test.css");

    const states = result.selectors.flatMap(s => s.states);
    expect(states).toContain("invalid");
    expect(states).toContain("placeholder");
  });

  test("extracts :focus-visible and :focus-within", () => {
    const css = `
      .btn:focus-visible { outline: 2px solid blue; }
      .container:focus-within { border-color: blue; }
    `;
    const result = parseCss(css, "test.css");

    const states = result.selectors.flatMap(s => s.states);
    expect(states).toContain("focus-visible");
    expect(states).toContain("focus-within");
  });

  test("extracts :active and :checked", () => {
    const css = `
      .btn:active { transform: scale(0.98); }
      input:checked { background: blue; }
    `;
    const result = parseCss(css, "test.css");

    const states = result.selectors.flatMap(s => s.states);
    expect(states).toContain("active");
    expect(states).toContain("checked");
  });

  test("includes line numbers", () => {
    const css = `.btn:hover { background: blue; }`;
    const result = parseCss(css, "test.css");

    expect(result.selectors[0]!.line).toBe(1);
  });

  test("handles complex selectors", () => {
    const css = `.form .input-group input:focus { border-color: blue; }`;
    const result = parseCss(css, "test.css");

    expect(result.selectors[0]!.states).toContain("focus");
  });

  test("returns empty for CSS without pseudo-classes", () => {
    const css = `.btn { background: blue; }`;
    const result = parseCss(css, "test.css");

    expect(result.selectors).toHaveLength(0);
  });
});

// ABOUTME: Unit tests for the analyzer.
// ABOUTME: Tests coverage calculation and missing state detection.

import type { CssParseResult, SelectorInfo } from "../src/parsers/css.ts";
import type { ElementInfo, JsxParseResult } from "../src/parsers/jsx.ts";
import { describe, expect, test } from "bun:test";
import { analyze } from "../src/analyzer.ts";

type RequiredFields = Pick<ElementInfo, "tag" | "line" | "states" | "className">;

function el(
  base: RequiredFields,
  overrides?: Partial<ElementInfo>,
): ElementInfo {
  return {
    ...base,
    hasUnresolvedExpressions: false,
    unresolvedExpressions: [],
    isContentRegion: false,
    canBeDisabled: false,
    canBeInvalid: false,
    hasPlaceholder: false,
    isRadioOrCheckbox: false,
    hasConditionalDisabled: false,
    ...overrides,
  };
}

function jsx(
  elements: ElementInfo[],
  file = "test.tsx",
): Map<string, JsxParseResult> {
  return new Map([[file, { elements }]]);
}

function css(
  selectors: SelectorInfo[],
  file = "test.css",
): Map<string, CssParseResult> {
  return new Map([[file, { selectors }]]);
}

describe("analyze", () => {
  test("calculates coverage for JSX elements", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({
          tag: "button",
          line: 10,
          states: ["hover", "focus"],
          className: "hover:bg-blue-500 focus:ring",
        }),
      ]),
      threshold: 80,
    });

    expect(result.elements).toBe(1);
    // button without disabled prop requires: hover, focus (2 states)
    expect(result.coverage.total).toBe(2);
    expect(result.coverage.present).toBe(2);
    expect(result.coverage.percentage).toBe(100);
  });

  test("identifies missing states", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({ tag: "button", line: 10, states: ["hover"], className: "hover:bg-blue-500" }),
      ]),
      threshold: 0,
    });

    expect(result.analyses[0]!.missingStates).toContain("focus");
    // active removed from defaults - it's visual polish, not a11y
    expect(result.analyses[0]!.missingStates).not.toContain("active");
    // disabled not required since element doesn't have disabled prop
    expect(result.analyses[0]!.missingStates).not.toContain("disabled");
    expect(result.analyses[0]!.missingStates).not.toContain("hover");
  });

  test("passes when coverage meets threshold", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({
          tag: "button",
          line: 10,
          states: ["hover", "focus"],
          className: "hover:bg focus:ring",
        }),
      ]),
      threshold: 100,
    });

    expect(result.passed).toBe(true);
    expect(result.coverage.percentage).toBe(100);
  });

  test("fails when coverage below threshold", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({ tag: "a", line: 5, states: ["hover"], className: "hover:underline" }),
      ]),
      threshold: 80,
    });

    expect(result.passed).toBe(false);
  });

  test("handles input element with required states", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el(
          { tag: "input", line: 1, states: ["focus", "disabled"], className: "focus:ring disabled:opacity" },
          { canBeDisabled: true },
        ),
      ]),
      threshold: 0,
    });

    // input requires: focus, disabled (hover/placeholder/invalid are optional)
    expect(result.analyses[0]!.missingStates).toEqual([]);
  });

  test("handles role-button elements", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({ tag: "role-button", line: 1, states: ["hover", "focus"], className: "hover:bg focus:ring" }),
      ]),
      threshold: 0,
    });

    // role-button without disabled prop requires: hover, focus
    // active removed from defaults - it's visual polish, not a11y
    expect(result.analyses[0]!.missingStates).not.toContain("active");
    // disabled not required since element doesn't have disabled prop
    expect(result.analyses[0]!.missingStates).not.toContain("disabled");
    // has hover and focus, so no missing states
    expect(result.analyses[0]!.missingStates).toEqual([]);
  });

  test("handles multiple files", () => {
    // Multi-file test keeps raw Map (jsx() helper is for single-file cases)
    const jsxResults = new Map([
      ["Button.tsx", { elements: [el({ tag: "button", line: 1, states: ["hover"], className: "" })] }],
      ["Link.tsx", { elements: [el({ tag: "a", line: 1, states: ["hover"], className: "" })] }],
    ]);

    const result = analyze({
      cssResults: new Map(),
      jsxResults,
      threshold: 0,
    });

    expect(result.elements).toBe(2);
    expect(result.files).toBe(2);
  });

  test("handles CSS-only results", () => {
    const result = analyze({
      cssResults: css([{ selector: ".btn", line: 1, states: ["hover", "focus"] }]),
      jsxResults: new Map(),
      threshold: 0,
    });

    expect(result.elements).toBe(1);
    expect(result.analyses[0]!.selector).toBe(".btn");
  });

  test("infers 'a' element from CSS selector containing 'link'", () => {
    const result = analyze({
      cssResults: css([{ selector: ".nav-link", line: 1, states: ["hover"] }]),
      jsxResults: new Map(),
      threshold: 0,
    });

    // 'a' requires: hover, focus (active removed from defaults)
    expect(result.analyses[0]!.missingStates).toContain("focus");
    expect(result.analyses[0]!.missingStates).not.toContain("active");
  });

  test("infers 'input' element from CSS selector containing 'input'", () => {
    const result = analyze({
      cssResults: css([{ selector: ".form-input", line: 1, states: ["focus"] }]),
      jsxResults: new Map(),
      threshold: 0,
    });

    // 'input' requires: focus, disabled (hover/placeholder/invalid are optional)
    expect(result.analyses[0]!.missingStates).not.toContain("hover");
    expect(result.analyses[0]!.missingStates).toContain("disabled");
    expect(result.analyses[0]!.missingStates).not.toContain("invalid");
    expect(result.analyses[0]!.missingStates).not.toContain("placeholder");
  });

  test("infers 'select' element from CSS selector containing 'select'", () => {
    const result = analyze({
      cssResults: css([{ selector: ".custom-select", line: 1, states: ["focus"] }]),
      jsxResults: new Map(),
      threshold: 0,
    });

    // 'select' requires: focus, disabled (hover has browser default)
    expect(result.analyses[0]!.missingStates).not.toContain("hover");
    expect(result.analyses[0]!.missingStates).toContain("disabled");
    expect(result.analyses[0]!.missingStates).not.toContain("invalid");
  });

  test("infers 'textarea' element from CSS selector containing 'textarea'", () => {
    const result = analyze({
      cssResults: css([{ selector: ".rich-textarea", line: 1, states: ["focus"] }]),
      jsxResults: new Map(),
      threshold: 0,
    });

    // 'textarea' requires: focus, disabled (hover/placeholder/invalid are optional)
    expect(result.analyses[0]!.missingStates).not.toContain("hover");
    expect(result.analyses[0]!.missingStates).toContain("disabled");
    expect(result.analyses[0]!.missingStates).not.toContain("invalid");
    expect(result.analyses[0]!.missingStates).not.toContain("placeholder");
  });

  test("uses default states for unknown CSS selector", () => {
    const result = analyze({
      cssResults: css([{ selector: ".card", line: 1, states: ["hover"] }]),
      jsxResults: new Map(),
      threshold: 0,
    });

    // Unknown elements default to: hover, focus
    expect(result.analyses[0]!.missingStates).toEqual(["focus"]);
  });

  test("uses custom required states when provided", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([el({ tag: "button", line: 1, states: ["hover"], className: "hover:bg" })]),
      threshold: 0,
      customRequiredStates: {
        button: ["hover", "focus"],
      },
    });

    // Custom states only require hover and focus
    expect(result.analyses[0]!.missingStates).toEqual(["focus"]);
    expect(result.analyses[0]!.missingStates).not.toContain("active");
    expect(result.analyses[0]!.missingStates).not.toContain("disabled");
  });

  test("ignores selectors matching ignoreSelectors patterns", () => {
    const result = analyze({
      cssResults: css([
        { selector: ".btn", line: 1, states: ["hover"] },
        { selector: ".icon-btn", line: 5, states: ["hover"] },
        { selector: ".nav-icon", line: 10, states: [] },
      ]),
      jsxResults: new Map(),
      threshold: 0,
      ignoreSelectors: ["*icon*"],
    });

    // Only .btn should be analyzed (icon patterns ignored)
    expect(result.elements).toBe(1);
    expect(result.analyses[0]!.selector).toBe(".btn");
  });

  test("ignores elements matching ignoreElements patterns", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({ tag: "button", line: 1, states: ["hover"], className: "btn" }),
        el({ tag: "button", line: 5, states: [], className: "icon-close" }),
        el({ tag: "a", line: 10, states: ["hover"], className: "link" }),
      ]),
      threshold: 0,
      ignoreElements: ["*icon*"],
    });

    // icon-close should be ignored
    expect(result.elements).toBe(2);
    const classNames = result.analyses.map(a => a.selector);
    expect(classNames).toContain("btn");
    expect(classNames).toContain("link");
    expect(classNames).not.toContain("icon-close");
  });

  test("supports multiple ignore patterns", () => {
    const result = analyze({
      cssResults: new Map(),
      jsxResults: jsx([
        el({ tag: "button", line: 1, states: ["hover"], className: "btn" }),
        el({ tag: "button", line: 2, states: [], className: "icon" }),
        el({ tag: "a", line: 3, states: [], className: "logo-link" }),
        el({ tag: "input", line: 4, states: ["focus"], className: "search" }),
      ]),
      threshold: 0,
      ignoreElements: ["icon", "*logo*"],
    });

    expect(result.elements).toBe(2);
  });

  describe("context-aware state requirements", () => {
    test("only requires disabled state when element has disabled prop", () => {
      const result = analyze({
        cssResults: new Map(),
        jsxResults: jsx([
          el(
            { tag: "button", line: 1, states: ["hover", "focus"], className: "hover:bg focus:ring" },
            { canBeDisabled: true },
          ),
        ]),
        threshold: 0,
      });

      // disabled should be required since canBeDisabled is true
      expect(result.analyses[0]!.missingStates).toContain("disabled");
      expect(result.analyses[0]!.requiredStates).toContain("disabled");
    });

    test("invalid styling is optional (apps may use auto-correction or custom error UX)", () => {
      const result = analyze({
        cssResults: new Map(),
        jsxResults: jsx([
          el({ tag: "input", line: 1, states: ["focus"], className: "focus:ring" }, { canBeInvalid: true }),
        ]),
        threshold: 0,
      });

      // invalid styling is optional - apps may use auto-correction or custom error UX
      expect(result.analyses[0]!.requiredStates).not.toContain("invalid");
      expect(result.analyses[0]!.missingStates).not.toContain("invalid");
    });

    test("placeholder styling is optional (browser defaults are acceptable)", () => {
      const result = analyze({
        cssResults: new Map(),
        jsxResults: jsx([
          el({ tag: "input", line: 1, states: ["focus"], className: "focus:ring" }, { hasPlaceholder: true }),
        ]),
        threshold: 0,
      });

      // placeholder styling is optional - browser defaults are acceptable
      expect(result.analyses[0]!.requiredStates).not.toContain("placeholder");
      expect(result.analyses[0]!.missingStates).not.toContain("placeholder");
    });
  });

  describe("unresolved expressions", () => {
    test("excludes elements with unresolved expressions from missing states", () => {
      const result = analyze({
        cssResults: new Map(),
        jsxResults: jsx([
          el(
            { tag: "button", line: 10, states: [], className: "" },
            { hasUnresolvedExpressions: true, unresolvedExpressions: ["tokens.effects.focusRing"] },
          ),
        ]),
        threshold: 0,
      });

      // Should not report missing states for unresolved element
      expect(result.analyses[0]!.missingStates).toEqual([]);
      expect(result.analyses[0]!.hasUnresolvedExpressions).toBe(true);
    });

    test("excludes unresolved elements from coverage calculation", () => {
      const result = analyze({
        cssResults: new Map(),
        jsxResults: jsx([
          el({ tag: "button", line: 10, states: ["hover", "focus"], className: "hover:bg focus:ring" }),
          el(
            { tag: "button", line: 20, states: [], className: "" },
            { hasUnresolvedExpressions: true, unresolvedExpressions: ["styles"] },
          ),
        ]),
        threshold: 100,
      });

      // Coverage should be 100% based only on the resolved element
      expect(result.coverage.percentage).toBe(100);
      expect(result.unresolvedCount).toBe(1);
      expect(result.passed).toBe(true);
    });

    test("tracks unresolvedCount correctly", () => {
      const result = analyze({
        cssResults: new Map(),
        jsxResults: jsx([
          el({ tag: "button", line: 1, states: ["hover"], className: "hover:bg" }),
          el(
            { tag: "a", line: 2, states: [], className: "" },
            { hasUnresolvedExpressions: true, unresolvedExpressions: ["linkStyles"] },
          ),
          el(
            { tag: "input", line: 3, states: ["focus"], className: "focus:ring" },
            { hasUnresolvedExpressions: true, unresolvedExpressions: ["tokens.input"] },
          ),
        ]),
        threshold: 0,
      });

      expect(result.elements).toBe(3);
      expect(result.unresolvedCount).toBe(2);
      // Only first element (button) should contribute to coverage
      // button without disabled prop requires 2 states (hover, focus)
      expect(result.coverage.total).toBe(2);
    });
  });
});

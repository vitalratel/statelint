// ABOUTME: Unit tests for output reporters.
// ABOUTME: Tests terminal, JSON, and markdown output formatting.

import type { AuditResult } from "../src/types.ts";
import { describe, expect, test } from "bun:test";
import { format, formatJson, formatMarkdown, formatSarif, formatTerminal } from "../src/reporters/index.ts";

const mockResult: AuditResult = {
  files: 2,
  elements: 2,
  analyses: [
    {
      selector: "hover:bg-blue-500",
      file: "src/Button.tsx",
      line: 10,
      elementType: "button",
      states: {
        hover: { present: true, location: { file: "src/Button.tsx", line: 10 } },
        focus: { present: false },
        active: { present: false },
        disabled: { present: false },
      },
      requiredStates: ["hover", "focus", "active", "disabled"],
      missingStates: ["focus", "active", "disabled"],
      hasUnresolvedExpressions: false,
      unresolvedExpressions: [],
    },
    {
      selector: ".link",
      file: "src/styles.css",
      line: 5,
      elementType: "a",
      states: {
        hover: { present: true },
        focus: { present: true },
        active: { present: false },
      },
      requiredStates: ["hover", "focus", "active"],
      missingStates: ["active"],
      hasUnresolvedExpressions: false,
      unresolvedExpressions: [],
    },
  ],
  coverage: {
    total: 7,
    present: 3,
    percentage: 43,
  },
  unresolvedCount: 0,
  passed: false,
  threshold: 80,
  parseErrors: [],
};

describe("formatTerminal", () => {
  test("includes coverage percentage", () => {
    const output = formatTerminal(mockResult);
    expect(output).toContain("43%");
  });

  test("shows FAIL when below threshold", () => {
    const output = formatTerminal(mockResult);
    expect(output).toContain("FAIL");
  });

  test("shows PASS when meeting threshold", () => {
    const passingResult = {
      ...mockResult,
      passed: true,
      coverage: { ...mockResult.coverage, percentage: 85 },
    };
    const output = formatTerminal(passingResult);
    expect(output).toContain("PASS");
  });

  test("lists missing states", () => {
    const output = formatTerminal(mockResult);
    expect(output).toContain("focus");
    expect(output).toContain("active");
    expect(output).toContain("disabled");
  });

  test("includes file paths", () => {
    const output = formatTerminal(mockResult);
    expect(output).toContain("src/Button.tsx");
    expect(output).toContain("src/styles.css");
  });
});

describe("formatJson", () => {
  test("returns valid JSON", () => {
    const output = formatJson(mockResult);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test("includes coverage data", () => {
    const output = formatJson(mockResult);
    const parsed = JSON.parse(output);
    expect(parsed.coverage.percentage).toBe(43);
  });

  test("includes passed status", () => {
    const output = formatJson(mockResult);
    const parsed = JSON.parse(output);
    expect(parsed.passed).toBe(false);
  });
});

describe("formatMarkdown", () => {
  test("includes header", () => {
    const output = formatMarkdown(mockResult);
    expect(output).toContain("# statelint");
  });

  test("includes coverage percentage", () => {
    const output = formatMarkdown(mockResult);
    expect(output).toContain("43%");
  });

  test("uses markdown formatting", () => {
    const output = formatMarkdown(mockResult);
    expect(output).toContain("##");
    expect(output).toContain("|");
  });
});

describe("format", () => {
  test("dispatches to terminal formatter", () => {
    const output = format(mockResult, "terminal");
    expect(output).toBe(formatTerminal(mockResult));
  });

  test("dispatches to json formatter", () => {
    const output = format(mockResult, "json");
    expect(output).toBe(formatJson(mockResult));
  });

  test("dispatches to markdown formatter", () => {
    const output = format(mockResult, "markdown");
    expect(output).toBe(formatMarkdown(mockResult));
  });

  test("dispatches to sarif formatter", () => {
    const output = format(mockResult, "sarif");
    expect(output).toBe(formatSarif(mockResult));
  });
});

describe("formatSarif", () => {
  test("returns valid JSON", () => {
    const output = formatSarif(mockResult);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test("includes SARIF version 2.1.0", () => {
    const output = formatSarif(mockResult);
    const sarif = JSON.parse(output);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif");
  });

  test("includes tool information", () => {
    const output = formatSarif(mockResult);
    const sarif = JSON.parse(output);
    expect(sarif.runs[0].tool.driver.name).toBe("statelint");
  });

  test("creates result for each missing state", () => {
    const output = formatSarif(mockResult);
    const sarif = JSON.parse(output);
    // mockResult has 4 missing states total (3 + 1)
    expect(sarif.runs[0].results.length).toBe(4);
  });

  test("includes file location in results", () => {
    const output = formatSarif(mockResult);
    const sarif = JSON.parse(output);
    const result = sarif.runs[0].results[0];
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("src/Button.tsx");
    expect(result.locations[0].physicalLocation.region.startLine).toBe(10);
  });

  test("includes rule information", () => {
    const output = formatSarif(mockResult);
    const sarif = JSON.parse(output);
    expect(sarif.runs[0].tool.driver.rules.length).toBeGreaterThan(0);
    expect(sarif.runs[0].tool.driver.rules[0].id).toContain("missing-state");
  });

  test("sets warning level for missing states", () => {
    const output = formatSarif(mockResult);
    const sarif = JSON.parse(output);
    expect(sarif.runs[0].results[0].level).toBe("warning");
  });
});

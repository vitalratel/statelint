// ABOUTME: Output reporters for statelint results.
// ABOUTME: Supports terminal, JSON, markdown, and SARIF output formats.

import type { AuditResult } from "../types.ts";

export interface FormatOptions {
  verbose?: boolean;
}

export function formatTerminal(result: AuditResult, options: FormatOptions = {}): string {
  const lines: string[] = [];
  const { coverage, passed, threshold, analyses, files, elements, unresolvedCount } = result;
  const { verbose } = options;

  lines.push(`statelint - State Coverage Report`);
  lines.push(`${"─".repeat(50)}`);
  lines.push(``);
  lines.push(`Files: ${files}  Elements: ${elements}`);
  if (unresolvedCount > 0) {
    lines.push(`Unresolved: ${unresolvedCount} elements with dynamic classNames (excluded from coverage)`);
    if (verbose) {
      lines.push(``);
      lines.push(`Unresolved elements:`);
      const unresolvedAnalyses = analyses.filter(a => a.hasUnresolvedExpressions);
      const byFile = new Map<string, typeof unresolvedAnalyses>();
      for (const a of unresolvedAnalyses) {
        const existing = byFile.get(a.file) || [];
        existing.push(a);
        byFile.set(a.file, existing);
      }
      for (const [file, fileAnalyses] of byFile) {
        lines.push(`  ${file}`);
        for (const a of fileAnalyses) {
          lines.push(`    line ${a.line}: <${a.elementType}> → ${a.unresolvedExpressions.join(", ")}`);
        }
      }
    }
  }
  lines.push(``);

  // Group by file
  const byFile = new Map<string, typeof analyses>();
  for (const a of analyses) {
    const existing = byFile.get(a.file) || [];
    existing.push(a);
    byFile.set(a.file, existing);
  }

  for (const [file, fileAnalyses] of byFile) {
    // Only show files with missing states (not unresolved-only files)
    const withMissing = fileAnalyses.filter(a => a.missingStates.length > 0);
    if (withMissing.length === 0)
      continue;

    lines.push(file);
    for (const a of withMissing) {
      lines.push(`  line ${a.line}: <${a.elementType}>`);
      for (const state of a.requiredStates) {
        const status = a.missingStates.includes(state) ? "✗" : "✓";
        lines.push(`    ${status} ${state}`);
      }
    }
    lines.push(``);
  }

  lines.push(`${"─".repeat(50)}`);
  lines.push(`Coverage: ${coverage.percentage}% (${coverage.present}/${coverage.total})`);
  lines.push(``);

  const status = passed ? "PASS" : "FAIL";
  const statusLine = passed
    ? `${status}: Coverage meets threshold (${threshold}%)`
    : `${status}: Below threshold (${threshold}%)`;
  lines.push(statusLine);

  return lines.join("\n");
}

export function formatJson(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatMarkdown(result: AuditResult, options: FormatOptions = {}): string {
  const lines: string[] = [];
  const { coverage, passed, threshold, analyses, files, elements, unresolvedCount } = result;
  const { verbose: _verbose } = options;

  lines.push(`# statelint Report`);
  lines.push(``);
  lines.push(`**Coverage:** ${coverage.percentage}% (${coverage.present}/${coverage.total})`);
  lines.push(`**Status:** ${passed ? "✅ PASS" : "❌ FAIL"} (threshold: ${threshold}%)`);
  lines.push(`**Files:** ${files} | **Elements:** ${elements}`);
  if (unresolvedCount > 0) {
    lines.push(`**Unresolved:** ${unresolvedCount} elements with dynamic classNames (excluded from coverage)`);
  }
  lines.push(``);

  if (analyses.some(a => a.missingStates.length > 0)) {
    lines.push(`## Issues`);
    lines.push(``);

    const byFile = new Map<string, typeof analyses>();
    for (const a of analyses) {
      if (a.missingStates.length > 0) {
        const existing = byFile.get(a.file) || [];
        existing.push(a);
        byFile.set(a.file, existing);
      }
    }

    for (const [file, fileAnalyses] of byFile) {
      lines.push(`### ${file}`);
      lines.push(``);
      lines.push(`| Line | Element | Missing States |`);
      lines.push(`|------|---------|----------------|`);
      for (const a of fileAnalyses) {
        lines.push(`| ${a.line} | ${a.selector} | ${a.missingStates.join(", ")} |`);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

interface SarifResult {
  ruleId: string;
  level: "warning" | "error" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number };
    };
  }>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
}

export function formatSarif(result: AuditResult): string {
  const { analyses } = result;
  const results: SarifResult[] = [];
  const rulesMap = new Map<string, SarifRule>();

  for (const analysis of analyses) {
    for (const missingState of analysis.missingStates) {
      const ruleId = `missing-state/${missingState}`;

      // Add rule if not already present
      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: `Missing ${missingState} state`,
          shortDescription: {
            text: `Missing :${missingState} state styling`,
          },
          fullDescription: {
            text: `Interactive elements should have :${missingState} state styling for accessibility and UX.`,
          },
          helpUri: "https://github.com/statelint/statelint#states",
        });
      }

      results.push({
        ruleId,
        level: "warning",
        message: {
          text: `Missing :${missingState} state for ${analysis.elementType} element "${analysis.selector}"`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: analysis.file },
              region: { startLine: analysis.line },
            },
          },
        ],
      });
    }
  }

  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "statelint",
            version: "0.1.0",
            informationUri: "https://github.com/statelint/statelint",
            rules: Array.from(rulesMap.values()),
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

export function format(
  result: AuditResult,
  outputFormat: "terminal" | "json" | "markdown" | "sarif",
  options: FormatOptions = {},
): string {
  switch (outputFormat) {
    case "json":
      return formatJson(result);
    case "markdown":
      return formatMarkdown(result, options);
    case "sarif":
      return formatSarif(result);
    case "terminal":
    default:
      return formatTerminal(result, options);
  }
}

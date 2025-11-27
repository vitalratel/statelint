// ABOUTME: Analyzer that computes state coverage for interactive elements.
// ABOUTME: Determines required states, identifies missing ones, and calculates coverage.

import type { CssParseResult } from "./parsers/css.ts";
import type { JsxParseResult } from "./parsers/jsx.ts";
import type {
  AuditResult,
  InteractiveElement,
  StateAnalysis,
  StateName,
} from "./types.ts";
import { DEFAULT_REQUIRED_STATES as REQUIRED_STATES } from "./types.ts";

export interface AnalyzeOptions {
  cssResults: Map<string, CssParseResult>;
  jsxResults: Map<string, JsxParseResult>;
  threshold: number;
  customRequiredStates?: Partial<Record<InteractiveElement, StateName[]>>;
  ignoreSelectors?: string[];
  ignoreElements?: string[];
}

function matchesPattern(value: string, pattern: string): boolean {
  // Simple glob-like matching: * matches any characters
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except *
    .replace(/\*/g, ".*"); // Convert * to .*
  return new RegExp(`^${regexPattern}$`, "i").test(value);
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPattern(value, pattern));
}

function getRequiredStates(
  elementType: string,
  customStates?: Partial<Record<InteractiveElement, StateName[]>>,
): StateName[] {
  if (customStates && elementType in customStates) {
    return customStates[elementType as InteractiveElement] ?? [];
  }
  if (elementType in REQUIRED_STATES) {
    return REQUIRED_STATES[elementType as InteractiveElement];
  }
  // For CSS selectors, default to basic button-like states
  return ["hover", "focus"];
}

function inferElementType(selector: string): InteractiveElement {
  const lower = selector.toLowerCase();
  if (lower.includes("button") || lower.includes("btn"))
    return "button";
  if (lower.includes("link") || lower.includes("anchor"))
    return "a";
  if (lower.includes("input"))
    return "input";
  if (lower.includes("select"))
    return "select";
  if (lower.includes("textarea"))
    return "textarea";
  return "unknown";
}

export function analyze(options: AnalyzeOptions): AuditResult {
  const {
    cssResults,
    jsxResults,
    threshold,
    customRequiredStates,
    ignoreSelectors = [],
    ignoreElements = [],
  } = options;
  const analyses: StateAnalysis[] = [];
  const filesSet = new Set<string>();

  // Process JSX results
  for (const [file, result] of jsxResults) {
    filesSet.add(file);
    for (const element of result.elements) {
      // Check if element should be ignored
      const selectorValue = element.className || `<${element.tag}>`;
      if (ignoreElements.length > 0 && matchesAnyPattern(selectorValue, ignoreElements)) {
        continue;
      }

      const elementType = element.tag as InteractiveElement;
      // Content regions (focusable divs, scrollable areas) only need focus
      let requiredStates = element.isContentRegion
        ? (["focus"] as StateName[])
        : getRequiredStates(elementType, customRequiredStates);

      // Filter out states that aren't meaningful for this element
      // Only require disabled styling if element actually has disabled prop
      // Skip if disabled is conditional (developer likely has ternary styling)
      if (!element.canBeDisabled || element.hasConditionalDisabled) {
        requiredStates = requiredStates.filter(s => s !== "disabled");
      }
      // Only require invalid styling if element has validation attributes
      if (!element.canBeInvalid) {
        requiredStates = requiredStates.filter(s => s !== "invalid");
      }
      // Only require placeholder styling if element has placeholder
      if (!element.hasPlaceholder) {
        requiredStates = requiredStates.filter(s => s !== "placeholder");
      }
      // Radio/checkbox inputs get hover feedback from their wrapping label
      if (element.isRadioOrCheckbox) {
        requiredStates = requiredStates.filter(s => s !== "hover");
      }

      const presentStates = element.states;

      // For elements with unresolved expressions, don't report missing states
      // (we can't know what states are actually provided)
      const missingStates = element.hasUnresolvedExpressions
        ? []
        : requiredStates.filter(s => !presentStates.includes(s));

      analyses.push({
        selector: selectorValue,
        file,
        line: element.line,
        elementType,
        states: Object.fromEntries(
          requiredStates.map(s => [
            s,
            {
              present: presentStates.includes(s),
              location: presentStates.includes(s)
                ? { file, line: element.line }
                : undefined,
            },
          ]),
        ),
        requiredStates,
        missingStates,
        hasUnresolvedExpressions: element.hasUnresolvedExpressions,
        unresolvedExpressions: element.unresolvedExpressions,
      });
    }
  }

  // Process CSS results (CSS selectors are always fully resolved - no expressions)
  for (const [file, result] of cssResults) {
    filesSet.add(file);
    for (const sel of result.selectors) {
      // Check if selector should be ignored
      if (ignoreSelectors.length > 0 && matchesAnyPattern(sel.selector, ignoreSelectors)) {
        continue;
      }

      const elementType = inferElementType(sel.selector);
      const requiredStates = getRequiredStates(elementType, customRequiredStates);
      const presentStates = sel.states;
      const missingStates = requiredStates.filter(
        s => !presentStates.includes(s),
      );

      analyses.push({
        selector: sel.selector,
        file,
        line: sel.line,
        elementType,
        states: Object.fromEntries(
          requiredStates.map(s => [
            s,
            {
              present: presentStates.includes(s),
              location: presentStates.includes(s)
                ? { file, line: sel.line }
                : undefined,
            },
          ]),
        ),
        requiredStates,
        missingStates,
        hasUnresolvedExpressions: false,
        unresolvedExpressions: [],
      });
    }
  }

  // Calculate coverage (excluding elements with unresolved expressions)
  const resolvedAnalyses = analyses.filter(a => !a.hasUnresolvedExpressions);
  const unresolvedCount = analyses.filter(a => a.hasUnresolvedExpressions).length;

  const totalRequired = resolvedAnalyses.reduce(
    (sum, a) => sum + a.requiredStates.length,
    0,
  );
  const totalPresent = resolvedAnalyses.reduce(
    (sum, a) => sum + (a.requiredStates.length - a.missingStates.length),
    0,
  );
  const percentage
    = totalRequired > 0 ? Math.round((totalPresent / totalRequired) * 100) : 100;

  return {
    files: filesSet.size,
    elements: analyses.length,
    analyses,
    coverage: {
      total: totalRequired,
      present: totalPresent,
      percentage,
    },
    unresolvedCount,
    passed: percentage >= threshold,
    threshold,
    parseErrors: [],
  };
}

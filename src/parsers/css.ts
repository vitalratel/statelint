// ABOUTME: CSS parser that extracts pseudo-class states from selectors.
// ABOUTME: Uses postcss to parse CSS and detect :hover, :focus, :disabled, etc.

import type { StateName } from "../types.ts";
import postcss from "postcss";

export interface SelectorInfo {
  selector: string;
  line: number;
  states: StateName[];
}

export interface CssParseResult {
  selectors: SelectorInfo[];
}

const PSEUDO_CLASS_MAP: Record<string, StateName> = {
  ":hover": "hover",
  ":focus": "focus",
  ":focus-visible": "focus-visible",
  ":focus-within": "focus-within",
  ":active": "active",
  ":disabled": "disabled",
  ":invalid": "invalid",
  ":checked": "checked",
  "::placeholder": "placeholder",
  ":placeholder-shown": "placeholder",
};

// Order matters: longer patterns first to avoid partial matches
const PSEUDO_REGEX = /:(focus-visible|focus-within|placeholder-shown|hover|focus|active|disabled|invalid|checked)|::placeholder/g;

export function parseCss(content: string, filePath: string): CssParseResult {
  const selectors: SelectorInfo[] = [];

  try {
    const root = postcss.parse(content, { from: filePath });

    root.walkRules((rule) => {
      const selectorList = rule.selector.split(",").map(s => s.trim());

      for (const fullSelector of selectorList) {
        const states: StateName[] = [];
        const matches = fullSelector.matchAll(PSEUDO_REGEX);

        for (const match of matches) {
          const pseudoKey = match[0].startsWith("::")
            ? match[0]
            : `:${match[1]}`;
          const state = PSEUDO_CLASS_MAP[pseudoKey];
          if (state && !states.includes(state)) {
            states.push(state);
          }
        }

        if (states.length > 0) {
          // Extract base selector (without pseudo-classes)
          const baseSelector = fullSelector
            .replace(PSEUDO_REGEX, "")
            .replace(/::placeholder/g, "")
            .trim();

          selectors.push({
            selector: baseSelector,
            line: rule.source?.start?.line ?? 0,
            states,
          });
        }
      }
    });
  }
  catch {
    // Parse errors handled by caller
  }

  return { selectors };
}

// ABOUTME: Shared constants and utilities for all parsers.
// ABOUTME: Contains interactive tags, state variants, and className extraction logic.

import type { StateName } from "../types.ts";

export const INTERACTIVE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
]);

export const TAILWIND_VARIANT_MAP: Record<string, StateName> = {
  "hover:": "hover",
  "focus:": "focus",
  "focus-visible:": "focus-visible",
  "focus-within:": "focus-within",
  "active:": "active",
  "disabled:": "disabled",
  "invalid:": "invalid",
  "checked:": "checked",
  "placeholder:": "placeholder",
};

// Order by length descending to match longer variants first
export const VARIANT_PREFIXES = Object.keys(TAILWIND_VARIANT_MAP).sort(
  (a, b) => b.length - a.length,
);

export const ARBITRARY_VARIANT_REGEX = /\[&:([\w-]+)\]/g;

export function extractStatesFromClassName(className: string): StateName[] {
  const states: StateName[] = [];
  const classes = className.split(/\s+/);

  for (const cls of classes) {
    // Check standard Tailwind variants
    for (const prefix of VARIANT_PREFIXES) {
      if (cls.startsWith(prefix)) {
        const state = TAILWIND_VARIANT_MAP[prefix];
        if (state && !states.includes(state)) {
          states.push(state);
        }
        break;
      }
    }

    // Check arbitrary variants [&:hover]
    const matches = cls.matchAll(ARBITRARY_VARIANT_REGEX);
    for (const match of matches) {
      const pseudoName = match[1];
      const state = TAILWIND_VARIANT_MAP[`${pseudoName}:`];
      if (state && !states.includes(state)) {
        states.push(state);
      }
    }
  }

  return states;
}

export function hasStateVariant(className: string): boolean {
  const classes = className.split(/\s+/);
  for (const cls of classes) {
    for (const prefix of VARIANT_PREFIXES) {
      if (cls.startsWith(prefix)) {
        return true;
      }
    }
    if (ARBITRARY_VARIANT_REGEX.test(cls)) {
      // Reset regex lastIndex since we're using global flag
      ARBITRARY_VARIANT_REGEX.lastIndex = 0;
      return true;
    }
  }
  return false;
}

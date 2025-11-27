// ABOUTME: Vue Single File Component parser.
// ABOUTME: Extracts CSS pseudo-classes from style blocks and Tailwind variants from templates.

import type { StateName } from "../types.ts";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { parseCss } from "./css.ts";
import { extractStatesFromClassName, INTERACTIVE_TAGS } from "./shared.ts";

export interface VueElementInfo {
  tag: string;
  line: number;
  states: StateName[];
  className: string;
  hasUnresolvedExpressions: boolean;
  unresolvedExpressions: string[];
  isContentRegion: boolean;
  canBeDisabled: boolean;
  canBeInvalid: boolean;
  hasPlaceholder: boolean;
  isRadioOrCheckbox: boolean;
  hasConditionalDisabled: boolean;
}

export interface VueSelectorInfo {
  selector: string;
  line: number;
  states: StateName[];
}

export interface VueParseResult {
  elements: VueElementInfo[];
  selectors: VueSelectorInfo[];
}

function parseTemplate(template: string, _filePath: string): VueElementInfo[] {
  const elements: VueElementInfo[] = [];

  // Match HTML elements with attributes
  const tagRegex = /<([a-z][\w-]*)(\s[^>]*)?(?:\/>|>)/gi;
  const matches = template.matchAll(tagRegex);

  for (const match of matches) {
    const tagName = match[1]!;
    const attributes = match[2] || "";

    // Extract class attribute (regular or :class binding)
    // Handle: class="...", :class="'...'", :class="\"...\""
    let className = "";
    const regularClassMatch = attributes.match(/\bclass=["']([^"']+)["']/);
    const boundClassMatch = attributes.match(/:class=["']['"]([^"']+)["']['"]|:class=["']'([^']+)'["']/);

    if (regularClassMatch) {
      className = regularClassMatch[1]!;
    }
    else if (boundClassMatch) {
      className = boundClassMatch[1] || boundClassMatch[2] || "";
    }

    // Check for role attribute
    const roleMatch = attributes.match(/role=["']([^"']+)["']/);
    const role = roleMatch ? roleMatch[1] : null;

    const isInteractive = INTERACTIVE_TAGS.has(tagName)
      || role === "button"
      || role === "link";

    if (isInteractive || className.includes(":")) {
      const states = extractStatesFromClassName(className);
      const lineNumber = template.substring(0, match.index).split("\n").length;

      let elementType = tagName;
      if (role === "button")
        elementType = "role-button";
      if (role === "link")
        elementType = "role-link";

      elements.push({
        tag: elementType,
        line: lineNumber,
        states,
        className,
        hasUnresolvedExpressions: false,
        unresolvedExpressions: [],
        isContentRegion: false,
        canBeDisabled: false,
        canBeInvalid: false,
        hasPlaceholder: false,
        isRadioOrCheckbox: false,
        hasConditionalDisabled: false,
      });
    }
  }

  return elements;
}

export function parseVue(content: string, filePath: string): VueParseResult {
  const elements: VueElementInfo[] = [];
  const selectors: VueSelectorInfo[] = [];

  try {
    const { descriptor } = parseSfc(content, {
      filename: filePath,
    });

    // Parse template for Tailwind variants
    if (descriptor.template) {
      const templateElements = parseTemplate(
        descriptor.template.content,
        filePath,
      );
      elements.push(...templateElements);
    }

    // Parse style blocks for CSS pseudo-classes
    for (const style of descriptor.styles) {
      const cssResult = parseCss(style.content, filePath);
      for (const sel of cssResult.selectors) {
        selectors.push({
          selector: sel.selector,
          line: sel.line + (style.loc.start.line - 1),
          states: sel.states,
        });
      }
    }
  }
  catch {
    // Parse errors handled by caller
  }

  return { elements, selectors };
}

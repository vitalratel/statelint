// ABOUTME: Svelte component parser.
// ABOUTME: Extracts CSS pseudo-classes from style blocks and Tailwind variants from markup.

import type { StateName } from "../types.ts";
import { parse } from "svelte/compiler";
import { parseCss } from "./css.ts";
import { extractStatesFromClassName, INTERACTIVE_TAGS } from "./shared.ts";

export interface SvelteElementInfo {
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

export interface SvelteSelectorInfo {
  selector: string;
  line: number;
  states: StateName[];
}

export interface SvelteParseResult {
  elements: SvelteElementInfo[];
  selectors: SvelteSelectorInfo[];
}

function visit(
  node: unknown,
  elements: SvelteElementInfo[],
  content: string,
): void {
  if (!node || typeof node !== "object")
    return;

  const n = node as Record<string, unknown>;

  // Handle regular elements
  if (n.type === "RegularElement" || n.type === "Element") {
    const name = n.name as string | undefined;
    if (name) {
      // Get class attribute
      let className = "";
      const attributes = (n.attributes || []) as Array<Record<string, unknown>>;

      for (const attr of attributes) {
        if (attr.type === "Attribute" && attr.name === "class") {
          const value = attr.value as Array<Record<string, unknown>> | undefined;
          if (value && value[0]?.type === "Text") {
            className = (value[0].data as string) || "";
          }
        }
      }

      // Check for role attribute
      let role: string | null = null;
      for (const attr of attributes) {
        if (attr.type === "Attribute" && attr.name === "role") {
          const value = attr.value as Array<Record<string, unknown>> | undefined;
          if (value && value[0]?.type === "Text") {
            role = (value[0].data as string) || null;
          }
        }
      }

      const isInteractive = INTERACTIVE_TAGS.has(name)
        || role === "button"
        || role === "link";

      if (isInteractive || className.includes(":")) {
        let elementType = name;
        if (role === "button")
          elementType = "role-button";
        if (role === "link")
          elementType = "role-link";

        const start = n.start as number | undefined;
        const lineNumber = start !== undefined
          ? content.substring(0, start).split("\n").length
          : 0;

        elements.push({
          tag: elementType,
          line: lineNumber,
          states: extractStatesFromClassName(className),
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

      // Visit element's fragment (children)
      const fragment = n.fragment as Record<string, unknown> | undefined;
      if (fragment?.nodes) {
        const nodes = fragment.nodes as unknown[];
        for (const child of nodes) {
          visit(child, elements, content);
        }
      }
    }
    return;
  }

  // Handle Fragment node
  if (n.type === "Fragment") {
    const nodes = n.nodes as unknown[] | undefined;
    if (nodes) {
      for (const child of nodes) {
        visit(child, elements, content);
      }
    }
    return;
  }

  // Handle EachBlock
  if (n.type === "EachBlock") {
    const body = n.body as Record<string, unknown> | undefined;
    if (body?.nodes) {
      const nodes = body.nodes as unknown[];
      for (const child of nodes) {
        visit(child, elements, content);
      }
    }
    return;
  }

  // Handle IfBlock
  if (n.type === "IfBlock") {
    const consequent = n.consequent as Record<string, unknown> | undefined;
    if (consequent?.nodes) {
      const nodes = consequent.nodes as unknown[];
      for (const child of nodes) {
        visit(child, elements, content);
      }
    }
    return;
  }

  // Generic traversal for other node types
  for (const key of Object.keys(n)) {
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        visit(item, elements, content);
      }
    }
    else if (child && typeof child === "object") {
      visit(child, elements, content);
    }
  }
}

export function parseSvelte(
  content: string,
  filePath: string,
): SvelteParseResult {
  const elements: SvelteElementInfo[] = [];
  const selectors: SvelteSelectorInfo[] = [];

  try {
    const ast = parse(content, {
      filename: filePath,
      modern: true,
    });

    // Visit the AST for markup elements
    if (ast.fragment) {
      visit(ast.fragment, elements, content);
    }

    // Parse CSS from style element
    const cssContent = ast.css?.content;
    if (cssContent) {
      const styleStart = cssContent.start;
      const styleEnd = cssContent.end;
      const cssCode = content.substring(styleStart, styleEnd);

      const cssResult = parseCss(cssCode, filePath);
      for (const sel of cssResult.selectors) {
        // Calculate actual line number in the file
        const linesBeforeStyle = content.substring(0, styleStart).split("\n").length - 1;
        selectors.push({
          selector: sel.selector,
          line: sel.line + linesBeforeStyle,
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

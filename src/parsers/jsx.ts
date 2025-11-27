// ABOUTME: JSX/TSX parser that extracts Tailwind state variants from className.
// ABOUTME: Uses @babel/parser to parse JSX and detect hover:, focus:, etc.

import type { InteractiveElement, StateName } from "../types.ts";
import type { SymbolTable } from "./resolver.ts";
import { parse } from "@babel/parser";
import { buildSymbolTable, resolveExpression } from "./resolver.ts";
import {
  extractStatesFromClassName,
  hasStateVariant,
  INTERACTIVE_TAGS,
} from "./shared.ts";

export interface ElementInfo {
  tag: InteractiveElement | string;
  line: number;
  states: StateName[];
  className: string;
  hasUnresolvedExpressions: boolean;
  unresolvedExpressions: string[];
  isContentRegion: boolean;
  // Attributes that indicate which states are meaningful
  canBeDisabled: boolean;
  canBeInvalid: boolean;
  hasPlaceholder: boolean;
  // Radio/checkbox inputs get hover feedback from their label
  isRadioOrCheckbox: boolean;
  // Dynamic props - developer likely has conditional styling via ternary
  hasConditionalDisabled: boolean;
}

export interface JsxParseResult {
  elements: ElementInfo[];
}

// Classes that indicate visually hidden elements (don't need interactive states)
const HIDDEN_CLASSES = new Set(["hidden", "sr-only", "invisible"]);

// Classes that indicate non-interactive elements (decorative, disabled pointer events)
const NON_INTERACTIVE_CLASSES = new Set(["pointer-events-none"]);

interface ClassNameExtraction {
  literalParts: string;
  hasUnresolvedExpressions: boolean;
  unresolvedExpressions: string[];
}

function extractClassNameFromValue(
  attrValue: Record<string, unknown>,
  symbols: SymbolTable,
): ClassNameExtraction {
  // String literal: className="hover:bg-blue-500"
  if (attrValue.type === "StringLiteral") {
    return {
      literalParts: attrValue.value as string,
      hasUnresolvedExpressions: false,
      unresolvedExpressions: [],
    };
  }

  // Expression container: className={...}
  if (attrValue.type === "JSXExpressionContainer") {
    const expr = attrValue.expression as Record<string, unknown>;
    return extractClassNameFromExpression(expr, symbols);
  }

  return {
    literalParts: "",
    hasUnresolvedExpressions: false,
    unresolvedExpressions: [],
  };
}

function extractClassNameFromExpression(
  expr: Record<string, unknown>,
  symbols: SymbolTable,
): ClassNameExtraction {
  // Try to resolve the expression using the symbol table
  const result = resolveExpression(expr, symbols);

  return {
    literalParts: result.resolvedValue,
    hasUnresolvedExpressions: !result.isFullyResolved,
    unresolvedExpressions: result.unresolvedParts,
  };
}

function isVisuallyHidden(className: string): boolean {
  const classes = className.split(/\s+/);
  return classes.some(cls => HIDDEN_CLASSES.has(cls));
}

function isNonInteractive(className: string): boolean {
  const classes = className.split(/\s+/);
  return classes.some(cls => NON_INTERACTIVE_CLASSES.has(cls));
}

function getElementType(
  tagName: string,
  role: string | null,
): InteractiveElement | string {
  if (role === "button")
    return "role-button";
  if (role === "link")
    return "role-link";
  if (INTERACTIVE_TAGS.has(tagName))
    return tagName as InteractiveElement;
  return tagName;
}

export function parseJsx(content: string, filePath: string): JsxParseResult {
  const elements: ElementInfo[] = [];

  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });

    // Build symbol table from the AST for variable resolution
    // Pass file path to enable import resolution
    const symbols = buildSymbolTable(ast as unknown as Record<string, unknown>, {
      currentFilePath: filePath,
      followImports: true,
    });

    function visit(node: unknown): void {
      if (!node || typeof node !== "object")
        return;
      const n = node as Record<string, unknown>;

      if (n.type === "JSXOpeningElement") {
        const name = n.name as Record<string, unknown> | undefined;
        const tagName
          = name?.type === "JSXIdentifier" ? (name.name as string) : null;

        if (tagName) {
          let classNameExtraction: ClassNameExtraction = {
            literalParts: "",
            hasUnresolvedExpressions: false,
            unresolvedExpressions: [],
          };
          let role: string | null = null;

          const attrs = (n.attributes || []) as Array<Record<string, unknown>>;
          for (const attr of attrs) {
            const attrName = attr.name as Record<string, unknown> | undefined;
            const attrValue = attr.value as Record<string, unknown> | undefined;

            if (attr.type === "JSXAttribute" && attrName?.name === "className" && attrValue) {
              classNameExtraction = extractClassNameFromValue(attrValue, symbols);
            }
            if (attr.type === "JSXAttribute" && attrName?.name === "role") {
              if (attrValue?.type === "StringLiteral") {
                role = attrValue.value as string;
              }
            }
          }

          const className = classNameExtraction.literalParts;

          // Skip visually hidden elements
          if (isVisuallyHidden(className)) {
            return;
          }

          // Skip non-interactive elements (pointer-events-none, etc.)
          if (isNonInteractive(className)) {
            return;
          }

          // Extract attributes for special handling
          let inputType: string | null = null;
          let tabIndexValue: number | null = null;
          let canBeDisabled = false;
          let canBeInvalid = false;
          let hasPlaceholder = false;
          let hasConditionalDisabled = false;

          for (const attr of attrs) {
            const attrName = attr.name as Record<string, unknown> | undefined;
            const attrValue = attr.value as Record<string, unknown> | undefined;
            const name = attrName?.name as string | undefined;

            if (attr.type === "JSXAttribute" && name === "type") {
              if (attrValue?.type === "StringLiteral") {
                inputType = attrValue.value as string;
              }
            }
            if (attr.type === "JSXAttribute" && name === "tabIndex") {
              // Handle tabIndex={0} or tabIndex={-1}
              if (attrValue?.type === "JSXExpressionContainer") {
                const expr = attrValue.expression as Record<string, unknown>;
                if (expr?.type === "NumericLiteral") {
                  tabIndexValue = expr.value as number;
                }
                // Handle negative: tabIndex={-1} is UnaryExpression
                if (expr?.type === "UnaryExpression" && expr.operator === "-") {
                  const arg = expr.argument as Record<string, unknown>;
                  if (arg?.type === "NumericLiteral") {
                    tabIndexValue = -(arg.value as number);
                  }
                }
              }
            }
            // Detect if element can be disabled and whether it's conditional
            if (attr.type === "JSXAttribute" && name === "disabled") {
              canBeDisabled = true;
              // Check if disabled is dynamic (expression, not just `disabled` or `disabled={true}`)
              if (attrValue?.type === "JSXExpressionContainer") {
                const expr = attrValue.expression as Record<string, unknown>;
                // If it's not a boolean literal true, it's conditional
                if (expr?.type !== "BooleanLiteral" || expr.value !== true) {
                  hasConditionalDisabled = true;
                }
              }
              // `disabled` without value is static (always disabled)
            }
            // Detect if element can be invalid (has validation)
            if (attr.type === "JSXAttribute" && (name === "required" || name === "pattern" || name === "min" || name === "max" || name === "minLength" || name === "maxLength")) {
              canBeInvalid = true;
            }
            // Detect placeholder
            if (attr.type === "JSXAttribute" && name === "placeholder") {
              hasPlaceholder = true;
            }
          }

          // type="email", type="url", type="number" imply validation
          if (inputType === "email" || inputType === "url" || inputType === "number") {
            canBeInvalid = true;
          }

          // Radio/checkbox inputs get hover feedback from their wrapping label
          const isRadioOrCheckbox = tagName === "input" && (inputType === "radio" || inputType === "checkbox");

          // Skip elements with tabIndex={-1} - programmatic focus only, no visible ring needed
          if (tabIndexValue === -1) {
            return;
          }

          // Skip file inputs - browser provides default focus styling
          if (tagName === "input" && inputType === "file") {
            return;
          }

          // Skip labels - focus belongs on the wrapped/associated input
          if (tagName === "label" && role !== "button" && role !== "link") {
            return;
          }

          const elementType = getElementType(tagName, role);
          const isInteractive
            = INTERACTIVE_TAGS.has(tagName)
              || role === "button"
              || role === "link";

          // Elements with tabIndex={0} but no interactive role are content regions
          // (e.g., scrollable divs) - they need focus but not other states
          const isContentRegion = tabIndexValue === 0 && !isInteractive && role !== "button" && role !== "link";

          // Non-interactive elements with hover styling but no tabIndex are visual containers
          // (e.g., card wrappers) - the nested interactive element handles focus
          const isVisualContainer
            = !isInteractive && !isContentRegion && hasStateVariant(className);
          if (isVisualContainer) {
            return;
          }

          // Only flag if truly interactive OR content regions
          if (isInteractive || isContentRegion) {
            const loc = n.loc as Record<string, Record<string, number>> | undefined;
            elements.push({
              tag: elementType,
              line: loc?.start?.line ?? 0,
              states: extractStatesFromClassName(className),
              className,
              hasUnresolvedExpressions: classNameExtraction.hasUnresolvedExpressions,
              unresolvedExpressions: classNameExtraction.unresolvedExpressions,
              isContentRegion,
              canBeDisabled,
              canBeInvalid,
              hasPlaceholder,
              isRadioOrCheckbox,
              hasConditionalDisabled,
            });
          }
        }
      }

      // Recursively visit all properties
      for (const key of Object.keys(n)) {
        const child = n[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            visit(item);
          }
        }
        else if (child && typeof child === "object") {
          visit(child);
        }
      }
    }

    visit(ast);
  }
  catch {
    // Parse errors handled by caller
  }

  return { elements };
}

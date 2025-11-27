// ABOUTME: Resolves AST expressions to string values using a symbol table.
// ABOUTME: Handles identifiers, member expressions, template literals, and conditionals.

import type { ASTNode, ResolutionResult, ResolvedValue, SymbolTable } from "./types.ts";

// String methods that don't affect the semantic content of class names
const STRING_PASSTHROUGH_METHODS = new Set([
  "trim",
  "trimStart",
  "trimEnd",
  "trimLeft",
  "trimRight",
  "replace",
  "replaceAll",
  "normalize",
  "toLowerCase",
  "toUpperCase",
]);

// Resolve an expression to a string value using the symbol table
export function resolveExpression(
  expr: ASTNode,
  symbols: SymbolTable,
  imports: Set<string> = new Set(),
): ResolutionResult {
  // String literal
  if (expr.type === "StringLiteral") {
    return {
      resolvedValue: expr.value as string,
      isFullyResolved: true,
      unresolvedParts: [],
    };
  }

  // Identifier - look up in symbol table
  if (expr.type === "Identifier") {
    const name = expr.name as string;
    const resolved = symbols.get(name);

    if (resolved?.type === "string" && resolved.value !== undefined) {
      return {
        resolvedValue: resolved.value,
        isFullyResolved: true,
        unresolvedParts: [],
      };
    }

    return {
      resolvedValue: "",
      isFullyResolved: false,
      unresolvedParts: [name],
    };
  }

  // Member expression (e.g., variants.primary or tokens.effects.focusRing)
  if (expr.type === "MemberExpression") {
    return resolveMemberExpression(expr, symbols);
  }

  // Conditional expression - union both branches
  if (expr.type === "ConditionalExpression") {
    const consequent = resolveExpression(expr.consequent as ASTNode, symbols, imports);
    const alternate = resolveExpression(expr.alternate as ASTNode, symbols, imports);

    // Union both results
    const combinedValue = [consequent.resolvedValue, alternate.resolvedValue]
      .filter(Boolean)
      .join(" ");

    return {
      resolvedValue: combinedValue,
      isFullyResolved: consequent.isFullyResolved && alternate.isFullyResolved,
      unresolvedParts: [...consequent.unresolvedParts, ...alternate.unresolvedParts],
    };
  }

  // Template literal
  if (expr.type === "TemplateLiteral") {
    return resolveTemplateLiteral(expr, symbols, imports);
  }

  // Call expression - unwrap string methods like .trim(), .replace()
  if (expr.type === "CallExpression") {
    return resolveCallExpression(expr, symbols, imports);
  }

  // Unhandled expression type
  return {
    resolvedValue: "",
    isFullyResolved: false,
    unresolvedParts: [stringifyExpr(expr)],
  };
}

function resolveMemberExpression(
  expr: ASTNode,
  symbols: SymbolTable,
): ResolutionResult {
  const object = expr.object as ASTNode;
  const property = expr.property as ASTNode;
  const isComputed = expr.computed as boolean;

  // Get the root object
  let current: ResolvedValue | undefined;

  if (object.type === "Identifier") {
    current = symbols.get(object.name as string);
  }
  else if (object.type === "MemberExpression") {
    // Nested member expression - resolve recursively to find the object
    const nestedResult = resolveMemberExpressionToValue(object, symbols);
    if (nestedResult) {
      current = nestedResult;
    }
    else {
      return {
        resolvedValue: "",
        isFullyResolved: false,
        unresolvedParts: [stringifyExpr(expr)],
      };
    }
  }
  else {
    return {
      resolvedValue: "",
      isFullyResolved: false,
      unresolvedParts: [stringifyExpr(expr)],
    };
  }

  if (!current || current.type === "unresolved") {
    return {
      resolvedValue: "",
      isFullyResolved: false,
      unresolvedParts: [stringifyExpr(expr)],
    };
  }

  // For computed access like variants[variant], union all values
  if (isComputed && current.type === "object" && current.properties) {
    const allValues: string[] = [];
    for (const [, value] of current.properties) {
      if (value.type === "string" && value.value) {
        allValues.push(value.value);
      }
      else if (value.type === "object") {
        // Recursively collect all string values from nested objects
        collectAllStrings(value, allValues);
      }
    }
    return {
      resolvedValue: allValues.join(" "),
      isFullyResolved: true,
      unresolvedParts: [],
    };
  }

  // Static property access
  if (property.type === "Identifier" && current.type === "object" && current.properties) {
    const propName = property.name as string;
    const propValue = current.properties.get(propName);

    if (propValue?.type === "string" && propValue.value !== undefined) {
      return {
        resolvedValue: propValue.value,
        isFullyResolved: true,
        unresolvedParts: [],
      };
    }

    if (propValue?.type === "object") {
      // Return the object for further access - but for className we need a string
      return {
        resolvedValue: "",
        isFullyResolved: false,
        unresolvedParts: [stringifyExpr(expr)],
      };
    }
  }

  return {
    resolvedValue: "",
    isFullyResolved: false,
    unresolvedParts: [stringifyExpr(expr)],
  };
}

function resolveMemberExpressionToValue(
  expr: ASTNode,
  symbols: SymbolTable,
): ResolvedValue | undefined {
  const object = expr.object as ASTNode;
  const property = expr.property as ASTNode;

  let current: ResolvedValue | undefined;

  if (object.type === "Identifier") {
    current = symbols.get(object.name as string);
  }
  else if (object.type === "MemberExpression") {
    current = resolveMemberExpressionToValue(object, symbols);
  }

  if (!current || current.type !== "object" || !current.properties) {
    return undefined;
  }

  if (property.type === "Identifier") {
    return current.properties.get(property.name as string);
  }

  return undefined;
}

function resolveCallExpression(
  expr: ASTNode,
  symbols: SymbolTable,
  imports: Set<string>,
): ResolutionResult {
  const callee = expr.callee as ASTNode;

  // Check if it's a method call: something.method()
  if (callee.type === "MemberExpression") {
    const property = callee.property as ASTNode;
    const methodName = property.type === "Identifier" ? (property.name as string) : null;

    // If it's a string passthrough method, resolve the underlying object
    if (methodName && STRING_PASSTHROUGH_METHODS.has(methodName)) {
      const object = callee.object as ASTNode;
      return resolveExpression(object, symbols, imports);
    }
  }

  // Unhandled call expression
  return {
    resolvedValue: "",
    isFullyResolved: false,
    unresolvedParts: [stringifyExpr(expr)],
  };
}

function collectAllStrings(value: ResolvedValue, result: string[]): void {
  if (value.type === "string" && value.value) {
    result.push(value.value);
  }
  else if (value.type === "object" && value.properties) {
    for (const [, v] of value.properties) {
      collectAllStrings(v, result);
    }
  }
}

function resolveTemplateLiteral(
  expr: ASTNode,
  symbols: SymbolTable,
  imports: Set<string>,
): ResolutionResult {
  const quasis = expr.quasis as ASTNode[];
  const expressions = expr.expressions as ASTNode[];

  const parts: string[] = [];
  const unresolvedParts: string[] = [];
  let allResolved = true;

  for (let i = 0; i < quasis.length; i++) {
    parts.push((quasis[i]!.value as ASTNode).raw as string);

    if (i < expressions.length) {
      const exprResult = resolveExpression(expressions[i]!, symbols, imports);
      parts.push(exprResult.resolvedValue);

      if (!exprResult.isFullyResolved) {
        allResolved = false;
        unresolvedParts.push(...exprResult.unresolvedParts);
      }
    }
  }

  return {
    resolvedValue: parts.join(""),
    isFullyResolved: allResolved,
    unresolvedParts,
  };
}

export function stringifyExpr(node: ASTNode): string {
  if (node.type === "Identifier") {
    return node.name as string;
  }
  if (node.type === "MemberExpression") {
    const obj = stringifyExpr(node.object as ASTNode);
    const prop = node.computed
      ? `[${stringifyExpr(node.property as ASTNode)}]`
      : `.${(node.property as ASTNode).name}`;
    return `${obj}${prop}`;
  }
  if (node.type === "StringLiteral") {
    return `"${node.value}"`;
  }
  return "<expr>";
}

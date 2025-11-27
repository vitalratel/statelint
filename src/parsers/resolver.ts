// ABOUTME: Symbol table and resolution logic for className expressions.
// ABOUTME: Resolves local variables, object properties, and template literals.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "@babel/parser";

type ASTNode = Record<string, unknown>;

// Represents a resolved value in the symbol table
export interface ResolvedValue {
  type: "string" | "object" | "unresolved";
  value?: string;
  properties?: Map<string, ResolvedValue>;
}

// Symbol table mapping variable names to their resolved values
export type SymbolTable = Map<string, ResolvedValue>;

// Result of resolving an expression
export interface ResolutionResult {
  resolvedValue: string;
  isFullyResolved: boolean;
  unresolvedParts: string[];
}

// Options for symbol table building
export interface SymbolTableOptions {
  currentFilePath?: string;
  followImports?: boolean;
}

// Cache for parsed import files (avoids re-parsing the same file)
const importCache = new Map<string, SymbolTable>();

// Clear import cache (useful for testing)
export function clearImportCache(): void {
  importCache.clear();
}

// Build symbol table from AST by extracting const/let declarations
export function buildSymbolTable(
  ast: ASTNode,
  options: SymbolTableOptions = {},
): SymbolTable {
  const symbols: SymbolTable = new Map();
  const pendingImports: Array<{ localName: string; importedName: string; sourcePath: string }> = [];

  function extractValue(init: ASTNode): ResolvedValue {
    // Unwrap TypeScript "as const" expressions
    if (init.type === "TSAsExpression" || init.type === "TSSatisfiesExpression") {
      return extractValue(init.expression as ASTNode);
    }

    if (init.type === "StringLiteral") {
      return { type: "string", value: init.value as string };
    }

    if (init.type === "TemplateLiteral") {
      const quasis = init.quasis as ASTNode[];
      const expressions = init.expressions as ASTNode[];

      // If no expressions, it's just a string
      if (expressions.length === 0) {
        const value = quasis.map(q => (q.value as ASTNode).raw as string).join("");
        return { type: "string", value };
      }

      // Try to resolve all expressions
      let allResolved = true;
      const parts: string[] = [];

      for (let i = 0; i < quasis.length; i++) {
        parts.push((quasis[i]!.value as ASTNode).raw as string);
        if (i < expressions.length) {
          const exprResult = resolveExpression(expressions[i]!, symbols);
          if (exprResult.isFullyResolved) {
            parts.push(exprResult.resolvedValue);
          }
          else {
            allResolved = false;
          }
        }
      }

      if (allResolved) {
        return { type: "string", value: parts.join("") };
      }
      return { type: "unresolved" };
    }

    if (init.type === "ObjectExpression") {
      const properties = new Map<string, ResolvedValue>();
      const props = init.properties as ASTNode[];

      for (const prop of props) {
        if (prop.type === "ObjectProperty") {
          const key = prop.key as ASTNode;
          const keyName = key.type === "Identifier"
            ? key.name as string
            : key.type === "StringLiteral"
              ? key.value as string
              : null;

          if (keyName) {
            const value = extractValue(prop.value as ASTNode);
            properties.set(keyName, value);
          }
        }
      }

      return { type: "object", properties };
    }

    return { type: "unresolved" };
  }

  function visit(node: ASTNode): void {
    if (!node || typeof node !== "object")
      return;

    // Track imports for later resolution
    if (node.type === "ImportDeclaration") {
      const specifiers = node.specifiers as ASTNode[];
      const sourcePath = (node.source as ASTNode)?.value as string;

      for (const spec of specifiers) {
        const localName = (spec.local as ASTNode)?.name as string;
        if (!localName)
          continue;

        if (spec.type === "ImportSpecifier") {
          // Named import: import { tokens } from "./tokens"
          const importedName = ((spec.imported as ASTNode)?.name as string) || localName;
          pendingImports.push({ localName, importedName, sourcePath });
        }
        else if (spec.type === "ImportDefaultSpecifier") {
          // Default import: import tokens from "./tokens"
          pendingImports.push({ localName, importedName: "default", sourcePath });
        }
        else if (spec.type === "ImportNamespaceSpecifier") {
          // Namespace import: import * as tokens from "./tokens"
          pendingImports.push({ localName, importedName: "*", sourcePath });
        }
      }
    }

    // Extract const/let declarations
    if (node.type === "VariableDeclaration") {
      const declarations = node.declarations as ASTNode[];
      for (const decl of declarations) {
        if (decl.type === "VariableDeclarator") {
          const id = decl.id as ASTNode;
          const init = decl.init as ASTNode;

          if (id?.type === "Identifier" && init) {
            const name = id.name as string;
            const value = extractValue(init);
            symbols.set(name, value);
          }
        }
      }
    }

    // Handle export declarations: export const tokens = {...}
    if (node.type === "ExportNamedDeclaration") {
      const declaration = node.declaration as ASTNode;
      if (declaration?.type === "VariableDeclaration") {
        const declarations = declaration.declarations as ASTNode[];
        for (const decl of declarations) {
          if (decl.type === "VariableDeclarator") {
            const id = decl.id as ASTNode;
            const init = decl.init as ASTNode;

            if (id?.type === "Identifier" && init) {
              const name = id.name as string;
              const value = extractValue(init);
              symbols.set(name, value);
            }
          }
        }
      }
    }

    // Recurse into child nodes
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object") {
            visit(item as ASTNode);
          }
        }
      }
      else if (child && typeof child === "object") {
        visit(child as ASTNode);
      }
    }
  }

  visit(ast);

  // Resolve imports if we have file context
  const { currentFilePath, followImports = true } = options;

  for (const { localName, importedName, sourcePath } of pendingImports) {
    if (!currentFilePath || !followImports) {
      // No file context - mark as unresolved
      symbols.set(localName, { type: "unresolved" });
      continue;
    }

    const resolvedValue = resolveImport(currentFilePath, sourcePath, importedName);
    if (resolvedValue) {
      symbols.set(localName, resolvedValue);
    }
    else {
      symbols.set(localName, { type: "unresolved" });
    }
  }

  return symbols;
}

// Resolve an import by reading and parsing the imported file
function resolveImport(
  currentFilePath: string,
  importPath: string,
  importedName: string,
): ResolvedValue | undefined {
  // Resolve the import path
  const currentDir = dirname(currentFilePath);
  let resolvedPath = resolve(currentDir, importPath);

  // Try common extensions if no extension provided
  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  if (!existsSync(resolvedPath)) {
    for (const ext of extensions) {
      const withExt = resolvedPath + ext;
      if (existsSync(withExt)) {
        resolvedPath = withExt;
        break;
      }
    }
  }

  // Also try /index files
  if (!existsSync(resolvedPath)) {
    for (const ext of extensions) {
      const indexPath = resolve(resolvedPath, `index${ext}`);
      if (existsSync(indexPath)) {
        resolvedPath = indexPath;
        break;
      }
    }
  }

  if (!existsSync(resolvedPath)) {
    return undefined;
  }

  // Check cache
  if (importCache.has(resolvedPath)) {
    const cachedSymbols = importCache.get(resolvedPath)!;
    return getExportedValue(cachedSymbols, importedName);
  }

  // Parse the imported file
  try {
    const content = readFileSync(resolvedPath, "utf-8");
    const importedAst = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });

    // Build symbol table for imported file (don't follow its imports to avoid cycles)
    const importedSymbols = buildSymbolTable(importedAst as unknown as ASTNode, {
      currentFilePath: resolvedPath,
      followImports: false, // Prevent deep recursion for now
    });

    // Cache the result
    importCache.set(resolvedPath, importedSymbols);

    return getExportedValue(importedSymbols, importedName);
  }
  catch {
    return undefined;
  }
}

// Get an exported value from a symbol table
function getExportedValue(symbols: SymbolTable, exportName: string): ResolvedValue | undefined {
  if (exportName === "*") {
    // Namespace import - create an object with all exports
    const properties = new Map<string, ResolvedValue>();
    for (const [name, value] of symbols) {
      if (value.type !== "unresolved") {
        properties.set(name, value);
      }
    }
    return { type: "object", properties };
  }

  if (exportName === "default") {
    // Default export - look for "default" in symbol table
    return symbols.get("default");
  }

  // Named export
  return symbols.get(exportName);
}

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
    return resolveMemberExpression(expr, symbols, imports);
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
  _imports: Set<string>,
): ResolutionResult {
  const object = expr.object as ASTNode;
  const property = expr.property as ASTNode;
  const isComputed = expr.computed as boolean;

  // Get the root object
  let current: ResolvedValue | undefined;
  let rootName: string;

  if (object.type === "Identifier") {
    rootName = object.name as string;
    current = symbols.get(rootName);
  }
  else if (object.type === "MemberExpression") {
    // Nested member expression - resolve recursively to find the object
    const nestedResult = resolveMemberExpressionToValue(object, symbols);
    if (nestedResult) {
      current = nestedResult;
      rootName = stringifyExpr(object);
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
      // This shouldn't happen in well-formed code
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

function stringifyExpr(node: ASTNode): string {
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

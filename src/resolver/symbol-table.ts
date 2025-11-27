// ABOUTME: Builds symbol tables from AST by extracting variable declarations.
// ABOUTME: Handles const/let declarations, exports, and imports.

import type {
  ASTNode,
  FileReader,
  ResolvedValue,
  SymbolTable,
  SymbolTableOptions,
} from "./types.ts";
import { resolveExpression } from "./expression-resolver.ts";
import { defaultFileReader, resolveImport } from "./import-resolver.ts";

export interface BuildSymbolTableOptions extends SymbolTableOptions {
  fileReader?: FileReader;
}

// Build symbol table from AST by extracting const/let declarations
export function buildSymbolTable(
  ast: ASTNode,
  options: BuildSymbolTableOptions = {},
): SymbolTable {
  const symbols: SymbolTable = new Map();
  const pendingImports: Array<{
    localName: string;
    importedName: string;
    sourcePath: string;
  }> = [];

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
  const {
    currentFilePath,
    followImports = true,
    fileReader = defaultFileReader,
  } = options;

  // Create a non-recursive symbol table builder for imports
  const buildImportSymbolTable = (importAst: ASTNode, filePath: string): SymbolTable => {
    return buildSymbolTable(importAst, {
      currentFilePath: filePath,
      followImports: false, // Prevent deep recursion
      fileReader,
    });
  };

  for (const { localName, importedName, sourcePath } of pendingImports) {
    if (!currentFilePath || !followImports) {
      // No file context - mark as unresolved
      symbols.set(localName, { type: "unresolved" });
      continue;
    }

    const resolvedValue = resolveImport(
      currentFilePath,
      sourcePath,
      importedName,
      buildImportSymbolTable,
      fileReader,
    );

    if (resolvedValue) {
      symbols.set(localName, resolvedValue);
    }
    else {
      symbols.set(localName, { type: "unresolved" });
    }
  }

  return symbols;
}

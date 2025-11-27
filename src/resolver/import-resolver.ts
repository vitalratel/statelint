// ABOUTME: Resolves imports by reading and parsing imported files.
// ABOUTME: Uses dependency injection for file system access to enable testing.

import type { ASTNode, FileReader, ResolvedValue, SymbolTable } from "./types.ts";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parse } from "@babel/parser";

// Default file reader using Node.js fs
export const defaultFileReader: FileReader = {
  exists: existsSync,
  read: (path: string) => readFileSync(path, "utf-8"),
};

// Cache for parsed import files (avoids re-parsing the same file)
const importCache = new Map<string, SymbolTable>();

// Clear import cache (useful for testing)
export function clearImportCache(): void {
  importCache.clear();
}

// Resolve an import by reading and parsing the imported file
export function resolveImport(
  currentFilePath: string,
  importPath: string,
  importedName: string,
  buildSymbolTableFn: (ast: ASTNode, filePath: string) => SymbolTable,
  fileReader: FileReader = defaultFileReader,
): ResolvedValue | undefined {
  // Resolve the import path
  const currentDir = dirname(currentFilePath);
  let resolvedPath = resolve(currentDir, importPath);

  // Try common extensions if no extension provided
  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  if (!fileReader.exists(resolvedPath)) {
    for (const ext of extensions) {
      const withExt = resolvedPath + ext;
      if (fileReader.exists(withExt)) {
        resolvedPath = withExt;
        break;
      }
    }
  }

  // Also try /index files
  if (!fileReader.exists(resolvedPath)) {
    for (const ext of extensions) {
      const indexPath = resolve(resolvedPath, `index${ext}`);
      if (fileReader.exists(indexPath)) {
        resolvedPath = indexPath;
        break;
      }
    }
  }

  if (!fileReader.exists(resolvedPath)) {
    return undefined;
  }

  // Check cache
  if (importCache.has(resolvedPath)) {
    const cachedSymbols = importCache.get(resolvedPath)!;
    return getExportedValue(cachedSymbols, importedName);
  }

  // Parse the imported file
  try {
    const content = fileReader.read(resolvedPath);
    const importedAst = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });

    // Build symbol table for imported file
    const importedSymbols = buildSymbolTableFn(
      importedAst as unknown as ASTNode,
      resolvedPath,
    );

    // Cache the result
    importCache.set(resolvedPath, importedSymbols);

    return getExportedValue(importedSymbols, importedName);
  }
  catch {
    return undefined;
  }
}

// Get an exported value from a symbol table
export function getExportedValue(
  symbols: SymbolTable,
  exportName: string,
): ResolvedValue | undefined {
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

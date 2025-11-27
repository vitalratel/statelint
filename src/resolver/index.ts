// ABOUTME: Public API for the resolver module.
// ABOUTME: Re-exports types and functions for symbol table building and expression resolution.

// Expression resolution
export { resolveExpression, stringifyExpr } from "./expression-resolver.ts";

// Import resolution
export { clearImportCache, defaultFileReader, getExportedValue } from "./import-resolver.ts";
// Symbol table
export { buildSymbolTable } from "./symbol-table.ts";

export type { BuildSymbolTableOptions } from "./symbol-table.ts";

// Types
export type {
  ASTNode,
  FileReader,
  ResolutionResult,
  ResolvedValue,
  SymbolTable,
  SymbolTableOptions,
} from "./types.ts";

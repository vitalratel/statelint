// ABOUTME: Shared types for the resolver module.
// ABOUTME: Defines interfaces for symbol tables, resolved values, and resolution results.

export type ASTNode = Record<string, unknown>;

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

// File system abstraction for dependency injection
export interface FileReader {
  exists: (path: string) => boolean;
  read: (path: string) => string;
}

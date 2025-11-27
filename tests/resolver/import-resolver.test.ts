// ABOUTME: Tests for import-resolver.ts
// ABOUTME: Verifies import resolution with mock file system.

import type { ASTNode, FileReader, SymbolTable } from "../../src/resolver/types.ts";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearImportCache,
  getExportedValue,
  resolveImport,
} from "../../src/resolver/import-resolver.ts";

// Mock file system for testing
function createMockFileReader(files: Record<string, string>): FileReader {
  return {
    exists: (path: string) => path in files,
    read: (path: string) => {
      const content = files[path];
      if (content !== undefined) {
        return content;
      }
      throw new Error(`File not found: ${path}`);
    },
  };
}

// Simple mock symbol table builder for testing
function mockBuildSymbolTable(ast: ASTNode, _filePath: string): SymbolTable {
  const symbols: SymbolTable = new Map();

  // Very simple extraction - just look for exported const with string value
  function visit(node: ASTNode): void {
    if (!node || typeof node !== "object")
      return;

    if (node.type === "ExportNamedDeclaration") {
      const declaration = node.declaration as ASTNode;
      if (declaration?.type === "VariableDeclaration") {
        const declarations = declaration.declarations as ASTNode[];
        for (const decl of declarations) {
          if (decl.type === "VariableDeclarator") {
            const id = decl.id as ASTNode;
            const init = decl.init as ASTNode;

            if (id?.type === "Identifier" && init?.type === "StringLiteral") {
              symbols.set(id.name as string, {
                type: "string",
                value: init.value as string,
              });
            }
            if (id?.type === "Identifier" && init?.type === "ObjectExpression") {
              const properties = new Map();
              for (const prop of (init.properties || []) as ASTNode[]) {
                if (prop.type === "ObjectProperty") {
                  const key = prop.key as ASTNode;
                  const value = prop.value as ASTNode;
                  if (key?.type === "Identifier" && value?.type === "StringLiteral") {
                    properties.set(key.name as string, {
                      type: "string",
                      value: value.value as string,
                    });
                  }
                }
              }
              symbols.set(id.name as string, { type: "object", properties });
            }
          }
        }
      }
    }

    // Recurse
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
  return symbols;
}

describe("resolveImport", () => {
  beforeEach(() => {
    clearImportCache();
  });

  test("resolves named export from relative path", () => {
    const files: Record<string, string> = {
      "/project/tokens.ts": `export const btnClass = "bg-blue-500";`,
    };
    const fileReader = createMockFileReader(files);

    const result = resolveImport(
      "/project/component.tsx",
      "./tokens",
      "btnClass",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result).toBeDefined();
    expect(result?.type).toBe("string");
    expect(result?.value).toBe("bg-blue-500");
  });

  test("resolves with .ts extension auto-detection", () => {
    const files: Record<string, string> = {
      "/project/tokens.ts": `export const style = "text-red-500";`,
    };
    const fileReader = createMockFileReader(files);

    const result = resolveImport(
      "/project/component.tsx",
      "./tokens",
      "style",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result?.value).toBe("text-red-500");
  });

  test("resolves with .tsx extension", () => {
    const files: Record<string, string> = {
      "/project/styles.tsx": `export const card = "rounded-lg";`,
    };
    const fileReader = createMockFileReader(files);

    const result = resolveImport(
      "/project/component.tsx",
      "./styles",
      "card",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result?.value).toBe("rounded-lg");
  });

  test("resolves index file in directory", () => {
    const files: Record<string, string> = {
      "/project/utils/index.ts": `export const helper = "flex items-center";`,
    };
    const fileReader = createMockFileReader(files);

    const result = resolveImport(
      "/project/component.tsx",
      "./utils",
      "helper",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result?.value).toBe("flex items-center");
  });

  test("returns undefined for non-existent file", () => {
    const fileReader = createMockFileReader({});

    const result = resolveImport(
      "/project/component.tsx",
      "./missing",
      "something",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result).toBeUndefined();
  });

  test("returns undefined for non-existent export", () => {
    const files: Record<string, string> = {
      "/project/tokens.ts": `export const existing = "value";`,
    };
    const fileReader = createMockFileReader(files);

    const result = resolveImport(
      "/project/component.tsx",
      "./tokens",
      "nonExistent",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result).toBeUndefined();
  });

  test("caches parsed files", () => {
    let parseCount = 0;
    const files: Record<string, string> = {
      "/project/tokens.ts": `export const a = "value-a"; export const b = "value-b";`,
    };

    const countingBuildSymbolTable = (ast: ASTNode, filePath: string): SymbolTable => {
      parseCount++;
      return mockBuildSymbolTable(ast, filePath);
    };

    const fileReader = createMockFileReader(files);

    // First call should parse
    resolveImport(
      "/project/component.tsx",
      "./tokens",
      "a",
      countingBuildSymbolTable,
      fileReader,
    );

    // Second call should use cache
    resolveImport(
      "/project/component.tsx",
      "./tokens",
      "b",
      countingBuildSymbolTable,
      fileReader,
    );

    expect(parseCount).toBe(1);
  });

  test("handles parse errors gracefully", () => {
    const files: Record<string, string> = {
      "/project/broken.ts": `export const broken = {{{invalid syntax`,
    };
    const fileReader = createMockFileReader(files);

    const result = resolveImport(
      "/project/component.tsx",
      "./broken",
      "broken",
      mockBuildSymbolTable,
      fileReader,
    );

    expect(result).toBeUndefined();
  });
});

describe("getExportedValue", () => {
  test("returns named export", () => {
    const symbols: SymbolTable = new Map([
      ["foo", { type: "string", value: "bar" }],
    ]);

    const result = getExportedValue(symbols, "foo");

    expect(result?.value).toBe("bar");
  });

  test("returns default export", () => {
    const symbols: SymbolTable = new Map([
      ["default", { type: "string", value: "default-value" }],
    ]);

    const result = getExportedValue(symbols, "default");

    expect(result?.value).toBe("default-value");
  });

  test("returns namespace with all exports", () => {
    const symbols: SymbolTable = new Map([
      ["a", { type: "string", value: "value-a" }],
      ["b", { type: "string", value: "value-b" }],
      ["unresolved", { type: "unresolved" }],
    ]);

    const result = getExportedValue(symbols, "*");

    expect(result?.type).toBe("object");
    expect(result?.properties?.size).toBe(2);
    expect(result?.properties?.get("a")?.value).toBe("value-a");
    expect(result?.properties?.get("b")?.value).toBe("value-b");
    // Unresolved values should be excluded
    expect(result?.properties?.has("unresolved")).toBe(false);
  });

  test("returns undefined for missing export", () => {
    const symbols: SymbolTable = new Map();

    const result = getExportedValue(symbols, "missing");

    expect(result).toBeUndefined();
  });
});

describe("clearImportCache", () => {
  test("clears the cache", () => {
    const files: Record<string, string> = {
      "/project/tokens.ts": `export const val = "first";`,
    };
    const fileReader = createMockFileReader(files);

    // First call
    const result1 = resolveImport(
      "/project/component.tsx",
      "./tokens",
      "val",
      mockBuildSymbolTable,
      fileReader,
    );
    expect(result1?.value).toBe("first");

    // Modify file content (simulating file change)
    const newFiles: Record<string, string> = {
      "/project/tokens.ts": `export const val = "second";`,
    };
    const newFileReader = createMockFileReader(newFiles);

    // Without clearing cache, should still return old value
    const result2 = resolveImport(
      "/project/component.tsx",
      "./tokens",
      "val",
      mockBuildSymbolTable,
      newFileReader,
    );
    expect(result2?.value).toBe("first"); // Still cached

    // Clear cache
    clearImportCache();

    // Now should read new value
    const result3 = resolveImport(
      "/project/component.tsx",
      "./tokens",
      "val",
      mockBuildSymbolTable,
      newFileReader,
    );
    expect(result3?.value).toBe("second");
  });
});

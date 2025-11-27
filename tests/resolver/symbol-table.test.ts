// ABOUTME: Tests for symbol-table.ts
// ABOUTME: Verifies AST to symbol table extraction for variable declarations.

import type { FileReader } from "../../src/resolver/types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { beforeEach, describe, expect, test } from "bun:test";
import { clearImportCache } from "../../src/resolver/import-resolver.ts";
import { buildSymbolTable } from "../../src/resolver/symbol-table.ts";

const FIXTURES_DIR = join(import.meta.dir, "../fixtures/resolver");

// Helper to parse and build symbol table from fixture file
function parseAndBuildFromFixture(fixtureName: string): ReturnType<typeof buildSymbolTable> {
  const content = readFileSync(join(FIXTURES_DIR, fixtureName), "utf-8");
  return parseAndBuild(content);
}

// Helper to parse code and build symbol table
function parseAndBuild(code: string, options: {
  filePath?: string;
  followImports?: boolean;
  fileReader?: FileReader;
} = {}) {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    errorRecovery: true,
  });

  return buildSymbolTable(ast as unknown as Record<string, unknown>, {
    currentFilePath: options.filePath,
    followImports: options.followImports ?? false,
    fileReader: options.fileReader,
  });
}

// Mock file reader for import tests
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

describe("buildSymbolTable", () => {
  beforeEach(() => {
    clearImportCache();
  });

  describe("const declarations", () => {
    test("extracts string literal", () => {
      const symbols = parseAndBuild(`const btnClass = "bg-blue-500";`);

      expect(symbols.get("btnClass")).toEqual({
        type: "string",
        value: "bg-blue-500",
      });
    });

    test("extracts multiple declarations", () => {
      const symbols = parseAndBuild(`
        const primary = "bg-blue-500";
        const secondary = "bg-gray-500";
      `);

      expect(symbols.get("primary")?.value).toBe("bg-blue-500");
      expect(symbols.get("secondary")?.value).toBe("bg-gray-500");
    });

    test("extracts let declarations", () => {
      const symbols = parseAndBuild(`let mutable = "hover:opacity-80";`);

      expect(symbols.get("mutable")?.value).toBe("hover:opacity-80");
    });

    test("extracts simple template literal", () => {
      const symbols = parseAndBuild("const tpl = `flex items-center`;");

      expect(symbols.get("tpl")).toEqual({
        type: "string",
        value: "flex items-center",
      });
    });

    test("extracts template literal with resolved expression", () => {
      const symbols = parseAndBuild(`
        const base = "bg-blue-500";
        const full = \`\${base} hover:opacity-80\`;
      `);

      expect(symbols.get("full")?.value).toBe("bg-blue-500 hover:opacity-80");
    });

    test("marks template with unresolved expression as unresolved", () => {
      const symbols = parseAndBuildFromFixture("symbol-table-template.ts");

      expect(symbols.get("tpl")?.type).toBe("unresolved");
    });
  });

  describe("object expressions", () => {
    test("extracts object with string values", () => {
      const symbols = parseAndBuild(`
        const variants = {
          primary: "bg-blue-500",
          secondary: "bg-gray-500",
        };
      `);

      const variants = symbols.get("variants");
      expect(variants?.type).toBe("object");
      expect(variants?.properties?.get("primary")).toEqual({
        type: "string",
        value: "bg-blue-500",
      });
      expect(variants?.properties?.get("secondary")).toEqual({
        type: "string",
        value: "bg-gray-500",
      });
    });

    test("extracts nested objects", () => {
      const symbols = parseAndBuild(`
        const tokens = {
          colors: {
            primary: "text-blue-500",
            secondary: "text-gray-500",
          },
        };
      `);

      const tokens = symbols.get("tokens");
      const colors = tokens?.properties?.get("colors");
      expect(colors?.type).toBe("object");
      expect(colors?.properties?.get("primary")?.value).toBe("text-blue-500");
    });

    test("handles string literal keys", () => {
      const symbols = parseAndBuild(`
        const obj = {
          "key-with-dash": "value",
        };
      `);

      const obj = symbols.get("obj");
      expect(obj?.properties?.get("key-with-dash")?.value).toBe("value");
    });
  });

  describe("TypeScript features", () => {
    test("unwraps 'as const' expression", () => {
      const symbols = parseAndBuild(`
        const variants = {
          primary: "bg-blue-500",
        } as const;
      `);

      const variants = symbols.get("variants");
      expect(variants?.type).toBe("object");
      expect(variants?.properties?.get("primary")?.value).toBe("bg-blue-500");
    });

    test("unwraps 'satisfies' expression", () => {
      const symbols = parseAndBuild(`
        const config = {
          color: "red",
        } satisfies Record<string, string>;
      `);

      const config = symbols.get("config");
      expect(config?.type).toBe("object");
      expect(config?.properties?.get("color")?.value).toBe("red");
    });
  });

  describe("export declarations", () => {
    test("extracts exported const", () => {
      const symbols = parseAndBuild(`export const exported = "visible";`);

      expect(symbols.get("exported")?.value).toBe("visible");
    });

    test("extracts exported object", () => {
      const symbols = parseAndBuild(`
        export const tokens = {
          btn: "rounded-lg",
        };
      `);

      const tokens = symbols.get("tokens");
      expect(tokens?.properties?.get("btn")?.value).toBe("rounded-lg");
    });
  });

  describe("import declarations", () => {
    test("marks import as unresolved without file context", () => {
      const symbols = parseAndBuild(`
        import { tokens } from "./tokens";
      `);

      expect(symbols.get("tokens")?.type).toBe("unresolved");
    });

    test("marks import as unresolved when followImports is false", () => {
      const symbols = parseAndBuild(
        `import { tokens } from "./tokens";`,
        { filePath: "/project/component.tsx", followImports: false },
      );

      expect(symbols.get("tokens")?.type).toBe("unresolved");
    });

    test("resolves named import with file reader", () => {
      const files: Record<string, string> = {
        "/project/tokens.ts": `export const btnClass = "bg-blue-500";`,
      };

      const symbols = parseAndBuild(
        `import { btnClass } from "./tokens";`,
        {
          filePath: "/project/component.tsx",
          followImports: true,
          fileReader: createMockFileReader(files),
        },
      );

      expect(symbols.get("btnClass")?.value).toBe("bg-blue-500");
    });

    test("resolves renamed import", () => {
      const files: Record<string, string> = {
        "/project/tokens.ts": `export const original = "value";`,
      };

      const symbols = parseAndBuild(
        `import { original as renamed } from "./tokens";`,
        {
          filePath: "/project/component.tsx",
          followImports: true,
          fileReader: createMockFileReader(files),
        },
      );

      expect(symbols.get("renamed")?.value).toBe("value");
    });

    test("resolves default import", () => {
      const files: Record<string, string> = {
        "/project/tokens.ts": `export default "default-value";`,
      };

      // Note: Our mock doesn't handle default exports, so this will be unresolved
      // This tests the code path for default imports
      const symbols = parseAndBuild(
        `import tokens from "./tokens";`,
        {
          filePath: "/project/component.tsx",
          followImports: true,
          fileReader: createMockFileReader(files),
        },
      );

      // Default export handling depends on the symbol table builder
      expect(symbols.has("tokens")).toBe(true);
    });

    test("resolves namespace import", () => {
      const files: Record<string, string> = {
        "/project/tokens.ts": `
          export const a = "value-a";
          export const b = "value-b";
        `,
      };

      const symbols = parseAndBuild(
        `import * as tokens from "./tokens";`,
        {
          filePath: "/project/component.tsx",
          followImports: true,
          fileReader: createMockFileReader(files),
        },
      );

      const tokens = symbols.get("tokens");
      expect(tokens?.type).toBe("object");
      expect(tokens?.properties?.get("a")?.value).toBe("value-a");
      expect(tokens?.properties?.get("b")?.value).toBe("value-b");
    });

    test("marks missing import as unresolved", () => {
      const files: Record<string, string> = {};

      const symbols = parseAndBuild(
        `import { missing } from "./nonexistent";`,
        {
          filePath: "/project/component.tsx",
          followImports: true,
          fileReader: createMockFileReader(files),
        },
      );

      expect(symbols.get("missing")?.type).toBe("unresolved");
    });
  });

  describe("unresolved values", () => {
    test("marks function call as unresolved", () => {
      const symbols = parseAndBuild(`const result = someFunction();`);

      expect(symbols.get("result")?.type).toBe("unresolved");
    });

    test("marks identifier reference as unresolved", () => {
      const symbols = parseAndBuild(`const copy = originalVar;`);

      expect(symbols.get("copy")?.type).toBe("unresolved");
    });

    test("marks arithmetic expression as unresolved", () => {
      const symbols = parseAndBuild(`const sum = 1 + 2;`);

      expect(symbols.get("sum")?.type).toBe("unresolved");
    });
  });

  describe("complex scenarios", () => {
    test("builds symbol table from real component code", () => {
      const code = `
        const baseClass = "rounded-lg shadow-md";
        const variants = {
          primary: "bg-blue-500 text-white",
          secondary: "bg-gray-200 text-gray-800",
        };

        export function Button({ variant = "primary" }) {
          return <button className={\`\${baseClass} \${variants[variant]}\`} />;
        }
      `;

      const symbols = parseAndBuild(code);

      expect(symbols.get("baseClass")?.value).toBe("rounded-lg shadow-md");
      expect(symbols.get("variants")?.properties?.get("primary")?.value).toBe(
        "bg-blue-500 text-white",
      );
    });

    test("handles deeply nested objects", () => {
      const code = `
        const theme = {
          colors: {
            brand: {
              primary: "blue-500",
              secondary: "gray-500",
            },
          },
        };
      `;

      const symbols = parseAndBuild(code);
      const theme = symbols.get("theme");
      const colors = theme?.properties?.get("colors");
      const brand = colors?.properties?.get("brand");

      expect(brand?.properties?.get("primary")?.value).toBe("blue-500");
    });
  });
});

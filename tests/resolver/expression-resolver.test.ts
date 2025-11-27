// ABOUTME: Tests for expression-resolver.ts
// ABOUTME: Verifies resolution of various expression types to string values.

import type { ResolvedValue, SymbolTable } from "../../src/resolver/types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, test } from "bun:test";
import {
  resolveExpression,
  stringifyExpr,
} from "../../src/resolver/expression-resolver.ts";

const FIXTURES_DIR = join(import.meta.dir, "../fixtures/resolver");

type ASTNode = Record<string, unknown>;

// Helper to parse an expression and return its AST node
function parseExpr(code: string): ASTNode {
  // Wrap in parentheses to ensure it parses as an expression
  const ast = parse(`(${code})`, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
  const stmt = ast.program.body[0] as unknown as ASTNode;
  if (stmt.type === "ExpressionStatement") {
    return stmt.expression as unknown as ASTNode;
  }
  return stmt;
}

// Helper to read a fixture file and extract expression from a variable named 'result'
function parseExprFromFixture(fixtureName: string): ASTNode {
  const content = readFileSync(join(FIXTURES_DIR, fixtureName), "utf-8");
  const ast = parse(content, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  // Find the variable declaration for 'result'
  for (const node of ast.program.body) {
    if (node.type === "VariableDeclaration") {
      const varDecl = node as unknown as ASTNode;
      const declarations = varDecl.declarations as ASTNode[];
      for (const decl of declarations) {
        const id = decl.id as ASTNode;
        if (id?.type === "Identifier" && id.name === "result") {
          return decl.init as ASTNode;
        }
      }
    }
  }

  throw new Error(`No 'result' variable found in fixture: ${fixtureName}`);
}

// Helper to build symbol table from fixture file
function buildSymbolsFromFixture(fixtureName: string): SymbolTable {
  const content = readFileSync(join(FIXTURES_DIR, fixtureName), "utf-8");
  const ast = parse(content, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const symbols: SymbolTable = new Map();

  for (const node of ast.program.body) {
    if (node.type === "VariableDeclaration") {
      const varDecl = node as unknown as ASTNode;
      const declarations = varDecl.declarations as ASTNode[];
      for (const decl of declarations) {
        const id = decl.id as ASTNode;
        const init = decl.init as ASTNode;

        if (
          id?.type === "Identifier"
          && id.name !== "result"
          && init?.type === "StringLiteral"
        ) {
          symbols.set(id.name as string, {
            type: "string",
            value: init.value as string,
          });
        }
      }
    }
  }

  return symbols;
}

// Helper to create a symbol table from entries
function createSymbols(entries: Array<[string, ResolvedValue]>): SymbolTable {
  return new Map(entries);
}

describe("resolveExpression", () => {
  describe("StringLiteral", () => {
    test("resolves string literal", () => {
      const expr = parseExpr("\"hover:bg-blue-500\"");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("hover:bg-blue-500");
      expect(result.unresolvedParts).toEqual([]);
    });

    test("resolves empty string", () => {
      const expr = parseExpr("\"\"");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("");
    });
  });

  describe("Identifier", () => {
    test("resolves identifier from symbol table", () => {
      const expr = parseExpr("buttonClass");
      const symbols = createSymbols([
        [
          "buttonClass",
          { type: "string", value: "hover:bg-blue-500 focus:ring" },
        ],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("hover:bg-blue-500 focus:ring");
    });

    test("marks unknown identifier as unresolved", () => {
      const expr = parseExpr("unknownVar");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
      expect(result.resolvedValue).toBe("");
      expect(result.unresolvedParts).toContain("unknownVar");
    });

    test("marks unresolved type as unresolved", () => {
      const expr = parseExpr("dynamicVar");
      const symbols = createSymbols([["dynamicVar", { type: "unresolved" }]]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(false);
      expect(result.unresolvedParts).toContain("dynamicVar");
    });
  });

  describe("MemberExpression", () => {
    test("resolves static property access", () => {
      const expr = parseExpr("variants.primary");
      const symbols = createSymbols([
        [
          "variants",
          {
            type: "object",
            properties: new Map([
              ["primary", { type: "string", value: "bg-blue-500" }],
              ["secondary", { type: "string", value: "bg-gray-500" }],
            ]),
          },
        ],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("bg-blue-500");
    });

    test("resolves nested property access", () => {
      const expr = parseExpr("tokens.colors.primary");
      const symbols = createSymbols([
        [
          "tokens",
          {
            type: "object",
            properties: new Map([
              [
                "colors",
                {
                  type: "object",
                  properties: new Map([
                    ["primary", { type: "string", value: "text-blue-500" }],
                  ]),
                },
              ],
            ]),
          },
        ],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("text-blue-500");
    });

    test("resolves computed access with union of all values", () => {
      const expr = parseExpr("variants[variant]");
      const symbols = createSymbols([
        [
          "variants",
          {
            type: "object",
            properties: new Map([
              ["primary", { type: "string", value: "bg-blue-500" }],
              ["secondary", { type: "string", value: "bg-gray-500" }],
            ]),
          },
        ],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toContain("bg-blue-500");
      expect(result.resolvedValue).toContain("bg-gray-500");
    });

    test("marks unknown object as unresolved", () => {
      const expr = parseExpr("unknown.property");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
      expect(result.unresolvedParts.length).toBeGreaterThan(0);
    });

    test("marks missing property as unresolved", () => {
      const expr = parseExpr("obj.missing");
      const symbols = createSymbols([
        [
          "obj",
          {
            type: "object",
            properties: new Map([
              ["exists", { type: "string", value: "value" }],
            ]),
          },
        ],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(false);
    });

    test("resolves computed access with nested objects by collecting all strings", () => {
      const expr = parseExpr("variants[size]");
      const symbols = createSymbols([
        [
          "variants",
          {
            type: "object",
            properties: new Map([
              ["primary", { type: "string", value: "bg-blue-500" }],
              [
                "sizes",
                {
                  type: "object",
                  properties: new Map([
                    ["sm", { type: "string", value: "text-sm" }],
                    ["lg", { type: "string", value: "text-lg" }],
                  ]),
                },
              ],
            ]),
          },
        ],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toContain("bg-blue-500");
      expect(result.resolvedValue).toContain("text-sm");
      expect(result.resolvedValue).toContain("text-lg");
    });
  });

  describe("ConditionalExpression", () => {
    test("resolves both branches and unions them", () => {
      const expr = parseExpr("isActive ? \"bg-blue-500\" : \"bg-gray-500\"");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toContain("bg-blue-500");
      expect(result.resolvedValue).toContain("bg-gray-500");
    });

    test("marks as unresolved if either branch is unresolved", () => {
      const expr = parseExpr("isActive ? dynamicClass : \"bg-gray-500\"");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
      expect(result.unresolvedParts).toContain("dynamicClass");
    });

    test("resolves nested conditionals", () => {
      const expr = parseExpr("a ? \"one\" : b ? \"two\" : \"three\"");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toContain("one");
      expect(result.resolvedValue).toContain("two");
      expect(result.resolvedValue).toContain("three");
    });
  });

  describe("TemplateLiteral", () => {
    test("resolves simple template literal", () => {
      const expr = parseExpr("`hover:bg-blue-500`");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("hover:bg-blue-500");
    });

    test("resolves template literal with resolved expression", () => {
      const expr = parseExprFromFixture("template-with-resolved.ts");
      const symbols = buildSymbolsFromFixture("template-with-resolved.ts");
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("bg-blue-500 hover:opacity-80");
    });

    test("partially resolves template with unresolved expression", () => {
      const expr = parseExprFromFixture("template-with-unresolved.ts");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
      expect(result.resolvedValue).toContain("hover:opacity-80");
      expect(result.unresolvedParts).toContain("dynamic");
    });

    test("resolves template with multiple expressions", () => {
      const expr = parseExprFromFixture("template-with-multiple.ts");
      const symbols = buildSymbolsFromFixture("template-with-multiple.ts");
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("one two three");
    });
  });

  describe("CallExpression", () => {
    test("resolves string.trim()", () => {
      const expr = parseExpr("className.trim()");
      const symbols = createSymbols([
        ["className", { type: "string", value: "  hover:bg-blue-500  " }],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
      expect(result.resolvedValue).toBe("  hover:bg-blue-500  ");
    });

    test("resolves chained string methods", () => {
      const expr = parseExpr("className.trim().toLowerCase()");
      const symbols = createSymbols([
        ["className", { type: "string", value: "HOVER:BG-BLUE-500" }],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
    });

    test("marks unknown function call as unresolved", () => {
      const expr = parseExpr("getClassName()");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
    });

    test("handles replace method", () => {
      const expr = parseExpr("str.replace(\"a\", \"b\")");
      const symbols = createSymbols([
        ["str", { type: "string", value: "class-a" }],
      ]);
      const result = resolveExpression(expr, symbols);

      expect(result.isFullyResolved).toBe(true);
    });
  });

  describe("unhandled expressions", () => {
    test("marks array expression as unresolved", () => {
      const expr = parseExpr("[\"a\", \"b\"]");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
    });

    test("marks function expression as unresolved", () => {
      const expr = parseExpr("() => 'class'");
      const result = resolveExpression(expr, new Map());

      expect(result.isFullyResolved).toBe(false);
    });
  });
});

describe("stringifyExpr", () => {
  test("stringifies identifier", () => {
    const expr = parseExpr("foo");
    expect(stringifyExpr(expr)).toBe("foo");
  });

  test("stringifies member expression", () => {
    const expr = parseExpr("foo.bar");
    expect(stringifyExpr(expr)).toBe("foo.bar");
  });

  test("stringifies computed member expression", () => {
    const expr = parseExpr("foo[bar]");
    expect(stringifyExpr(expr)).toBe("foo[bar]");
  });

  test("stringifies nested member expression", () => {
    const expr = parseExpr("a.b.c");
    expect(stringifyExpr(expr)).toBe("a.b.c");
  });

  test("stringifies string literal", () => {
    const expr = parseExpr("\"hello\"");
    expect(stringifyExpr(expr)).toBe("\"hello\"");
  });

  test("returns <expr> for unknown types", () => {
    const expr = parseExpr("[1, 2, 3]");
    expect(stringifyExpr(expr)).toBe("<expr>");
  });
});

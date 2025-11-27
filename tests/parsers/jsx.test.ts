// ABOUTME: Unit tests for JSX/TSX parser.
// ABOUTME: Tests Tailwind variant extraction from className attributes.

import { describe, expect, test } from "bun:test";
import { parseJsx } from "../../src/parsers/jsx.ts";

describe("parseJsx", () => {
  test("extracts hover: variant from button", () => {
    const jsx = `<button className="hover:bg-blue-500">Click</button>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.tag).toBe("button");
    expect(result.elements[0]!.states).toContain("hover");
  });

  test("extracts multiple variants", () => {
    const jsx = `<a href="#" className="hover:underline focus:ring active:scale-95">Link</a>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.tag).toBe("a");
    expect(result.elements[0]!.states).toContain("hover");
    expect(result.elements[0]!.states).toContain("focus");
    expect(result.elements[0]!.states).toContain("active");
  });

  test("extracts disabled: variant from input", () => {
    const jsx = `<input className="disabled:opacity-50 invalid:border-red-500" />`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.tag).toBe("input");
    expect(result.elements[0]!.states).toContain("disabled");
    expect(result.elements[0]!.states).toContain("invalid");
  });

  test("extracts focus-visible: and focus-within:", () => {
    const jsx = `<button className="focus-visible:outline-2 focus-within:ring">OK</button>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.states).toContain("focus-visible");
    expect(result.elements[0]!.states).toContain("focus-within");
  });

  test("extracts placeholder: variant", () => {
    const jsx = `<input className="placeholder:text-gray-400" />`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.states).toContain("placeholder");
  });

  test("extracts checked: variant", () => {
    const jsx = `<input type="checkbox" className="checked:bg-blue-500" />`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.states).toContain("checked");
  });

  test("extracts arbitrary variant [&:hover]", () => {
    const jsx = `<div role="button" className="[&:hover]:bg-gray-100">Click</div>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.states).toContain("hover");
  });

  test("detects role='button' as interactive", () => {
    const jsx = `<div role="button" className="hover:bg-blue-500">Click</div>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.tag).toBe("role-button");
  });

  test("detects role='link' as interactive", () => {
    const jsx = `<span role="link" className="hover:underline">Link</span>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.tag).toBe("role-link");
  });

  test("includes line numbers", () => {
    const jsx = `
      <div>
        <button className="hover:bg-blue-500">Click</button>
      </div>
    `;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements[0]!.line).toBeGreaterThan(1);
  });

  test("extracts className from multiple elements", () => {
    const jsx = `
      <div>
        <button className="hover:bg-blue-500">One</button>
        <a href="#" className="focus:ring">Two</a>
      </div>
    `;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(2);
  });

  test("handles elements without state variants", () => {
    const jsx = `<button className="bg-blue-500 text-white">Click</button>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.states).toHaveLength(0);
  });

  test("handles select and textarea", () => {
    const jsx = `
      <>
        <select className="focus:ring" />
        <textarea className="hover:border-gray-400" />
      </>
    `;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(2);
    expect(result.elements.find(e => e.tag === "select")?.states).toContain("focus");
    expect(result.elements.find(e => e.tag === "textarea")?.states).toContain("hover");
  });

  test("does not flag non-interactive elements with responsive breakpoints", () => {
    const jsx = `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">Content</div>`;
    const result = parseJsx(jsx, "test.tsx");

    // div with only responsive prefixes should not be flagged as interactive
    expect(result.elements).toHaveLength(0);
  });

  test("does not flag non-interactive elements with other non-state prefixes", () => {
    const jsx = `
      <div className="sm:px-4 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <span className="dark:text-white">Text</span>
      </div>
    `;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(0);
  });

  test("excludes elements with hidden class", () => {
    const jsx = `<input type="file" className="hidden" />`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(0);
  });

  test("excludes elements with sr-only class", () => {
    const jsx = `<input type="radio" className="sr-only" />`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(0);
  });

  test("excludes elements with invisible class", () => {
    const jsx = `<button className="invisible">Hidden</button>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(0);
  });

  test("still flags interactive elements with state variants even if they have breakpoints", () => {
    const jsx = `<button className="md:px-4 hover:bg-blue-500">Click</button>`;
    const result = parseJsx(jsx, "test.tsx");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.states).toContain("hover");
  });

  describe("expression detection", () => {
    test("detects template literal with expressions as unresolved", () => {
      const jsx = `<button className={\`base \${tokens.effects.focusRing}\`}>Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(true);
    });

    test("detects pure identifier className as unresolved", () => {
      const jsx = `<button className={styles}>Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(true);
    });

    test("detects member expression className as unresolved", () => {
      const jsx = `<button className={tokens.buttons.primary}>Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(true);
    });

    test("extracts states from literal parts of template literal", () => {
      const jsx = `<button className={\`hover:bg-blue-500 \${dynamicClass} focus:ring-2\`}>Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(true);
    });

    test("string literal className has no unresolved expressions", () => {
      const jsx = `<button className="hover:bg-blue-500">Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("tracks unresolved expression sources", () => {
      const jsx = `<button className={\`base \${tokens.effects.focusRing} \${variantClasses[variant]}\`}>Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements[0]!.unresolvedExpressions).toHaveLength(2);
      expect(result.elements[0]!.unresolvedExpressions).toContain("tokens.effects.focusRing");
      expect(result.elements[0]!.unresolvedExpressions).toContain("variantClasses[variant]");
    });

    test("conditional expression with literal branches is resolved (unions both)", () => {
      const jsx = `<button className={isActive ? "hover:bg-blue-500" : "hover:bg-gray-500"}>Click</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      // Conditional with string literal branches is now resolved by unioning
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
      expect(result.elements[0]!.states).toContain("hover");
    });
  });

  describe("same-file variable resolution", () => {
    test("resolves simple const string variable", () => {
      const jsx = `
        const baseClasses = "hover:bg-blue-500 focus:ring-2";
        function Button() {
          return <button className={baseClasses}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("resolves object property access", () => {
      const jsx = `
        const variants = {
          primary: "hover:bg-blue-700 active:scale-95",
          secondary: "hover:bg-gray-200"
        };
        function Button() {
          return <button className={variants.primary}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("active");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("resolves computed property access by unioning all values", () => {
      const jsx = `
        const variants = {
          primary: "hover:bg-blue-700 focus:ring-blue-500",
          secondary: "hover:bg-gray-200 active:scale-95"
        };
        function Button({ variant }) {
          return <button className={variants[variant]}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      // Should union all variant values
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.states).toContain("active");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("resolves template literal with local variable", () => {
      const jsx = `
        const interactive = "hover:bg-blue-500 focus:ring-2";
        function Button() {
          return <button className={\`p-4 \${interactive}\`}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("resolves conditional expression by unioning both branches", () => {
      const jsx = `
        function Button({ isActive }) {
          return <button className={isActive ? "hover:bg-blue-500 active:scale-95" : "hover:bg-gray-500 focus:ring-2"}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      // Should union both branches
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("active");
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("unwraps string method chains like .trim().replace()", () => {
      const jsx = `
        const base = "hover:bg-blue-500";
        function Button() {
          return <button className={\`\${base} focus:ring-2\`.trim().replace(/\\s+/g, ' ')}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.states).toContain("hover");
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });

    test("marks unresolved when variable not found in file", () => {
      const jsx = `
        function Button() {
          return <button className={unknownVariable}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(true);
      expect(result.elements[0]!.unresolvedExpressions).toContain("unknownVariable");
    });

    test("marks unresolved for imported variables without file context", () => {
      // Without providing actual file paths, imports remain unresolved
      const jsx = `
        import { tokens } from "./tokens";
        function Button() {
          return <button className={tokens.effects.focusRing}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      // Without file system access, imported variables remain unresolved
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(true);
    });

    test("resolves nested object access", () => {
      const jsx = `
        const tokens = {
          effects: {
            focusRing: "focus:ring-2 focus:ring-blue-500"
          }
        };
        function Button() {
          return <button className={tokens.effects.focusRing}>Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.states).toContain("focus");
      expect(result.elements[0]!.hasUnresolvedExpressions).toBe(false);
    });
  });

  describe("false positive handling", () => {
    test("skips elements with pointer-events-none", () => {
      const jsx = `
        function Slider() {
          return <div className="pointer-events-none hover:bg-blue-500">Track</div>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      // Element with pointer-events-none should be skipped
      expect(result.elements).toHaveLength(0);
    });

    test("skips label elements (focus belongs on child input)", () => {
      const jsx = `
        function Form() {
          return (
            <label className="hover:text-blue-500">
              Name
              <input type="text" className="focus:ring-2" />
            </label>
          );
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      // Label should be skipped, only input should be detected
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.tag).toBe("input");
    });

    test("skips file inputs (browser provides default styling)", () => {
      const jsx = `
        function Upload() {
          return <input type="file" className="w-full" />;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      // File input should be skipped
      expect(result.elements).toHaveLength(0);
    });

    test("detects content regions with tabIndex as needing only focus", () => {
      const jsx = `
        function CodeBlock() {
          return <div tabIndex={0} className="focus:ring-2">Scrollable content</div>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      // Should be detected as a content region
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.isContentRegion).toBe(true);
    });

    test("does not mark interactive elements with tabIndex as content regions", () => {
      const jsx = `
        function Button() {
          return <button tabIndex={0} className="hover:bg-blue-500">Click</button>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      // Button with tabIndex is still interactive, not a content region
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.isContentRegion).toBe(false);
    });

    test("skips elements with tabIndex={-1} (programmatic focus only)", () => {
      const jsx = `
        function Alert() {
          return <div tabIndex={-1} role="alert" className="focus:ring-2">Announcement</div>;
        }
      `;
      const result = parseJsx(jsx, "test.tsx");

      // tabIndex={-1} is for programmatic focus, not user focus - skip it
      expect(result.elements).toHaveLength(0);
    });
  });

  describe("attribute detection for state requirements", () => {
    test("detects disabled attribute (static)", () => {
      const jsx = `<button disabled className="bg-gray-500">Submit</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeDisabled).toBe(true);
      expect(result.elements[0]!.hasConditionalDisabled).toBe(false);
    });

    test("detects disabled={true} as static", () => {
      const jsx = `<button disabled={true} className="bg-gray-500">Submit</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeDisabled).toBe(true);
      expect(result.elements[0]!.hasConditionalDisabled).toBe(false);
    });

    test("detects disabled={isDisabled} as conditional", () => {
      const jsx = `<button disabled={isDisabled} className="bg-gray-500">Submit</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeDisabled).toBe(true);
      expect(result.elements[0]!.hasConditionalDisabled).toBe(true);
    });

    test("detects disabled={loading || !valid} as conditional", () => {
      const jsx = `<button disabled={loading || !valid} className="bg-gray-500">Submit</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeDisabled).toBe(true);
      expect(result.elements[0]!.hasConditionalDisabled).toBe(true);
    });

    test("detects required attribute", () => {
      const jsx = `<input required className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("detects pattern attribute", () => {
      const jsx = `<input pattern="[0-9]+" className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("detects min/max attributes", () => {
      const jsx = `<input type="number" min={0} max={100} className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("detects minLength/maxLength attributes", () => {
      const jsx = `<input minLength={3} maxLength={50} className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("detects placeholder attribute", () => {
      const jsx = `<input placeholder="Enter name" className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasPlaceholder).toBe(true);
    });

    test("detects type=email implies validation", () => {
      const jsx = `<input type="email" className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("detects type=url implies validation", () => {
      const jsx = `<input type="url" className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("detects type=number implies validation", () => {
      const jsx = `<input type="number" className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(true);
    });

    test("element without validation attributes has canBeInvalid=false", () => {
      const jsx = `<input type="text" className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeInvalid).toBe(false);
    });

    test("element without placeholder has hasPlaceholder=false", () => {
      const jsx = `<input className="border" />`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.hasPlaceholder).toBe(false);
    });

    test("element without disabled has canBeDisabled=false", () => {
      const jsx = `<button className="bg-blue-500">Submit</button>`;
      const result = parseJsx(jsx, "test.tsx");

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]!.canBeDisabled).toBe(false);
    });
  });
});

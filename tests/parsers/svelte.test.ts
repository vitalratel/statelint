// ABOUTME: Unit tests for Svelte parser.
// ABOUTME: Tests extraction of CSS pseudo-classes and Tailwind variants from .svelte files.

import { describe, expect, test } from "bun:test";
import { parseSvelte } from "../../src/parsers/svelte.ts";

describe("parseSvelte", () => {
  test("extracts Tailwind variants from markup", () => {
    const svelte = `
      <button class="hover:bg-blue-500 focus:ring">Click</button>
    `;
    const result = parseSvelte(svelte, "Button.svelte");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.tag).toBe("button");
    expect(result.elements[0]!.states).toContain("hover");
    expect(result.elements[0]!.states).toContain("focus");
  });

  test("extracts CSS pseudo-classes from style block", () => {
    const svelte = `
      <button class="btn">Click</button>
      <style>
        .btn:hover { background: blue; }
        .btn:focus { outline: 2px solid blue; }
      </style>
    `;
    const result = parseSvelte(svelte, "Button.svelte");

    expect(result.selectors).toHaveLength(2);
    expect(result.selectors[0]!.states).toContain("hover");
    expect(result.selectors[1]!.states).toContain("focus");
  });

  test("extracts multiple interactive elements", () => {
    const svelte = `
      <div>
        <button class="hover:bg-blue-500">Button</button>
        <input class="focus:ring disabled:opacity-50" />
        <a href="#" class="hover:underline">Link</a>
      </div>
    `;
    const result = parseSvelte(svelte, "Form.svelte");

    expect(result.elements).toHaveLength(3);
    expect(result.elements.find(e => e.tag === "button")?.states).toContain("hover");
    expect(result.elements.find(e => e.tag === "input")?.states).toContain("focus");
    expect(result.elements.find(e => e.tag === "input")?.states).toContain("disabled");
    expect(result.elements.find(e => e.tag === "a")?.states).toContain("hover");
  });

  test("handles Svelte class directive syntax", () => {
    const svelte = `
      <button class="hover:bg-blue-500" class:active={isActive}>Click</button>
    `;
    const result = parseSvelte(svelte, "Button.svelte");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.states).toContain("hover");
  });

  test("returns empty for file without interactive elements", () => {
    const svelte = `
      <div class="container">
        <p>Hello</p>
      </div>
    `;
    const result = parseSvelte(svelte, "Static.svelte");

    expect(result.elements).toHaveLength(0);
    expect(result.selectors).toHaveLength(0);
  });

  test("handles SCSS in style blocks", () => {
    const svelte = `
      <button class="btn">Click</button>
      <style lang="scss">
        .btn {
          &:hover { background: blue; }
        }
      </style>
    `;
    const result = parseSvelte(svelte, "Button.svelte");

    expect(result.selectors.length).toBeGreaterThan(0);
  });

  test("handles role attributes", () => {
    const svelte = `
      <div role="button" class="hover:bg-blue-500">Click me</div>
    `;
    const result = parseSvelte(svelte, "Custom.svelte");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.tag).toBe("role-button");
  });

  test("extracts states from elements in each blocks", () => {
    const svelte = `
      {#each items as item}
        <button class="hover:bg-blue-500">{item}</button>
      {/each}
    `;
    const result = parseSvelte(svelte, "List.svelte");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.states).toContain("hover");
  });
});

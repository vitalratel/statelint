// ABOUTME: Unit tests for Vue SFC parser.
// ABOUTME: Tests extraction of CSS pseudo-classes and Tailwind variants from .vue files.

import { describe, expect, test } from "bun:test";
import { parseVue } from "../../src/parsers/vue.ts";

describe("parseVue", () => {
  test("extracts Tailwind variants from template", () => {
    const vue = `
      <template>
        <button class="hover:bg-blue-500 focus:ring">Click</button>
      </template>
    `;
    const result = parseVue(vue, "Button.vue");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.tag).toBe("button");
    expect(result.elements[0]!.states).toContain("hover");
    expect(result.elements[0]!.states).toContain("focus");
  });

  test("extracts CSS pseudo-classes from style block", () => {
    const vue = `
      <template>
        <button class="btn">Click</button>
      </template>
      <style>
        .btn:hover { background: blue; }
        .btn:focus { outline: 2px solid blue; }
      </style>
    `;
    const result = parseVue(vue, "Button.vue");

    expect(result.selectors).toHaveLength(2);
    expect(result.selectors[0]!.states).toContain("hover");
    expect(result.selectors[1]!.states).toContain("focus");
  });

  test("handles scoped styles", () => {
    const vue = `
      <template>
        <a href="#" class="link">Link</a>
      </template>
      <style scoped>
        .link:hover { text-decoration: underline; }
      </style>
    `;
    const result = parseVue(vue, "Link.vue");

    expect(result.selectors).toHaveLength(1);
    expect(result.selectors[0]!.states).toContain("hover");
  });

  test("extracts multiple interactive elements", () => {
    const vue = `
      <template>
        <div>
          <button class="hover:bg-blue-500">Button</button>
          <input class="focus:ring disabled:opacity-50" />
          <a href="#" class="hover:underline">Link</a>
        </div>
      </template>
    `;
    const result = parseVue(vue, "Form.vue");

    expect(result.elements).toHaveLength(3);
    expect(result.elements.find(e => e.tag === "button")?.states).toContain("hover");
    expect(result.elements.find(e => e.tag === "input")?.states).toContain("focus");
    expect(result.elements.find(e => e.tag === "input")?.states).toContain("disabled");
    expect(result.elements.find(e => e.tag === "a")?.states).toContain("hover");
  });

  test("handles Vue-specific class binding syntax", () => {
    const vue = `
      <template>
        <button :class="'hover:bg-blue-500 focus:ring'">Click</button>
      </template>
    `;
    const result = parseVue(vue, "Button.vue");

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.states).toContain("hover");
    expect(result.elements[0]!.states).toContain("focus");
  });

  test("returns empty for file without interactive elements", () => {
    const vue = `
      <template>
        <div class="container">
          <p>Hello</p>
        </div>
      </template>
    `;
    const result = parseVue(vue, "Static.vue");

    expect(result.elements).toHaveLength(0);
    expect(result.selectors).toHaveLength(0);
  });

  test("handles SCSS/LESS in style blocks", () => {
    const vue = `
      <template>
        <button class="btn">Click</button>
      </template>
      <style lang="scss">
        .btn {
          &:hover { background: blue; }
          &:focus { outline: none; }
        }
      </style>
    `;
    const result = parseVue(vue, "Button.vue");

    expect(result.selectors.length).toBeGreaterThan(0);
  });

  test("handles multiple style blocks", () => {
    const vue = `
      <template>
        <button class="btn">Click</button>
      </template>
      <style>
        .btn:hover { background: blue; }
      </style>
      <style scoped>
        .btn:focus { outline: none; }
      </style>
    `;
    const result = parseVue(vue, "Button.vue");

    const allStates = result.selectors.flatMap(s => s.states);
    expect(allStates).toContain("hover");
    expect(allStates).toContain("focus");
  });
});

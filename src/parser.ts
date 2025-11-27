// ABOUTME: Orchestrates file parsing across all supported formats.
// ABOUTME: Provides a unified interface for parsing CSS, JSX, Vue, and Svelte files.

import type { CssParseResult } from "./parsers/css.ts";
import type { JsxParseResult } from "./parsers/jsx.ts";
import { readFile } from "node:fs/promises";
import { parseCss } from "./parsers/css.ts";
import { parseJsx } from "./parsers/jsx.ts";
import { parseSvelte } from "./parsers/svelte.ts";
import { parseVue } from "./parsers/vue.ts";

export interface ParseError {
  file: string;
  error: string;
}

export interface ParseAllResult {
  cssResults: Map<string, CssParseResult>;
  jsxResults: Map<string, JsxParseResult>;
  parseErrors: ParseError[];
}

export interface FilesByType {
  css: string[];
  jsx: string[];
  vue: string[];
  svelte: string[];
}

async function parseFile<T>(
  file: string,
  parser: (content: string, filePath: string) => T,
): Promise<{ result: T | null; error: ParseError | null }> {
  try {
    const content = await readFile(file, "utf-8");
    return { result: parser(content, file), error: null };
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { result: null, error: { file, error: msg } };
  }
}

export async function parseAll(files: FilesByType): Promise<ParseAllResult> {
  const cssResults = new Map<string, CssParseResult>();
  const jsxResults = new Map<string, JsxParseResult>();
  const parseErrors: ParseError[] = [];

  // Parse CSS files
  for (const file of files.css) {
    const { result, error } = await parseFile(file, parseCss);
    if (result)
      cssResults.set(file, result);
    if (error)
      parseErrors.push(error);
  }

  // Parse JSX files
  for (const file of files.jsx) {
    const { result, error } = await parseFile(file, parseJsx);
    if (result)
      jsxResults.set(file, result);
    if (error)
      parseErrors.push(error);
  }

  // Parse Vue files (produces both CSS and JSX results)
  for (const file of files.vue) {
    const { result, error } = await parseFile(file, parseVue);
    if (error) {
      parseErrors.push(error);
    }
    else if (result) {
      if (result.selectors.length > 0) {
        cssResults.set(file, { selectors: result.selectors });
      }
      if (result.elements.length > 0) {
        jsxResults.set(file, { elements: result.elements });
      }
    }
  }

  // Parse Svelte files (produces both CSS and JSX results)
  for (const file of files.svelte) {
    const { result, error } = await parseFile(file, parseSvelte);
    if (error) {
      parseErrors.push(error);
    }
    else if (result) {
      if (result.selectors.length > 0) {
        cssResults.set(file, { selectors: result.selectors });
      }
      if (result.elements.length > 0) {
        jsxResults.set(file, { elements: result.elements });
      }
    }
  }

  return { cssResults, jsxResults, parseErrors };
}

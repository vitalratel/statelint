// ABOUTME: File scanner that discovers CSS, JSX, Vue, and Svelte files using glob patterns.
// ABOUTME: Uses fast-glob to efficiently find files while respecting ignore patterns.

import process from "node:process";
import fg from "fast-glob";

export interface ScanOptions {
  include: string[];
  exclude: string[];
  cwd?: string;
}

export interface ScanResult {
  css: string[];
  jsx: string[];
  vue: string[];
  svelte: string[];
}

const CSS_EXTENSIONS = [".css"];
const JSX_EXTENSIONS = [".jsx", ".tsx"];
const VUE_EXTENSIONS = [".vue"];
const SVELTE_EXTENSIONS = [".svelte"];

export async function scanFiles(options: ScanOptions): Promise<ScanResult> {
  const { include, exclude, cwd = process.cwd() } = options;

  const files = await fg(include, {
    cwd,
    ignore: exclude,
    absolute: true,
    onlyFiles: true,
  });

  const css: string[] = [];
  const jsx: string[] = [];
  const vue: string[] = [];
  const svelte: string[] = [];

  for (const file of files) {
    const ext = file.slice(file.lastIndexOf("."));
    if (CSS_EXTENSIONS.includes(ext)) {
      css.push(file);
    }
    else if (JSX_EXTENSIONS.includes(ext)) {
      jsx.push(file);
    }
    else if (VUE_EXTENSIONS.includes(ext)) {
      vue.push(file);
    }
    else if (SVELTE_EXTENSIONS.includes(ext)) {
      svelte.push(file);
    }
  }

  return { css, jsx, vue, svelte };
}

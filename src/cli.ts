#!/usr/bin/env bun
// ABOUTME: CLI entry point for statelint.
// ABOUTME: Parses arguments, orchestrates scanning/analysis, and outputs results.

import process from "node:process";
import { program } from "commander";
import { analyze } from "./analyzer.ts";
import { loadConfig } from "./config.ts";
import { parseAll } from "./parser.ts";
import { format } from "./reporters/index.ts";
import { scanFiles } from "./scanner.ts";

interface CliOptions {
  config?: string;
  minCoverage?: number;
  output?: "terminal" | "json" | "markdown" | "sarif";
  strict?: boolean;
  verbose?: boolean;
}

const pkg = { version: "0.1.0", name: "statelint" };

program
  .name(pkg.name)
  .version(pkg.version)
  .description("Audit interactive state coverage in CSS and Tailwind codebases")
  .argument("[glob]", "Files to analyze", "src/**/*.{css,tsx,jsx,vue,svelte}")
  .option("-c, --config <path>", "Path to config file")
  .option("--min-coverage <n>", "Minimum coverage percentage (0-100)", Number.parseFloat)
  .option("-o, --output <format>", "Output format: terminal, json, markdown, sarif")
  .option("--strict", "Fail on parse errors")
  .option("-v, --verbose", "Show details for unresolved elements")
  .action(async (glob: string, options: CliOptions) => {
    try {
      await run(glob, options);
    }
    catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });

async function run(glob: string, options: CliOptions): Promise<void> {
  const config = await loadConfig({
    configPath: options.config,
    cliOptions: {
      minCoverage: options.minCoverage,
      output: options.output,
      strict: options.strict,
    },
  });

  const includePatterns = glob ? [glob] : config.include;
  const files = await scanFiles({
    include: includePatterns,
    exclude: config.exclude,
  });

  const { cssResults, jsxResults, parseErrors } = await parseAll(files);

  if (config.strict && parseErrors.length > 0) {
    console.error("Parse errors in strict mode:");
    for (const { file, error } of parseErrors) {
      console.error(`  ${file}: ${error}`);
    }
    process.exit(2);
  }

  const result = analyze({
    cssResults,
    jsxResults,
    threshold: config.minCoverage,
    customRequiredStates: config.requiredStates,
    ignoreSelectors: config.ignoreSelectors,
    ignoreElements: config.ignoreElements,
  });

  result.parseErrors = parseErrors;

  const output = format(result, config.output, { verbose: options.verbose });
  console.log(output);

  process.exit(result.passed ? 0 : 1);
}

program.parse();

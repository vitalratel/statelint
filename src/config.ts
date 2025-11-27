// ABOUTME: Config loader using cosmiconfig.
// ABOUTME: Searches for statelint.config.json, .statelintrc, and package.json#statelint.

import type { StatelintConfig } from "./types.ts";
import process from "node:process";
import { cosmiconfig } from "cosmiconfig";
import { DEFAULT_CONFIG } from "./types.ts";

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
  cliOptions?: Partial<StatelintConfig>;
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<StatelintConfig> {
  const { cwd = process.cwd(), configPath, cliOptions = {} } = options;

  const explorer = cosmiconfig("statelint", {
    searchPlaces: [
      "statelint.config.json",
      "statelint.config.js",
      ".statelintrc",
      ".statelintrc.json",
      ".statelintrc.js",
      "package.json",
    ],
  });

  let fileConfig: Partial<StatelintConfig> = {};

  try {
    const result = configPath
      ? await explorer.load(configPath)
      : await explorer.search(cwd);

    if (result && !result.isEmpty) {
      fileConfig = result.config as Partial<StatelintConfig>;
    }
  }
  catch {
    // Config file not found or invalid, use defaults
  }

  // Merge: defaults < file config < CLI options
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...filterUndefined(cliOptions),
    // Deep merge requiredStates
    requiredStates: {
      ...DEFAULT_CONFIG.requiredStates,
      ...fileConfig.requiredStates,
      ...cliOptions.requiredStates,
    },
  };
}

function filterUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

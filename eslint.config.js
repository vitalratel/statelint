// ABOUTME: ESLint v9 flat config using @antfu/eslint-config.
// ABOUTME: Enforces TypeScript strictness and code quality for statelint CLI.

import antfu from "@antfu/eslint-config";

export default antfu(
  {
    typescript: true,

    stylistic: {
      indent: 2,
      quotes: "double",
      semi: true,
    },

    ignores: [
      "dist",
      "node_modules",
      "coverage",
      "tests/fixtures",
      "*.json",
      "*.md",
      "docs",
    ],
  },

  // TypeScript-specific rules (requires parser)
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "ts/no-explicit-any": "error",
      "ts/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "ts/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // General rules for all files
  {
    rules: {
      "no-console": "off", // CLI tool needs console output
      "prefer-const": "error",
      "no-var": "error",
      "style/max-len": ["warn", {
        code: 100,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
    },
  },
);

# statelint

[![CI](https://github.com/vitalratel/statelint/actions/workflows/ci.yml/badge.svg)](https://github.com/vitalratel/statelint/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/vitalratel/statelint/branch/main/graph/badge.svg)](https://codecov.io/gh/vitalratel/statelint)
[![npm version](https://img.shields.io/npm/v/statelint.svg)](https://www.npmjs.com/package/statelint)

Static analysis CLI that audits interactive state coverage in frontend codebases. Detects missing `:hover`, `:focus`, `:disabled`, and other states on buttons, links, and form controls.

## Why?

Designers define multiple interactive states for UI components. Developers often miss some during implementation:

- **Accessibility issues** — Missing `:focus` makes sites unusable for keyboard users
- **Incomplete UX** — No `:disabled` styling confuses users
- **Late QA catches** — Issues found late require rework

statelint catches these gaps automatically.

## Requirements

- Node.js 20 or later

## Installation

```bash
# Using bun
bun add -d statelint

# Using npm
npm install --save-dev statelint
```

## Usage

```bash
# Analyze src directory
npx statelint ./src

# With coverage threshold (fails if below)
npx statelint ./src --min-coverage 80

# Specific file patterns
npx statelint "src/components/**/*.tsx"

# Output as JSON
npx statelint ./src --output json
```

## Example Output

```
statelint - State Coverage Report
──────────────────────────────────────────────────

Files: 12  Elements: 24
Unresolved: 2 elements with dynamic classNames (excluded from coverage)

Missing states:
  src/components/Button.tsx
    line 15: <button> missing: focus, disabled
  src/components/Link.tsx
    line 8: <a> missing: focus

──────────────────────────────────────────────────
Coverage: 85% (41/48)

PASS: Coverage meets threshold (80%)
```

## Supported Files

| Format | States Detected |
|--------|-----------------|
| CSS | `:hover`, `:focus`, `:disabled`, etc. |
| JSX/TSX | Tailwind variants: `hover:`, `focus:`, etc. |
| Vue SFC | Both `<style>` and `<template>` |
| Svelte | Both `<style>` and markup |

## Configuration

Create `statelint.config.json` in your project root:

```json
{
  "include": ["src/**/*.{css,tsx,jsx,vue,svelte}"],
  "exclude": ["**/*.test.*", "**/node_modules/**"],
  "minCoverage": 80,
  "output": "terminal",
  "requiredStates": {
    "button": ["hover", "focus", "disabled"],
    "a": ["hover", "focus"],
    "input": ["focus", "disabled"]
  }
}
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` | `string[]` | `["**/*.{css,tsx,jsx,vue,svelte}"]` | File patterns to analyze |
| `exclude` | `string[]` | `["**/node_modules/**", "**/*.test.*"]` | Patterns to ignore |
| `minCoverage` | `number` | `0` | Minimum coverage percentage (0-100) |
| `output` | `string` | `"terminal"` | Output format: `terminal`, `json`, `markdown`, `sarif` |
| `requiredStates` | `object` | See defaults | Override required states per element type |
| `strict` | `boolean` | `false` | Fail on parse errors |

## CLI Options

```
Usage: statelint [options] [glob]

Arguments:
  glob                   Files to analyze (default: "src/**/*.{css,tsx,jsx,vue,svelte}")

Options:
  -V, --version          Output version number
  -c, --config <path>    Path to config file
  --min-coverage <n>     Minimum coverage percentage (0-100)
  -o, --output <format>  Output format: terminal, json, markdown, sarif
  --strict               Fail on parse errors
  -v, --verbose          Show details for unresolved elements
  -h, --help             Display help
```

## CI Integration

```yaml
# GitHub Actions
- name: Lint interactive states
  run: npx statelint ./src --min-coverage 80
```

```yaml
# With SARIF upload for code scanning
- name: Run statelint
  run: npx statelint ./src --output sarif > statelint.sarif

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: statelint.sarif
```

## Default Required States

| Element | Required States |
|---------|-----------------|
| `button` | hover, focus, disabled* |
| `a` | hover, focus |
| `input` | focus, disabled* |
| `select` | focus, disabled* |
| `textarea` | focus, disabled* |
| `role="button"` | hover, focus, disabled* |
| `role="link"` | hover, focus |

*\* Only required when the element has the corresponding attribute*

## License

MIT

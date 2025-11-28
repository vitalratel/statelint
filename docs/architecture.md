# statelint: Architecture Document

## Overview

statelint is a static analysis CLI tool that audits frontend codebases for missing interactive states on UI components. It parses CSS and component files to detect whether interactive elements (buttons, links, inputs) have all required pseudo-class states (hover, focus, disabled, etc.) implemented.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLI Layer                               │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐  │
│  │ commander│  │ cosmiconfig│  │  Args   │  │  Output Formatter │  │
│  └─────────┘  └──────────┘  └─────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Core Engine                               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  File Scanner  │  │   Analyzer    │  │  Report Generator │   │
│  │  (fast-glob)   │  │               │  │                   │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Parser Layer                              │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ postcss │  │ @babel/parser│  │ @vue/compiler │  │  svelte  │  │
│  │  (CSS)  │  │  (JSX/TSX)   │  │    -sfc      │  │ compiler │  │
│  └─────────┘  └─────────────┘  └──────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
statelint/
├── src/
│   ├── cli.ts                 # Entry point, argument parsing, orchestration
│   ├── config.ts              # Configuration loading (cosmiconfig)
│   ├── scanner.ts             # File discovery (fast-glob)
│   ├── analyzer.ts            # State coverage analysis and reporting
│   ├── types.ts               # Shared TypeScript types and defaults
│   ├── parser.ts              # File-type dispatch to specific parsers
│   ├── parsers/
│   │   ├── shared.ts          # Common constants (INTERACTIVE_TAGS, variants)
│   │   ├── css.ts             # CSS pseudo-class extraction
│   │   ├── jsx.ts             # JSX/TSX Tailwind variant detection
│   │   ├── vue.ts             # Vue SFC parsing
│   │   └── svelte.ts          # Svelte file parsing
│   ├── resolver/              # Same-file variable resolution for JSX
│   │   ├── index.ts           # Public API and orchestration
│   │   ├── types.ts           # Resolver-specific types
│   │   ├── symbol-table.ts    # Symbol table for tracking declarations
│   │   ├── import-resolver.ts # Handles import statement resolution
│   │   └── expression-resolver.ts # Resolves expressions to string values
│   └── reporters/
│       └── index.ts           # All output formatters (terminal, JSON, markdown, SARIF)
├── tests/
│   ├── fixtures/              # Sample files for testing
│   │   └── resolver/          # Resolver-specific test fixtures
│   ├── parsers/               # Parser unit tests
│   ├── resolver/              # Resolver unit tests
│   ├── integration/           # End-to-end CLI tests
│   ├── analyzer.test.ts
│   ├── config.test.ts
│   ├── reporters.test.ts
│   └── scanner.test.ts
├── package.json
└── tsconfig.json
```

## Core Data Types

```typescript
// Element types that require interactive states
type InteractiveElement =
  | 'button'
  | 'a'
  | 'input'
  | 'select'
  | 'textarea'
  | 'role-button'
  | 'role-link'
  | 'unknown';

// States we check for
type StateName =
  | 'hover'
  | 'focus'
  | 'active'
  | 'disabled'
  | 'focus-visible'
  | 'focus-within'
  | 'invalid'
  | 'checked'
  | 'placeholder';

// Analysis result for a single selector/component
interface StateAnalysis {
  selector: string;           // CSS selector or component identifier
  file: string;               // Source file path
  line: number;               // Line number
  elementType: InteractiveElement;
  states: {
    [key in StateName]?: {
      present: boolean;
      location?: { file: string; line: number };
    };
  };
  requiredStates: StateName[];
  missingStates: StateName[];
  hasUnresolvedExpressions: boolean;  // Dynamic className we can't analyze
  unresolvedExpressions: string[];    // e.g., ["tokens.effects.focusRing"]
}

// Overall audit result
interface AuditResult {
  files: number;
  elements: number;
  analyses: StateAnalysis[];
  coverage: {
    total: number;            // Total required states
    present: number;          // States found
    percentage: number;       // 0-100
  };
  unresolvedCount: number;    // Elements excluded from coverage
  passed: boolean;            // Based on threshold
  threshold: number;          // Configured minimum coverage
  parseErrors: Array<{ file: string; error: string }>;
}
```

## Component Interactions

### 1. CLI Entry (`cli.ts`)

```
User runs: npx statelint ./src --min-coverage 80

cli.ts:
  1. Parse arguments (commander)
  2. Load config (cosmiconfig)
  3. Merge CLI args with config
  4. Call analyzer.run(options)
  5. Format output (reporter)
  6. Exit with appropriate code
```

### 2. File Scanner (`scanner.ts`)

```
Input: glob patterns, ignore patterns
Output: List of file paths grouped by type

Process:
  1. Expand globs using fast-glob
  2. Respect .gitignore
  3. Categorize by extension (.css, .tsx, .vue, .svelte)
  4. Return { css: [...], jsx: [...], vue: [...], svelte: [...] }
```

### 3. Parser Layer (`parsers/*.ts`)

Each parser is a standalone module with a parse function:

```typescript
// CSS parser returns selectors with pseudo-classes
function parseCss(content: string, filePath: string): CssParseResult;

// JSX parser returns elements with Tailwind variants
function parseJsx(content: string, filePath: string): JsxParseResult;

// Vue/Svelte parsers return both (from <template> and <style>)
function parseVue(content: string, filePath: string): VueParseResult;
function parseSvelte(content: string, filePath: string): SvelteParseResult;
```

#### CSS Parser (`parsers/css.ts`)

```
Input: CSS file content
Output: Selectors with detected pseudo-classes

Example:
  .btn:hover { ... }
  .btn:focus { ... }

  → { selector: '.btn', states: ['hover', 'focus'] }
```

#### JSX Parser (`parsers/jsx.ts`)

```
Input: JSX/TSX file content
Output: Elements with Tailwind variants

Example:
  <button className="hover:bg-blue-500 focus:ring-2">

  → { element: 'button', line: 5, states: ['hover', 'focus'] }
```

#### Vue Parser (`parsers/vue.ts`)

```
Input: Vue SFC content
Output: Combined results from <template> and <style>

Process:
  1. Extract <template> → parse for elements
  2. Extract <style> → parse for CSS rules
  3. Match scoped styles to template elements
```

#### Svelte Parser (`parsers/svelte.ts`)

```
Input: Svelte file content
Output: Combined results from markup and <style>

Process:
  1. Parse component markup for elements
  2. Extract <style> → parse for CSS rules
  3. Match styles to elements
```

### 4. Analyzer (`analyzer.ts`)

```
Input: Parsed results from all files
Output: AuditResult

Process:
  1. Collect all interactive elements
  2. For each element, determine required states
  3. Check which states are present
  4. Calculate coverage
  5. Compare against threshold
```

### 5. Reporters (`reporters/index.ts`)

All output formatters are in a single module:

```typescript
function formatTerminal(result: AuditResult): string;
function formatJson(result: AuditResult): string;
function formatMarkdown(result: AuditResult): string;
function formatSarif(result: AuditResult): string;

// Main entry point dispatches to the appropriate formatter
function format(result: AuditResult, outputFormat: string): string;
```

## State Detection Logic

### CSS Pseudo-Class Detection

```typescript
// Pseudo-classes we recognize
const PSEUDO_CLASSES = {
  hover: [':hover'],
  focus: [':focus', ':focus-visible', ':focus-within'],
  active: [':active'],
  disabled: [':disabled', '[disabled]'],
  invalid: [':invalid', ':user-invalid'],
  checked: [':checked'],
  placeholder: ['::placeholder', ':placeholder-shown'],
};
```

### Tailwind Variant Detection

```typescript
// Tailwind variants we recognize
const TAILWIND_VARIANTS = {
  hover: ['hover:'],
  focus: ['focus:', 'focus-visible:', 'focus-within:'],
  active: ['active:'],
  disabled: ['disabled:'],
  invalid: ['invalid:'],
  checked: ['checked:'],
  placeholder: ['placeholder:'],
};

// Also handle arbitrary variants
// [&:hover]:bg-blue-500 → hover state
```

### Required States by Element

```typescript
// Context-aware: disabled/invalid/placeholder only required when element has those attributes
// Active is visual polish (not a11y critical), hover on native inputs has browser defaults
const DEFAULT_REQUIRED_STATES: Record<InteractiveElement, StateName[]> = {
  'button': ['hover', 'focus', 'disabled'],
  'a': ['hover', 'focus'],
  'input': ['focus', 'disabled'],
  'select': ['focus', 'disabled'],
  'textarea': ['focus', 'disabled'],
  'role-button': ['hover', 'focus', 'disabled'],
  'role-link': ['hover', 'focus'],
  'unknown': ['hover', 'focus'],
};
```

## Configuration

### Config File Format (`statelint.config.json`)

```json
{
  "include": ["src/**/*.{css,tsx,vue,svelte}"],
  "exclude": ["**/*.test.*", "**/node_modules/**"],
  "minCoverage": 80,
  "requiredStates": {
    "button": ["hover", "focus", "disabled"],
    "a": ["hover", "focus"],
    "input": ["focus", "disabled", "invalid"]
  },
  "output": "terminal",
  "strict": false
}
```

### Config Resolution (cosmiconfig)

Searches for config in:
1. `statelint` property in `package.json`
2. `.statelintrc` (JSON or YAML)
3. `.statelintrc.json`
4. `.statelintrc.js`
5. `statelint.config.js`
6. `statelint.config.json`

## Output Formats

### Terminal (Default)

```
Analyzing src/**/*.{css,tsx,vue,svelte}...

Found 23 interactive elements across 8 files

src/components/Button.tsx
  line 12: <button>
    ✓ hover (hover:bg-blue-600)
    ✗ focus — missing focus: variant
    ✗ disabled — missing disabled: variant

Coverage: 67% (16/24 required states)
FAIL: Below threshold (80%)
```

### JSON

```json
{
  "files": 8,
  "elements": 23,
  "coverage": {
    "total": 24,
    "present": 16,
    "percentage": 67
  },
  "passed": false,
  "issues": [
    {
      "file": "src/components/Button.tsx",
      "line": 12,
      "element": "button",
      "missing": ["focus", "disabled"]
    }
  ]
}
```

### SARIF (GitHub Code Scanning)

Follows SARIF 2.1.0 schema for GitHub integration.

## Error Handling

### Parse Errors

- Log warning, continue with other files
- Include parse errors in final report
- Don't fail build for parse errors (unless `--strict`)

### File Access Errors

- Log warning, skip inaccessible files
- Report skipped files count

### Configuration Errors

- Fail fast with clear error message
- Validate config schema on load

## Performance Considerations

### Current Implementation

- Sequential file processing (sufficient for typical projects)
- Target: < 2 seconds for 1000 files
- Files loaded entirely into memory (reasonable for source files)

### Future Optimizations (if needed)

- Parallel file parsing with worker threads
- AST caching for watch mode
- Incremental analysis for changed files only

## Testing Strategy

### Unit Tests

- Each parser tested with inline fixtures (`tests/parsers/`)
- Resolver modules tested independently (`tests/resolver/`)
- Analyzer logic tested with mock parse results (`tests/analyzer.test.ts`)
- Reporter output tested for all formats (`tests/reporters.test.ts`)
- Config loading tested with temp files (`tests/config.test.ts`)

### Integration Tests

- Full CLI execution (`tests/integration/cli.test.ts`)
- Tests all output formats and exit codes
- Tests config file loading

### Test Coverage

- All core modules have dedicated test files
- Run `bun test` to execute the full suite

## Future Considerations (P2/P3)

### Browser Mode

Optional Playwright-based analysis for:
- CSS-in-JS codebases
- Production site audits
- Sites behind authentication

### Watch Mode

- File watcher integration
- Incremental analysis
- Terminal UI with live updates

### VS Code Extension

- Inline warnings in editor
- Quick fixes for common issues
- Hover information for states

## References

- ADR-001: CLI vs Browser Extension
- ADR-002: Static vs Browser-Based Analysis
- ADR-003: Programming Language Choice
- ADR-004: Parser/Framework Choices
- PRD: Product Requirements Document

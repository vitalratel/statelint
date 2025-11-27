# ADR-004: Parser and Framework Choices

## Status

Accepted

## Date

2024-11-26

## Context

Having chosen TypeScript (ADR-003), we need to select specific parsers for each file format and establish the CLI framework.

### CSS Parser Options

#### postcss

- **Pros:** Largest ecosystem, plugin architecture, battle-tested
- **Cons:** Designed for transformation, not just analysis

#### css-tree

- **Pros:** Fast, designed for analysis, detailed AST
- **Cons:** Smaller ecosystem

#### lightningcss (via WASM)

- **Pros:** Very fast (Rust-based)
- **Cons:** WASM adds complexity, overkill for analysis-only use

**Decision: postcss**

The plugin ecosystem and widespread adoption make postcss the safer choice. Performance difference is negligible for analysis-only operations.

### JSX/TSX Parser Options

#### @babel/parser

- **Pros:** Industry standard, handles all JSX variants, TypeScript support
- **Cons:** Larger dependency

#### typescript (compiler API)

- **Pros:** Native TypeScript support
- **Cons:** Heavier, designed for compilation not analysis

#### swc (via WASM)

- **Pros:** Fast
- **Cons:** WASM complexity, less mature JS bindings

**Decision: @babel/parser**

Standard choice for JSX analysis. Handles TypeScript, Flow, and all JSX variants.

### Vue Parser

#### @vue/compiler-sfc

- **Pros:** Official Vue parser, always up-to-date
- **Cons:** None significant

**Decision: @vue/compiler-sfc**

Only production-ready option. Official support ensures compatibility.

### Svelte Parser

#### svelte/compiler

- **Pros:** Official Svelte parser
- **Cons:** None significant

**Decision: svelte/compiler**

Only production-ready option. Official support ensures compatibility.

### CLI Framework Options

#### commander

- **Pros:** Most popular, simple API, well-documented
- **Cons:** None significant for our use case

#### yargs

- **Pros:** Feature-rich, good for complex CLIs
- **Cons:** Heavier than needed

#### cac

- **Pros:** Lightweight, used by Vite
- **Cons:** Smaller community

#### No framework (process.argv)

- **Pros:** Zero dependencies
- **Cons:** Reinventing the wheel

**Decision: commander**

Most popular choice with simple API. Provides argument parsing, help generation, and subcommands with minimal overhead.

### Output Formatting

#### chalk

- **Pros:** De facto standard for terminal colors
- **Cons:** Had ESM migration issues (resolved in v5)

#### picocolors

- **Pros:** Tiny, fast, no dependencies
- **Cons:** Fewer features

**Decision: picocolors**

Smaller footprint aligns with NF2 (installation size < 10MB). Provides all needed functionality (colors, bold, underline).

### File Globbing

#### fast-glob

- **Pros:** Fast, well-maintained, gitignore support
- **Cons:** None significant

#### glob

- **Pros:** Original, widely used
- **Cons:** Slower than fast-glob

**Decision: fast-glob**

Performance matters for large codebases. Supports gitignore patterns out of the box.

## Decision

### Final Parser/Framework Stack

| Purpose | Package | Version Strategy |
|---------|---------|------------------|
| CSS parsing | `postcss` | Latest stable |
| JSX/TSX parsing | `@babel/parser` | Latest stable |
| Vue SFC parsing | `@vue/compiler-sfc` | Latest stable |
| Svelte parsing | `svelte` | Latest stable (compiler included) |
| CLI framework | `commander` | Latest stable |
| Terminal colors | `picocolors` | Latest stable |
| File globbing | `fast-glob` | Latest stable |
| Config loading | `cosmiconfig` | Latest stable |

### Estimated Bundle Size

| Package | Size (approx) |
|---------|---------------|
| postcss | 30KB |
| @babel/parser | 500KB |
| @vue/compiler-sfc | 800KB |
| svelte | 600KB |
| commander | 50KB |
| picocolors | 3KB |
| fast-glob | 100KB |
| cosmiconfig | 50KB |
| **Total** | ~2.1MB |

Well within NF2 target (< 10MB).

## Consequences

### Positive

- Official parsers for Vue and Svelte ensure framework compatibility
- Well-maintained, popular packages reduce maintenance risk
- Small bundle size enables fast installation
- Consistent API patterns across parsers

### Negative

- Multiple parsers mean multiple AST formats to handle
- Dependency on external packages for core functionality

### Mitigation

- Abstract parser interfaces behind common types
- Pin major versions to avoid breaking changes
- Document parser version requirements

## References

- ADR-003: Programming Language Choice
- postcss documentation
- Babel parser documentation
- Vue SFC compiler documentation
- Svelte compiler API

# ADR-003: Programming Language Choice

## Status

Accepted

## Date

2024-11-26

## Context

With the decision to build a static analysis CLI tool (ADR-001, ADR-002), we needed to choose a programming language. The tool must parse:

- CSS files (including pseudo-class selectors)
- JSX/TSX files (for Tailwind class detection)
- Vue Single File Components (`.vue`)
- Svelte files (`.svelte`)

### Options Considered

#### Option A: TypeScript/Node.js

The JavaScript ecosystem with TypeScript for type safety.

**Pros:**
- Rich parser ecosystem for frontend formats
- Target audience (frontend devs) already has Node installed
- Same language as the code being analyzed
- `npx` distribution is frictionless

**Cons:**
- Slower than compiled languages
- Larger runtime dependency

#### Option B: Go

Compiled language with good CLI tooling.

**Pros:**
- Single binary distribution
- Fast execution
- Good standard library for CLI tools

**Cons:**
- Limited frontend parser ecosystem
- No mature Vue/Svelte parsers
- CSS parsing options exist but less mature

#### Option C: Rust

Systems language with growing frontend tooling presence.

**Pros:**
- Excellent performance
- `swc` for JSX parsing
- `lightningcss` for CSS parsing
- Growing adoption in frontend tooling (Vite, Turbopack)

**Cons:**
- No Vue parser (vue-rs is abandoned)
- No Svelte parser
- Steeper learning curve
- Longer development time

#### Option D: Python

Scripting language with good parsing libraries.

**Pros:**
- Readable, quick to develop
- Some CSS parsing (`cssutils`, `tinycss2`)

**Cons:**
- No JSX/Vue/Svelte parsers
- Slow compared to compiled languages
- Extra runtime dependency for users

### Parser Ecosystem Analysis

| Format | TypeScript | Go | Rust | Python |
|--------|------------|-----|------|--------|
| CSS | ✅ postcss, css-tree | ⚠️ tdewolff/parse | ✅ lightningcss | ⚠️ tinycss2 |
| JSX/TSX | ✅ @babel/parser, ts-morph | ❌ None | ✅ swc | ❌ None |
| Vue SFC | ✅ @vue/compiler-sfc | ❌ None | ❌ None | ❌ None |
| Svelte | ✅ svelte/compiler | ❌ None | ❌ None | ❌ None |

### Key Insight

**The parser ecosystem is the deciding factor.**

Vue and Svelte parsers only exist in JavaScript. Building parsers from scratch would:
- Take 3-6 months of development time
- Require ongoing maintenance as frameworks evolve
- Risk falling out of sync with framework updates

Using the official parsers (maintained by Vue and Svelte teams) ensures compatibility and reduces maintenance burden.

### Distribution Consideration

The argument for Go/Rust is "single binary distribution." However:

1. Frontend developers already have Node.js installed
2. `npx statelint` provides zero-install experience
3. npm is the natural distribution channel for frontend tools
4. Node.js performance is acceptable for static analysis (~1s for 1000 files)

## Decision

**Use TypeScript with Node.js.**

The parser ecosystem advantage is decisive. Vue and Svelte are P1 requirements (supporting major frameworks), and only TypeScript has production-ready parsers.

### Recommended Parser Stack

| Format | Parser | Notes |
|--------|--------|-------|
| CSS | `postcss` or `css-tree` | Both mature, postcss has larger ecosystem |
| JSX/TSX | `@babel/parser` | Industry standard, handles all JSX variants |
| Vue SFC | `@vue/compiler-sfc` | Official Vue parser |
| Svelte | `svelte/compiler` | Official Svelte parser |

## Consequences

### Positive

- Access to official, maintained parsers for all target formats
- Familiar tooling for frontend developers
- `npx` distribution requires no installation
- TypeScript provides type safety during development
- Same language ecosystem as users' codebases

### Negative

- Slower than Go/Rust (acceptable for use case)
- Requires Node.js runtime (acceptable for target audience)
- Larger distribution size than single binary (~10MB vs ~5MB)

### Mitigation

- Use `esbuild` for fast TypeScript compilation
- Bundle dependencies to minimize install size
- Consider optional Rust rewrite for performance-critical paths if needed (P3)

## References

- ADR-001: CLI vs Browser Extension
- ADR-002: Static vs Browser-Based Analysis
- Vue SFC Compiler documentation
- Svelte Compiler API documentation

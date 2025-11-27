# ADR-002: Static Analysis vs Browser-Based Analysis

## Status

Accepted

## Date

2024-11-26

## Context

After deciding on a CLI tool (ADR-001), we needed to determine how the tool would analyze CSS and component files. Two primary approaches exist:

### Options Considered

#### Option A: Browser-Based Analysis (Playwright)

A CLI that launches a headless browser:
- User runs `statelint http://localhost:3000`
- Tool uses Playwright to load the page
- Injects script to query DOM and computed styles
- Analyzes `getComputedStyle()` diffs for pseudo-states
- Reports missing states

#### Option B: Static File Analysis

A CLI that parses source files directly:
- User runs `statelint ./src`
- Tool parses CSS files for pseudo-class rules
- Tool parses JSX/Vue/Svelte for Tailwind variants
- Reports missing states based on selector/class analysis

#### Option C: Hybrid (Static-first, Browser fallback)

Static analysis as default, with optional `--browser` flag for:
- CSS-in-JS libraries (styled-components, Emotion)
- Deployed production sites
- Sites with complex build pipelines

### Analysis

| Factor | Browser-Based | Static Analysis |
|--------|---------------|-----------------|
| **CSS-in-JS Support** | ✅ Full | ❌ Cannot analyze |
| **Speed** | ⚠️ 2-5s per page | ✅ <1s for 1000 files |
| **Dependencies** | ⚠️ Playwright (~50MB) | ✅ Parsers only (~5MB) |
| **Build Required** | Yes (must serve app) | No |
| **Auth Handling** | ⚠️ Complex (cookies, tokens) | ✅ N/A |
| **Dynamic Content** | ✅ Full | ❌ Source only |
| **Multi-page Audit** | ⚠️ Sequential, slow | ✅ Parallel, fast |
| **CI Simplicity** | ⚠️ Needs browser install | ✅ Just Node |

### Key Insight

The question arose: "Why do we need to use browser for a CLI tool? Why not just apply it to the project folder?"

This reframed the problem. Browser-based analysis was assumed because the original concept was a browser extension. But for a CLI tool targeting source code:

1. **Most modern CSS is written in source files** — plain CSS, CSS Modules, Tailwind
2. **CSS-in-JS is declining** — Tailwind adoption is growing; styled-components usage peaked
3. **Static analysis is faster** — No build step, no browser launch
4. **CI environments prefer minimal dependencies** — Playwright adds complexity

### CSS-in-JS Consideration

The main argument for browser-based analysis is CSS-in-JS (styles defined in JavaScript). However:

1. CSS-in-JS market share is declining (2024 State of CSS survey)
2. Tools like Tailwind/UnoCSS dominate utility-first space
3. CSS-in-JS codebases can use the browser mode as P2 feature
4. Static analysis covers the majority use case

## Decision

**Static analysis as the primary (and MVP) approach.**

Browser-based analysis via Playwright can be added as a P2 feature for CSS-in-JS codebases.

## Consequences

### Positive

- Faster execution (sub-second for typical projects)
- Smaller installation footprint (~5MB vs ~50MB)
- Simpler CI integration (no browser binary needed)
- No build step required — analyze source directly
- Parallel file processing for large codebases

### Negative

- Cannot analyze CSS-in-JS (styled-components, Emotion, etc.)
- Cannot audit deployed production sites
- Dynamic styles (JavaScript-generated) not visible

### Mitigation

- Document CSS-in-JS limitation clearly
- Add browser mode as P2 feature for teams that need it
- Provide migration path for CSS-in-JS users (extract to CSS files, or use browser mode)

## References

- ADR-001: CLI vs Browser Extension
- State of CSS 2024 survey data

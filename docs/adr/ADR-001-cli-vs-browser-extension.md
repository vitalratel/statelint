# ADR-001: CLI Tool vs Browser Extension

## Status

Accepted

## Date

2024-11-26

## Context

We identified a gap in the design-dev tooling space: no tool audits whether interactive UI components have all necessary CSS states (hover, focus, disabled, etc.) implemented.

The initial concept was a browser extension, following the pattern of existing tools like VisBug, Over.fig, and Pixelay. However, we needed to decide on the right delivery mechanism.

### Options Considered

#### Option A: Browser Extension

A Chrome/Firefox extension that:
- User clicks extension icon on any page
- Extension scans DOM for interactive elements
- Analyzes CSS rules for each element
- Displays results in popup with export options

#### Option B: CLI Tool

A command-line tool that:
- User runs `statelint ./src` in terminal
- Tool parses source files statically
- Reports missing states
- Exits with error code if below threshold

#### Option C: Both (Extension + CLI)

Shared core analysis logic with two delivery mechanisms.

### Analysis

| Factor | Browser Extension | CLI Tool |
|--------|-------------------|----------|
| **CI Integration** | ❌ Cannot run headless | ✅ Native fit |
| **Team Enforcement** | ⚠️ Everyone must install | ✅ One config in repo |
| **Multi-page Audit** | ⚠️ Manual, one at a time | ✅ Script against file glob |
| **Visual Highlighting** | ✅ Can overlay on page | ❌ Cannot |
| **Works Behind Auth** | ✅ Uses browser session | ⚠️ Needs cookie config |
| **Automation** | ❌ Manual trigger | ✅ Scriptable |
| **Development Effort** | Higher (manifest, popup UI, messaging) | Lower |

### Key Insight

The core value proposition evolved during design:

**Initial framing:** "Quickly see what states you're missing while building"
→ Favors extension (immediate visual feedback)

**Revised framing:** "Catch missing states before they hit production"
→ Favors CLI (CI integration, team enforcement)

The revised framing is more valuable because:
1. One developer using an extension doesn't protect the team
2. CI gates ensure consistent enforcement
3. Teams pay for CI tools; individuals rarely pay for extensions

### Workflow Comparison

**Extension workflow:**
1. Open browser
2. Navigate to page
3. Click extension
4. Click "Audit"
5. Review results
6. Click "Export"
7. Save file

**CLI workflow:**
1. Run `npx statelint ./src`
2. Review results

The CLI workflow is significantly simpler for the primary use case.

## Decision

**Build a CLI tool first.**

The browser extension can be added later if there's demand for visual debugging, but the CLI delivers the core value (CI integration, team enforcement) with less development effort.

## Consequences

### Positive

- Faster time to MVP
- Natural CI/CD integration
- Team-wide enforcement without individual installs
- Simpler architecture (no popup UI, manifest, message passing)
- Can audit entire codebase in one command

### Negative

- Cannot visually highlight problems on a live page
- Cannot audit production sites without source access
- Cannot work behind authentication without explicit cookie config

### Mitigation

- Document the "browser mode" (using Playwright) as a P2 feature for cases requiring live page analysis
- The static analysis approach covers the majority of use cases

## References

- Original browser extension research in conversation history
- Comparison of VisBug, Over.fig, Pixelay, UI Verifier

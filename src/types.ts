// ABOUTME: Core type definitions for statelint.
// ABOUTME: Defines interactive elements, states, analysis results, and configuration.

export type InteractiveElement
  = | "button"
    | "a"
    | "input"
    | "select"
    | "textarea"
    | "role-button"
    | "role-link"
    | "unknown";

export type StateName
  = | "hover"
    | "focus"
    | "active"
    | "disabled"
    | "focus-visible"
    | "focus-within"
    | "invalid"
    | "checked"
    | "placeholder";

export interface StateLocation {
  file: string;
  line: number;
  source?: string; // e.g., "hover:bg-blue-500" or ":hover"
}

export interface StateStatus {
  present: boolean;
  location?: StateLocation;
}

export interface StateAnalysis {
  selector: string;
  file: string;
  line: number;
  elementType: InteractiveElement;
  states: Partial<Record<StateName, StateStatus>>;
  requiredStates: StateName[];
  missingStates: StateName[];
  hasUnresolvedExpressions: boolean;
  unresolvedExpressions: string[];
}

export interface AuditResult {
  files: number;
  elements: number;
  analyses: StateAnalysis[];
  coverage: {
    total: number;
    present: number;
    percentage: number;
  };
  unresolvedCount: number;
  passed: boolean;
  threshold: number;
  parseErrors: Array<{ file: string; error: string }>;
}

export interface StatelintConfig {
  include: string[];
  exclude: string[];
  minCoverage: number;
  requiredStates: Partial<Record<InteractiveElement, StateName[]>>;
  output: "terminal" | "json" | "markdown" | "sarif";
  strict: boolean;
  ignoreSelectors: string[];
  ignoreElements: string[];
}

export const DEFAULT_REQUIRED_STATES: Record<InteractiveElement, StateName[]> = {
  // active is visual polish (pressed state), not accessibility-critical
  // hover on native form controls has acceptable browser defaults
  // placeholder styling has acceptable browser defaults
  // invalid styling is optional - apps may use auto-correction or custom error UX
  "button": ["hover", "focus", "disabled"],
  "a": ["hover", "focus"],
  "input": ["focus", "disabled"],
  "select": ["focus", "disabled"],
  "textarea": ["focus", "disabled"],
  "role-button": ["hover", "focus", "disabled"],
  "role-link": ["hover", "focus"],
  "unknown": ["hover", "focus"],
};

export const DEFAULT_CONFIG: StatelintConfig = {
  include: ["**/*.{css,tsx,jsx,vue,svelte}"],
  exclude: ["**/node_modules/**", "**/*.test.*", "**/*.spec.*"],
  minCoverage: 0,
  requiredStates: {},
  output: "terminal",
  strict: false,
  ignoreSelectors: [],
  ignoreElements: [],
};

/** Maps user-friendly WCAG aliases to canonical axe-core tag names. */
export const WCAG_TAG_MAP: Record<string, string> = {
  'a': 'wcag2a',
  'wcag20a': 'wcag2a',
  'wcag2a': 'wcag2a',
  'aa': 'wcag2aa',
  'wcag20aa': 'wcag2aa',
  'wcag2aa': 'wcag2aa',
  'aaa': 'wcag2aaa',
  'wcag20aaa': 'wcag2aaa',
  'wcag2aaa': 'wcag2aaa',
  'wcag21a': 'wcag21a',
  'wcag21aa': 'wcag21aa',
  'wcag21aaa': 'wcag21aaa',
  'wcag22a': 'wcag22a',
  'wcag22aa': 'wcag22aa',
  'wcag22aaa': 'wcag22aaa',
  // Add other known tags or aliases here
};

/** Cumulative expansion of each WCAG tag into its lower-level prerequisite tags. */
export const WCAG_TAG_EXPANSIONS: Record<string, string[]> = {
  'wcag2a': ['wcag2a'],
  'wcag2aa': ['wcag2a', 'wcag2aa'],
  'wcag2aaa': ['wcag2a', 'wcag2aa', 'wcag2aaa'],
  'wcag21a': ['wcag2a', 'wcag21a'],
  'wcag21aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  'wcag21aaa': ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa'],
  'wcag22a': ['wcag2a', 'wcag21a', 'wcag22a'],
  'wcag22aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
  'wcag22aaa': [
    'wcag2a',
    'wcag2aa',
    'wcag2aaa',
    'wcag21a',
    'wcag21aa',
    'wcag21aaa',
    'wcag22a',
    'wcag22aa',
    'wcag22aaa',
  ],
};

/** Allowed tag names or prefixes accepted as-is by `convertWcagTag`. */
export const ALLOWED_PREFIXES_OR_TAGS: string[] = ['wcag', 'best-practice', 'section508'];

/** Default WCAG tag set used when the caller omits `wcagStandards`. */
export const DEFAULT_WCAG_TAGS: string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Threshold below which the total number of evaluated rules is considered suspiciously low. */
export const SUSPICIOUSLY_LOW_RULE_COUNT = 10;

/** Maximum number of steps allowed in a single scenario run. */
export const DEFAULT_MAX_STEPS = 100;

/** Default per-step timeout in milliseconds. */
export const DEFAULT_STEP_TIMEOUT_MS = 30_000;

/** Default global scenario timeout in milliseconds. */
export const DEFAULT_GLOBAL_TIMEOUT_MS = 180_000;

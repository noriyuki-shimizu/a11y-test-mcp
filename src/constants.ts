/** WCAG tag map */
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

/** Allow prefixes or tags */
export const ALLOWED_PREFIXES_OR_TAGS: string[] = ['wcag', 'best-practice', 'section508'];

/** default WCAG tags */
export const DEFAULT_WCAG_TAGS: string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

import playwright from 'playwright';
import type { Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import type { ViolationSummary, AccessibilityTestOutput } from './types'
import { WCAG_TAG_MAP, ALLOWED_PREFIXES_OR_TAGS, DEFAULT_WCAG_TAGS } from './constants'

/**
 * Enhance WCAG tag conversion
 * @param {string[]} tags - Array of WCAG tags
 * @returns {string[]} Converted array of WCAG tags
 */
const convertWcagTag = (tags: string[]): string[] => {
  return tags.map(tag => {
    const lowerTag = tag.toLowerCase().replace(/[\s.]/g, '');

    if (lowerTag in WCAG_TAG_MAP) {
      return WCAG_TAG_MAP[lowerTag];
    }

    if (ALLOWED_PREFIXES_OR_TAGS.some(prefixOrTag => lowerTag.startsWith(prefixOrTag) || lowerTag === prefixOrTag)) {
      return lowerTag;
    }

    console.warn(`Unrecognized WCAG tag: ${tag}`);
    return '';
  }).filter(tag => tag !== '');
}

/**
 * Formats a single accessibility violation into a human-readable string.
 * Includes impact level, ID, description, node count, help URL, and details of each affected node.
 * @param {ViolationSummary} v - The violation summary object containing details about the violation.
 * @returns {string} A formatted string representing the violation, suitable for display in reports or logs.
 */
const formatViolation = (v: ViolationSummary): string => {
  const violationHeader = `    - [${String(v.impact?.toUpperCase() ?? 'N/A')}] ${v.id}: ${v.description} (Nodes: ${String(v.nodes.length)}, Help: ${v.helpUrl})`;
  const violationNodes = v.nodes
    .map((node, index) => `      Node ${String(index + 1)}: ${node.html}`)
    .join('\n');
  return `${violationHeader}\n${violationNodes}`;
};

/**
 * Execute a11y test
 * @param {string[]} urls - URLs
 * @param {string[] | undefined} wcagStandards - WCAG standards to apply
 * @returns {AccessibilityTestOutput[]} - Results of the accessibility tests
 */
export const execTest = async (urls: string[], wcagStandards: string[] | undefined): Promise<AccessibilityTestOutput[]> => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const tagsToUse = (wcagStandards && wcagStandards.length > 0)
    ? convertWcagTag(wcagStandards)
    : DEFAULT_WCAG_TAGS;

  try {
    const results: AccessibilityTestOutput[] = await Promise.all(urls.map(async (url) => {
      let page: Page | null = null;
      try {
        page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });

        const axeBuilder = new AxeBuilder({ page });

        axeBuilder.withTags(tagsToUse);

        const axeResults = await axeBuilder.analyze();

        const summarizedViolations: ViolationSummary[] = axeResults.violations.map(v => ({
          id: v.id,
          impact: v.impact === null ? undefined : v.impact,
          description: v.description,
          helpUrl: v.helpUrl,
          nodes: v.nodes
        }));

        return {
          url: url,
          violations: summarizedViolations,
          passesCount: axeResults.passes.length,
          incompleteCount: axeResults.incomplete.length,
          inapplicableCount: axeResults.inapplicable.length,
        };
      } catch (error) {
        return {
          url: url,
          error: `Failed to test: ${error instanceof Error ? error.message : String(error)}`,
        };
      } finally {
        if (page !== null) {
          await page.close();
        }
      }
    }))
    return results
  } finally {
    await browser.close();
  }
}

/**
 * Convert structured results to text format
 * @param {AccessibilityTestOutput[]} structuredResults - Structured results from the tests
 * @returns {string} - Text representation of the results
 */
export const convertTestResultToText = (structuredResults: AccessibilityTestOutput[]): string => {
  let outputText = '';
  for (const result of structuredResults) {
    let resultText = `URL: ${result.url}\n`;
    if (result.error) {
      resultText += `  Error: ${result.error}\n`;
    } else {
      resultText += `  Violations: ${String(result.violations?.length ?? 0)}\n`;

      if (result.violations && result.violations.length > 0) {
        for (const violation of result.violations) {
          resultText += `${formatViolation(violation)}\n`;
        }
      }

      resultText += `  Passes: ${String(result.passesCount ?? 0)}\n`;
      resultText += `  Incomplete: ${String(result.incompleteCount ?? 0)}\n`;
      resultText += `  Inapplicable: ${String(result.inapplicableCount ?? 0)}\n`;
    }
    outputText += resultText + '\n';
  }
  return outputText.trim();
}

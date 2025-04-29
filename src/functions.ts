import playwright from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import type { ViolationSummary, AccessibilityTestOutput } from './types'

/**
 * Enhance WCAG tag conversion
 * @param {string[]} tags - Array of WCAG tags
 * @returns {string[]} Converted array of WCAG tags
 */
const convertWcagTag = (tags: string[]): string[] => {
  return tags.map(tag => {
    const lowerTag = tag.toLowerCase().replace(/[\s.]/g, '');
    switch (lowerTag) {
      case 'wcag2a':
      case 'a':
      case 'wcag20a':
        return 'wcag2a';
      case 'wcag2aa':
      case 'aa':
      case 'wcag20aa':
        return 'wcag2aa';
      case 'wcag21a':
        return 'wcag21a';
      case 'wcag21aa':
        return 'wcag21aa';
      case 'wcag22a':
        return 'wcag22a';
      case 'wcag22aa':
        return 'wcag22aa';
      default:
        if (lowerTag.startsWith('wcag') || ['best-practice', 'section508'].includes(lowerTag)) {
          return lowerTag;
        }
        console.warn(`Unrecognized WCAG tag: ${tag}`);
        return '';
    }
  }).filter(tag => {
    return tag !== '';
  });
}

/**
 * Execute a11y test
 * @param {string[]} urls - URLs
 * @param {string[] | undefined} wcagStandards - WCAG standards to apply
 * @returns {AccessibilityTestOutput[]} - Results of the accessibility tests
 */
export const execTest = async (urls: string[], wcagStandards: string[] | undefined): Promise<AccessibilityTestOutput[]> => {
  const results: AccessibilityTestOutput[] = [];
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();

  try {
    for (const url of urls) {
      let page;
      try {
        page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });

        const axeBuilder = new AxeBuilder({ page });

        const tagsToUse = (wcagStandards && wcagStandards.length > 0)
          ? convertWcagTag(wcagStandards)
          : ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

        axeBuilder.withTags(tagsToUse);

        const axeResults = await axeBuilder.analyze();

        // Summarize results, handling null impact
        const summarizedViolations: ViolationSummary[] = axeResults.violations.map(v => ({
          id: v.id,
          // Handle null impact from axe-core
          impact: v.impact === null ? undefined : v.impact,
          description: v.description,
          helpUrl: v.helpUrl,
          nodes: v.nodes
        }));

        results.push({
          url: url,
          violations: summarizedViolations,
          passesCount: axeResults.passes.length,
          incompleteCount: axeResults.incomplete.length,
          inapplicableCount: axeResults.inapplicable.length,
        });

      } catch (error) {
        results.push({
          url: url,
          error: `Failed to test: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        if (page) {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Convert structured results to text format
 * @param {AccessibilityTestOutput[]} structuredResults - Structured results from the tests
 * @returns {string} - Text representation of the results
 */
export const convertTestResultToText = (structuredResults: AccessibilityTestOutput[]): string => {
  return structuredResults
    .map((result) => {
      const resultTextList: string[] = [`URL: ${result.url}`]
      if (result.error) {
        resultTextList.push(`  Error: ${result.error}`);
      } else {
        resultTextList.push(`  Violations: ${String(result.violations?.length ?? 0)}`);

        const resultViolationText = result.violations?.map((v) => {
          return [
            `    - [${String(v.impact?.toUpperCase() ?? 'N/A')}] ${v.id}: ${v.description} (Nodes: ${String(v.nodes.length)}, Help: ${v.helpUrl})`,
            v.nodes
            .map((node, index) => {
              return `      Node ${String(index + 1)}: ${node.html}`
            })
            .join('\n')
          ].join('\n');
        });

        if (resultViolationText !== undefined) {
          resultTextList.push(...resultViolationText);
        }

        resultTextList.push(`  Passes: ${String(result.passesCount ?? 0)}`);
        resultTextList.push(`  Incomplete: ${String(result.incompleteCount ?? 0)}`);
        resultTextList.push(`  Inapplicable: ${String(result.inapplicableCount ?? 0)}`);
      }
      return resultTextList.join('\n');
    })
    .join('\n')
    .trim();
}
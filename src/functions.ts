import AxeBuilder from '@axe-core/playwright';
import type { NodeResult } from 'axe-core';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import {
  ALLOWED_PREFIXES_OR_TAGS,
  DEFAULT_WCAG_TAGS,
  SUSPICIOUSLY_LOW_RULE_COUNT,
  WCAG_TAG_EXPANSIONS,
  WCAG_TAG_MAP,
} from './constants';

export interface ViolationSummary {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  helpUrl: string;
  nodes: NodeResult[];
}

/** Output structure of an a11y test result. */
export interface AccessibilityTestOutput {
  url: string;
  violations?: ViolationSummary[];
  /** Detailed `incomplete` results that require human verification. */
  incomplete?: ViolationSummary[];
  passesCount?: number;
  /** Convenience count, equivalent to `incomplete?.length`. */
  incompleteCount?: number;
  inapplicableCount?: number;
  /** Non-fatal warnings (e.g. suspiciously few rules evaluated). */
  warnings?: string[];
  error?: string;
}

/**
 * Normalize and cumulatively expand WCAG tags into the axe-core tag set.
 *
 * @param tags - User-supplied WCAG tags or aliases.
 * @returns Deduplicated array of canonical axe-core tags.
 */
export const convertWcagTag = (tags: string[]): string[] => {
  const expanded: string[] = [];

  for (const tag of tags) {
    const lowerTag = tag.toLowerCase().replace(/[\s.]/g, '');
    const canonical = WCAG_TAG_MAP[lowerTag] as string | undefined;

    if (canonical !== undefined) {
      const expansion = WCAG_TAG_EXPANSIONS[canonical] as string[] | undefined;
      if (expansion !== undefined) {
        expanded.push(...expansion);
      } else {
        expanded.push(canonical);
      }
      continue;
    }

    if (
      ALLOWED_PREFIXES_OR_TAGS.some(
        prefixOrTag => lowerTag.startsWith(prefixOrTag) || lowerTag === prefixOrTag,
      )
    ) {
      expanded.push(lowerTag);
      continue;
    }

    console.warn(`Unrecognized WCAG tag: ${tag}`);
  }

  return Array.from(new Set(expanded));
};

/**
 * Convert an axe-core result entry into the `ViolationSummary` shape.
 *
 * @param v - axe-core result-like entry (Result or IncompleteResult).
 * @returns Normalized summary used in the output.
 */
const summarizeAxeEntry = (
  v: { id: string; impact?: string | null; description: string; helpUrl: string; nodes: NodeResult[] },
): ViolationSummary => ({
  id: v.id,
  impact: v.impact === null || v.impact === undefined
    ? undefined
    : (v.impact as ViolationSummary['impact']),
  description: v.description,
  helpUrl: v.helpUrl,
  nodes: v.nodes,
});

/**
 * Build warning messages when the audit evaluated fewer rules than expected.
 *
 * @param counts - Per-bucket axe-core result counts.
 * @returns Array of warning messages (empty when no warning applies).
 */
export const buildAuditWarnings = (counts: {
  violations: number;
  passes: number;
  incomplete: number;
  inapplicable: number;
}): string[] => {
  const total = counts.violations + counts.passes + counts.incomplete + counts.inapplicable;
  const warnings: string[] = [];
  if (total < SUSPICIOUSLY_LOW_RULE_COUNT) {
    warnings.push(
      `Audit evaluated only ${total.toString()} rules in total — the page may not be fully rendered yet. `
        + `Add a waitFor / waitForNetworkIdle step before this audit, or re-navigate to the URL with waitUntil="networkidle".`,
    );
  }
  return warnings;
};

/**
 * Format a single violation or incomplete entry into a human-readable string.
 *
 * @param v - Violation summary to render.
 * @returns Multi-line string including header and per-node detail.
 */
const formatViolation = (v: ViolationSummary): string => {
  const violationHeader = `    - [${
    v.impact?.toUpperCase() ?? 'N/A'
  }] ${v.id}: ${v.description} (Nodes: ${v.nodes.length.toString()}, Help: ${v.helpUrl})`;
  const violationNodes = v.nodes
    .map((node, index) => `      Node ${(index + 1).toString()}: ${node.html}`)
    .join('\n');
  return `${violationHeader}\n${violationNodes}`;
};

/**
 * Run accessibility tests against the given URLs.
 *
 * @param urls - URLs to test.
 * @param wcagStandards - WCAG tags or aliases; falls back to {@link DEFAULT_WCAG_TAGS} when omitted.
 * @returns Array of per-URL accessibility test results.
 */
export const execTest = async (
  urls: string[],
  wcagStandards: string[] | undefined,
): Promise<AccessibilityTestOutput[]> => {
  const browser = await chromium.launch();
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

        const summarizedViolations = axeResults.violations.map(summarizeAxeEntry);
        const summarizedIncomplete = axeResults.incomplete.map(summarizeAxeEntry);

        const warnings = buildAuditWarnings({
          violations: axeResults.violations.length,
          passes: axeResults.passes.length,
          incomplete: axeResults.incomplete.length,
          inapplicable: axeResults.inapplicable.length,
        });

        return {
          url: url,
          violations: summarizedViolations,
          incomplete: summarizedIncomplete,
          passesCount: axeResults.passes.length,
          incompleteCount: axeResults.incomplete.length,
          inapplicableCount: axeResults.inapplicable.length,
          warnings: warnings.length > 0 ? warnings : undefined,
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
    }));
    return results;
  } finally {
    await browser.close();
  }
};

/**
 * Convert structured results into a human-readable text report.
 *
 * @param structuredResults - Results returned by {@link execTest}.
 * @returns Formatted report string.
 */
export const convertTestResultToText = (structuredResults: AccessibilityTestOutput[]): string => {
  let outputText = '';
  for (const result of structuredResults) {
    let resultText = `URL: ${result.url}\n`;
    if (result.error) {
      resultText += `  Error: ${result.error}\n`;
    } else {
      if (result.warnings && result.warnings.length > 0) {
        for (const w of result.warnings) {
          resultText += `  ⚠ Warning: ${w}\n`;
        }
      }

      resultText += `  Violations: ${String(result.violations?.length ?? 0)}\n`;

      if (result.violations && result.violations.length > 0) {
        for (const violation of result.violations) {
          resultText += `${formatViolation(violation)}\n`;
        }
      }

      resultText += `  Passes: ${String(result.passesCount ?? 0)}\n`;
      resultText += `  Incomplete: ${String(result.incompleteCount ?? 0)}\n`;

      if (result.incomplete && result.incomplete.length > 0) {
        for (const incomplete of result.incomplete) {
          resultText += `${formatViolation(incomplete)}\n`;
        }
      }

      resultText += `  Inapplicable: ${String(result.inapplicableCount ?? 0)}\n`;
    }
    outputText += resultText + '\n';
  }
  return outputText.trim();
};

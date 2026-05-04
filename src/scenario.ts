import AxeBuilder from '@axe-core/playwright';
import type { NodeResult } from 'axe-core';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, FrameLocator, Page } from 'playwright';
import { z } from 'zod';
import { DEFAULT_GLOBAL_TIMEOUT_MS, DEFAULT_MAX_STEPS, DEFAULT_STEP_TIMEOUT_MS, DEFAULT_WCAG_TAGS } from './constants';
import { type AccessibilityTestOutput, buildAuditWarnings, type ViolationSummary } from './functions';

/* -------------------------------------------------------------------------- */
/*                              Scenario Schema                               */
/* -------------------------------------------------------------------------- */

const SelectorSchema = z.string().min(1).max(500);

const FrameScopeSchema = z.object({
  selector: SelectorSchema.optional(),
  url: z.url().optional(),
}).optional();

const BaseStep = z.object({
  /** Optional human-readable label for logs / audit names. */
  label: z.string().max(200).optional(),
  /** Per-step timeout in milliseconds. */
  timeout: z.number().min(0).max(120_000).optional(),
  /** Optional iframe scope for the step. */
  frame: FrameScopeSchema,
});

const GotoStep = BaseStep.extend({
  type: z.literal('goto'),
  url: z.url(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional(),
});

const ClickStep = BaseStep.extend({
  type: z.literal('click'),
  selector: SelectorSchema,
});

const FillStep = BaseStep.extend({
  type: z.literal('fill'),
  selector: SelectorSchema,
  value: z.string().max(10_000),
});

const SelectStep = BaseStep.extend({
  type: z.literal('select'),
  selector: SelectorSchema,
  value: z.union([z.string(), z.array(z.string()).max(50)]),
});

const PressStep = BaseStep.extend({
  type: z.literal('press'),
  /** Selector to focus before pressing. If omitted, pressed on page.keyboard. */
  selector: SelectorSchema.optional(),
  key: z.string().min(1).max(50),
});

const HoverStep = BaseStep.extend({
  type: z.literal('hover'),
  selector: SelectorSchema,
});

const WaitForStep = BaseStep.extend({
  type: z.literal('waitFor'),
  selector: SelectorSchema.optional(),
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
});

const WaitForUrlStep = BaseStep.extend({
  type: z.literal('waitForUrl'),
  url: z.string().min(1).max(500),
});

const WaitForNetworkIdleStep = BaseStep.extend({
  type: z.literal('waitForNetworkIdle'),
});

const AuditStep = BaseStep.extend({
  type: z.literal('audit'),
  /** Human-readable name for this audit snapshot. */
  name: z.string().min(1).max(200).optional(),
  wcagStandards: z.array(z.string()).optional(),
});

const ScenarioStepSchema = z.discriminatedUnion('type', [
  GotoStep,
  ClickStep,
  FillStep,
  SelectStep,
  PressStep,
  HoverStep,
  WaitForStep,
  WaitForUrlStep,
  WaitForNetworkIdleStep,
  AuditStep,
]);

export const ScenarioInputSchema = z.object({
  /** Optional scenario name for the report. */
  name: z.string().max(200).optional(),
  /**
   * Default WCAG standards applied when an audit step omits its own.
   * If omitted entirely, falls back to the project default tags.
   */
  defaultWcagStandards: z.array(z.string()).optional(),
  /** Maximum number of steps allowed. Hard upper bound enforced regardless. */
  maxSteps: z.number().min(1).max(DEFAULT_MAX_STEPS).optional(),
  /** Global timeout in milliseconds applied to the whole scenario run. */
  globalTimeoutMs: z.number().min(1).max(600_000).optional(),
  /** Sequence of steps to execute. */
  steps: z.array(ScenarioStepSchema).min(1).max(DEFAULT_MAX_STEPS),
});

export type ScenarioInput = z.infer<typeof ScenarioInputSchema>;
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

/* -------------------------------------------------------------------------- */
/*                                 Output                                     */
/* -------------------------------------------------------------------------- */

export interface ScenarioAuditResult extends AccessibilityTestOutput {
  /** Audit step index in the scenario (0-based). */
  stepIndex: number;
  /** Optional name for this audit snapshot. */
  name?: string;
}

export interface ScenarioStepLog {
  stepIndex: number;
  type: ScenarioStep['type'];
  label?: string;
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

export interface ScenarioRunResult {
  scenarioName?: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  steps: ScenarioStepLog[];
  audits: ScenarioAuditResult[];
  aborted?: { reason: string };
}

/* -------------------------------------------------------------------------- */
/*                              Helper utilities                              */
/* -------------------------------------------------------------------------- */

/** Resolve `${env:NAME}` placeholders in a value using process.env. */
const resolveSecrets = (input: string): string => {
  return input.replace(/\$\{env:([A-Z0-9_]+)\}/g, (_, name: string) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  });
};

/** Read URL allowlist from env. Empty list means "no restriction". */
const getAllowedOrigins = (): string[] => {
  const raw = process.env.A11Y_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
};

/**
 * Verify that the given URL is allowed under the configured origin allowlist.
 * Allowlist entries are matched as URL prefixes after normalization.
 */
const assertUrlAllowed = (url: string): void => {
  const allowlist = getAllowedOrigins();
  if (allowlist.length === 0) return;
  const ok = allowlist.some(prefix => url.startsWith(prefix));
  if (!ok) {
    throw new Error(
      `URL "${url}" is not in A11Y_ALLOWED_ORIGINS allowlist`,
    );
  }
};

/** Resolve the active locator scope (page or iframe) for a step. */
const resolveScope = async (
  page: Page,
  frame: ScenarioStep['frame'],
): Promise<Page | FrameLocator> => {
  if (!frame) return page;
  if (frame.selector) {
    return page.frameLocator(frame.selector);
  }
  if (frame.url) {
    // Wait until a frame matching the url is attached.
    const handle = await page.waitForSelector('iframe', { timeout: 10_000 });
    void handle;
    const frames = page.frames();
    const target = frames.find(f => f.url().startsWith(frame.url ?? ''));
    if (!target) {
      throw new Error(`Frame with url prefix "${frame.url}" not found`);
    }
    // FrameLocator is preferred but we only have a Frame here; fallback via frameLocator on parent.
    // Best effort: locate by exact URL substring.
    return page.frameLocator(`iframe[src*="${frame.url}"]`);
  }
  return page;
};

/* -------------------------------------------------------------------------- */
/*                            Scenario execution                              */
/* -------------------------------------------------------------------------- */

interface RunContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  defaultWcagStandards: string[];
}

/**
 * Run a single scenario step against the active page.
 * When the step is `audit`, the result is appended to `audits`.
 *
 * @param ctx - Shared run context (browser, page, defaults).
 * @param step - Validated step definition to execute.
 * @param stepIndex - Zero-based index of the step in the scenario.
 * @param audits - Accumulator that receives audit results.
 * @param convertWcagTag - WCAG tag conversion function (injected to avoid circular deps).
 */
const runStep = async (
  ctx: RunContext,
  step: ScenarioStep,
  stepIndex: number,
  audits: ScenarioAuditResult[],
  convertWcagTag: (tags: string[]) => string[],
): Promise<void> => {
  const stepTimeout = step.timeout ?? DEFAULT_STEP_TIMEOUT_MS;
  const scope = await resolveScope(ctx.page, step.frame);

  switch (step.type) {
    case 'goto': {
      assertUrlAllowed(step.url);
      await ctx.page.goto(step.url, {
        waitUntil: step.waitUntil ?? 'networkidle',
        timeout: stepTimeout,
      });
      return;
    }
    case 'click': {
      await scope.locator(step.selector).first().click({ timeout: stepTimeout });
      return;
    }
    case 'fill': {
      const value = resolveSecrets(step.value);
      await scope.locator(step.selector).first().fill(value, { timeout: stepTimeout });
      return;
    }
    case 'select': {
      await scope.locator(step.selector).first().selectOption(step.value, { timeout: stepTimeout });
      return;
    }
    case 'press': {
      if (step.selector) {
        await scope.locator(step.selector).first().press(step.key, { timeout: stepTimeout });
      } else {
        await ctx.page.keyboard.press(step.key);
      }
      return;
    }
    case 'hover': {
      await scope.locator(step.selector).first().hover({ timeout: stepTimeout });
      return;
    }
    case 'waitFor': {
      if (step.selector) {
        await scope.locator(step.selector).first().waitFor({
          // Default to 'attached' (DOM presence) rather than 'visible' so that
          // SPA elements that are intentionally rendered off-screen or behind
          // overlays don't time out. Callers can still pass `state: 'visible'`
          // explicitly when they want strict visibility.
          state: step.state ?? 'attached',
          timeout: stepTimeout,
        });
      } else {
        await ctx.page.waitForLoadState('domcontentloaded', { timeout: stepTimeout });
      }
      return;
    }
    case 'waitForUrl': {
      await ctx.page.waitForURL(step.url, { timeout: stepTimeout });
      return;
    }
    case 'waitForNetworkIdle': {
      await ctx.page.waitForLoadState('networkidle', { timeout: stepTimeout });
      return;
    }
    case 'audit': {
      const tags = (step.wcagStandards && step.wcagStandards.length > 0)
        ? convertWcagTag(step.wcagStandards)
        : ctx.defaultWcagStandards;

      const builder = new AxeBuilder({ page: ctx.page });
      builder.withTags(tags);
      const axeResults = await builder.analyze();

      const summarizedViolations: ViolationSummary[] = axeResults.violations.map(v => ({
        id: v.id,
        impact: v.impact === null ? undefined : v.impact,
        description: v.description,
        helpUrl: v.helpUrl,
        nodes: v.nodes,
      }));
      const summarizedIncomplete: ViolationSummary[] = axeResults.incomplete.map(v => ({
        id: v.id,
        impact: v.impact ?? undefined,
        description: v.description,
        helpUrl: v.helpUrl,
        nodes: v.nodes,
      }));

      const warnings = buildAuditWarnings({
        violations: axeResults.violations.length,
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length,
        inapplicable: axeResults.inapplicable.length,
      });

      audits.push({
        stepIndex,
        name: step.name ?? step.label,
        url: ctx.page.url(),
        violations: summarizedViolations,
        incomplete: summarizedIncomplete,
        passesCount: axeResults.passes.length,
        incompleteCount: axeResults.incomplete.length,
        inapplicableCount: axeResults.inapplicable.length,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
      return;
    }
  }
};

/**
 * Execute a scenario end-to-end and collect step logs and audit results.
 *
 * @param input - Validated scenario input.
 * @param convertWcagTag - WCAG tag conversion function (injected to avoid circular deps).
 * @returns Aggregated scenario run result.
 */
export const execScenario = async (
  input: ScenarioInput,
  convertWcagTag: (tags: string[]) => string[],
): Promise<ScenarioRunResult> => {
  const startedAt = new Date();
  const stepsLog: ScenarioStepLog[] = [];
  const audits: ScenarioAuditResult[] = [];

  // Hard caps regardless of input.
  const maxSteps = Math.min(input.maxSteps ?? DEFAULT_MAX_STEPS, DEFAULT_MAX_STEPS);
  const globalTimeoutMs = input.globalTimeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS;

  if (input.steps.length > maxSteps) {
    throw new Error(
      `Scenario has ${input.steps.length.toString()} steps which exceeds maxSteps=${maxSteps.toString()}`,
    );
  }

  const defaultWcagStandards = (input.defaultWcagStandards && input.defaultWcagStandards.length > 0)
    ? convertWcagTag(input.defaultWcagStandards)
    : DEFAULT_WCAG_TAGS;

  const browser = await chromium.launch();
  let aborted: ScenarioRunResult['aborted'];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const runCtx: RunContext = { browser, context, page, defaultWcagStandards };

    const deadline = Date.now() + globalTimeoutMs;

    for (let i = 0; i < input.steps.length; i++) {
      const step = input.steps[i];
      const stepStart = Date.now();

      if (Date.now() >= deadline) {
        stepsLog.push({
          stepIndex: i,
          type: step.type,
          label: step.label,
          status: 'skipped',
          durationMs: 0,
          error: 'Global scenario timeout exceeded before this step',
        });
        aborted = { reason: 'globalTimeout' };
        continue;
      }

      try {
        await runStep(runCtx, step, i, audits, convertWcagTag);
        stepsLog.push({
          stepIndex: i,
          type: step.type,
          label: step.label,
          status: 'ok',
          durationMs: Date.now() - stepStart,
        });
      } catch (error) {
        stepsLog.push({
          stepIndex: i,
          type: step.type,
          label: step.label,
          status: 'failed',
          durationMs: Date.now() - stepStart,
          error: error instanceof Error ? error.message : String(error),
        });
        aborted = { reason: `step ${i.toString()} failed` };
        break;
      }
    }
  } finally {
    await browser.close();
  }

  const finishedAt = new Date();

  return {
    scenarioName: input.name,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
    steps: stepsLog,
    audits,
    aborted,
  };
};

/* -------------------------------------------------------------------------- */
/*                              Output formatter                              */
/* -------------------------------------------------------------------------- */

/**
 * Format an audit's violations, incomplete entries, and warnings into text.
 *
 * @param audit - Audit result produced by an `audit` step.
 * @returns Multi-line string suitable for inclusion in the scenario report.
 */
const formatAuditViolations = (audit: ScenarioAuditResult): string => {
  const lines: string[] = [];

  if (audit.warnings && audit.warnings.length > 0) {
    for (const w of audit.warnings) {
      lines.push(`  ⚠ Warning: ${w}`);
    }
  }

  lines.push(`  Violations: ${String(audit.violations?.length ?? 0)}`);
  if (audit.violations && audit.violations.length > 0) {
    for (const v of audit.violations) {
      const header = `    - [${
        v.impact?.toUpperCase() ?? 'N/A'
      }] ${v.id}: ${v.description} (Nodes: ${v.nodes.length.toString()}, Help: ${v.helpUrl})`;
      const nodes = v.nodes.map((n: NodeResult, idx) => `      Node ${(idx + 1).toString()}: ${n.html}`).join('\n');
      lines.push(`${header}\n${nodes}`);
    }
  }
  lines.push(`  Passes: ${String(audit.passesCount ?? 0)}`);
  lines.push(`  Incomplete: ${String(audit.incompleteCount ?? 0)}`);
  if (audit.incomplete && audit.incomplete.length > 0) {
    for (const v of audit.incomplete) {
      const header = `    - [${
        v.impact?.toUpperCase() ?? 'N/A'
      }] ${v.id}: ${v.description} (Nodes: ${v.nodes.length.toString()}, Help: ${v.helpUrl})`;
      const nodes = v.nodes.map((n: NodeResult, idx) => `      Node ${(idx + 1).toString()}: ${n.html}`).join('\n');
      lines.push(`${header}\n${nodes}`);
    }
  }
  lines.push(`  Inapplicable: ${String(audit.inapplicableCount ?? 0)}`);
  return lines.join('\n');
};

/**
 * Convert a scenario run result into a human-readable text report.
 *
 * @param result - Result returned by {@link execScenario}.
 * @returns Formatted report string.
 */
export const convertScenarioResultToText = (result: ScenarioRunResult): string => {
  const lines: string[] = [];
  const title = result.scenarioName ? `Scenario: ${result.scenarioName}` : 'Scenario';
  lines.push(`=== ${title} ===`);
  lines.push(`Started:  ${result.startedAt}`);
  lines.push(`Finished: ${result.finishedAt}`);
  lines.push(`Duration: ${result.totalDurationMs.toString()}ms`);
  if (result.aborted) {
    lines.push(`Aborted:  ${result.aborted.reason}`);
  }
  lines.push('');
  lines.push('--- Step log ---');
  for (const s of result.steps) {
    const labelPart = s.label ? ` (${s.label})` : '';
    const errorPart = s.error ? ` -- ${s.error}` : '';
    lines.push(
      `  #${s.stepIndex.toString().padStart(2, '0')} ${s.type.padEnd(20, ' ')} ${s.status.padEnd(7, ' ')} ${
        s.durationMs.toString().padStart(6, ' ')
      }ms${labelPart}${errorPart}`,
    );
  }
  lines.push('');
  lines.push('--- Audits ---');
  if (result.audits.length === 0) {
    lines.push('  (no audit steps were executed)');
  } else {
    for (const audit of result.audits) {
      const name = audit.name ? `"${audit.name}"` : '(unnamed)';
      lines.push(`Audit #${audit.stepIndex.toString()} ${name}`);
      lines.push(`  URL: ${audit.url}`);
      if (audit.error) {
        lines.push(`  Error: ${audit.error}`);
      } else {
        lines.push(formatAuditViolations(audit));
      }
      lines.push('');
    }
  }
  return lines.join('\n').trim();
};

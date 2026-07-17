import AxeBuilder from '@axe-core/playwright';
import { type Page, type TestInfo, expect } from '@playwright/test';
import type { Result, ImpactValue } from 'axe-core';

/**
 * Automated accessibility (a11y) scanning built on axe-core.
 *
 * The suite drives the same mock-JMAP-backed server as the visual-regression
 * suite (see playwright.a11y.config.ts and e2e/visual/README.md) and runs an
 * axe-core audit against each key surface.
 *
 * Failure policy:
 *  - serious / critical violations FAIL the test (these are the ones that
 *    materially block assistive-technology users).
 *  - moderate / minor violations are attached to the report as an artifact but
 *    do NOT fail the run, so we get visibility without blocking on the long
 *    tail of low-severity findings.
 *
 * See e2e/a11y/README.md for the rationale, the failure threshold, and the
 * documented third-party exclusions.
 */

/** Impact levels that fail the build. Everything else is reported only. */
const FAILING_IMPACTS: ReadonlySet<ImpactValue> = new Set<ImpactValue>([
  'serious',
  'critical',
]);

/**
 * CSS selectors for known third-party regions whose internal DOM we do not
 * control and cannot realistically fix from this repo. Excluded from every
 * scan and documented in e2e/a11y/README.md.
 *
 *  - `.tiptap` / `.ProseMirror`: the TipTap rich-text editor content area
 *    (composer body). Its contenteditable DOM is owned by TipTap/ProseMirror;
 *    a11y of the editor itself is upstream's responsibility.
 */
const THIRD_PARTY_EXCLUDES: readonly string[] = ['.tiptap', '.ProseMirror'];

interface CheckA11yOptions {
  /** Extra CSS selectors to exclude on top of the shared third-party list. */
  exclude?: string[];
  /** Restrict the scan to a subtree (e.g. an open dialog) instead of the page. */
  include?: string[];
}

/** Compact, serialisable view of a single axe violation for the report. */
function summarise(v: Result) {
  return {
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      failureSummary: n.failureSummary,
    })),
  };
}

/** One line per violation for human-readable test output. */
function formatLines(violations: Result[]): string {
  return violations
    .map(
      (v) =>
        `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) ${v.helpUrl}`,
    )
    .join('\n');
}

/**
 * Run an axe-core audit on the current page state and assert that no
 * serious/critical violations exist. Moderate/minor findings are attached to
 * the report but never fail the run.
 */
export async function checkA11y(
  page: Page,
  testInfo: TestInfo,
  surface: string,
  options: CheckA11yOptions = {},
): Promise<void> {
  let builder = new AxeBuilder({ page });

  for (const sel of options.include ?? []) {
    builder = builder.include(sel);
  }
  for (const sel of [...THIRD_PARTY_EXCLUDES, ...(options.exclude ?? [])]) {
    builder = builder.exclude(sel);
  }

  const results = await builder.analyze();
  const violations = results.violations;

  const failing = violations.filter(
    (v) => v.impact != null && FAILING_IMPACTS.has(v.impact),
  );
  const reportOnly = violations.filter(
    (v) => v.impact == null || !FAILING_IMPACTS.has(v.impact),
  );

  // Always attach the full breakdown so moderate/minor findings are visible in
  // the report artifact even on a passing run.
  await testInfo.attach(`a11y-${surface}.json`, {
    body: JSON.stringify(
      {
        surface,
        failingCount: failing.length,
        reportOnlyCount: reportOnly.length,
        failing: failing.map(summarise),
        reportOnly: reportOnly.map(summarise),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  if (reportOnly.length > 0) {
    // Surface non-failing findings in the log without failing the test.
    console.log(
      `\n[a11y:${surface}] ${reportOnly.length} moderate/minor finding(s) (report-only):\n${formatLines(
        reportOnly,
      )}`,
    );
  }

  expect(
    failing,
    `[a11y:${surface}] ${failing.length} serious/critical violation(s):\n${formatLines(
      failing,
    )}`,
  ).toEqual([]);
}

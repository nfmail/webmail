#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import console from "node:console";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// Directories whose .tsx files participate in the UI convention check.
const SCANNED_DIRECTORIES = ["components", "app"];

const BASELINE_RELATIVE_PATH = "scripts/ui-conventions-baseline.json";

// Tailwind palette families that must not be used as raw color utilities.
// Semantic tokens (primary, muted-foreground, success, warning, info, ...)
// are the sanctioned alternative and never match these families.
const PALETTE_FAMILIES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

// Utility prefixes that accept a color (bg-, text-, border-, ring-, ...).
const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "ring-offset",
  "ring",
  "from",
  "via",
  "to",
  "fill",
  "stroke",
  "divide",
  "outline",
  "decoration",
  "accent",
  "caret",
  "placeholder",
  "shadow",
];

const PALETTE_STEP = "(?:50|100|200|300|400|500|600|700|800|900|950)";

// Matches, e.g. bg-blue-500, text-gray-400, border-red-200, dark:hover:bg-slate-800/40
export const PALETTE_PATTERN = new RegExp(
  `(?:^|[\\s"'\`])(?:[a-z-]+:)*(?:${COLOR_PREFIXES.join("|")})-(?:${PALETTE_FAMILIES.join(
    "|",
  )})-${PALETTE_STEP}(?:\\/\\d{1,3})?(?![\\w-])`,
  "g",
);

// Matches space-x-4, space-y-2, -space-x-1, dark:space-y-px, etc.
export const SPACE_PATTERN =
  /(?:^|[\s"'`])(?:[a-z-]+:)*-?space-[xy]-(?:\d+(?:\.\d+)?|px)(?![\w-])/g;

export const CATEGORIES = {
  palette: {
    label: "raw Tailwind palette color classes",
    pattern: PALETTE_PATTERN,
    guidance:
      "Use semantic tokens (bg-primary, text-muted-foreground, success/warning/info/selection/unread) instead of raw palette colors.",
  },
  space: {
    label: "space-x-* / space-y-* spacing utilities",
    pattern: SPACE_PATTERN,
    guidance: "Use gap-* on a flex/grid container instead of space-x-* / space-y-*.",
  },
};

function countMatches(source, pattern) {
  // Patterns carry the global flag; reset lastIndex to stay reentrant.
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(source) !== null) {
    count += 1;
  }
  return count;
}

function listTrackedTsxFiles(root) {
  const output = execFileSync(
    "git",
    ["-C", root, "ls-files", "-z", "--", ...SCANNED_DIRECTORIES],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  return output
    .split("\0")
    .filter((filePath) => filePath.endsWith(".tsx"))
    .sort();
}

// Produce { palette: { file: count }, space: { file: count } } for the tree.
export function scanTree(root = process.cwd()) {
  const result = {};
  for (const category of Object.keys(CATEGORIES)) {
    result[category] = {};
  }

  for (const filePath of listTrackedTsxFiles(root)) {
    const source = readFileSync(resolve(root, filePath), "utf8");
    for (const [category, { pattern }] of Object.entries(CATEGORIES)) {
      const count = countMatches(source, pattern);
      if (count > 0) {
        result[category][filePath] = count;
      }
    }
  }

  return result;
}

export function baselinePath(root = process.cwd()) {
  return resolve(root, BASELINE_RELATIVE_PATH);
}

export function loadBaseline(root = process.cwd()) {
  const path = baselinePath(root);
  if (!existsSync(path)) {
    throw new Error(`UI convention baseline is missing at ${BASELINE_RELATIVE_PATH}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// Build a stable, sorted baseline document from a fresh scan.
export function buildBaseline(root = process.cwd(), { allowlist = [] } = {}) {
  const scan = scanTree(root);
  const categories = {};
  for (const [category, files] of Object.entries(scan)) {
    categories[category] = {
      files: Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  }

  return {
    description:
      "Ratchet baseline for scripts/check-ui-conventions.mjs. Counts may only shrink; regenerate with `npm run check:ui -- --update` after reducing violations.",
    categories,
    // Justified, reviewed exceptions. Each entry silences one category for one
    // file and MUST carry a human-readable reason.
    allowlist,
  };
}

function allowlistLookup(baseline) {
  const allowed = new Map();
  for (const entry of baseline.allowlist ?? []) {
    if (!entry || !entry.file || !entry.category) {
      continue;
    }
    if (!entry.reason || `${entry.reason}`.trim() === "") {
      throw new Error(
        `Allowlist entry for ${entry.file} (${entry.category}) must include a non-empty reason`,
      );
    }
    allowed.set(`${entry.category}:${entry.file}`, entry.reason);
  }
  return allowed;
}

// Compare a fresh scan against the baseline using the ratchet rules.
export function compareToBaseline(scan, baseline) {
  const allowed = allowlistLookup(baseline);
  const newViolations = [];
  const increased = [];
  const improved = [];

  for (const category of Object.keys(CATEGORIES)) {
    const current = scan[category] ?? {};
    const recorded = baseline.categories?.[category]?.files ?? {};

    for (const [file, count] of Object.entries(current)) {
      if (allowed.has(`${category}:${file}`)) {
        continue;
      }
      const baselineCount = recorded[file] ?? 0;
      if (baselineCount === 0) {
        newViolations.push({ category, file, count });
      } else if (count > baselineCount) {
        increased.push({ category, file, count, baselineCount });
      }
    }

    for (const [file, baselineCount] of Object.entries(recorded)) {
      const count = current[file] ?? 0;
      if (count < baselineCount) {
        improved.push({ category, file, count, baselineCount });
      }
    }
  }

  return { newViolations, increased, improved };
}

function reportFailure({ newViolations, increased }) {
  console.error("UI convention check failed.\n");

  if (newViolations.length > 0) {
    console.error("New violations in files that were previously clean:");
    for (const { category, file, count } of newViolations) {
      console.error(`  - [${category}] ${file}: ${count}`);
      console.error(`      ${CATEGORIES[category].guidance}`);
    }
    console.error("");
  }

  if (increased.length > 0) {
    console.error("Violation counts increased above the baseline:");
    for (const { category, file, count, baselineCount } of increased) {
      console.error(`  - [${category}] ${file}: ${count} (baseline ${baselineCount})`);
      console.error(`      ${CATEGORIES[category].guidance}`);
    }
    console.error("");
  }

  console.error(
    "Legacy usages are tracked in a ratchet baseline and may only shrink.\n" +
      "Fix the new usages, add a justified allowlist entry (with a reason) in\n" +
      `${BASELINE_RELATIVE_PATH}, or migrate the file to semantic tokens / gap-*.`,
  );
}

function resolveRoot() {
  const rootArgumentIndex = process.argv.indexOf("--root");
  if (rootArgumentIndex !== -1) {
    return process.argv[rootArgumentIndex + 1];
  }
  return process.cwd();
}

function updateBaseline(root) {
  let existingAllowlist = [];
  try {
    existingAllowlist = loadBaseline(root).allowlist ?? [];
  } catch {
    existingAllowlist = [];
  }
  const baseline = buildBaseline(root, { allowlist: existingAllowlist });
  writeFileSync(baselinePath(root), `${JSON.stringify(baseline, null, 2)}\n`);

  const totals = Object.fromEntries(
    Object.entries(baseline.categories).map(([category, { files }]) => [
      category,
      Object.values(files).reduce((sum, count) => sum + count, 0),
    ]),
  );
  console.log(`Wrote ${BASELINE_RELATIVE_PATH}`);
  for (const [category, total] of Object.entries(totals)) {
    const fileCount = Object.keys(baseline.categories[category].files).length;
    console.log(`  ${category}: ${total} usages across ${fileCount} files`);
  }
}

function run() {
  const root = resolveRoot();
  if (!root) {
    console.error("UI convention check could not start: no repository root.");
    process.exitCode = 2;
    return;
  }

  if (process.argv.includes("--update")) {
    try {
      updateBaseline(root);
    } catch (error) {
      console.error(`UI convention baseline update failed: ${error.message}`);
      process.exitCode = 2;
    }
    return;
  }

  let scan;
  let baseline;
  try {
    scan = scanTree(root);
    baseline = loadBaseline(root);
  } catch (error) {
    console.error(`UI convention check could not complete: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  let comparison;
  try {
    comparison = compareToBaseline(scan, baseline);
  } catch (error) {
    console.error(`UI convention check could not complete: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const { newViolations, increased, improved } = comparison;

  if (newViolations.length === 0 && increased.length === 0) {
    console.log("UI convention check passed.");
    if (improved.length > 0) {
      console.log(
        `${improved.length} tracked file(s) improved below baseline. ` +
          "Run `npm run check:ui -- --update` to tighten the ratchet.",
      );
    }
    return;
  }

  reportFailure(comparison);
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run();
}

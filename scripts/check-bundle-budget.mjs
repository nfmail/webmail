#!/usr/bin/env node
/**
 * Bundle budget check for the client JS the app ships.
 *
 * Turbopack builds don't emit the webpack-era app-build-manifest, so the
 * check works on the emitted client chunks directly: it computes the gzipped
 * size of every file under .next/static/chunks (the complete client-JS
 * payload) and compares two aggregates against scripts/bundle-budget.json —
 * the total and the largest single chunk. Both move immediately when a
 * dependency (UI primitives included) starts bloating the bundle, which is
 * what the budget exists to catch.
 *
 * Run after `next build`:  node scripts/check-bundle-budget.mjs
 * Refresh budgets deliberately:  node scripts/check-bundle-budget.mjs --update
 * (sets each budget to current + 10% headroom; review the diff).
 */
import console from "node:console";
import process from "node:process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";

const root = process.cwd();
const chunksDir = join(root, ".next", "static", "chunks");
const budgetPath = join(root, "scripts", "bundle-budget.json");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = walk(chunksDir);
if (files.length === 0) {
  console.error("Bundle budget: no client chunks under .next/static/chunks — run `next build` first.");
  process.exit(1);
}

let totalBytes = 0;
let largest = { file: "", bytes: 0 };
const sized = files.map((file) => {
  const bytes = gzipSync(readFileSync(file)).length;
  totalBytes += bytes;
  if (bytes > largest.bytes) largest = { file, bytes };
  return { file, bytes };
});

const kb = (b) => Math.round(b / 1024);
const measured = {
  "total-client-js": kb(totalBytes),
  "largest-chunk": kb(largest.bytes),
};

if (process.argv.includes("--update")) {
  const budgets = Object.fromEntries(
    Object.entries(measured).map(([k, v]) => [k, Math.ceil((v * 1.1) / 10) * 10]),
  );
  writeFileSync(
    budgetPath,
    JSON.stringify(
      {
        description:
          "Gzipped client-JS budgets in KB (total of .next/static/chunks and the largest single chunk), enforced by scripts/check-bundle-budget.mjs after next build. Refresh deliberately with --update and review the diff.",
        budgets,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Bundle budgets written: ${JSON.stringify(budgets)}`);
  process.exit(0);
}

let budgetFile;
try {
  budgetFile = JSON.parse(readFileSync(budgetPath, "utf8"));
} catch {
  console.error("Bundle budget: scripts/bundle-budget.json missing — run with --update to create it.");
  process.exit(1);
}

sized.sort((a, b) => b.bytes - a.bytes);
console.log(`Client chunks: ${files.length} files, gzipped total ${measured["total-client-js"]} KB`);
console.log("Largest chunks:");
for (const { file, bytes } of sized.slice(0, 5)) {
  console.log(`  ${String(kb(bytes)).padStart(5)} KB  ${relative(join(root, ".next"), file)}`);
}

const failures = [];
for (const [metric, value] of Object.entries(measured)) {
  const budget = budgetFile.budgets[metric];
  if (budget === undefined) failures.push(`${metric}: no budget recorded — run --update`);
  else if (value > budget) failures.push(`${metric}: ${value} KB exceeds the ${budget} KB budget`);
  else console.log(`${metric}: ${value} KB within ${budget} KB budget`);
}

if (failures.length) {
  console.error("\nBundle budget check FAILED:");
  failures.forEach((f) => console.error("  - " + f));
  console.error("\nShrink the bundle or refresh budgets deliberately with --update (review the diff).");
  process.exit(1);
}
console.log("\nBundle budget check passed.");

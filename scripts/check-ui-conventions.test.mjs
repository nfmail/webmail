import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { afterEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";

import {
  buildBaseline,
  compareToBaseline,
  PALETTE_PATTERN,
  scanTree,
  SPACE_PATTERN,
} from "./check-ui-conventions.mjs";

const temporaryDirectories = [];
const scriptPath = fileURLToPath(new URL("./check-ui-conventions.mjs", import.meta.url));

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function countMatches(pattern, source) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(source) !== null) {
    count += 1;
  }
  return count;
}

test("palette pattern flags raw palette utilities and variants", () => {
  assert.equal(countMatches(PALETTE_PATTERN, 'className="bg-blue-500 text-gray-400"'), 2);
  assert.equal(countMatches(PALETTE_PATTERN, 'className="dark:hover:bg-slate-800/40"'), 1);
  assert.equal(countMatches(PALETTE_PATTERN, 'className="border-red-200 ring-emerald-500"'), 2);
});

test("palette pattern ignores semantic tokens and unrelated utilities", () => {
  const semantic =
    'className="bg-primary text-muted-foreground border-border bg-success text-info gap-4 shadow-sm"';
  assert.equal(countMatches(PALETTE_PATTERN, semantic), 0);
});

test("space pattern flags space-x/space-y utilities including variants", () => {
  assert.equal(countMatches(SPACE_PATTERN, 'className="space-x-4 space-y-2"'), 2);
  assert.equal(countMatches(SPACE_PATTERN, 'className="-space-x-1 md:space-y-px"'), 2);
});

test("space pattern ignores gap utilities", () => {
  assert.equal(countMatches(SPACE_PATTERN, 'className="gap-4 gap-x-2 space-between"'), 0);
});

test("scanTree counts violations per file under components/ and app/", () => {
  const repository = createRepository({
    "components/ui/button.tsx": 'export const B = () => <div className="bg-primary" />;\n',
    "components/email/list.tsx":
      'export const L = () => <div className="bg-blue-500 space-x-4 text-gray-500" />;\n',
    "app/(main)/page.tsx": 'export const P = () => <div className="space-y-2" />;\n',
    "lib/util.tsx": 'export const U = () => <div className="bg-red-500" />;\n',
  });

  const scan = scanTree(repository);

  assert.deepEqual(scan.palette, { "components/email/list.tsx": 2 });
  assert.deepEqual(scan.space, {
    "app/(main)/page.tsx": 1,
    "components/email/list.tsx": 1,
  });
});

test("compareToBaseline passes when counts match the baseline", () => {
  const repository = createRepository({
    "components/email/list.tsx": 'export const L = () => <div className="bg-blue-500" />;\n',
  });
  const baseline = buildBaseline(repository);

  const result = compareToBaseline(scanTree(repository), baseline);

  assert.deepEqual(result.newViolations, []);
  assert.deepEqual(result.increased, []);
});

test("compareToBaseline reports new violations in previously clean files", () => {
  const baseline = {
    categories: { palette: { files: {} }, space: { files: {} } },
    allowlist: [],
  };
  const scan = { palette: { "components/new.tsx": 3 }, space: {} };

  const result = compareToBaseline(scan, baseline);

  assert.deepEqual(result.newViolations, [
    { category: "palette", file: "components/new.tsx", count: 3 },
  ]);
});

test("compareToBaseline reports increases above the baseline", () => {
  const baseline = {
    categories: { palette: { files: { "components/x.tsx": 2 } }, space: { files: {} } },
    allowlist: [],
  };
  const scan = { palette: { "components/x.tsx": 5 }, space: {} };

  const result = compareToBaseline(scan, baseline);

  assert.deepEqual(result.increased, [
    { category: "palette", file: "components/x.tsx", count: 5, baselineCount: 2 },
  ]);
});

test("compareToBaseline records improvements below the baseline", () => {
  const baseline = {
    categories: { palette: { files: { "components/x.tsx": 5 } }, space: { files: {} } },
    allowlist: [],
  };
  const scan = { palette: { "components/x.tsx": 2 }, space: {} };

  const result = compareToBaseline(scan, baseline);

  assert.deepEqual(result.newViolations, []);
  assert.deepEqual(result.increased, []);
  assert.deepEqual(result.improved, [
    { category: "palette", file: "components/x.tsx", count: 2, baselineCount: 5 },
  ]);
});

test("allowlist silences a justified exception", () => {
  const baseline = {
    categories: { palette: { files: {} }, space: { files: {} } },
    allowlist: [
      {
        file: "components/legacy.tsx",
        category: "palette",
        reason: "Third-party embed requires literal brand colors.",
      },
    ],
  };
  const scan = { palette: { "components/legacy.tsx": 4 }, space: {} };

  const result = compareToBaseline(scan, baseline);

  assert.deepEqual(result.newViolations, []);
  assert.deepEqual(result.increased, []);
});

test("allowlist entry without a reason is rejected", () => {
  const baseline = {
    categories: { palette: { files: {} }, space: { files: {} } },
    allowlist: [{ file: "components/legacy.tsx", category: "palette", reason: "" }],
  };
  const scan = { palette: { "components/legacy.tsx": 4 }, space: {} };

  assert.throws(() => compareToBaseline(scan, baseline), /must include a non-empty reason/);
});

test("CLI passes against a freshly generated baseline", () => {
  const repository = createRepository({
    "components/email/list.tsx":
      'export const L = () => <div className="bg-blue-500 space-x-4" />;\n',
  });
  const generate = spawnSync(process.execPath, [scriptPath, "--root", repository, "--update"], {
    encoding: "utf8",
  });
  assert.equal(generate.status, 0, generate.stderr);

  execFileSync("git", ["-C", repository, "add", "--force", "."]);
  const check = spawnSync(process.execPath, [scriptPath, "--root", repository], {
    encoding: "utf8",
  });

  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /UI convention check passed/);
});

test("CLI fails when a new violation is introduced after the baseline", () => {
  const repository = createRepository({
    "components/email/list.tsx": 'export const L = () => <div className="gap-4" />;\n',
  });
  execFileSync(process.execPath, [scriptPath, "--root", repository, "--update"]);

  writeFileSync(
    join(repository, "components/email/list.tsx"),
    'export const L = () => <div className="bg-blue-500" />;\n',
  );
  execFileSync("git", ["-C", repository, "add", "--force", "."]);

  const check = spawnSync(process.execPath, [scriptPath, "--root", repository], {
    encoding: "utf8",
  });

  assert.equal(check.status, 1);
  assert.match(check.stderr, /UI convention check failed/);
  assert.match(check.stderr, /bg-blue-500|New violations|components\/email\/list\.tsx/);
});

function createRepository(files) {
  const repository = mkdtempSync(join(tmpdir(), "nf-ui-conventions-"));
  temporaryDirectories.push(repository);
  execFileSync("git", ["init", "--quiet", repository]);
  execFileSync("git", ["-C", repository, "config", "user.name", "NF Test"]);
  execFileSync("git", ["-C", repository, "config", "user.email", "nf-test@example.invalid"]);
  mkdirSync(join(repository, "scripts"), { recursive: true });

  for (const [filePath, contents] of Object.entries(files)) {
    const absolutePath = join(repository, filePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }

  execFileSync("git", ["-C", repository, "add", "--force", "."]);
  return repository;
}

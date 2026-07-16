import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { afterEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";

import { listExcludedTrackedFiles } from "./check-nf.mjs";

const temporaryDirectories = [];
const scriptPath = fileURLToPath(new URL("./check-nf.mjs", import.meta.url));
const policyPath = fileURLToPath(new URL("../.nfignore", import.meta.url));
const hookPath = fileURLToPath(new URL("../.husky/pre-commit", import.meta.url));

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("accepts public source and documentation", () => {
  const repository = createRepository({
    "README.md": "Public documentation\n",
    "CONTRIBUTING.md": "Public contributor guide\n",
    "docs/architecture.md": "Public architecture\n",
    "docs/research-methodology.md": "Public methodology\n",
    "app/api/prompt/route.ts": "export const runtime = 'nodejs';\n",
  });

  assert.deepEqual(listExcludedTrackedFiles(repository), []);
});

test("matches configured paths throughout the tracked tree", () => {
  const files = {
    "AGENTS.md": "local configuration\n",
    "docs/CLAUDE.md": "local configuration\n",
    "tools/.beads/issues.jsonl": "{}\n",
    ".cursor/rules/project.mdc": "local configuration\n",
    ".github/copilot-instructions.md": "local configuration\n",
    "docs/private-plan.md": "local notes\n",
    "notes/nf-internal-research.txt": "local notes\n",
    "prompts/release.md": "local notes\n",
    "artifacts/session.transcript.json": "{}\n",
  };
  const repository = createRepository(files);

  assert.deepEqual(listExcludedTrackedFiles(repository).sort(), Object.keys(files).sort());
});

test("matching is case insensitive", () => {
  const repository = createRepository({
    "docs/agents.MD": "local configuration\n",
    "tools/.CODEX/settings.json": "{}\n",
  });

  assert.deepEqual(listExcludedTrackedFiles(repository).sort(), [
    "docs/agents.MD",
    "tools/.CODEX/settings.json",
  ]);
});

test("CLI reports configured tracked paths", () => {
  const repository = createRepository({
    "README.md": "Public documentation\n",
    "docs/private-research.md": "local notes\n",
  });

  const result = spawnSync(process.execPath, [scriptPath, "--root", repository], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NF validation failed for tracked paths/);
  assert.match(result.stderr, /docs\/private-research\.md/);
});

test("CLI passes a clean tracked tree", () => {
  const repository = createRepository({ "docs/public-guide.md": "Public documentation\n" });

  const result = spawnSync(process.execPath, [scriptPath, "--root", repository], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NF validation passed/);
});

test("pre-commit hook stops before commit creation", () => {
  const repository = createRepository({ "AGENTS.md": "local configuration\n" });

  const result = spawnSync("git", ["-C", repository, "commit", "-m", "test commit"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /NF validation failed for tracked paths/);
  assert.match(`${result.stdout}\n${result.stderr}`, /AGENTS\.md/);

  const head = spawnSync("git", ["-C", repository, "rev-parse", "--verify", "HEAD"]);
  assert.notEqual(head.status, 0);
});

function createRepository(files) {
  const repository = mkdtempSync(join(tmpdir(), "nf-validation-"));
  temporaryDirectories.push(repository);
  execFileSync("git", ["init", "--quiet", repository]);
  copyFileSync(policyPath, join(repository, ".nfignore"));
  mkdirSync(join(repository, ".husky"), { recursive: true });
  copyFileSync(hookPath, join(repository, ".husky/pre-commit"));
  chmodSync(join(repository, ".husky/pre-commit"), 0o755);
  mkdirSync(join(repository, "scripts"), { recursive: true });
  copyFileSync(scriptPath, join(repository, "scripts/check-nf.mjs"));

  for (const [filePath, contents] of Object.entries(files)) {
    const absolutePath = join(repository, filePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }

  execFileSync("git", ["-C", repository, "add", "--force", "."]);
  execFileSync("git", ["-C", repository, "config", "user.name", "NF Test"]);
  execFileSync("git", ["-C", repository, "config", "user.email", "nf-test@example.invalid"]);
  execFileSync("git", ["-C", repository, "config", "core.hooksPath", ".husky"]);
  return repository;
}

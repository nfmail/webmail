#!/usr/bin/env node
/**
 * Companion to textify-messages.mjs: the main codemod cleared
 * useTranslations(namespace) arguments, which silently un-prefixed the
 * dynamic template-literal call sites (t(`error.${e}`) under the old
 * "login" namespace must now resolve the full retained ID
 * "login.error.<e>"). Bake the former namespace into each dynamic template.
 *
 * Idempotent: skips templates that already start with their namespace.
 * Run with --write to apply; default dry-run.
 */
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const SRC_DIRS = ['app', 'components', 'lib', 'stores', 'hooks'];

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      sourceFiles(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// The namespace each hook variable used BEFORE textify — recovered from git
// history is not needed: textify recorded the resolved dynamic prefixes in
// the catalogs (retained dotted IDs). We instead read the ORIGINAL namespace
// from the pre-textify revision passed as argv[2] (a git ref).
import { execFileSync } from 'node:child_process';
const BASE_REF = process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'origin/main';

let patched = 0;
const report = [];

for (const dir of SRC_DIRS) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    let original;
    try {
      original = execFileSync('git', ['show', `${BASE_REF}:${rel}`], { encoding: 'utf8' });
    } catch {
      continue; // new file since base
    }
    if (!original.includes('useTranslations(')) continue;

    // Old namespaces by variable, position-aware, from the BASE revision.
    const assignRegex = /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:["']([^"']*)["'])?\s*\)/g;
    const oldAssignments = [];
    let m;
    while ((m = assignRegex.exec(original)) !== null) {
      oldAssignments.push({ varName: m[1], namespace: m[2] ?? '', index: m.index });
    }
    if (!oldAssignments.some((a) => a.namespace)) continue;

    // Dynamic templates in the OLD file, with their resolved namespace and
    // static prefix; match them in the NEW file by template content.
    const dynRegex = /\b(\w+)(\.raw|\.has)?\(\s*`([^`]*\$\{[^`]*)`/g;
    const targets = [];
    while ((m = dynRegex.exec(original)) !== null) {
      const varName = m[1];
      const ns = oldAssignments
        .filter((a) => a.varName === varName && a.index < m.index)
        .sort((a, b) => b.index - a.index)[0]?.namespace;
      if (!ns) continue;
      targets.push({ varName, suffix: m[2] ?? '', template: m[3], ns });
    }
    if (!targets.length) continue;

    let content = readFileSync(file, 'utf8');
    let fileChanged = false;
    for (const t of targets) {
      const needle = `${t.varName}${t.suffix}(\`${t.template}\``;
      const replacement = `${t.varName}${t.suffix}(\`${t.ns}.${t.template}\``;
      if (t.template.startsWith(`${t.ns}.`)) continue; // already prefixed
      if (!content.includes(needle)) continue; // site changed/moved
      content = content.split(needle).join(replacement);
      fileChanged = true;
      patched++;
      report.push(`${rel}: \`${t.template}\` -> \`${t.ns}.${t.template}\``);
    }
    if (fileChanged && WRITE) writeFileSync(file, content);
  }
}

console.log(`${WRITE ? 'APPLIED' : 'DRY RUN'} — ${patched} dynamic call sites prefixed (base ${BASE_REF})`);
report.forEach((r) => console.log('  ' + r));

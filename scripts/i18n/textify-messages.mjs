#!/usr/bin/env node
/**
 * Phase B codemod (nfw-lingui.7): retire dotted-key message IDs in favor of
 * natural-English msgids (classic gettext).
 *
 *  - Rewrites static call sites: `useTranslations("ns")` + `t("key")` becomes
 *    `useTranslations()` + `t("<English source text>")` (also t.raw/t.has).
 *  - Dynamic template-literal call sites (t(`...${x}`)) are left untouched;
 *    the dotted IDs they can resolve to are retained in the catalogs and
 *    reported for manual conversion to explicit descriptor maps.
 *  - Regenerates locales/{en,hu}/messages.po: msgid = English text (deduped;
 *    Hungarian conflicts are reported for msgctxt follow-up), plus the
 *    retained dotted IDs for dynamic families.
 *
 * Run with --write to apply; default is a dry-run report.
 */
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const SRC_DIRS = ['app', 'components', 'lib', 'stores', 'hooks'];

// --- PO parsing -------------------------------------------------------------

function parsePo(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const map = new Map();
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('msgid "')) { i++; continue; }
    const readStr = () => {
      let value = lines[i].replace(/^msg(id|str) /, '').replace(/^"(.*)"$/, '$1');
      while (i + 1 < lines.length && /^".*"$/.test(lines[i + 1])) {
        value += lines[++i].replace(/^"(.*)"$/, '$1');
      }
      i++;
      return value;
    };
    const id = readStr();
    while (i < lines.length && !lines[i].startsWith('msgstr ')) i++;
    if (i >= lines.length) break;
    const str = readStr();
    if (id !== '') map.set(unescapePo(id), unescapePo(str));
  }
  return map;
}

function unescapePo(s) {
  return s.replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
}

function escapePo(s) {
  return s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
}

/** Escape for a double-quoted JS string literal. */
function escapeJs(s) {
  return s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
}

// --- Source walking ---------------------------------------------------------

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

// --- Codemod ----------------------------------------------------------------

const en = parsePo(join(ROOT, 'locales/en/messages.po'));
const hu = parsePo(join(ROOT, 'locales/hu/messages.po'));

const usedTextIds = new Map(); // en text -> Set<dotted id> (provenance)
const retainedDynamicPrefixes = new Set();
const missing = [];
let rewrittenCalls = 0;
let rewrittenHooks = 0;

for (const dir of SRC_DIRS) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    let content = readFileSync(file, 'utf8');
    const original = content;

    // Position-aware var -> namespace assignments (same proven logic as the
    // translations guard test).
    const assignRegex = /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:["']([^"']*)["'])?\s*\)/g;
    const assignments = [];
    let m;
    while ((m = assignRegex.exec(content)) !== null) {
      assignments.push({ varName: m[1], namespace: m[2] ?? '', index: m.index });
    }
    if (assignments.length === 0) continue;

    const varNames = [...new Set(assignments.map((a) => a.varName))];
    const edits = [];

    for (const varName of varNames) {
      const varAssignments = assignments.filter((a) => a.varName === varName);
      // t("key"), t.raw("key"), t.has("key")
      const callRegex = new RegExp(`\\b${varName}(\\.raw|\\.has)?\\(\\s*(["'])([^"'{}]+)\\2`, 'g');
      while ((m = callRegex.exec(content)) !== null) {
        const key = m[3];
        if (key.startsWith('.')) continue;
        const ns = varAssignments
          .filter((a) => a.index < m.index)
          .sort((a, b) => b.index - a.index)[0]?.namespace;
        if (ns === undefined) continue;
        const fullId = ns ? `${ns}.${key}` : key;
        const text = en.get(fullId);
        if (text === undefined) {
          missing.push(`${relative(ROOT, file)}: ${fullId}`);
          continue;
        }
        const set = usedTextIds.get(text) ?? new Set();
        set.add(fullId);
        usedTextIds.set(text, set);
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          replacement: `${varName}${m[1] ?? ''}("${escapeJs(text)}"`,
        });
        rewrittenCalls++;
      }

      // Dynamic template-literal calls: record the resolved prefix to retain.
      const dynRegex = new RegExp(`\\b${varName}(\\.raw|\\.has)?\\(\\s*\`([^\`]*?)\\$\\{`, 'g');
      while ((m = dynRegex.exec(content)) !== null) {
        const ns = varAssignments
          .filter((a) => a.index < m.index)
          .sort((a, b) => b.index - a.index)[0]?.namespace;
        if (ns === undefined) continue;
        const prefix = ns ? `${ns}.${m[2]}` : m[2];
        retainedDynamicPrefixes.add(prefix);
      }
    }

    // Apply call edits back-to-front, then clear hook namespaces.
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) {
      content = content.slice(0, e.start) + e.replacement + content.slice(e.end);
    }
    const afterHooks = content.replace(
      /useTranslations\(\s*["'][^"']*["']\s*\)/g,
      () => { rewrittenHooks++; return 'useTranslations()'; },
    );
    content = afterHooks;

    if (content !== original && WRITE) writeFileSync(file, content);
  }
}

// --- Catalog regeneration ---------------------------------------------------

const retainedIds = [...en.keys()].filter((id) =>
  [...retainedDynamicPrefixes].some((p) => id.startsWith(p)),
);

const huConflicts = [];
const entries = []; // { msgid, en, hu }
for (const [text, ids] of usedTextIds) {
  const huTexts = new Set([...ids].map((id) => hu.get(id)).filter(Boolean));
  if (huTexts.size > 1) huConflicts.push({ text, ids: [...ids], huTexts: [...huTexts] });
  entries.push({ msgid: text, hu: [...huTexts][0] ?? '' });
}
for (const id of retainedIds) {
  entries.push({ msgid: id, hu: hu.get(id) ?? '', retainedKey: true, en: en.get(id) });
}

function writePo(locale, getStr) {
  const header = [
    'msgid ""', 'msgstr ""',
    '"POT-Creation-Date: 2026-07-18 00:00+0000\\n"',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    `"Language: ${locale}\\n"`, '',
  ];
  const body = entries
    .sort((a, b) => a.msgid.localeCompare(b.msgid))
    .map((e) => [
      '#. js-lingui-explicit-id',
      ...(e.retainedKey ? ['#. retained dotted key (dynamic call sites)'] : []),
      `msgid "${escapePo(e.msgid)}"`,
      `msgstr "${escapePo(getStr(e))}"`,
      '',
    ].join('\n'));
  if (WRITE) writeFileSync(join(ROOT, `locales/${locale}/messages.po`), [...header, ...body].join('\n'));
}

writePo('en', (e) => (e.retainedKey ? (e.en ?? '') : e.msgid));
writePo('hu', (e) => e.hu);

// --- Report -----------------------------------------------------------------

console.log(`${WRITE ? 'APPLIED' : 'DRY RUN'}`);
console.log(`rewritten t() calls: ${rewrittenCalls}`);
console.log(`cleared hook namespaces: ${rewrittenHooks}`);
console.log(`unique text msgids: ${usedTextIds.size}`);
console.log(`retained dynamic prefixes: ${retainedDynamicPrefixes.size}`);
[...retainedDynamicPrefixes].sort().forEach((p) => console.log(`  - ${p}* (${retainedIds.filter((i) => i.startsWith(p)).length} ids)`));
console.log(`hu translation conflicts (need msgctxt/manual pick): ${huConflicts.length}`);
huConflicts.slice(0, 20).forEach((c) => console.log(`  - "${c.text}" <= ${c.ids.join(', ')}`));
console.log(`missing en texts for used keys: ${missing.length}`);
missing.slice(0, 20).forEach((x) => console.log(`  - ${x}`));

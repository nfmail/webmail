#!/usr/bin/env node
/**
 * Second textify pass: convert the t("short_key") call sites the main codemod
 * could not resolve (t passed into helpers as a parameter, or hooks assigned
 * after the call in file order). For every t()/tCommon() string argument that
 * is not a catalog msgid, resolve the legacy dotted ID using the namespaces
 * the file's hooks had at BASE (plus the catalog root), and replace the
 * literal with the English source text.
 *
 * Run with --write to apply; default dry-run. Ambiguous or unresolvable keys
 * are reported and left untouched.
 */
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const BASE_REF = process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'origin/main';
const SRC_DIRS = ['app', 'components', 'lib', 'stores', 'hooks'];

function parsePo(text) {
  const lines = text.split('\n');
  const map = new Map();
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('msgid "')) { i++; continue; }
    const readStr = () => {
      let v = lines[i].replace(/^msg(id|str) /, '').replace(/^"(.*)"$/, '$1');
      while (i + 1 < lines.length && /^".*"$/.test(lines[i + 1])) v += lines[++i].replace(/^"(.*)"$/, '$1');
      i++;
      return v;
    };
    const id = readStr();
    while (i < lines.length && !lines[i].startsWith('msgstr ')) i++;
    if (i >= lines.length) break;
    const str = readStr();
    if (id !== '') map.set(unesc(id), unesc(str));
  }
  return map;
}
const unesc = (s) => s.replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
const escJs = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t');

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.') || entry === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

const oldEn = parsePo(execFileSync('git', ['show', `${BASE_REF}:locales/en/messages.po`], { encoding: 'utf8' }));
const newIds = new Set(parsePo(readFileSync(join(ROOT, 'locales/en/messages.po'), 'utf8')).keys());
const hu = parsePo(execFileSync('git', ['show', `${BASE_REF}:locales/hu/messages.po`], { encoding: 'utf8' }));

let fixed = 0;
const ambiguous = [];
const unresolved = [];
const newCatalogEntries = new Map(); // en text -> hu text (entries to ensure exist)

for (const dir of SRC_DIRS) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    let content = readFileSync(file, 'utf8');

    // Candidate namespaces from the BASE revision of this file.
    let namespaces = [];
    try {
      const original = execFileSync('git', ['show', `${BASE_REF}:${rel}`], { encoding: 'utf8' });
      namespaces = [...original.matchAll(/(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    } catch { /* new file */ }
    const candidates = [...new Set(namespaces)];

    const edits = [];
    for (const m of content.matchAll(/(?<![.\w$])(?:t|tCommon)(?:\.raw|\.has)?\(\s*(['"])((?:[^'"\\]|\\.)*?)\1/g)) {
      const raw = m[2];
      const key = unesc(raw.replaceAll("\\'", "'"));
      if (!key || key.startsWith('.')) continue;
      if (newIds.has(key)) continue; // already a valid msgid (text or retained)

      const hits = [];
      if (oldEn.has(key)) hits.push(key);
      for (const ns of candidates) {
        const full = `${ns}.${key}`;
        if (oldEn.has(full)) hits.push(full);
      }
      if (hits.length === 0) {
        // t arrived as a prop/param: resolve by unique suffix in the legacy catalog.
        const suffixHits = [...oldEn.keys()].filter((id) => id.endsWith(`.${key}`));
        if (new Set(suffixHits.map((h) => oldEn.get(h))).size === 1) hits.push(suffixHits[0]);
        else if (suffixHits.length) { ambiguous.push(`${rel}: ${key} -> ${suffixHits.join(' | ')}`); continue; }
      }
      const uniqueTexts = new Set(hits.map((h) => oldEn.get(h)));
      if (hits.length === 0) {
        unresolved.push(`${rel}: ${key}`);
        continue;
      }
      if (uniqueTexts.size > 1) {
        ambiguous.push(`${rel}: ${key} -> ${hits.join(' | ')}`);
        continue;
      }
      const fullId = hits[0];
      const text = oldEn.get(fullId);
      const start = m.index + m[0].length - raw.length - 2; // opening quote pos
      edits.push({ start, end: m.index + m[0].length, replacement: `"${escJs(text)}"` });
      newCatalogEntries.set(text, hu.get(fullId) ?? '');
      fixed++;
    }

    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) content = content.slice(0, e.start) + e.replacement + content.slice(e.end);
    if (edits.length && WRITE) writeFileSync(file, content);
  }
}

// Ensure the resolved texts exist in both catalogs (append missing entries).
if (WRITE) {
  for (const locale of ['en', 'hu']) {
    const poPath = join(ROOT, `locales/${locale}/messages.po`);
    const existing = new Set(parsePo(readFileSync(poPath, 'utf8')).keys());
    const esc = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
    let appended = '';
    for (const [text, huText] of newCatalogEntries) {
      if (existing.has(text)) continue;
      appended += `#. js-lingui-explicit-id\nmsgid "${esc(text)}"\nmsgstr "${esc(locale === 'en' ? text : huText)}"\n\n`;
    }
    if (appended) writeFileSync(poPath, readFileSync(poPath, 'utf8') + '\n' + appended);
  }
}

console.log(`${WRITE ? 'APPLIED' : 'DRY RUN'} — ${fixed} call sites converted to English text`);
console.log(`catalog entries ensured: ${newCatalogEntries.size}`);
console.log(`ambiguous (untouched): ${ambiguous.length}`);
ambiguous.forEach((a) => console.log('  AMBIG ' + a));
console.log(`unresolved (untouched): ${unresolved.length}`);
unresolved.forEach((u) => console.log('  MISS ' + u));

// @vitest-environment node
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Guards for the Lingui .po catalogs (locales/<locale>/messages.po):
 *
 *  1. Catalog parity — en (source) and every translation catalog cover the
 *     same explicit-ID set.
 *  2. Missing-key scan — every static `t("key")` call site in the source tree
 *     (resolved through its `useTranslations("<ns>")` namespace) exists in
 *     the en catalog. Dynamic template-literal keys are out of scope here;
 *     they fall back to the raw ID at runtime and are exercised by their own
 *     component tests.
 */

const rootDir = path.resolve(__dirname, '../..');
const localesDir = path.join(rootDir, 'locales');
const referenceLocale = 'en';

/** Parse the msgid set from a gettext .po file (handles multi-line strings). */
function loadCatalogIds(locale: string): Set<string> {
  const filePath = path.join(localesDir, locale, 'messages.po');
  const content = fs.readFileSync(filePath, 'utf-8');
  const ids = new Set<string>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^msgid "(.*)"$/);
    if (!match) continue;
    let id = match[1];
    // Multi-line msgid: subsequent bare string lines continue the value.
    while (i + 1 < lines.length && /^"(.*)"$/.test(lines[i + 1])) {
      id += lines[++i].slice(1, -1);
    }
    const unescaped = id
      .replaceAll('\\n', '\n')
      .replaceAll('\\t', '\t')
      .replaceAll('\\"', '"')
      .replaceAll('\\\\', '\\');
    if (unescaped !== '') ids.add(unescaped);
  }
  return ids;
}

// Collect source files recursively
function getSourceFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      results.push(...getSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract translation keys from source, respecting which variable maps to which namespace.
 * Handles multiple useTranslations calls per file (even reusing the same variable name
 * in different functions) by finding, for each t("key") call, the nearest preceding
 * useTranslations assignment to that variable.
 */
function extractUsedKeys(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const keys: string[] = [];

  // Collect all variable→namespace assignments with their positions. The
  // namespace argument is optional (text-msgid call sites use bare
  // useTranslations()).
  const assignRegex = /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:["']([^"']*)["'])?\s*\)/g;
  const assignments: { varName: string; namespace: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = assignRegex.exec(content)) !== null) {
    assignments.push({ varName: m[1], namespace: m[2] ?? '', index: m.index });
  }

  if (assignments.length === 0) return keys;

  // Get unique variable names
  const varNames = [...new Set(assignments.map((a) => a.varName))];

  // For each variable, find its t("key") calls and resolve namespace by position
  for (const varName of varNames) {
    const varAssignments = assignments.filter((a) => a.varName === varName);
    // Double-quoted literal with escape support: message texts may contain
    // apostrophes, ICU braces, and escaped quotes/newlines.
    const callRegex = new RegExp(`\\b${varName}(?:\\.raw|\\.has)?\\(\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g');
    while ((m = callRegex.exec(content)) !== null) {
      const key = m[1]
        .replaceAll('\\n', '\n')
        .replaceAll('\\t', '\t')
        .replaceAll('\\"', '"')
        .replaceAll('\\\\', '\\');
      if (key.startsWith('.') || key === '') continue;
      // Find the nearest preceding assignment for this variable
      const ns = varAssignments
        .filter((a) => a.index < m!.index)
        .sort((a, b) => b.index - a.index)[0]?.namespace;
      if (ns === undefined) continue;
      keys.push(ns ? `${ns}.${key}` : key);
    }
  }

  return [...new Set(keys)];
}

function collectUsedKeysByFile(files: string[]): Map<string, string[]> {
  const keyToFiles = new Map<string, string[]>();

  for (const filePath of files) {
    for (const key of extractUsedKeys(filePath)) {
      const existing = keyToFiles.get(key) ?? [];
      if (!existing.includes(filePath)) {
        existing.push(filePath);
        keyToFiles.set(key, existing);
      }
    }
  }

  return keyToFiles;
}

const locales = fs
  .readdirSync(localesDir)
  .filter((entry) => fs.statSync(path.join(localesDir, entry)).isDirectory());

const referenceIds = loadCatalogIds(referenceLocale);

describe('translation catalogs', () => {
  it('reference locale (en) should have message IDs', () => {
    expect(referenceIds.size).toBeGreaterThan(0);
  });

  const otherLocales = locales.filter((l) => l !== referenceLocale);

  it.each(otherLocales)('%s should cover every ID from en', (locale) => {
    const localeIds = loadCatalogIds(locale);
    const missing = [...referenceIds].filter((id) => !localeIds.has(id));

    expect(missing, `Missing ${missing.length} IDs in "${locale}":\n${missing.join('\n')}`).toEqual([]);
  });

  it.each(otherLocales)('%s should not have extra IDs absent from en', (locale) => {
    const extra = [...loadCatalogIds(locale)].filter((id) => !referenceIds.has(id));

    expect(extra, `Extra ${extra.length} IDs in "${locale}":\n${extra.join('\n')}`).toEqual([]);
  });
});

describe('translations used in source code exist in the en catalog', () => {
  const srcDirs = ['components', 'app', 'hooks', 'lib', 'stores', 'contexts'].map((d) => path.join(rootDir, d));
  const allFiles = srcDirs.flatMap((d) => getSourceFiles(d));
  const usedKeysByFile = collectUsedKeysByFile(allFiles);
  const usedKeys = [...usedKeysByFile.keys()].sort();

  it('all translation keys referenced in source should exist in the en catalog', () => {
    const missing = usedKeys.filter((key) => !referenceIds.has(key));
    const details = missing.map((key) => {
      const relativeFiles = (usedKeysByFile.get(key) ?? [])
        .map((filePath) => path.relative(rootDir, filePath))
        .sort();

      return `${key}\n  used in:\n  - ${relativeFiles.join('\n  - ')}`;
    });

    expect(
      missing,
      `${missing.length} translation key(s) used in source code but missing from the en catalog:\n${details.join('\n')}`,
    ).toEqual([]);
  });
});

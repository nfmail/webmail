#!/usr/bin/env node
/**
 * One-shot converter: legacy locales/<locale>/common.json (nested next-intl
 * message JSON) -> locales/<locale>/messages.po (Lingui explicit-ID catalog).
 *
 * The dotted JSON path becomes the explicit message ID (msgid); the JSON value
 * becomes the translation (msgstr). ICU MessageFormat strings transfer
 * verbatim — both systems speak the same dialect. Entries missing from a
 * target locale are emitted with an empty msgstr so `lingui compile` applies
 * the English fallback (see fallbackLocales in lingui.config.ts).
 *
 * Usage: node scripts/i18n/convert-json-to-po.mjs
 */
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_LOCALE = 'en';
const LOCALES = ['en', 'hu'];

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.set(path, String(value));
    }
  }
  return out;
}

function poEscape(s) {
  return s
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t');
}

function poEntry(id, translation) {
  return [
    '#. js-lingui-explicit-id',
    `msgid "${poEscape(id)}"`,
    `msgstr "${poEscape(translation)}"`,
    '',
  ].join('\n');
}

function poHeader(locale) {
  return [
    'msgid ""',
    'msgstr ""',
    '"POT-Creation-Date: 2026-07-18 00:00+0000\\n"',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    `"Language: ${locale}\\n"`,
    '',
  ].join('\n');
}

const source = flatten(
  JSON.parse(readFileSync(join(root, 'locales', SOURCE_LOCALE, 'common.json'), 'utf8')),
);

for (const locale of LOCALES) {
  const messages =
    locale === SOURCE_LOCALE
      ? source
      : flatten(JSON.parse(readFileSync(join(root, 'locales', locale, 'common.json'), 'utf8')));

  const chunks = [poHeader(locale)];
  let translated = 0;
  // Iterate the SOURCE key set so every catalog covers every known ID and
  // stray keys that only exist in a target locale are dropped.
  for (const [id, sourceText] of source) {
    const value = locale === SOURCE_LOCALE ? sourceText : messages.get(id);
    if (value !== undefined) translated += 1;
    chunks.push(poEntry(id, value ?? ''));
  }

  const outPath = join(root, 'locales', locale, 'messages.po');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, chunks.join('\n'));
  console.log(`${locale}: ${source.size} ids, ${translated} translated -> ${outPath}`);
}

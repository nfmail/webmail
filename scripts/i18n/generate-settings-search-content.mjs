#!/usr/bin/env node
/**
 * One-shot generator (Phase B of the message-ID migration): rebuild the
 * settings search content from the legacy dotted-key catalog structure.
 *
 * The settings page used to derive its per-tab search haystack + sub-results
 * by walking the nested translation tree (useMessages + tabSearchPaths).
 * With natural-text msgids there is no tree anymore, so this script resolves
 * the old dotted subtrees ONE time (from the pre-migration en catalog in git
 * history) and emits a static module of message IDs per tab — text msgids for
 * migrated entries, dotted msgids for retained dynamic families — which the
 * page translates through t() at render time.
 *
 * Usage: node scripts/i18n/generate-settings-search-content.mjs \
 *          <old-en.po> <new-en.po> > components/settings/settings-search-content.ts
 */
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';

const [oldPoPath, newPoPath] = process.argv.slice(2);

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
    if (id !== '') {
      map.set(unesc(id), unesc(str));
    }
  }
  return map;
}
const unesc = (s) => s.replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\"', '"').replaceAll('\\\\', '\\');

const oldEn = parsePo(oldPoPath); // dotted id -> en text
const newIds = new Set(parsePo(newPoPath).keys()); // msgids now (texts + retained dotted)

// Keep in sync with tabSearchPaths in app/(main)/[locale]/settings/page.tsx
// at the time of generation.
const tabSearchPaths = {
  account: ['settings.account.name_label','settings.account.username_label','settings.account.account_type_label','settings.account.auth_method_label','settings.account.email','settings.account.server','settings.account.storage','settings.account.accounts'],
  language: ['settings.appearance.language'],
  notifications: ['settings.notifications'],
  appearance: ['settings.appearance.theme','settings.appearance.font_size','settings.appearance.list_density','settings.appearance.animations'],
  layout: ['settings.appearance.toolbar_position','settings.appearance.toolbar_labels','settings.appearance.hide_account_switcher','settings.appearance.show_rail_account_list','settings.appearance.unified_mailbox','settings.appearance.all_mail','settings.appearance.colorful_sidebar_icons','settings.email_behavior.mail_layout'],
  reading: ['settings.email_behavior.mark_read','settings.email_behavior.archive_mode','settings.email_behavior.delete_action','settings.email_behavior.attachment_click_action','settings.email_behavior.attachment_image_previews','settings.email_behavior.attachment_position','settings.email_behavior.disable_threading','settings.email_behavior.emails_per_page','settings.email_behavior.hide_inline_image_attachments','settings.email_behavior.hover_actions','settings.email_behavior.permanently_delete_junk','settings.email_behavior.show_preview'],
  composing: ['settings.email_behavior.attachment_reminder','settings.email_behavior.auto_select_reply_identity','settings.email_behavior.plain_text_mode','settings.email_behavior.default_mail_program','settings.email_behavior.signature_position','settings.email_behavior.sub_address_delimiter'],
  downloads: ['settings.downloads'],
  identities: ['settings.identities'],
  vacation: ['settings.vacation'],
  filters: ['settings.filters'],
  templates: ['settings.templates'],
  folders: ['settings.folders'],
  keywords: ['settings.keywords'],
  security: ['settings.security'],
  content_senders: ['settings.email_behavior.always_light_mode','settings.email_behavior.external_content','settings.email_behavior.trusted_senders'],
  calendar: ['calendar.settings', 'calendar.management'],
  contacts: ['settings.contacts', 'contacts'],
  files: ['settings.files'],
  protocol_handlers: ['protocol_handlers'],
  sidebar_apps: ['settings.sidebar_apps', 'sidebar_apps'],
  about_data: ['settings.advanced'],
  themes: [],
  plugins: [],
  debug: ['settings.advanced'],
};

// Rebuild the nested tree from the dotted ids.
const tree = {};
for (const [id, text] of oldEn) {
  const parts = id.split('.');
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node[parts[i]] ??= {};
  }
  node[parts[parts.length - 1]] = { __id: id, __text: text };
}

const getByPath = (obj, path) =>
  path.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), obj);

/** The msgid to use at runtime for a legacy dotted id. */
function msgidFor(leaf) {
  return newIds.has(leaf.__id) ? leaf.__id : leaf.__text;
}

function collect(node, texts, subs) {
  if (!node || typeof node !== 'object') return;
  if (node.__id) {
    texts.push(msgidFor(node));
    return;
  }
  const label = node.label ?? node.title;
  if (label?.__id) {
    subs.push({
      label: msgidFor(label),
      ...(node.description?.__id ? { description: msgidFor(node.description) } : {}),
    });
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('__')) continue;
    collect(value, texts, subs);
  }
}

const out = {};
for (const [tab, paths] of Object.entries(tabSearchPaths)) {
  const texts = [];
  const subs = [];
  for (const p of paths) collect(getByPath(tree, p), texts, subs);
  out[tab] = { texts: [...new Set(texts)], subs };
}

const esc = (s) => JSON.stringify(s);
console.log('// Generated by scripts/i18n/generate-settings-search-content.mjs —');
console.log('// per-tab searchable settings content as message IDs (translate via t()).');
console.log('// Regenerate or hand-extend when settings surfaces gain new entries.');
console.log('');
console.log('export interface SettingsSearchSub {');
console.log('  label: string;');
console.log('  description?: string;');
console.log('}');
console.log('');
console.log('export interface SettingsSearchContent {');
console.log('  texts: string[];');
console.log('  subs: SettingsSearchSub[];');
console.log('}');
console.log('');
console.log('export const SETTINGS_SEARCH_CONTENT: Record<string, SettingsSearchContent> = {');
for (const [tab, { texts, subs }] of Object.entries(out)) {
  console.log(`  ${tab}: {`);
  console.log(`    texts: [${texts.map(esc).join(', ')}],`);
  console.log(`    subs: [`);
  for (const s of subs) {
    console.log(`      { label: ${esc(s.label)}${s.description ? `, description: ${esc(s.description)}` : ''} },`);
  }
  console.log('    ],');
  console.log('  },');
}
console.log('};');

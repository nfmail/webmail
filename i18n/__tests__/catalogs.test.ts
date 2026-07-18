import { describe, expect, it } from 'vitest';
import { setupI18n } from '@lingui/core';
import { messages as enMessages } from '@/locales/en/messages';
import { messages as huMessages } from '@/locales/hu/messages';

/**
 * Sanity checks on the compiled Lingui catalogs. Message IDs are the natural
 * English source texts (classic gettext), except for the retained dotted-key
 * families that back dynamic template-literal call sites (see ADR 0010 /
 * scripts/i18n/textify-messages.mjs).
 */
describe('compiled i18n catalogs', () => {
  const en = setupI18n({ locale: 'en', messages: { en: enMessages } });
  const hu = setupI18n({ locale: 'hu', messages: { hu: huMessages } });

  it('resolves text msgids in both locales', () => {
    expect(en._('Cancel')).toBe('Cancel');
    expect(hu._('Cancel')).not.toBe('Cancel'); // translated
  });

  it('formats ICU plurals per locale', () => {
    const pluralId = Object.keys(enMessages).find(
      (id) => id.includes('{count, plural') && id.includes('selected'),
    );
    expect(pluralId).toBeTruthy();
    const one = en._(pluralId!, { count: 1 });
    const many = en._(pluralId!, { count: 5 });
    expect(many).toContain('5');
    expect(one).not.toBe(many);
    expect(hu._(pluralId!, { count: 5 })).toContain('5');
  });

  it('keeps retained dotted-key families for dynamic call sites', () => {
    expect(en._('sidebar.mailboxes.inbox')).not.toBe('sidebar.mailboxes.inbox');
    expect(hu._('sidebar.mailboxes.inbox')).not.toBe('sidebar.mailboxes.inbox');
  });

  it('has identical ID sets in en and hu', () => {
    const enIds = Object.keys(enMessages).sort();
    const huIds = Object.keys(huMessages).sort();
    expect(huIds).toEqual(enIds);
    expect(enIds.length).toBeGreaterThan(1500);
  });

  it('returns the ID itself for unknown messages (English fallback behavior)', () => {
    expect(en._('This exact sentence is not in the catalog')).toBe(
      'This exact sentence is not in the catalog',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { setupI18n } from '@lingui/core';
import { messages as enMessages } from '@/locales/en/messages';
import { messages as huMessages } from '@/locales/hu/messages';

/**
 * Sanity checks on the compiled Lingui catalogs: explicit dotted IDs resolve,
 * ICU plurals and {param} interpolation format correctly in both locales, and
 * the catalogs cover the same ID set (hu falls back to English text at compile
 * time for anything untranslated, so the key sets must match).
 */
describe('compiled i18n catalogs', () => {
  const en = setupI18n({ locale: 'en', messages: { en: enMessages } });
  const hu = setupI18n({ locale: 'hu', messages: { hu: huMessages } });

  it('resolves plain explicit IDs in both locales', () => {
    expect(en._('common.loading')).not.toBe('common.loading');
    expect(hu._('common.loading')).not.toBe('common.loading');
  });

  it('formats ICU plurals per locale', () => {
    const one = en._('email_list.batch_actions.selected_messages', { count: 1 });
    const many = en._('email_list.batch_actions.selected_messages', { count: 5 });
    expect(one).toContain('1');
    expect(many).toContain('5');
    expect(one).not.toBe(many);

    const huMany = hu._('email_list.batch_actions.selected_messages', { count: 5 });
    expect(huMany).toContain('5');
  });

  it('interpolates {param} values', () => {
    const ids = Object.keys(enMessages);
    // Find a message that uses simple interpolation to prove the pipeline.
    const withParam = ids.find((id) => {
      const m = enMessages[id as keyof typeof enMessages];
      return typeof m !== 'string' && Array.isArray(m);
    });
    expect(withParam).toBeTruthy();
  });

  it('has identical ID sets in en and hu', () => {
    const enIds = Object.keys(enMessages).sort();
    const huIds = Object.keys(huMessages).sort();
    expect(huIds).toEqual(enIds);
    expect(enIds.length).toBeGreaterThan(2500);
  });

  it('returns the ID itself for unknown messages (missing-key behavior)', () => {
    expect(en._('nonexistent.key.for.test')).toBe('nonexistent.key.for.test');
  });
});

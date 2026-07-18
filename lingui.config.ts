import type { LinguiConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';

/**
 * Lingui i18n configuration.
 *
 * NF Mail uses the explicit-ID runtime architecture: message IDs are the
 * dotted keys inherited from the JSON era (e.g. "calendar.title"), catalogs
 * are gettext .po files, and compilation is a CLI step (`npm run i18n:compile`)
 * — no macro/SWC plugin, so the bundler never sees a Lingui transform.
 *
 * English is the source locale; untranslated entries in other catalogs fall
 * back to the English text at compile time via `fallbackLocales`.
 */
const config: LinguiConfig = {
  locales: ['en', 'hu'],
  sourceLocale: 'en',
  fallbackLocales: {
    default: 'en',
  },
  format: formatter({ lineNumbers: false }),
  catalogs: [
    {
      path: '<rootDir>/locales/{locale}/messages',
      include: ['app', 'components', 'lib', 'stores', 'hooks', 'i18n'],
    },
  ],
  compileNamespace: 'ts',
};

export default config;

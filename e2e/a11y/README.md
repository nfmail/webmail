# Accessibility (a11y) Scans

Automated [axe-core](https://github.com/dequelabs/axe-core) accessibility audits
of NF Mail's key surfaces. The suite catches serious/critical WCAG issues on
every PR so accessibility regressions are caught before merge — a companion to
the visual-regression baseline.

## What it covers

Each surface gets one axe-core scan:

| Surface | What is scanned |
| --- | --- |
| `login` | Login page (mock dev-login card) |
| `mail-list` | Mailbox with the message list |
| `thread-view` | An opened conversation |
| `composer` | The new-message composer (TipTap body excluded — see below) |
| `settings-main` | Settings landing |
| `settings-subpage` | The Account settings section |
| `calendar` | Month view |
| `contacts` | Address book |
| `dialog-keyboard-shortcuts` | Open Dialog: the keyboard-shortcuts help modal (opened with `?`) |
| `context-menu-email` | Open context menu: right-click on a mail row (auto-skips if it does not open) |

Themes: the scan runs in both light and dark, one Playwright project per theme
(`desktop-light`, `desktop-dark`), because colour-contrast findings are
theme-dependent. A single desktop viewport (1280x800) is used — structural a11y
(roles, names, landmarks) does not vary by viewport, and the visual suite owns
the full viewport matrix.

## How it runs

Identical mock-backend approach to the visual suite: the app is driven against
its **built-in mock JMAP backend** (`DEV_MOCK_JMAP=true`,
`JMAP_SERVER_URL=/api/dev-jmap`). No real mail server is needed — the mock
serves deterministic dummy data and the login page shows a one-click **Sign in**
dev-login button.

`playwright.a11y.config.ts` boots the web server itself with the right env, so a
plain `npm run test:a11y` is self-contained. The login and navigation helpers
are reused verbatim from `../visual/helpers.ts` so both suites reach each surface
the same way. Navigation between surfaces is client-side (the dev login does not
enable "remember me", so a hard reload would drop the session).

## Failure policy

axe assigns each violation an **impact**: `minor`, `moderate`, `serious`, or
`critical`.

- **serious / critical → FAIL.** These materially block assistive-technology
  users, so any such violation fails the test (and CI).
- **moderate / minor → report only.** Attached to the report as an
  `a11y-<surface>.json` artifact and logged to the console, but they do **not**
  fail the run. This gives visibility into the long tail without blocking merges
  on low-severity findings.

The full breakdown (both failing and report-only) is attached on every run —
including passing runs — so the report always shows the current a11y posture.

## Exclusions (third-party regions)

Some regions are owned by third-party libraries whose internal DOM we do not
control and cannot fix from this repo. They are excluded from every scan
(`THIRD_PARTY_EXCLUDES` in `axe-helper.ts`):

- **`.tiptap` / `.ProseMirror`** — the [TipTap](https://tiptap.dev/) rich-text
  editor content area (the composer body). Its `contenteditable` DOM is rendered
  and managed by TipTap/ProseMirror; accessibility of the editor surface itself
  is upstream's responsibility. The composer **chrome** around the editor (the
  dialog, toolbar, recipient fields, send controls) is still fully scanned.

Per-surface additional excludes can be passed to `checkA11y(...)` via its
`exclude` option; none are currently needed beyond the shared list.

## Commands

```bash
# Run the full scan (both themes). Boots its own server.
npm run test:a11y

# Target a subset while iterating:
npm run test:a11y -- --project=desktop-light
npm run test:a11y -- --project=desktop-light -g mail-list
```

To point the suite at an already-running server instead of letting Playwright
start one:

```bash
PLAYWRIGHT_A11Y_BASE_URL=http://localhost:3100 npm run test:a11y
# (reuseExistingServer is on when CI is unset)
```

## CI

The `a11y-scan` job in `.github/workflows/ci.yml` installs Chromium and runs
`npm run test:a11y`. Like the visual-regression job, the config boots its own
mock-backed dev server, so no separate build or mail server is required. The
`test-results/` directory (axe attachments + traces for any failing surface) is
uploaded as the `a11y-scan-results` artifact for triage.

## Files

- `playwright.a11y.config.ts` — projects (light/dark), web server, mock env
- `e2e/a11y/surfaces.a11y.spec.ts` — the surfaces and interaction states
- `e2e/a11y/axe-helper.ts` — axe runner, impact filtering, exclusions, reporting
- `e2e/a11y/README.md` — this file

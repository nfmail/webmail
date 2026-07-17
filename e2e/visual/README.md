# Visual Regression Baseline

Pre-migration screenshot baseline for NF Mail's key surfaces. It exists to give
the **shadcn/ui migration** a known-good visual reference: every migration PR is
diffed against these snapshots so unintended layout, spacing, or colour changes
are caught before merge.

## What it covers

Surfaces (one screenshot each):

- `login` — login page (mock dev-login card)
- `mail-list` — mailbox with the message list
- `thread-view` — an opened conversation
- `composer` — the new-message composer
- `settings-main` — settings landing
- `settings-subpage` — the Account settings section
- `calendar` — month view
- `contacts` — address book
- `files` — **skipped by default** (see _Known gaps_)

Matrix: 3 viewports x 2 themes, one Playwright project per combination:

| Project | Viewport | Theme |
| --- | --- | --- |
| `mobile-light` / `mobile-dark` | 320 x 720 | light / dark |
| `tablet-light` / `tablet-dark` | 768 x 1024 | light / dark |
| `desktop-light` / `desktop-dark` | 1280 x 800 | light / dark |

Snapshots are stored flat and platform-tagged in
`e2e/visual/__screenshots__/`, e.g. `mail-list-desktop-light-linux.png`.
They are checked into the repo. Snapshots are OS-dependent — generate and
refresh them on the same platform CI uses (Linux).

## How it runs

The suite drives the app against its **built-in mock JMAP backend**
(`DEV_MOCK_JMAP=true`, `JMAP_SERVER_URL=/api/dev-jmap`). No real mail server is
needed: the mock serves deterministic dummy mail/calendar/contact data and the
login page shows a one-click **Sign in** dev-login button.

`playwright.visual.config.ts` starts the web server itself with the right env,
so a plain `npm run test:visual` is self-contained. Navigation between surfaces
is client-side (clicking the nav rail / bottom tab bar) because the dev login
does not enable "remember me", so a hard page reload would drop the session.

Determinism aids:

- `reducedMotion: 'reduce'` + `animations: 'disabled'`
- injected CSS disables transitions/animations, hides the text caret, and hides
  the Next.js dev overlay
- the first-run welcome tour is dismissed before the mail screenshot
- dynamic regions are masked (see below)

### Masking

- **`.tabular-nums`** — relative mail timestamps and folder/label/unread
  counters. The mock generates these relative to "now", so they drift.
- **calendar grid** — anchored to the current month/day; the body is masked and
  only the surrounding chrome (toolbar, sidebar, header) is compared.
- **login self-update notice** — depends on a network check.

`maxDiffPixelRatio` is `0.02` to absorb sub-pixel font-rendering noise.

## Commands

```bash
# Run the suite (compares against committed baselines). Boots its own server.
npm run test:visual

# Update / (re)generate baselines — ONLY with reviewed intent (see below).
npm run test:visual:update

# Target a subset while iterating:
npm run test:visual -- --project=desktop-light
npm run test:visual -- --project=desktop-light -g mail-list
```

To point the suite at an already-running server instead of letting Playwright
start one:

```bash
PLAYWRIGHT_VISUAL_BASE_URL=http://localhost:3100 npm run test:visual
# (reuseExistingServer is on when CI is unset)
```

## Update procedure (review rule)

Baselines are a **source of truth**, not disposable output.

1. Do **not** run `test:visual:update` to make a red run pass by reflex.
2. When a migration PR legitimately changes a surface, run
   `npm run test:visual:update`, then **eyeball every changed PNG** in the diff.
3. Commit the regenerated snapshots **in the same PR** as the change that caused
   them, and call out in the PR description which surfaces changed and why.
4. Reviewers must inspect the snapshot diff as part of review — an approved PR
   means the visual change was seen and intended.

## Known gaps / blocked surfaces

- **Files** — the mock JMAP backend advertises no WebDAV capability, so the
  Files nav entry is hidden (`supportsFiles` is false) and the surface is not
  reachable. The `files` test `skip()`s automatically. To baseline it, run the
  suite against a backend where WebDAV/files is enabled, then
  `npm run test:visual:update`.
- **Calendar / contacts data** — dates and mock records are time-relative;
  the calendar body is masked. If mock data changes materially, regenerate.

## Files

- `playwright.visual.config.ts` — projects, web server, snapshot path template
- `e2e/visual/surfaces.visual.spec.ts` — the surfaces and their interactions
- `e2e/visual/helpers.ts` — login, navigation, stability CSS, masking
- `e2e/visual/__screenshots__/` — committed baselines

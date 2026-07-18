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
- **pinned clock**: the browser clock (`page.clock.setFixedTime`, see
  `FIXED_NOW` in `helpers.ts`) and the mock backend's fixture dates
  (`DEV_JMAP_MOCK_NOW` in `playwright.visual.config.ts`) are both pinned to the
  same instant, and both the server (`TZ`) and browser (`timezoneId`) run in
  UTC. Date-anchored surfaces — the calendar grid, "today" markers, relative
  timestamps — therefore render identically on every run and stay under test
  unmasked. Keep the two constants in sync if you ever move the pinned date.
- dynamic regions are masked (see below)

### Masking

- **`.tabular-nums`** — relative mail timestamps and folder/label/unread
  counters (deterministic with the pinned clock, but kept masked as a
  belt-and-braces measure for runs against a non-mock backend).
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

## Continuous integration

A **Visual regression** job in `.github/workflows/ci.yml` runs this suite on
every pull request and on pushes to `main`. It mirrors the Browser smoke job's
setup (Node from `.nvmrc`, `npm ci`, `npx playwright install --with-deps
chromium`) and then runs `npm run test:visual`. The config boots its own dev
server against the mock JMAP backend, so the job needs no separate build or
mail server.

- **Runner platform:** `ubuntu-latest`. Snapshots are OS-dependent and the
  committed baselines are Linux-rendered, so the runner matches — do not
  regenerate baselines on macOS or Windows and expect them to pass here.
- **On failure:** the job uploads `test-results/` (actual / expected / diff
  PNGs plus Playwright traces) as the `visual-regression-results` artifact, so
  a red run can be triaged from the Actions run without reproducing locally.
- **Required vs. optional:** the job is named "Visual regression" so it can be
  marked non-required in branch-protection while the shadcn migration churns
  baselines. Whether it actually blocks merges is governed by the repository
  ruleset / branch-protection config, which is outside this file's control. If
  the repo treats every job as required, either mark this one optional in the
  ruleset or keep baselines green per the update procedure below.

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

- **Files** — the mock JMAP backend advertises no FileNode/WebDAV capability,
  so the Files nav entry is hidden (`supportsFiles` is false) and the surface is
  not reachable. The `files` test `skip()`s automatically.

  **What makes it reachable (investigated).** `JMAPClient.supportsFiles()`
  (`lib/jmap/client.ts`) gates on the **per-account** capability: for a personal
  account it returns true only when that account's `accountCapabilities`
  advertises `urn:ietf:params:jmap:filenode`. So the minimal flag is to add
  `urn:ietf:params:jmap:filenode` to the mock session in
  `app/api/dev-jmap/[...path]/route.ts` — to the top-level `capabilities`, the
  account's `accountCapabilities`, and `primaryAccounts` — and to add a
  `FileNode/get` handler (the browse path calls `FileNode/get` with `ids: null`
  and builds the tree from `parentId`; folders are nodes with `blobId: null`).
  A small deterministic fixture (fixed timestamps so nothing drifts) renders a
  real listing. That change is self-contained to the mock and produces a clean
  files surface across all six viewport/theme projects.

  **Why it is NOT enabled here (important).** `supportsFiles()` is
  session-global, so advertising the capability makes the **Files nav entry
  appear on every authenticated surface**, not just `/files`. That shifts the
  nav rail (desktop) and the bottom tab bar from four to five entries (mobile /
  tablet), which changes the layout of the already-committed `mail-list`,
  `thread-view`, `composer`, `settings-*`, `calendar`, and `contacts`
  baselines. Enabling files therefore requires regenerating **all** authenticated
  baselines in the same change — it cannot be done in isolation. Because the
  baselines are frozen during the shadcn migration (refreshed at branch end,
  not piecemeal), the capability is intentionally left disabled for now.

  **To baseline Files** (do this together with a full baseline refresh, e.g. at
  branch end): add the mock capability + `FileNode/get` handler described above
  (or point the suite at a real backend where files is enabled), then run
  `npm run test:visual:update` and review the diffs for **every** authenticated
  surface, since the nav gains a Files entry everywhere.

  When baselining the mobile/tablet Files shot specifically, note that the page
  renders two `a[href="/files"]` anchors (desktop rail + mobile bottom bar); the
  shared `navigate()` helper clicks `.first()`, which is the inactive rail
  anchor on small viewports. Click the `:visible` anchor and wait for a stable
  row (e.g. the first folder) before shooting, or the shot captures the mail
  list instead.
- **Calendar / contacts data** — fixture dates are pinned via
  `DEV_JMAP_MOCK_NOW` + the frozen browser clock, so they don't drift between
  runs. If mock data changes materially, regenerate.

## Files

- `playwright.visual.config.ts` — projects, web server, snapshot path template
- `e2e/visual/surfaces.visual.spec.ts` — the surfaces and their interactions
- `e2e/visual/helpers.ts` — login, navigation, stability CSS, masking
- `e2e/visual/__screenshots__/` — committed baselines

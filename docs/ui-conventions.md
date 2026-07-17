# UI Conventions

NF Mail is migrating its interface to [shadcn/ui](https://ui.shadcn.com/) with a
semantic design-token system. These conventions keep the UI consistent across
light and dark themes and make theme changes a single-file edit. They are
enforced in CI by `npm run check:ui`.

## Semantic tokens only

Style with semantic tokens, never raw Tailwind palette colors. Tokens are
defined once in `app/globals.css` and adapt automatically to light and dark
themes.

```tsx
// Do
<div className="bg-primary text-primary-foreground" />
<span className="text-muted-foreground" />
<div className="border border-border bg-card" />

// Avoid — raw palette colors do not follow the theme
<div className="bg-blue-500 text-white" />
<span className="text-gray-500" />
<div className="border border-red-200" />
```

Available token families include the shadcn defaults plus NF extensions:

| Purpose            | Tokens                                                        |
| ------------------ | ------------------------------------------------------------ |
| Surfaces           | `background`, `card`, `popover`, `muted`, `secondary`, `sidebar` |
| Text / foreground  | `foreground`, `muted-foreground`, `*-foreground` pairs       |
| Primary / accent   | `primary`, `accent`, `ring`, `border`, `input`               |
| Destructive        | `destructive`, `destructive-foreground`                      |
| NF status (added)  | `success`, `warning`, `info` (each with a `-foreground` pair) |
| NF states (added)  | `selection`, `selection-foreground`, `unread`                |

Use these as normal Tailwind utilities: `bg-success`, `text-warning`,
`text-info`, `bg-selection`, `text-unread`, and so on. If you need a new color,
add a token to `app/globals.css` (both the light `:root` and `.dark` blocks and
the `@theme inline` mapping) rather than reaching for a palette class.

## Spacing: `gap-*` over `space-*`

Prefer `gap-*` on a flex or grid container instead of `space-x-*` / `space-y-*`.
`gap` composes cleanly with wrapping, RTL, and conditional children, and avoids
the margin side effects of the `space-*` utilities.

```tsx
// Do
<div className="flex items-center gap-2">…</div>
<div className="flex flex-col gap-4">…</div>

// Avoid
<div className="flex items-center space-x-2">…</div>
<div className="flex flex-col space-y-4">…</div>
```

## `components/ui` is vendored source

Files under `components/ui/` are shadcn/ui components vendored into the
repository. They are ours to own and edit, but they originate from the shadcn
CLI. When updating a vendored component, pull upstream changes through the CLI
and review the diff before applying, rather than hand-copying:

```bash
npx shadcn@latest diff <component>   # review upstream changes
npx shadcn@latest add <component>    # apply after review
```

Keep local modifications intentional and minimal so future `--diff` reviews stay
readable.

## The convention check (ratchet)

`npm run check:ui` scans every tracked `.tsx` file under `components/` and `app/`
for the two rules above and compares the results against a baseline in
`scripts/ui-conventions-baseline.json`.

The check is a **ratchet**: the baseline records the known legacy usages so they
do not block CI, but those counts may only shrink. The check fails when:

- a file that was previously clean gains a violation, or
- an existing file's violation count increases above its baseline.

Migrating legacy usages away is always safe. After reducing violations, tighten
the baseline so the gains are locked in:

```bash
npm run check:ui              # verify against the baseline
npm run check:ui -- --update  # regenerate the baseline after improvements
npm run test:ui-check         # run the check's own tests
```

### Justified exceptions

If a specific file genuinely needs a raw palette color or `space-*` utility (for
example, matching a fixed third-party brand color), add an allowlist entry with a
required reason to `scripts/ui-conventions-baseline.json`:

```json
{
  "allowlist": [
    {
      "file": "components/example/embed.tsx",
      "category": "palette",
      "reason": "Third-party widget requires its exact brand color."
    }
  ]
}
```

`category` is `palette` or `space`. Entries without a non-empty `reason` are
rejected. Keep exceptions rare and well justified.

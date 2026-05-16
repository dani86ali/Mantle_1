# Skill: UI Page (Next.js App Router)

Every interactive page under `src/app/estimates/[id]/...` follows the same
shape: client component, fetch in `useEffect`, skeleton while loading,
card-based sections, fixed action bar.

---

## Input / Output contract

- Top of file: `"use client";`
- Read route params with `useParams()`, navigate with `useRouter()`.
- Data comes from `fetch("/api/estimates/[id]/...")` — never call DB / engines
  from the page.
- Map raw API JSON → strongly-typed `PageData` in a local `toPageData(json)`
  helper. UI components see typed rows, not `Record<string, unknown>`.

---

## Rules

1. **Data lifecycle**: `useState<PageData | null>(null)`, `loading`, `error`.
   In `useEffect`, use a `cancelled` flag and `return () => { cancelled = true }`
   to drop late responses on unmount/id change.
2. **Skeleton, not spinner.** Render the same outer chrome (header + cards)
   with `skeleton` divs while `loading` is true. See `CheckpointSkeleton`.
3. **Theme tokens (light theme)** — never hard-code hex:
   - backgrounds: `bg-bg-primary` (white), `bg-bg-card` (#F8F9FC)
   - borders:   `border-[var(--border)]`, hover `border-[var(--border-hover)]`
   - text:      `text-text-primary | text-text-secondary | text-text-tertiary`
   - accent:    `bg-accent`, `hover:bg-accent-hover` for primary actions
   - mono:      `font-mono` for ids, SKUs, prices
4. **Card pattern**: `Card` from `./sections`, collapsible via chevron toggle,
   subtitle for counts (`subtitle={\`${rows.length} items\`}`).
5. **Tables**: sticky header (`sticky top-0`), alternating row backgrounds
   (`bg-bg-card` / `bg-bg-primary`), horizontal scroll wrapper
   (`overflow-x-auto`) for mobile. Use `<table>` semantics, not nested divs.
6. **Action bar**: fixed bottom strip
   `fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)]
    bg-bg-primary/95 backdrop-blur` and offset for the sidebar (`sm:left-56`).
   Primary action `bg-accent text-text-primary`; secondary `border` style;
   destructive `text-destructive hover:bg-destructive-muted`. Pad main with
   `pb-28` so content isn't hidden underneath.
7. **Badges**: pill `rounded-full px-2.5 py-0.5 text-xs font-medium` with
   semantic background: `accent-muted` / `blue-muted` / `warning-muted` /
   `destructive-muted` / `success-muted`. Build a `Record<status, classes>` map
   inside a small `*Badge` component.
8. **Currency**: `new Intl.NumberFormat("en-US", { style: "currency",
   currency: "SAR", maximumFractionDigits: 0 }).format(n)`. Wrap in a `format`
   helper if used more than twice.
9. **File-size budget: 200 lines.** When `page.tsx` exceeds it, split:
   `page.tsx` (shell + data flow), `sections.tsx` (Card + section components +
   row types), `mappers.ts` (JSON → typed `PageData`).
10. **Error display**: `rounded-card border border-destructive/30
    bg-destructive-muted p-3 text-sm text-destructive` — same component
    whether the error is loading-time or action-time.

---

## Anti-patterns

- ❌ `async function Page()` (server component) for these pages — they're
  interactive, use `"use client"`.
- ❌ Hard-coded colors (`text-gray-500`, `bg-white`). Always tokens.
- ❌ Calling Drizzle / engine code from `useEffect`. Always via `/api/*`.
- ❌ Passing raw `json` shapes into section components. Map to typed rows.
- ❌ Spinner over the whole page that flashes for 50 ms. Use the skeleton.
- ❌ Letting `page.tsx` grow past 200 lines instead of extracting sections.
- ❌ Forgetting `pb-28` — the fixed action bar will cover the last row.

---

## Reference files

- `src/app/estimates/[id]/checkpoint/page.tsx` — shell, skeleton, action bar,
  `toPageData` mapper.
- `src/app/estimates/[id]/checkpoint/sections.tsx` — Card + section
  components, typed row interfaces.
- `src/app/estimates/[id]/bom/page.tsx` — priced table, currency formatting.
- `src/app/estimates/[id]/compliance/page.tsx` — editable status, badge map.

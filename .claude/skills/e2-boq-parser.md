# Skill: E2 BoQ Template Parser

Each BoQ flavor (Aramco Type A Ariba, Saudi Electric NRM2, …) gets one parser.
Pure function, no I/O, no AI.

---

## Input / Output contract

Input: `sheets: Record<string, string[][]>` — Excel already parsed into
string matrices by the caller. Validate with
`z.record(z.string(), z.array(z.array(z.string()))).parse(sheets)`.
**Never accept raw binary** — Excel parsing is the caller's job.

Output: `BoQLineItem[]` (defined in `src/engines/e2/boq-types.ts`):
`{ itemNumber, description, qty, unit, unitPrice?, currency?, partNumber?,
manufacturer?, leadTime?, metadata? }`. Anything that doesn't fit the typed
fields goes into `metadata: Record<string, string>` (omit when empty).

---

## Rules

1. **Detect the right sheet by name pattern**, not by index.
   `Object.keys(sheets).find(s => s.includes("Commercial Envelope"))`. Throw an
   `Error` with the available sheet names if missing — the caller surfaces it.
2. **Detect the header row / version** before reading data. Two signals,
   strongest first:
   a. sheet-name prefix (e.g. `"6 "` vs `"7 "` for 2022 vs 2024 Aramco), or
   b. header row width fallback (`rows[0].length >= 42 ? COLS_2024 : COLS_2022`).
3. **Encode column maps as named `ColMap` constants per version.** Keep the
   Excel-letter as a `//` comment on each line — code review against the
   template is then a one-shot diff.
4. **Skip system/header rows** with a constant slice (`rows.slice(4)` for
   Aramco) — document why in a comment with the 1-indexed Excel row range.
5. **Filter non-data rows with an item-number regex** like
   `/^\d+\.\d+$/`. Section banners, totals, and blanks all fail this test.
6. **Parse numerics through a helper** that returns `undefined` on blank /
   NaN — never `0`, since `0` is a valid (free-issue) price.
7. **Description-embedded fields** (e.g. `Part# X12-345`) → regex-extract in a
   tiny helper, store on the typed field. Don't pollute the description.
8. **Tests in same session.** Mock a small `string[][]` matching the real
   column layout; assert the expected `BoQLineItem` for one happy row, one
   skipped section row, one blank-qty row. Cover both version variants.

---

## Anti-patterns

- ❌ Hard-coding `sheets["Sheet1"]` — every customer renames sheets.
- ❌ One giant `ColMap` with `if (version === "2024") col = 17 else 16` per
  field — branch once at the top with `detectVersion`, not per column.
- ❌ Pushing leftover columns into `description` — that's what `metadata` is for.
- ❌ Throwing on a single malformed data row. Return `null` from
  `rowToLineItem` and the outer loop drops it.
- ❌ Calling `xlsx`/`exceljs` here. Parser receives already-decoded sheets.
- ❌ `any` on the row type. It's `string[]`.

---

## Reference files

- `src/engines/e2/parsers/type-a-ariba.ts` — version detection, ColMap pattern,
  description-embedded part-number extraction.
- `src/engines/e2/parsers/type-b-nrm2.ts` — Saudi Electric NRM2 layout.
- `src/engines/e2/boq-types.ts` — `BoQLineItem` shape.

# Honeywell CCW Parity Evidence

Status: read-only parity evidence for the Honeywell MVP Quick BoM demo (demo scope
only).

This document records the parity check between the configured/priced CCW reference
estimate and the generated Honeywell Mantle demo workbook, originally captured in
Prompt 74 and re-run in Prompt 76 after the Prompt 75 CCW-like switch child ordering.
It is evidence and regression only: it adds no runtime authority, no pricing authority, no
configuration authority, no app/API/UI/DB wiring, and no export-package behavior. It
changes no approved rule pack, candidate pack, approval packet, pricing fixture,
composer, runner, or workbook writer. The automated check lives in
`tests/lib/projects/honeywell-ccw-parity-evidence.test.ts`.

## 1. What is compared

- **CCW reference (configured/priced):**
  `C:\Pre-Sales\Benchmarck_Files\Estimate_NB167337237YA.xlsx`, sheet
  `EstimateDetails_NB167337237YA`. This is the primary configured/priced CCW
  reference for this parity check. It is regression/evidence for Honeywell MVP
  parity only - **not permanent Cisco authority**, and not a runtime pricing,
  catalog, or configuration source.
- **Generated Honeywell Mantle workbook:** produced by the deterministic Prompt 73
  path (`scripts/write-honeywell-quick-bom-demo.ts`), which runs the verified
  in-memory runner `runHoneywellQuickBomDemoMantleExportModel`
  (`src/lib/projects/quick-bom-runner.ts`) and the Mantle workbook writer
  `writeMantlePriceEstimateWorkbook` (`src/lib/projects/mantle-workbook-writer.ts`)
  into the committed Mantle template. The parity test reproduces that exact
  deterministic path in-memory and writes a fresh temporary workbook; it never reads
  a committed output workbook.

## 2. Authority boundaries (unchanged by this evidence)

- **Pricing authority and configuration authority remain separate.** Configuration
  authority is the approved Batch 1+2+3 rule packs plus explicit engineer review;
  pricing authority is the committed Honeywell demo pricing fixture
  (`data/quick-bom/honeywell-demo-pricing-fixture.json`), demo scope only.
- The live CCW estimate is regression/evidence for Honeywell MVP parity only, not
  permanent Cisco authority.
- **Optics `SFP-10G-LR-S=` and `SFP-10/25G-LR-S=` are standalone customer BoQ
  lines, not switch expansion children.** They are priced/exported only because the
  customer provided them.
- **Replacements remain deferred and no silent SKU substitution is authorized.** A
  replacement stays a separate, explicit, human-approved decision.
- No runtime AI, math, pricing, SKU replacement, catalog lookup, validation, or
  configuration decision is introduced by this evidence.

## 3. Pricing representation (term basis vs effective unit)

CCW raw `ListPrice` for term lines such as `LIC-CW-A` can be a monthly/term-rate
basis (e.g. 78.11), while `Extended ListPrice` captures the full term. The parity
check compares **extended totals and effective unit pricing**, never raw `ListPrice`
treated as the full per-unit price.

Worked example - `LIC-CW-A`:

- CCW raw `ListPrice` = 78.11 (a term-rate basis, **not** the full per-unit demo
  price).
- CCW `Extended ListPrice` = 33743.52 for quantity 12.
- Generated effective unit = `Extended ListPrice / Quantity` = 33743.52 / 12 =
  **2811.96**.
- Extended amounts agree on both sides (33743.52), so the line is at parity even
  though the raw per-unit bases differ.

## 4. Expected parity baseline

| Measure | CCW | Generated Mantle |
| --- | --- | --- |
| Item rows | 60 | 60 |
| Unique SKUs | 50 | 50 |
| Missing SKUs | none | none |
| Extra SKUs | none | none |
| Quantity differences (by SKU) | none | none |
| Extended amount differences (by SKU) | none | none |
| Total extended amount (SAR) | 2185708.76 | 2185708.76 |
| Row sequence (all 60 item rows) | reference order | exact match |
| Documented sequence exceptions | none | none |

Notes on the baseline:

- The CCW sheet has 69 worksheet rows; exactly 60 are item rows. An item row has a
  Line Number, an Item Name/SKU, a Quantity, and a `ListPrice`. Blank separator,
  group, header, and footer rows are excluded. Zero-priced included items carry a
  blank `Extended ListPrice` cell, read as 0; they remain item rows.
- 50 unique SKUs across 60 rows: 10 zero-priced SKUs appear twice (once under each
  switch section), for example `TE-EMBEDDED-T`, `CAB-C15-CBN`, and
  `NETWORK-PNP-LIC`. Quantities and extended amounts are therefore compared
  aggregated per SKU.
- `LIC-CW-A` raw CCW `ListPrice` 78.11 is **not** the full per-unit demo price; the
  effective unit is 2811.96 from `Extended ListPrice / Quantity`.
- **Child-line sequence now matches CCW exactly under the switch sections.** Prompt
  75 applied CCW-like child ordering to `C9300X-48HX-A` and `C9300L-24P-4X-A`,
  reordering only - it adds, removes, and reprices nothing. The set, quantities, and
  pricing were already at parity; after Prompt 75 the child row order is identical
  too, so the generated row sequence now matches the CCW item-row sequence exactly
  across all 60 item rows for the Honeywell MVP demo path. Row sequence: exact match.
  Documented exceptions: none.

## 5. What this evidence does NOT do

- It creates no runtime authority, no pricing authority, and no configuration
  authority.
- It adds no app, API, UI, DB, coordinator, adapter, engine, or export-package
  behavior, and modifies no `src/**` file.
- It performs no runtime AI, math, pricing, SKU replacement, catalog lookup, or
  validation. The parity comparison is deterministic TypeScript/Vitest (ExcelJS)
  over the committed demo inputs and the live CCW reference workbook.

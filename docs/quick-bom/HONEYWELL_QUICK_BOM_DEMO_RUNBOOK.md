# Honeywell Quick BoM Demo Runbook

Status: operator runbook for the Honeywell MVP Quick BoM demo (demo scope only).

Operator-facing runbook for the Honeywell Quick BoM demo. It defines what the
generated Honeywell Mantle workbook is, the current status after Prompt 71, the
authority boundaries, and the manual checklist to run once Prompt 73 adds the
operator command. It is a demo runbook, not an architecture source of truth;
`C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md` remains the source
of truth and `docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md` is the execution tracker.

## 1. What the Honeywell Mantle workbook is

The Honeywell Mantle workbook is a **generated `.xlsx` customer-facing priced
BoQ/BoM workbook** in the Mantle/STC template shape. It is produced
deterministically, in order, from:

- the Honeywell-shaped demo input (normalized customer BoQ lines, in customer
  order),
- human-accepted SKU decisions (each customer SKU accepted as itself; no AI,
  fuzzy, catalog, or replacement),
- the approved Batch 1+2+3 configuration expansion (the active composed pack from
  `getHoneywellMvpConfigExpansionRulePack`,
  `src/lib/projects/honeywell-config-expansion-rule-pack.ts`),
- explicit engineer expansion review (an accept/reject decision for every
  expansion line; nothing is auto-approved),
- the committed Honeywell demo pricing fixture
  (`data/quick-bom/honeywell-demo-pricing-fixture.json`),
- the in-memory Mantle export model (`runHoneywellQuickBomDemoMantleExportModel`,
  `src/lib/projects/quick-bom-runner.ts`), and
- the Mantle workbook writer (`writeMantlePriceEstimateWorkbook`,
  `src/lib/projects/mantle-workbook-writer.ts`), writing into the committed
  template `src/templates/mantle/Mantle_Priced_BoQBoM.template.xlsx`.

It is explicitly **not**:

- **not** the old Honeywell input workbook (the customer-provided BoQ),
- **not** the historical `Honeywell_BoQ_priced.xlsx` benchmark workbook,
- **not** a CCW export (e.g. `Estimate_NB167337237YA.xlsx`), and
- **not** a mutation of a customer-uploaded file. The writer reads the committed
  Mantle template and writes a fresh output file; it never edits the customer's
  workbook in place.

## 2. Current status (after Prompt 71)

- The full path is **proven by an automated end-to-end test**:
  `tests/lib/projects/honeywell-quick-bom-demo-e2e.test.ts` runs the whole path on
  the committed fixture, writes the Mantle model to a temporary `.xlsx` with
  `writeMantlePriceEstimateWorkbook`, and re-opens that workbook through the Mantle
  layout locator to assert rows, order, category footers, and totals.
- **No stable manual command exists until Prompt 73.** Today the workbook is
  produced only by the automated e2e test; there is no committed operator command
  or script that writes it on demand. Prompt 73 adds that command.

## 3. Authority boundaries

Configuration authority and pricing authority stay strictly separate:

- **Configuration authority** is the approved Batch 1+2+3 rule packs plus explicit
  engineer review. Only those three approved batches drive what is added, and
  every expansion line still needs an explicit accept/reject decision.
- **Pricing authority** is the committed Honeywell demo pricing fixture, and it is
  **demo-only authority for the Honeywell demo scope** - not production pricing
  authority. See `docs/quick-bom/HONEYWELL_DEMO_PRICING_FIXTURE.md`.

The demo holds these boundaries:

- **No Batch 4 runtime expansion pack.** Batch 4 is a decision record only.
- **Optics are standalone customer BoQ lines**, never expansion children. They are
  priced/exported only because the customer provided them.
- **Replacements remain deferred.** No silent SKU substitution; a replacement
  stays a separate, explicit, human-approved decision.
- **No runtime AI, catalog, or pricing decisions.** All math, lookups, and rule
  checks are deterministic TypeScript over committed/approved data.

## 4. Manual checklist (use after Prompt 73 adds the command)

This checklist is for once the Prompt 73 operator command exists. It does not work
today, because no manual command exists yet (Section 2).

1. **Run the command** that writes the Honeywell Mantle demo workbook.
2. **Verify the output path** is under a temp/demo output folder (a generated
   output file, not the template, the customer input, or any benchmark workbook).
3. **Open the workbook** in Excel.
4. **Confirm line counts:** 60 rows / 50 unique priced SKUs / no unpriced lines
   (no missing-decision, not-accepted, or missing-price rows).
5. **Confirm standalone optics** remain customer-origin lines (not expansion
   children) with qty 12 (`SFP-10G-LR-S=`) and qty 14 (`SFP-10/25G-LR-S=`).
6. **Confirm representative Batch 3 expansion quantities:** `FAN-T2` 18,
   `C9300L-STACK-A` 12, `STACK-T3A-50CM` 6.
7. **Confirm representative totals (SAR):** `totalPriceSar` 2185708.76,
   VAT 327856.31, `totalIncVatSar` 2513565.07.
8. **Confirm the workbook is customer-facing Mantle format** and does not require
   manual reformatting for the demo.

## 5. App-level testing comes later

Full app-level manual testing (Project create -> review -> approval -> export
through Project/API/UI/DB) is **not ready yet**; it **comes later**, after the
Project/API/UI wiring (P74+). This runbook covers only the in-memory demo path and
the Prompt 73 local command. App wiring must build the canonical Project Quick BoM
flow and must not shortcut through the legacy estimate/pipeline (E2) UI.

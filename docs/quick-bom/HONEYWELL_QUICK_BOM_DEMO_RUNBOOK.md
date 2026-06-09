# Honeywell Quick BoM Demo Runbook

Status: operator runbook for the Honeywell MVP Quick BoM demo (demo scope only).
Refreshed by Prompt 138. Prior record: Refreshed by Prompt 136. Prior: Refreshed by
Prompt 132.

Operator-facing runbook for the Honeywell Quick BoM demo. It defines what the
generated Honeywell Mantle workbook is, the local operator command (Prompt 73), the
authority boundaries, the manual workbook checklist, the app-level seeded demo proof
(Prompt 81), the app-level arbitrary flow proof (Prompt 97), the full seven-line
Honeywell app proof (Prompt 131), the Prompt 135 local Docker Postgres Project-state
real-DB proof, and the Prompt 137 live-DB Quick BoM API route/action-chain proof. It is a demo runbook, not an architecture source of
truth;
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

## 2. Local operator command (Prompt 73)

- The full path is **proven by an automated end-to-end test**:
  `tests/lib/projects/honeywell-quick-bom-demo-e2e.test.ts` runs the whole path on
  the committed fixture, writes the Mantle model to a temporary `.xlsx` with
  `writeMantlePriceEstimateWorkbook`, and re-opens that workbook through the Mantle
  layout locator to assert rows, order, category footers, and totals.
- **The operator command now exists (Prompt 73).** Run
  `npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts` from the repo root to
  write the Honeywell Mantle demo workbook on demand. It runs the same verified
  in-memory path the e2e test proves and writes a fresh `.xlsx`; pass
  `--output <path>` to choose where it lands (default: a temp/demo output folder
  under the OS temp dir). The command prints an operator summary (output path, line
  counts, representative quantities, and totals) for cross-checking the workbook.

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

## 4. Manual checklist (Prompt 73 command)

Run this checklist with the Prompt 73 operator command. From the repo root:

`npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts --output <path>`

Omit `--output` to write to the default temp/demo output folder under the OS temp
dir. The command prints the output path, line counts, representative quantities,
and totals; cross-check those against the opened workbook.

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

## 5. App-level demo proof (Prompt 81)

The app-level Quick BoM demo path is proven for the seeded Honeywell demo Project by
`tests/app/honeywell-quick-bom-app-e2e.test.tsx`. It wires the real product pieces
together (only framework/store boundaries are mocked):

- It seeds the real Honeywell demo Project fixture
  (`createHoneywellQuickBomDemoProjectFixture`,
  `src/lib/projects/honeywell-demo-project-fixture.ts`).
- It renders the real Prompt 80 UI page (`src/app/projects/[id]/quick-bom/page.tsx`)
  over the real GET workspace route
  (`src/app/api/projects/[id]/quick-bom/route.ts`).
- It approves the export package through the real POST approval route
  (`src/app/api/projects/[id]/quick-bom/approvals/route.ts`) and service
  (`src/lib/projects/project-quick-bom-approval.ts`).
- The Mantle export workbook is **generated on disk** during the test.
- After approving the export package, the export artifact moves from `needs_review`
  to `approved` and the readiness state changes to **customer-deliverable ready**.
- It verifies **payload-only** artifact values (a customer SKU, the demo source
  filename, an optic SKU) **never leak** into the UI/DOM.

This proves the seeded Honeywell demo Project path through the real GET route, the
real POST route/service, and the real UI page work together. It runs against an
in-memory Project store under the test harness; it is not a production database run.

## 6. App-level arbitrary flow proof (Prompt 97)

Beyond the seeded Honeywell demo Project (Section 5), the Quick BoM app route/action
chain now exists for a non-seeded, arbitrary quick_bom Project, and is proved end to
end by `tests/app/project-quick-bom-arbitrary-flow-e2e.test.tsx` (Prompt 97). It runs
the current app routes/services - create Project, upload BoQ, normalize, SKU
draft/review, configuration draft/review, pricing, pricing review, export creation,
export approval, and download - under the test harness/in-memory store. The proved
chain is: upload -> normalize -> SKU draft -> explicit SKU review -> SKU approval ->
configuration draft -> explicit configuration review -> configuration approval ->
pricing -> priced approval -> export -> export approval -> download.

The split between the two app-level proofs:

- **Seeded Honeywell fixture** (Section 5) is the **full 60-row Honeywell CCW parity
  demo path** - the real customer-facing demo, with full set/quantity/pricing/row-order
  parity against the CCW reference.
- **Arbitrary Project app E2E** (Prompt 97) is the **route/action chain proof on a
  reduced catalog-resolvable input** (a small CSV subset whose SKUs resolve against the
  committed local catalog). It proves the wiring works for a non-seeded Project; it is
  not a full customer BoQ run.

In the Prompt 97 flow the SKU and configuration line reviews are made through direct
route calls (`.../sku-resolution/review`, `.../configuration-expansion/review`) while
the UI shows a line-review-required notice; priced review is driven UI-only and export
approval runs through the UI.

Honest limitations of the arbitrary flow proof (the same boundaries as the backlog):

- No production DB provisioning/RLS/migrations; the E2E runs against an in-memory store.
- No manual browser QA of the arbitrary-Project flow.
- No full uploaded Honeywell BoQ through real SKU resolution, and no full local catalog
  coverage for Honeywell parent SKUs (the proof uses a reduced catalog-resolvable
  subset).
- No production pricing authority (the demo pricing fixture is demo-only authority).
- No broad Cisco-general configuration authority (only the approved Honeywell Batch
  1+2+3 packs).
- Line-level SKU/config/pricing review UI screens now exist (P126-P131,
  `src/app/projects/[id]/quick-bom/page.tsx`, tested by
  `tests/ui/project-quick-bom-page.test.tsx`); they were not present at P97 time.

All authority boundaries in Section 3 stay intact: no runtime AI/catalog/pricing/
configuration decisions; configuration and pricing authority stay separate; Batch 4 is
a decision record only; optics are standalone customer BoQ lines; replacements remain
deferred with no silent substitution.

## 7. Prompt 131 full seven-line Honeywell app proof

Prompt 131 proved the full seven-line Honeywell BoQ upload through the app UI/panels
(line-level review screens added by P126-P131) under the test harness/in-memory store.
`src/app/projects/[id]/quick-bom/page.tsx` now includes line-level SKU/config/pricing
review UI; test file: `tests/ui/project-quick-bom-page.test.tsx`.

Committed fixture totals from the Prompt 131 proof:

- 7 normalized customer rows
- 7 accepted SKU review decisions
- 60 accepted configuration lines
- 60 priced lines
- 60 export rows
- no unpriced lines / no missing prices
- totalPriceSar 2185708.76
- totalIncVatSar 2513565.07

The proof runs under the test harness/in-memory store, not live/provisioned DB or real
browser QA. Authority boundaries from Section 3 remain unchanged.

## 8. App-level manual testing status

The automated app-level demo paths above are proven for the seeded Honeywell demo
Project (Prompt 81), for a non-seeded arbitrary quick_bom Project by the Prompt 97
route/action chain E2E, and end-to-end through the UI panels by the Prompt 131
seven-line app proof. Line-level SKU/config/pricing review UI now exists (P126-P131).
A local Docker Postgres Project-state proof now exists (P135,
`scripts/prove-project-real-db.ts`; see Section 9). Still follow-up work and not part
of this demo slice: manual browser QA of the flow, browser-driven UI against a
live/provisioned database (P135 proves Project-store DB behavior and P137 proves the
Quick BoM API route/action-chain behavior, but browser-driven UI against a
live/provisioned database remains open), full uploaded Honeywell BoQ through real SKU
resolution, and production pricing authority. Broad app wiring must build the
canonical Project Quick BoM flow and must not shortcut through the legacy
estimate/pipeline (E2) UI.

## 9. Prompt 135 real-DB proof

Prompt 135 added `scripts/prove-project-real-db.ts` and ran it successfully against
local Docker Postgres via `npx.cmd tsx scripts/prove-project-real-db.ts`. The proof
reported result PASS; required tables present (tenants, projects, project_stages,
project_artifacts, project_approvals); stage count 5; wrong-tenant read null; approval
count 1; after normalized_boq v2: sku_resolution, configuration_expansion, priced_boq,
and export_package stale, while normalized_boq v2 remains generated; cleanup ok, proof
tenant rows removed.

The script proves existing Project repository/service behavior against a real DB:
`createQuickBomProject`, `getProjectById` tenant-scoped read,
`createProjectArtifactVersion`/`listProjectArtifacts`,
`createProjectApproval`/`listProjectApprovals`, and Prompt 133 downstream staleness
propagation. It is an operator proof/evidence command only; it does not change product
behavior.

This closes the Project-store local real-DB provisioning gap (B10). It does NOT prove
manual browser QA, browser-driven UI against a live/provisioned database, full uploaded
Honeywell BoQ through real SKU resolution, or production deployment readiness. Those
remain open follow-ups (Section 8).

## 10. Prompt 137 live-DB Quick BoM API route/action chain proof

Prompt 137 added `scripts/prove-project-quick-bom-route-real-db.ts` and ran it
successfully against local Docker Postgres via
`npx.cmd tsx scripts/prove-project-quick-bom-route-real-db.ts`. The proof reported:

- result: PASS
- required tables: present (tenants, projects, project_files, project_stages,
  project_artifacts, project_approvals)
- normalized line count: 7
- SKU catalog source: honeywell_mvp_demo_catalog_supplement
- SKU accepted count: 7
- config accepted lines: 60
- priced line count: 60
- totalPriceSar: 2185708.76
- totalIncVatSar: 2513565.07
- export row count: 60
- downloaded XLSX bytes: 14315
- cleanup result: ok (proof tenant rows and temp files removed)

The script proves existing Next.js Quick BoM API route/action handlers against a real
local/provisioned Postgres DB for the full Honeywell seven-line route chain:
create quick_bom Project -> upload customer BoQ -> normalize -> SKU resolution with
explicit honeywell_mvp_demo catalog profile -> explicit SKU review -> SKU approval ->
configuration expansion draft -> explicit configuration review -> configuration
approval -> deterministic SAR pricing -> priced approval -> export package -> export
approval -> approved workbook download. It is an operator proof/evidence command only;
it does not change product behavior.

Prompt 137 closes the live-DB Quick BoM API route/action-chain proof gap. It does NOT
close:
- manual browser QA;
- browser-driven UI against a live/provisioned DB;
- production deployment readiness;
- full real-catalog Honeywell SKU resolution (uses explicit honeywell_mvp_demo catalog
  profile/supplement and demo fixture authority, not full production Cisco catalog);
- production Cisco pricing authority;
- broad Cisco-general configuration authority.

Manual browser QA, browser-driven UI against a live/provisioned database, full uploaded
Honeywell BoQ through real SKU resolution, and production pricing authority remain open
follow-ups (Section 8).

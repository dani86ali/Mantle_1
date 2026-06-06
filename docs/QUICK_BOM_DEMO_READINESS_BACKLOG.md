# Quick BoM Demo-Readiness Product Fix Backlog

Execution tracker only. `C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md`
is the architecture source of truth; this backlog never overrides it and is not a
planning document. Last refreshed by Prompt 72 to reflect the verified P66-P71
Honeywell Quick BoM path: the active Batch 1+2+3 selector/composer, the pure
Quick BoM runner, the demo price/category fixture, deterministic demo pricing,
the in-memory Mantle model, and the Prompt 71 end-to-end validation that writes
and re-opens a temporary Mantle workbook. The Batch 4 record stays a decision
record only. The proven path is in Section 5B; the remaining boundary (no
operator-facing demo command until P73, no app-level Project/API/UI/DB wiring) is
in Sections 6 and 9.

## 2. Status

This is a demo-readiness triage document for the current Quick BoM product
spine. It is NOT an architecture source of truth and does NOT change any
architecture lock. It exists to help test the current product, separate what is
genuinely implemented from what is missing or unproven, and prioritize the
narrow fixes needed before BOMATIC can be demoed as a commercially useful Quick
BoM workflow.

It records confirmed gaps (directly supported by repo/planning files read for
this triage) separately from items that still need verification. "Confirmed"
means a repo file was read and supports the claim. "Needs verification" means
the claim is plausible from what was read but was not directly proven, and is
written as a testing task rather than an assertion.

## 3. Source Of Truth And Boundaries

- `C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md` remains the
  architecture source of truth. This backlog never overrides it.
- Benchmark/priced files (Mantle priced workbook, `Honeywell_BoQ_priced.xlsx`,
  CCW exports) are regression/sanity references only. They are NOT rule sources
  and NOT configuration authority.
- Runtime processing must remain deterministic: TypeScript functions and DB
  queries do math, lookups, and rule checks (BOMATIC First Commandment).
- No runtime LLM pricing, SKU replacement, catalog lookup, or configuration
  decisions. AI may assist only in offline rule authoring with citations.
- Configuration expansion requires approved structured rule packs; a candidate
  pack is inert until human pre-sales approval.
- Pricing authority and configuration authority stay separate: pricing comes
  from the catalog/price source; what to add/default/offer comes from approved
  rule packs.
- A future Honeywell MVP demo pricing fixture (sourced from
  `Estimate_NB167337237YA.xlsx` and/or the local `cisco_gpl_sar.csv`) is
  temporary demo-fixture pricing evidence only - fixture authority, not permanent
  or production Cisco pricing authority. Temporary fixture pricing must never be
  treated as production pricing authority.

## 4. Demo Target

Minimum credible Quick BoM demo path:

1. Upload/ingest a Honeywell-format (Format #2) BoQ.
2. Normalize rows into canonical BoQ lines (order and hierarchy preserved).
3. Resolve SKUs through human-approved decisions.
4. Expand configuration from the approved Honeywell rule packs (Batch 1+2+3,
   composed).
5. Engineer reviews the configuration expansion draft.
6. Persist the accepted `configuration_expansion` artifact.
7. Price from the approved `configuration_expansion`.
8. Approve the `priced_boq`.
9. Export a Mantle-format customer-facing workbook.
10. Use the readiness report to show the current blocker at each step.

## 5. Current Implemented Spine

All items in this section were confirmed by reading the named files. The spine
is implemented as pure helpers plus narrow DB-backed services under
`src/lib/projects/` and `src/lib/db/`. A pure in-memory Quick BoM runner now
drives this spine end to end (Section 5B), but no app-level product surface
(Project/API/UI/DB) is wired yet (see Section 6).

Project/stage/artifact foundation (confirmed):

- Canonical Project aggregate, stage/artifact/approval/file/evidence types, SKU
  resolution decision/suggestion types, pricing config
  (`src/types/project.ts`).
- Pure stage definitions + per-mode materialization, including
  `configuration_expansion_review` at stable order 35 (`stages.ts`).
- DB stores: versioned artifact create/read (`project-artifact-store.ts`),
  approval store that transactionally records an approval and transitions the
  exact artifact version AND its stage to approved/rejected
  (`project-approval-store.ts`), plus project/file/evidence stores and
  `project-schema.ts` (re-exported by `schema.ts`).
- Pure helpers: artifact version materializer (`artifacts.ts`), approval
  decision->status mapping (`approvals.ts`).

BoQ normalization (confirmed):

- Locked Format #1 and Format #2 detection + canonical normalization on
  already-read rows; exact invalid-format message; line order, line numbers, and
  dotted parent/child hierarchy preserved (`boq-formats.ts`).
- `normalized_boq` artifact service from a recorded BoQ file
  (`boq-normalization.ts`), via the file loader (`boq-file-loader.ts`).

SKU resolution (confirmed):

- Deterministic catalog lookup, exact then normalized, against a committed local
  STC historical/mock catalog (NOT live Cisco GPL) (`catalog-lookup.ts`).
- Draft helper: one `needs_review` decision per line, suggestions only, never
  auto-accepted (`sku-resolution.ts`); `sku_resolution` artifact service
  (`sku-resolution-artifact.ts`); human accept/reject review helper and
  review-artifact that creates a new version (`sku-resolution-review.ts`,
  `sku-resolution-review-artifact.ts`).
- NOTE: only steps 1-2 (exact + normalized) of the Section 8 flow are wired.
  Deterministic fuzzy (step 3) and AI-assisted suggestion (step 4) are not
  implemented.

Configuration expansion (confirmed):

- Type-only rule-pack + artifact-payload contract (`config-expansion-types.ts`).
- Deterministic draft builder that only accepts a fully approved pack
  (`validateRulePack` requires pack `status === "approved"` and
  `approvalRequired === false`, AND the same on every parent and child rule,
  plus at least one evidence citation each) (`config-expansion.ts`).
- Parent-child structural/display model (`config-expanded-bom-model.ts`),
  engineer accept/reject review producing an in-memory accepted expanded BoM
  (`config-expansion-review.ts`), and a `needs_review` `configuration_expansion`
  artifact gated on an approved source `sku_resolution` artifact AND an approved
  rule pack (`config-expansion-artifact.ts`).

Pricing (confirmed):

- Deterministic SAR pricing math (`pricing.ts`) and a priced draft from the
  accepted expanded BoM only; SAR unit prices are caller-supplied
  (`unitListPriceSarBySku`) - there is no catalog->SAR sourcing or USD->SAR
  conversion here (`priced-boq.ts`).
- `priced_boq` artifact service gated on an approved `configuration_expansion`
  artifact AND an approved rule pack; unresolved/unpriced lines retained with
  status/warning (`priced-boq-artifact.ts`).

Mantle export (confirmed):

- Pure priced->Mantle row model; category split (product/service/subscription)
  is caller-supplied via `categoryByAcceptedSku`, and any priced row without a
  category defaults to product with one warning
  (`mantle-price-estimate-model.ts`).
- Workbook writer that opens the committed sanitized template
  (`src/templates/mantle/Mantle_Priced_BoQBoM.template.xlsx`), writes into the
  located layout, preserves structure, inserts/copies template rows when needed,
  keeps unpriced rows in place, and rebuilds footer/summary totals referencing
  the written rows with BOMATIC-cached results (`mantle-workbook-writer.ts`,
  `mantle-layout-locator.ts`, `mantle-workbook-inspector.ts`).
- `export_package` artifact service gated on an approved `priced_boq`
  (`mantle-export-artifact.ts`).

Readiness/reporting (confirmed):

- Pure read-only Quick BoM readiness report: derives the next step and the
  blocking step from artifact type/version/status, with transitive create gates
  and customer-deliverable readiness (`quick-bom-readiness.ts`).
- Pure staleness planner that walks the artifact dependency graph and returns
  planned `stale` transitions (`staleness.ts`) - planning only.

Tests (confirmed): a broad suite under `tests/lib/projects/` covers the modules
above, including readiness, the artifact services, the Mantle writer, the
approved Honeywell Batch 1/2/3 rule packs, the rule-pack composer, and the Batch 4
decision record.

This is a real, well-tested spine. A pure in-memory Quick BoM runner composes it
end to end and is proven by the Prompt 71 end-to-end test (Section 5B). It is
still NOT an app-level product: no coordinator, API, or UI invokes these services
(Section 6, B1), and the legacy estimate/pipeline UI is not the canonical Project
Quick BoM flow.

## 5A. Honeywell Configuration Expansion Authority (Current)

Approved runtime configuration expansion authority now exists for the Honeywell
Quick BoM MVP. Three approved rule packs are committed and accepted by the
deterministic expansion builder (`validateRulePack` in `config-expansion.ts`):

- `data/config-expansion/honeywell-batch1-approved-rules.json`
- `data/config-expansion/honeywell-batch2-approved-rules.json`
- `data/config-expansion/honeywell-batch3-approved-rules.json`

Composer coverage for Batch 1+2+3 exists:
`composeApprovedConfigExpansionRulePacks` (`config-expansion-rule-pack-composer.ts`)
merges these separately-approved packs by parentSku into one in-memory approved
pack that `buildConfigurationExpansionDraft` accepts, so packs that intentionally
share parent SKUs (C9300X / C9300L) can be used together without tripping the
duplicate-parent-SKU guard.

`data/config-expansion/honeywell-batch4-decision-record.json` is a decision
record only, not runtime expansion authority. It creates no Batch 4 runtime
expansion rule pack; the composer/selector remains Batch 1 + Batch 2 + Batch 3
only.

Optics are standalone customer BoQ lines, not configuration-expansion children.
The two Batch 4 optics (`SFP-10G-LR-S=`, `SFP-10/25G-LR-S=`) can be priced and
exported when they are present in the customer BoQ and deterministic pricing
evidence exists, but they must not be auto-attached as expansion children under
any switch or module.

Replacement candidates remain deferred. The Batch 4 historical-to-current
replacement candidates authorize no silent runtime SKU substitution; a
replacement stays a separate, explicit, human-approved decision and is never
applied silently at runtime.

The active runtime selector/composer now exists (P66, proven).
`getHoneywellMvpConfigExpansionRulePack`
(`src/lib/projects/honeywell-config-expansion-rule-pack.ts`)
reads the committed Batch 1+2+3 approved pack JSON and composes them via
`composeApprovedConfigExpansionRulePacks` into the active expansion pack that
`buildConfigurationExpansionDraft` accepts. It composes only - approves nothing
new, infers no lines, substitutes no SKUs, prices nothing - and stays separate
from pricing authority. Selection/composition is no longer an open gap; see
Section 5B for the full proven path.

## 5B. Proven Honeywell Quick BoM Demo Path (P66-P71)

The in-memory Honeywell Quick BoM demo path is now built and proven end to end.
Prompts 66-71 are completed and committed, and the Prompt 71 end-to-end test
exercises the whole path on the committed fixture, writes the resulting Mantle
workbook to a temporary file, and re-opens it to assert structure and totals.
This is the single canonical record of the proven counts/totals; the blocker
table (Section 6) only carries resolved markers and Section 9 only carries the
forward prompts.

Completed and proven:

- Active Honeywell Batch 1+2+3 selector/composer exists (P66):
  `getHoneywellMvpConfigExpansionRulePack`
  (`src/lib/projects/honeywell-config-expansion-rule-pack.ts`) composes the
  committed Batch 1+2+3 approved packs via
  `composeApprovedConfigExpansionRulePacks`.
- Pure Quick BoM runner exists (P67):
  `src/lib/projects/quick-bom-runner.ts` drives normalize-input ->
  expand -> explicit review -> price -> Mantle model by composing existing
  helpers, in memory, adding no business logic.
- Honeywell demo price/category fixture exists (P68):
  `data/quick-bom/honeywell-demo-pricing-fixture.json` (loader
  `src/lib/projects/honeywell-demo-pricing-fixture.ts`) supplies a SAR
  `unitListPriceSarBySku` map and a SKU->Mantle-category map for exactly the 50
  demo SKUs.
- Deterministic demo pricing exists (P69): `runHoneywellQuickBomDemoPricing`
  prices the accepted expanded BoM from the fixture with a caller-supplied
  pricing config - no runtime AI, catalog, or pricing decision.
- In-memory Mantle export-model composition exists (P70):
  `runHoneywellQuickBomDemoMantleExportModel` maps the priced BoQ to a Mantle
  price-estimate model with `buildMantlePriceEstimateModel` - no workbook,
  artifact, approval, or stage transition.
- Prompt 71 end-to-end validation (P71):
  `runHoneywellQuickBomDemoMantleExportModel` runs the whole path, then
  `writeMantlePriceEstimateWorkbook` writes a temporary `.xlsx`, which the test
  re-opens through the Mantle layout locator to pass structure and totals checks
  (`tests/lib/projects/honeywell-quick-bom-demo-e2e.test.ts`).

Proven counts and totals on the committed fixture (the spec the e2e test pins):

- 60 lines carried through the draft, review, priced BoQ, and Mantle model.
- 50 unique priced SKUs; 0 unpriced lines (no missing-decision, not-accepted, or
  missing-price rows).
- 7 customer lines and 53 accepted expansion lines, 0 rejected; every expansion
  line accepted by an EXPLICIT engineer decision (nothing auto-approved).
- Both optics stay standalone customer BoQ lines, never expansion children:
  `SFP-10G-LR-S=` qty 12 and `SFP-10/25G-LR-S=` qty 14.
- Representative Batch 3 expansion quantities: `FAN-T2` 18, `C9300L-STACK-A` 12,
  `STACK-T3A-50CM` 6.
- Representative totals (SAR, markup 0, VAT 15): `totalPriceSar` 2185708.76,
  `productTotalSar` 1669647.61, `serviceTotalSar` 304972.06,
  `subscriptionTotalSar` 211089.09, VAT 327856.31, `totalIncVatSar` 2513565.07.

Remaining boundary (still NOT done):

- No operator-facing demo workbook command/script exists yet; the path is proven
  only by the automated e2e test. That stable manual command is Prompt 73.
- No app-level Project/API/UI/DB wiring exists. The runner is in-memory only and
  persists/approves nothing.
- The current estimate UI is legacy pipeline UI, not the canonical Project Quick
  BoM flow. App wiring must not shortcut through legacy E2.
- No Batch 4 runtime expansion pack; optics stay standalone customer BoQ lines;
  replacements remain deferred with no silent SKU substitution.
- The demo pricing fixture is Honeywell MVP demo-only authority, not production
  pricing authority.

## 6. Demo Blockers

Priority key: P0 blocks a credible demo. P1 means the demo can proceed with a
visible manual workaround. P2 is polish/follow-up. Blockers resolved since Prompt
65 are kept for the audit trail and marked Done with the prompt that closed them;
see Section 5B for the proven path.

| ID | Priority | Area | Issue | Evidence from repo | Demo impact | Status / next prompt |
|----|----------|------|-------|--------------------|-------------|----------------------|
| B1 | P0 | Orchestration | End-to-end Quick BoM wiring at the runner level. | The pure in-memory runner `src/lib/projects/quick-bom-runner.ts` composes the spine end to end and is proven by `honeywell-quick-bom-demo-e2e.test.ts` (Section 5B). No `src/app/api/projects/**` and no projects UI exist yet (glob empty); nothing app-level invokes the runner. | The demo path runs in-memory via the runner/e2e test; an operator still has no app surface and no standalone command (B11). | Done at runner level (P67); app-level wiring later (B12) |
| B2 | P0 | Expansion pack selection | Active runtime selector/composer for the Batch 1+2+3 packs. | `getHoneywellMvpConfigExpansionRulePack` (`src/lib/projects/honeywell-config-expansion-rule-pack.ts`) reads the committed Batch 1+2+3 approved pack JSON and composes them via `composeApprovedConfigExpansionRulePacks` into the active pack that `buildConfigurationExpansionDraft` accepts. | Expansion now runs from disk-loaded approved packs; pricing and export are reachable. Composition only - no new approval, no pricing. | Done (P66) |
| B3 | P0 | Demo fixture | A reproducible Honeywell demo run through the spine. | The committed fixture `data/quick-bom/honeywell-demo-pricing-fixture.json` plus the runner carry one Honeywell-shaped run `normalize-input -> expand -> review -> price -> Mantle model`, proven by the P71 e2e test. No persisted DB-backed project/run yet (still in-memory; see B10). | The in-memory demo state is reproducible and proven; a persisted DB demo run is not built. | In-memory demo proven (P68/P71); persisted DB run still open (B10) |
| B4 | P1 | Review surfaces | No product-facing review UI/API for SKU resolution, configuration expansion, or pricing approvals. | Approval logic exists as a pure helper (`approvals.ts`) and a DB store (`project-approval-store.ts`) that transitions artifact + stage status, but has no caller outside tests; no API/UI. The runner takes EXPLICIT review decisions as inputs, but exposes no reviewer surface. | Approvals are demoable only by direct service/script/runner calls, not by a reviewer clicking approve. | later/post-MVP |
| B5 | P1 | Orchestration | Driving the spine no longer needs hand-built artifacts. | The runner advances input -> expand -> review -> price -> Mantle model deterministically; `quick-bom-readiness.ts` remains a read-only report alongside it. | Operator no longer hand-assembles each step in-memory; an app-level driver/readiness surface is still future. | Done at runner level (P67) |
| B6 | P1 | Staleness | Upstream changes do not automatically mark downstream artifacts stale at runtime. | `staleness.ts planStaleArtifactUpdates` is pure planning with no caller in `src` (grep); `project-approval-store.ts` and `project-artifact-store.ts` explicitly do not propagate staleness. | Regenerating an upstream artifact mid-demo leaves stale downstream artifacts looking valid; the canonical "auto-stale" rule is not enforced. | later/post-MVP |
| B7 | P1 | Demo data | Committed SAR price source and Mantle category map for the Honeywell scope. | The committed demo fixture supplies a SAR `unitListPriceSarBySku` map and a SKU->Mantle-category map for exactly the 50 demo SKUs (loader `honeywell-demo-pricing-fixture.ts`); the P71 e2e test prices all 60 lines with correct category totals and no warnings. Fixture pricing is temporary demo-fixture evidence only, never production authority (Section 3). | Pricing and category totals are correct for the Honeywell demo scope. | Done (P68) |
| B8 | P1 | Mantle export tests | Real-input Mantle export proof for the Honeywell shape. | `honeywell-quick-bom-demo-e2e.test.ts` writes the Honeywell Mantle model to a temporary workbook and re-opens it to assert rows, order, category footers, and totals against the committed template. Marafiq/EnergyTech real-input export tests are still not present. | Honeywell "customer-ready without manual reformatting" is now proven; other customer formats remain unproven. | Done for Honeywell (P71); other formats later |
| B9 | P2 | Catalog coverage (needs verification) | SKU resolution resolves only against a committed local STC mock catalog; whether the Honeywell-scope SKUs are present is unverified. | `catalog-lookup.ts` reads `getCatalogMock()` (`LOCAL_CATALOG_SOURCE = local_stc_historical_mock`); exact + normalized only, no fuzzy/AI. The demo runner sidesteps this by taking human-accepted SKU decisions as inputs (acceptedSku == originalSku), so catalog coverage is still unverified. | If Honeywell SKUs are absent from the mock, a real resolution step (not the demo's inline accept) would leave lines unresolved. Needs verification, then a fixture decision. | open / needs verification |
| B10 | P2 | DB provisioning (needs verification) | Project-table provisioning for a demo DB is unproven; no committed migration directory. | `schema.ts` line ~301 `export * from "./project-schema"` with a "Not yet wired to runtime" note; `drizzle.config.ts` present; no `drizzle/` migration dir (glob empty). The runner is in-memory and sidesteps DB persistence entirely. | A demo against real DB persistence may need `drizzle-kit push` or equivalent first; needs verification. | open / needs verification |
| B11 | P0 | Operator command | No operator-facing command/script writes the Honeywell Mantle demo workbook on demand. | The path is proven only by the automated e2e test; no committed CLI/script invokes `runHoneywellQuickBomDemoMantleExportModel` + `writeMantlePriceEstimateWorkbook` to produce a file an operator can open. | An operator cannot regenerate the demo workbook live without running the test harness. | P73 |
| B12 | P1 | App-level wiring | No canonical Project/API/UI/DB flow drives the Quick BoM path; the existing estimate UI is legacy pipeline UI. | No `src/app/api/projects/**` or projects UI (glob empty); the legacy estimate/pipeline UI is the E2 path, not the canonical Project Quick BoM flow. | The demo runs only in-memory/script; app wiring must build the canonical Project flow and not shortcut through legacy E2. | later (P74+) |

## 7. Missing Functions / Product Gaps

Grouped by workflow stage. Each item is a missing capability, not a vague
improvement.

Intake/upload:
- No upload endpoint or service that records a BoQ `project_file` and triggers
  `normalizeProjectBoqFile` (the normalization service exists but has no caller).
- No project-creation + stage-materialization entry point a demo can call.

Normalization:
- No driver that turns an uploaded file into a `normalized_boq` artifact in one
  product-facing action (the pieces exist; wiring does not).

SKU review:
- No fuzzy (step 3) or AI-assisted (step 4) suggestion path; only exact +
  normalized are wired.
- No API/UI to present `sku_resolution` decisions and capture accept/reject
  (only the pure review helper + DB store exist).

Configuration expansion review:
- Active selector/composer now exists (P66, Section 5B); the active Batch 1+2+3
  pack is assembled from disk and the runner takes explicit per-line review
  decisions. Remaining gap: no API/UI to present the expansion draft and capture
  per-line accept/reject (B12).

Pricing review:
- Committed Honeywell demo SAR price map now exists (P68, B7); it is demo-fixture
  authority only. Still missing: production catalog->SAR sourcing/conversion and
  any API/UI to present priced lines and capture pricing approval (B12).

Export approval:
- Committed Honeywell SKU->Mantle-category map now exists (P68, B7) and the
  in-memory Mantle model is composed by the runner (P70). Still missing: no
  API/UI to trigger `createMantleExportArtifact` after pricing approval and
  surface the generated workbook for download/approval (B12), and no
  operator-facing command writes the workbook on demand (B11, P73).

Demo data/fixtures:
- In-memory Honeywell demo run through the spine now exists and is proven (P68/
  P71, Section 5B); a persisted DB-backed demo project/run is still missing (B3/
  B10).
- Honeywell SKU coverage in the local mock catalog unverified; the demo runner
  sidesteps it with human-accepted SKU decisions (B9).
- DB provisioning for project tables unverified (B10).

Error handling/readiness/status display:
- Staleness is planned but never applied at runtime (B6).
- No surface renders the readiness report's next-step/blocking-step to a user.

## 8. Output Issues To Test

Concrete output risks. Where the spine already has logic, the test confirms it;
where it depends on caller-supplied data, the test must supply realistic inputs.

- Customer line order: confirm `normalized_boq` and the Mantle workbook preserve
  the uploaded BoQ row order (no reordering). Logic present in `boq-formats.ts`
  and `mantle-workbook-writer.ts`; needs a real-input test.
- Parent-child grouping: confirm dotted hierarchy and expansion children nest
  under their source customer line in customer-then-children order
  (`config-expanded-bom-model.ts`, `config-expansion.ts`).
- Zero-price included lines: confirm `included_zero_price` child components are
  added and survive review and pricing (retained, not dropped).
- Rejected expansion lines excluded from pricing: confirm rejected lines are
  excluded from `acceptedLines` and never priced (`config-expansion-review.ts`,
  `priced-boq.ts`).
- Approved expansion lines included in pricing: confirm accepted expansion lines
  are priced by their own SKU.
- Unresolved/customer lines retained: confirm `missing_decision`,
  `not_accepted`, and `missing_price` rows are kept in place with a status/
  warning in both the priced draft and the Mantle workbook.
- Mantle workbook formulas/styles/totals: confirm preserved styles/widths,
  rebuilt category/total formulas referencing only written rows, and cached
  BOMATIC results (`mantle-workbook-writer.test.ts` covers the template path;
  extend with real inputs).
- SAR currency/margin/VAT: confirm SAR-only, 2-decimal rounding, margin/markup,
  and 15% VAT carried into the workbook totals; confirm a non-SAR price input
  throws.
- Source provenance retained: confirm every artifact records `sourceFileIds`/
  `sourceArtifactIds` and that the priced/export payloads echo upstream
  provenance ids/versions.
- Stale upstream blocks downstream: confirm a stale upstream artifact blocks
  downstream create and customer-deliverable readiness in the report, AND
  (after B6) that regenerating an upstream actually marks downstream stale.

## 9. Recommended Next Prompts

The Honeywell Quick BoM MVP path is the roughly 10-14 prompt slice that makes one
real demo path runnable before any broad UI polish; that narrow Quick BoM path is
the first target and RFP remains out of current scope. Each prompt stays narrow
(one verifiable success criterion). Prompts P66-P71 are now complete and proven
(Section 5B); P72 is this refresh; P73 is the operator demo command; later prompts
wire the canonical Project app flow.

Completed (P65-P71) - kept as the execution record; the proof is in Section 5B:

- P65 - Backlog refresh (the prior refresh; superseded by this P72 refresh).
- P66 - Active Honeywell Batch 1+2+3 selector/composer - DONE
  (`honeywell-config-expansion-rule-pack.ts`).
- P67 - Pure Quick BoM runner - DONE (`quick-bom-runner.ts`).
- P68 - Honeywell demo price/category fixture - DONE
  (`data/quick-bom/honeywell-demo-pricing-fixture.json`).
- P69 - Deterministic demo pricing from the fixture - DONE
  (`runHoneywellQuickBomDemoPricing`).
- P70 - In-memory Mantle export-model composition - DONE
  (`runHoneywellQuickBomDemoMantleExportModel`).
- P71 - Honeywell end-to-end validation (writes and re-opens a temporary Mantle
  workbook; structure/totals checks pass) - DONE
  (`honeywell-quick-bom-demo-e2e.test.ts`).

Recommended next prompts, in order:

- P72 - Backlog refresh + Honeywell Quick BoM demo operator runbook (this prompt)
  - Goal: refresh this backlog so it reflects the verified P66-P71 path and add an
    operator-facing runbook/checklist at
    `docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md` defining what the
    Honeywell Mantle workbook is, the post-P71 status, the authority boundaries,
    and the manual checklist to use after P73.
  - Files: this doc, the runbook, and their doc regression tests in
    `tests/lib/projects/`.
  - Stop: the backlog and runbook reflect the current state and their tests pass.

- P73 - Local Honeywell Mantle demo command/script
  - Goal: add a committed, operator-runnable local command/script that calls
    `runHoneywellQuickBomDemoMantleExportModel` and
    `writeMantlePriceEstimateWorkbook` to write the Honeywell Mantle demo workbook
    to a temp/demo output folder on demand. Composition only - no new pricing,
    configuration, AI, catalog, or SKU-substitution behavior; no app-level
    Project/API/UI/DB wiring. This closes B11.
  - Files: a script/command entry under the repo's existing script location plus a
    test; no `src/**` runtime behavior change beyond a thin command wrapper.
  - Stop: running the command writes a customer-facing Honeywell Mantle workbook
    matching the Section 5B counts/totals, openable without manual reformatting.

- P74+ - Canonical Project app flow wiring
  - Goal: wire the canonical Project Quick BoM flow (project create -> normalize
    -> SKU review -> expansion review -> pricing approval -> Mantle export) through
    Project/API/UI/DB, driven by the runner and the existing artifact/approval
    stores. It must build the canonical Project flow and must NOT shortcut through
    the legacy estimate/pipeline (E2) UI. This closes B4/B6/B12 and the persisted-
    DB part of B3/B10.
  - Files: API routes, UI, and DB provisioning under `src/`; tests.
  - Stop: an operator can drive the Honeywell Quick BoM demo through the app, with
    real review/approval surfaces and persisted state.

## 10. Open Questions

- Q1: Batch 1+2+3 rules are human-approved and committed and the active selector/
  composer is now wired and proven (Section 5B, P66); the open question is now
  only who signs off on any future Batch 4 expansion pack (optics and replacements
  stay out of expansion until then).
- Q2: Should the first operator demo be the local command/script (P73) or app/UI-
  first (P74+)? The recommended order is command-first, then app.
- Q3: Should the first demo use real project DB persistence (requires DB
  provisioning, B10) or in-memory service composition for speed?
- Q4: Which files are allowed as regression references for the demo, and what is
  the committed/sanitized source for the Honeywell SAR price and category maps
  (B7)? Benchmark/priced workbooks are references only, never rule sources.
- Q5: Is exact + normalized SKU resolution sufficient for the Honeywell demo, or
  is deterministic fuzzy suggestion (step 3) needed before the demo?

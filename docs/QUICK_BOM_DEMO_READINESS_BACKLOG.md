# Quick BoM Demo-Readiness Product Fix Backlog

Execution tracker only. `C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md`
is the architecture source of truth; this backlog never overrides it and is not a
planning document. Last refreshed by Prompt 65 to match the current Honeywell
configuration-expansion state (approved Batch 1+2+3 authority, the Batch 4
decision record, and the P65-P71 path).

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
`src/lib/projects/` and `src/lib/db/`. It is library-level, not yet wired into a
runnable end-to-end product surface (see Section 6).

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

This is a real, well-tested spine. It is NOT a runnable end-to-end product: no
coordinator, API, or UI invokes these services (Section 6, B1).

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

What is still missing: no committed runtime selector/loader assembles the Batch
1+2+3 packs from disk and composes them into the active expansion set yet -
nothing in `src/` loads the approved pack JSON or calls the composer (grep). That
active expansion pack selection/composition is the next implementation step (P66),
and it stays separate from pricing authority.

## 6. Demo Blockers

Priority key: P0 blocks a credible demo. P1 means the demo can proceed with a
visible manual workaround. P2 is polish/follow-up.

| ID | Priority | Area | Issue | Evidence from repo | Demo impact | Recommended fix prompt |
|----|----------|------|-------|--------------------|-------------|------------------------|
| B1 | P0 | Orchestration | No end-to-end Quick BoM wiring. The spine services exist only as libraries; nothing composes them into a runnable flow. | No `src/app/api/projects/**` (glob empty); no projects UI under `src/app/**/projects/**` (glob empty); the artifact-creation + approval services are referenced only within `src/lib/projects/` and `src/lib/db/` (grep), never from a coordinator/API/UI. | Cannot run the demo without writing a custom script that calls each service by hand. | P67 |
| B2 | P0 | Expansion pack selection | Approved Batch 1+2+3 packs and the composer both exist, but no committed runtime selector/loader assembles them from disk into the active expansion set. | `honeywell-batch1/2/3-approved-rules.json` are `status: "approved"`; `composeApprovedConfigExpansionRulePacks` merges them in memory and `validateRulePack` accepts the result, but nothing in `src/` loads the pack JSON or calls the composer (grep). | Expansion cannot run in a product flow until selection/composition is wired, so pricing and export stay unreachable. This is wiring, not rule authoring. | P66 |
| B3 | P0 | Demo fixture | No persisted real Honeywell project/run carried through the full spine. | No seed/fixture composes `normalized_boq -> sku_resolution -> configuration_expansion -> priced_boq -> export_package`; tests use hand-built artifact stubs (e.g. `quick-bom-readiness.test.ts`). | No durable demo state to show; every run starts from scratch via manual steps. | P68 |
| B4 | P1 | Review surfaces | No product-facing review UI/API for SKU resolution, configuration expansion, or pricing approvals. | Approval logic exists as a pure helper (`approvals.ts`) and a DB store (`project-approval-store.ts`) that transitions artifact + stage status, but has no caller outside tests; no API/UI. | Approvals are demoable only by direct service/script calls, not by a reviewer clicking approve. | later/post-MVP |
| B5 | P1 | Orchestration | Demo readiness depends on manual artifact construction. The readiness report is read-only and nothing advances the spine. | `quick-bom-readiness.ts` only inspects artifacts; the create-next-artifact services must each be invoked manually (no driver exists - same root cause as B1). | Operator must manually create each artifact in order; error-prone live. | P67 |
| B6 | P1 | Staleness | Upstream changes do not automatically mark downstream artifacts stale at runtime. | `staleness.ts planStaleArtifactUpdates` is pure planning with no caller in `src` (grep); `project-approval-store.ts` and `project-artifact-store.ts` explicitly do not propagate staleness. | Regenerating an upstream artifact mid-demo leaves stale downstream artifacts looking valid; the canonical "auto-stale" rule is not enforced. | later/post-MVP |
| B7 | P1 | Demo data | No committed SAR price source or Mantle category map for the Honeywell scope. Pricing and the Mantle product/service/subscription split both depend on caller-supplied maps. | `priced-boq.ts` consumes explicit `unitListPriceSarBySku` (no catalog->SAR); `mantle-price-estimate-model.ts` uses caller `categoryByAcceptedSku` and defaults unmapped priced rows to product with a warning. No committed Honeywell SAR/category map found. | Pricing returns mostly unpriced lines and the Mantle category totals are wrong unless the operator hand-builds both maps. Fixture pricing is temporary demo-fixture evidence only, never production authority. | P68 |
| B8 | P1 | Mantle export tests | No real customer-input export tests for Honeywell, Marafiq, or EnergyTech formats. | Glob/grep of `tests/lib/projects/` finds no Honeywell/Marafiq/EnergyTech or `Benchmarck_Files` references in the Mantle tests; `mantle-workbook-writer.test.ts` asserts structure against the committed template only. | Section 10/19 require real-input export proof; without it, "customer-ready without manual reformatting" is unproven for real BoQ shapes. | P70/P71 |
| B9 | P2 | Catalog coverage (needs verification) | SKU resolution resolves only against a committed local STC mock catalog; whether the Honeywell-scope SKUs are present is unverified. | `catalog-lookup.ts` reads `getCatalogMock()` (`LOCAL_CATALOG_SOURCE = local_stc_historical_mock`); exact + normalized only, no fuzzy/AI. Honeywell SKU coverage in the mock not checked. | If Honeywell SKUs are absent, every line is unresolved and must be accepted by hand SKU entry. Needs verification, then a fixture decision. | P68 |
| B10 | P2 | DB provisioning (needs verification) | Project-table provisioning for a demo DB is unproven; no committed migration directory. | `schema.ts` line ~301 `export * from "./project-schema"` with a "Not yet wired to runtime" note; `drizzle.config.ts` present; no `drizzle/` migration dir (glob empty). | A demo against real DB persistence may need `drizzle-kit push` or equivalent first; needs verification. | P67/P68 |

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
- Approved Batch 1+2+3 runtime rule packs exist and the composer merges them, but
  no committed runtime selector/loader assembles them into the active expansion
  set yet - the remaining P0 wiring gap (B2, P66). See Section 5A.
- No API/UI to present the expansion draft and capture per-line accept/reject.

Pricing review:
- No committed Honeywell SAR price map and no catalog->SAR sourcing/conversion;
  pricing input must be supplied by the caller (B7).
- No API/UI to present priced lines and capture pricing approval.

Export approval:
- No API/UI to trigger `createMantleExportArtifact` after pricing approval and to
  surface the generated workbook for download/approval.
- No committed Honeywell SKU->Mantle-category map (B7).

Demo data/fixtures:
- No seeded Honeywell demo project/run through the spine (B3).
- Honeywell SKU coverage in the local mock catalog unverified (B9).
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

In order. The sequence makes one real Honeywell Quick BoM demo path runnable
before any broad UI polish. Each prompt stays narrow (one verifiable success
criterion). These P65-P71 prompts are the next slice of the roughly 10-14 prompt
Honeywell Quick BoM MVP path; that narrow Quick BoM path is the first target and
RFP remains out of current scope.

- P65 - Backlog refresh (this prompt)
  - Goal: refresh this backlog to match the current Honeywell configuration-
    expansion state - approved Batch 1+2+3 authority, the Batch 4 decision record,
    the optics-standalone and replacements-deferred boundaries, and the P65-P71
    path.
  - Files: this doc plus a focused doc regression test in `tests/lib/projects/`.
  - Stop: the doc and its test reflect the current state.

- P66 - Active Honeywell Batch 1+2+3 selector/composer support
  - Goal: add a committed runtime selector/loader that reads the approved Batch 1,
    Batch 2, and Batch 3 pack JSON and composes them (via
    `composeApprovedConfigExpansionRulePacks`) into the active expansion pack for
    the Honeywell scope. Composition only - approves nothing new, infers no lines,
    replaces no SKUs, prices nothing. This is the next implementation step (B2).
  - Files: a loader/selector under `src/lib/projects/`; tests in
    `tests/lib/projects/`.
  - Stop: `buildConfigurationExpansionDraft` runs on the Honeywell scope using the
    composed Batch 1+2+3 pack assembled from disk, without throwing.

- P67 - Quick BoM runner skeleton
  - Goal: add one deterministic service that drives the spine end to end (create
    project, normalize, resolve, expand using the P66 composed pack, price,
    export) by composing the existing services, with no new business logic. This
    resolves the B1/B5 orchestration gap.
  - Files: new `src/lib/projects/quick-bom-runner.ts` (or `src/services/quick-bom/`),
    composing the existing artifact services + the approval and readiness helpers;
    tests in `tests/lib/projects/`.
  - Stop: a test runs a synthetic project from upload to `export_package` and the
    readiness report reports customer-deliverable ready.

- P68 - Honeywell demo price/category fixture
  - Goal: provide a reproducible Honeywell demo dataset - a committed sample BoQ
    input path, a SAR `unitListPriceSarBySku` map, and a SKU->Mantle-category map -
    plus verification that Honeywell SKUs resolve and project tables provision. The
    fixture pricing is temporary demo-fixture evidence only, never production
    pricing authority (Section 3).
  - Files: fixtures under `tests/fixtures/` or `data/`; a documented provisioning
    step; tests.
  - Stop: the P67 runner produces a fully priced Mantle workbook for the Honeywell
    fixture with correct category totals.

- P69 - Deterministic pricing from approved expansion
  - Goal: price the accepted expanded BoM deterministically from the P68 fixture
    inputs, keeping standalone optics priced as customer BoQ lines (not expansion
    children) when present in scope. No runtime AI, catalog, or pricing decision.
  - Files: tests and any thin glue under `src/lib/projects/`; no new pricing
    authority.
  - Stop: pricing returns SAR-priced lines for the Honeywell fixture with VAT/
    margin per Section 9 of the planning file.

- P70 - Mantle export path from approved priced BoQ
  - Goal: drive the Mantle-format export from the approved priced BoQ produced by
    P69, preserving all Mantle output requirements (Section 10 of the planning
    file).
  - Files: tests under `tests/lib/projects/` using the committed template (not the
    confidential benchmark workbooks).
  - Stop: the runner exports a customer-ready Mantle workbook from the Honeywell
    priced BoQ without manual reformatting.

- P71 - Honeywell end-to-end validation
  - Goal: prove the full Honeywell Quick BoM path (normalize -> resolve -> expand
    -> price -> export) end to end on the committed fixture, including real-input
    Mantle export assertions for the Honeywell shape.
  - Files: an end-to-end test under `tests/lib/projects/`.
  - Stop: the Honeywell end-to-end test passes with structure/totals assertions and
    the readiness report reports customer-deliverable ready.

## 10. Open Questions

- Q1: Batch 1+2+3 rules are human-approved and committed (Section 5A); the open
  question is now narrower - wire the active selector/composer (B2/P66), and
  decide who signs off on any future Batch 4 expansion pack (optics and
  replacements stay out of expansion until then).
- Q2: Should the first demo be CLI/service-only (P67) or API/UI-first
  (later/post-MVP)? The recommended order is service-first, then UI.
- Q3: Should the first demo use real project DB persistence (requires DB
  provisioning, B10) or in-memory service composition for speed?
- Q4: Which files are allowed as regression references for the demo, and what is
  the committed/sanitized source for the Honeywell SAR price and category maps
  (B7)? Benchmark/priced workbooks are references only, never rule sources.
- Q5: Is exact + normalized SKU resolution sufficient for the Honeywell demo, or
  is deterministic fuzzy suggestion (step 3) needed before the demo?

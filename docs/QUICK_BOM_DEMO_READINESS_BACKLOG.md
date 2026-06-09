# Quick BoM Demo-Readiness Product Fix Backlog

Execution tracker only. `C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md`
is the architecture source of truth; this backlog never overrides it and is not a
planning document. Last refreshed by Prompt 138 (docs/test alignment cleanup, after Prompt 137 added
`scripts/prove-project-quick-bom-route-real-db.ts` and ran it against local Docker
Postgres (live-DB Quick BoM API route/action-chain proof, Section 5H). Prior:
refreshed by Prompt 136 after Prompt 135 added
`scripts/prove-project-real-db.ts` and ran it against local Docker Postgres (B10
closed for local/provisioned Project-store real-DB proof) and the Prompt 136
docs/test alignment. Prior: refreshed by Prompt 134 after Prompt 133 applied
automatic downstream artifact staleness propagation in
`src/lib/db/project-artifact-store.ts` (B6 closed) and the Prompt 134 docs/test
alignment. Prior: refreshed by Prompt 132
after Prompts 104-131 (P104-P114
Honeywell demo catalog supplement explicit opt-in and authority-safe UI wiring;
P126-P131 line-level SKU/config/pricing review UI screens and full seven-line Honeywell
app proof). Prior closure: refreshed by Prompt 98 to reflect the committed repo state
after Prompts 83-97 (the broader Quick BoM app route/action chain), closing the
Prompt 83-98 app-readiness sequence. The Prompt 65-82 seeded Honeywell closure record
is preserved below: the proven in-memory P66-P71 Honeywell Quick BoM spine (active
Batch 1+2+3 selector/composer, the pure Quick BoM runner, the demo price/category
fixture, deterministic demo pricing, the in-memory Mantle model, and the Prompt 71
end-to-end validation that writes and re-opens a temporary Mantle workbook) stays
intact in Section 5B; Prompt 73 added the operator-facing demo command
(`scripts/write-honeywell-quick-bom-demo.ts`); Prompts 74-76 added CCW parity
evidence and proved exact 60-row CCW sequence parity after switch child ordering
(Section 5C); and Prompts 77-81 added a narrow app-level seeded-demo surface - a
read-only workspace model and GET route, a persisted Honeywell demo Project fixture,
an approval service and POST route, a minimal Project Quick BoM UI, and an app-level
end-to-end proof (Section 5D). On top of that seeded slice, Prompts 83-97 added and
proved the broader Quick BoM app route/action chain beyond the seeded fixture -
create Project, upload BoQ, normalize, SKU draft/review, configuration draft/review,
pricing, pricing review, export creation, export approval, and download (Section 5E).
The Batch 4 record stays a decision record only. Prompts 100/101 then aligned the
DB-readiness evidence to the committed migration SQL and the withTenantDb
tenant-context wrapper, and Prompts 102/103 align the catalog-coverage evidence to the
read-only Prompt 102 Honeywell catalog coverage audit (verified local mock coverage
with material missing-SKU gaps).

This backlog remains an execution tracker, not the architecture source of truth. The
Prompt 97 app-level arbitrary-Project proof runs the current app/routes/services for a
non-seeded quick_bom Project under the test harness/in-memory store on a reduced
catalog-resolvable CSV subset. Prompts 104-114 added explicit Honeywell demo catalog
supplement opt-in and authority-safe UI wiring. Prompts 126-131 added line-level
SKU/config/pricing review UI screens (`src/app/projects/[id]/quick-bom/page.tsx`,
tested by `tests/ui/project-quick-bom-page.test.tsx`) and proved the full seven-line
Honeywell BoQ upload through the app UI/panels with committed fixture totals (Section 5F).
Prompt 133 applied automatic downstream artifact staleness propagation in
`src/lib/db/project-artifact-store.ts` (B6 closed). Prompt 134 is the prior docs/test
alignment refresh. Prompt 135 added `scripts/prove-project-real-db.ts` and ran it
against local Docker Postgres (B10 closed for local/provisioned Project-store
real-DB proof). Prompt 136 is the prior docs/test alignment refresh. Prompt 137 added
`scripts/prove-project-quick-bom-route-real-db.ts` and ran it against local Docker
Postgres, proving the full Honeywell seven-line Quick BoM API route/action chain
against a real DB (Section 5H). Prompt 138 is this docs/test alignment cleanup. None
of these proofs claim production readiness; honest remaining gaps are in Sections 6-7.

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
`src/lib/projects/` and `src/lib/db/`. A pure in-memory Quick BoM runner drives
this spine end to end (Section 5B). A seeded Honeywell app-level surface wraps the
spine for the full Honeywell demo Project (Section 5D), and the broader app
route/action chain now exists for a non-seeded arbitrary quick_bom Project
(Section 5E). Line-level SKU/config/pricing review UI now exists (P126-P131,
Section 5F). Project-store local real-DB proof exists (P135,
`scripts/prove-project-real-db.ts`). Quick BoM API route/action chain against real DB
exists (P137, `scripts/prove-project-quick-bom-route-real-db.ts`, Section 5H).
Browser-driven UI against live DB, manual browser QA, production deployment, and full
uploaded Honeywell catalog coverage through real SKU resolution remain open
(Sections 6-7).

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
  planned `stale` transitions (`staleness.ts`). Prompt 133 wires the planner into
  the artifact repository: `createProjectArtifactVersion`
  (`project-artifact-store.ts`) now calls `planStaleArtifactUpdates` inside the
  same tenant-scoped transaction after inserting a new artifact version, marking
  latest eligible downstream artifact versions stale. Immutable history preserved;
  only `status -> stale` and `updatedAt` on planned downstream artifacts;
  missing/stale/not_applicable latest downstream skipped. Verified by
  `tests/lib/db/project-artifact-store.test.ts` (normalized_boq, sku_resolution,
  configuration_expansion, and priced_boq regeneration stale the correct downstream
  Quick BoM artifacts).

Tests (confirmed): a broad suite under `tests/lib/projects/` covers the modules
above, including readiness, the artifact services, the Mantle writer, the
approved Honeywell Batch 1/2/3 rule packs, the rule-pack composer, and the Batch 4
decision record.

This is a real, well-tested spine. A pure in-memory Quick BoM runner composes it
end to end and is proven by the Prompt 71 end-to-end test (Section 5B). A seeded
app-level surface (GET workspace route, approval POST route/service, and a minimal
Project Quick BoM UI) drives the full Honeywell demo Project (Section 5D). The
P83-P97 route/action chain then extends the app surface beyond the seeded fixture
(Section 5E). Prompt 137 proves the full Honeywell seven-line Quick BoM API
route/action chain against a real local/provisioned Postgres DB (Section 5H). This
still does not replace the legacy estimate/pipeline UI, which remains the E2 path and
is not the canonical Project Quick BoM flow.

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

Status after Prompts 73-97 (the in-memory spine above is unchanged):

- The operator-facing demo workbook command now exists (Prompt 73,
  `scripts/write-honeywell-quick-bom-demo.ts`); see Section 5C.
- A narrow app-level surface now drives the spine for the seeded Honeywell demo
  Project (Prompts 77-81); see Section 5D. It is scoped to the seeded demo path
  under the test harness/in-memory store.
- The broader app route/action chain now exists beyond the seeded fixture
  (Prompts 83-97); see Section 5E. It is proved under the test harness/in-memory
  store on reduced catalog-resolvable input, not production DB/browser execution.
- The legacy estimate/pipeline UI remains the E2 path, not the canonical Project
  Quick BoM flow. Future production app hardening must continue the canonical Project
  flow and must not shortcut through legacy E2.
- No Batch 4 runtime expansion pack; optics stay standalone customer BoQ lines;
  replacements remain deferred with no silent SKU substitution.
- The demo pricing fixture is Honeywell MVP demo-only authority, not production
  pricing authority.

## 5C. Honeywell CCW Parity And Operator Command (P73-P76)

Evidence and workbook-readiness work completed and committed after the in-memory
spine. It adds no runtime authority, no pricing authority, no configuration
authority, and no app/API/UI/DB behavior.

- Operator command exists (P73): `scripts/write-honeywell-quick-bom-demo.ts` runs
  the same verified in-memory path the Prompt 71 e2e proves and writes a fresh
  Mantle `.xlsx` on demand (default under the OS temp dir; `--output <path>` to
  choose). Composition only - no new pricing, configuration, AI, catalog, or
  SKU-substitution behavior. P73 itself added no app/API/UI/DB behavior; the
  seeded-demo app surface was added later in P77-P81. See
  `docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md`.
- CCW parity evidence exists (P74):
  `docs/quick-bom/HONEYWELL_CCW_PARITY_EVIDENCE.md` plus
  `tests/lib/projects/honeywell-ccw-parity-evidence.test.ts` compare the generated
  Honeywell Mantle workbook against the configured/priced CCW reference
  `Estimate_NB167337237YA.xlsx`. The CCW estimate is regression/evidence for
  Honeywell MVP parity only, not permanent Cisco authority.
- CCW-like switch child ordering exists (P75):
  `getHoneywellMvpConfigExpansionRulePack`
  (`src/lib/projects/honeywell-config-expansion-rule-pack.ts`) reorders existing
  child lines under the two approved switch parents (`C9300X-48HX-A`,
  `C9300L-24P-4X-A`) into the CCW print sequence, adding/removing/repricing nothing.
- Exact 60-row CCW sequence parity is proven (P76): after the Prompt 75 ordering,
  the parity evidence and test confirm the generated row sequence matches the CCW
  item-row sequence across all 60 item rows, with no documented exceptions. The set,
  quantities, and pricing were already at parity; Prompt 75 closed the row order.

## 5D. App-Level Seeded Honeywell Demo Surface (P77-P81)

A narrow app-level surface now drives the Quick BoM spine for the seeded Honeywell
demo Project. It is a real GET/POST route pair, a real review/approval service, a
real UI page, a persisted demo Project fixture, and an app-level end-to-end proof.

- Read-only workspace model + GET route (P77): `loadProjectQuickBomWorkspace`
  (`src/lib/projects/project-quick-bom-workspace.ts`) builds a serializable,
  payload-free Quick BoM workspace (project summary, stages, latest spine artifacts,
  approvals, readiness report); `GET /api/projects/[id]/quick-bom`
  (`src/app/api/projects/[id]/quick-bom/route.ts`) returns it, tenant-scoped, with
  not_found -> 404 / wrong_mode -> 409 / ok -> 200. Read-only: no mutation, pricing,
  export, runner, catalog, or AI.
- Persisted Honeywell demo Project fixture (P78):
  `createHoneywellQuickBomDemoProjectFixture`
  (`src/lib/projects/honeywell-demo-project-fixture.ts`) seeds the one canonical
  Honeywell quick_bom demo Project end to end through the existing Project stores
  (normalized_boq -> draft/reviewed sku_resolution -> configuration_expansion ->
  priced_boq -> Mantle export_package), approving each gated step and leaving the
  export package needs_review. DEMO-ONLY, not a production seeder.
- Approval service + POST route (P79): `reviewProjectQuickBomArtifact`
  (`src/lib/projects/project-quick-bom-approval.ts`) records an approve/reject
  decision against an EXACT artifact version for the four approval-gated Quick BoM
  artifact types only (sku_resolution, configuration_expansion, priced_boq,
  export_package) and returns the refreshed workspace;
  `POST /api/projects/[id]/quick-bom/approvals`
  (`src/app/api/projects/[id]/quick-bom/approvals/route.ts`) exposes it. Approval is
  per exact artifact id, never by type/latest/stage; the decider is the session user.
- Minimal Project Quick BoM UI (P80):
  `src/app/projects/[id]/quick-bom/page.tsx` GETs the read-only workspace and renders
  the project summary, readiness, stages, latest spine artifacts, and approvals; its
  only mutation is an approve/reject POST for the four gated types. It never renders
  or depends on artifact payloads and imports the read-model shapes with `import type`.
- App-level Honeywell E2E (P81):
  `tests/app/honeywell-quick-bom-app-e2e.test.tsx` seeds the real fixture, renders the
  real UI over the real GET route, approves the export package over the real POST
  route/service, and generates the export workbook on disk. It asserts the export
  package moves needs_review -> approved, readiness becomes customer-deliverable
  ready, and payload-only artifact values never reach the DOM. Only framework/store
  boundaries are mocked (useParams, requireAuth, the three Project DB stores via one
  in-memory store).

Scope of this seeded app-level proof: it covers the seeded Honeywell demo Project path
under the test harness/in-memory store. The broader arbitrary-Project app route/action
chain is covered separately in Section 5E (P83-P97). Neither proof claims browser-driven
UI against live/provisioned DB, broad customer formats, or manual browser QA are
complete. Those remain open (Section 6, Section 7).

## 5E. App-Level Arbitrary Quick BoM Flow (P83-P97)

Beyond the seeded Honeywell demo surface (Section 5D), the Quick BoM app route/action
chain now exists for a non-seeded, arbitrary quick_bom Project. These are real route
handlers and services wired into the Project Quick BoM UI; they were added and proved
across Prompts 83-97 and committed.

App route/action chain (each a committed route handler):

- Create Project: `POST /api/projects/quick-bom`
  (`src/app/api/projects/quick-bom/route.ts`) creates a quick_bom Project shell (P83).
- Upload BoQ: `POST /api/projects/[id]/quick-bom/files` records a BoQ Project file (P84).
- Normalize: `POST /api/projects/[id]/quick-bom/files/[fileId]/normalize` creates the
  `normalized_boq` artifact (P85).
- SKU resolution draft: `POST .../artifacts/[artifactId]/sku-resolution` creates a
  `sku_resolution` draft (P86).
- SKU resolution review: `POST .../artifacts/[artifactId]/sku-resolution/review` records
  explicit per-line SKU review decisions (P87).
- Configuration expansion draft:
  `POST .../artifacts/[artifactId]/configuration-expansion` creates a
  `configuration_expansion` draft (P88).
- Configuration expansion review:
  `POST .../artifacts/[artifactId]/configuration-expansion/review` records explicit
  per-line expansion review decisions (P89).
- Pricing: `POST .../artifacts/[artifactId]/priced-boq` creates `priced_boq` from the
  approved/accepted `configuration_expansion` (P90).
- Pricing review: `POST .../artifacts/[artifactId]/priced-boq/review` records pricing
  review approval/rejection (P91).
- Export creation: `POST .../artifacts/[artifactId]/export-package` creates
  `export_package` from the approved `priced_boq` (P94).
- Export download: `GET .../artifacts/[artifactId]/export-package/download` serves the
  already-approved export workbook (P95).

Prompts 92-93 extended the minimal route/service tests around the pricing/export action
chain and the app/workspace readiness wiring for the post-review chain (test and wiring
extensions as committed, not new files). Prompt 96 wired the Project Quick BoM UI action
rail (`src/app/projects/[id]/quick-bom/page.tsx`) to support upload+normalize, the
create draft/action buttons, priced review, export creation, and the approved-export
download link.

Prompt 97 app-level arbitrary-Project E2E
(`tests/app/project-quick-bom-arbitrary-flow-e2e.test.tsx`) proves the chain for a
non-seeded arbitrary quick_bom Project using the current app/routes/services under the
test harness/in-memory store: upload -> normalize -> SKU draft -> explicit SKU review ->
SKU approval -> configuration draft -> explicit configuration review -> configuration
approval -> pricing -> priced approval -> export -> export approval -> download. It is
intentionally a reduced arbitrary-Project proof on a reduced catalog-resolvable CSV
subset; it does not prove full uploaded Honeywell customer BoQ catalog coverage through
real SKU resolution.

In the P97 flow the SKU and configuration line reviews are made through direct route
calls (`.../sku-resolution/review`, `.../configuration-expansion/review`) - the UI
showed a line-review-required notice at P97 time; line-level review UI screens were
added in P126-P131 (Section 5F). Priced review is driven UI-only and export approval
runs through the UI. The seeded Honeywell fixture (Section 5D) remains the full 60-row
Honeywell CCW parity demo path; the arbitrary Project E2E is the route/action chain
proof on reduced catalog-resolvable input.

This app-level arbitrary-Project proof does NOT prove:

- production DB provisioning/RLS/migrations (the E2E runs against an in-memory store);
- manual browser QA;
- full uploaded Honeywell BoQ through real SKU resolution;
- full local catalog coverage for Honeywell parent SKUs;
- production pricing authority;
- broad Cisco-general configuration authority.

Prompt 102 added a read-only Honeywell catalog coverage audit
(`docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md`,
`src/lib/projects/honeywell-catalog-coverage-audit.ts`,
`tests/lib/projects/honeywell-catalog-coverage-audit.test.ts`) so the catalog coverage
above is now verified with material gaps rather than an open question. Against the
local_stc_historical_mock source the seven Honeywell customer rows resolve 4 matched, 3
not_found, 0 ambiguous (missing CW9178I-CFG, C9300X-48HX-A, C9300L-24P-4X-A) and the
broader 50-SKU demo universe resolves 30 matched, 20 not_found, 0 ambiguous. The audit
is evidence only and grants no pricing, configuration, production catalog, or
substitution authority. Full uploaded Honeywell BoQ through real SKU resolution stays a
remaining gap because those missing local mock catalog SKUs (the three customer parent
SKUs and the twenty broader demo SKUs) are absent, not because coverage is unproven;
closing it needs explicit catalog-fixture/authority work.

The product is still not production-ready for arbitrary customers; full customer and
general production readiness remains future. The authority boundaries are unchanged:
no runtime AI/catalog/pricing/configuration decisions; demo-only pricing fixture;
pricing authority and configuration authority stay separate; Batch 4 is a decision
record only; optics are standalone customer BoQ lines; replacements remain deferred
with no silent substitution.

## 5F. UI Hardening And Full App Proof (P104-P131)

Prompts 104-114 added explicit Honeywell demo catalog supplement opt-in and
authority-safe UI wiring. The catalog supplement is explicit opt-in only and demo
scoped; it grants no production pricing or catalog authority.

Prompts 126-131 added line-level SKU/config/pricing review UI screens to
`src/app/projects/[id]/quick-bom/page.tsx` and proved the full seven-line Honeywell
BoQ upload through the app UI/panels under the test harness/in-memory store.
Test file: `tests/ui/project-quick-bom-page.test.tsx`.

Prompt 131 full seven-line Honeywell app proof (committed fixture totals):

- 7 normalized customer rows
- 7 accepted SKU review decisions
- 60 accepted configuration lines
- 60 priced lines
- 60 export rows
- no unpriced lines / no missing prices
- totalPriceSar 2185708.76
- totalIncVatSar 2513565.07

The proof runs under the test harness/in-memory store, not live/provisioned DB or real
browser QA. Authority boundaries unchanged: Honeywell demo catalog supplement is
explicit opt-in only and demo scoped; runtime AI performs no SKU/config/pricing
decisions; configuration authority is approved Honeywell Batch 1+2+3 only; pricing
authority is committed Honeywell demo fixture only. Project-store local real-DB proof
exists (P135, `scripts/prove-project-real-db.ts`); Quick BoM API route/action chain
against real DB exists (P137, `scripts/prove-project-quick-bom-route-real-db.ts`);
browser-driven UI against live DB remains open; manual browser QA remains not run.
Batch 4 remains a decision record only; optics remain standalone customer BoQ lines;
no silent SKU replacement.

## 5G. Local Docker Postgres Project-State Proof (P135)

Prompt 135 added `scripts/prove-project-real-db.ts` and ran it successfully against
local Docker Postgres. The proof reported:

- result PASS;
- required tables present: tenants, projects, project_stages, project_artifacts,
  project_approvals;
- stage count 5;
- wrong-tenant read null;
- approval count 1;
- after normalized_boq v2: sku_resolution, configuration_expansion, priced_boq, and
  export_package stale, while normalized_boq v2 remains generated;
- cleanup ok, proof tenant rows removed.

The script proves existing Project repository/service behavior against a real DB:
`createQuickBomProject`, `getProjectById` tenant-scoped read,
`createProjectArtifactVersion`/`listProjectArtifacts`,
`createProjectApproval`/`listProjectApprovals`, and Prompt 133 downstream staleness
propagation. It is an operator proof/evidence command only; it does not change product
behavior and was run via `npx.cmd tsx scripts/prove-project-real-db.ts`.

This closes B10 for local/provisioned Project-store real-DB proof. It does NOT prove:
- production deployment readiness;
- manual browser QA;
- browser-driven UI against a live/provisioned DB;
- full uploaded Honeywell BoQ through real SKU resolution;
- production Cisco pricing authority;
- broad Cisco-general configuration authority.

## 5H. Live-DB Quick BoM API Route/Action Chain Proof (P137)

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
  profile/supplement and demo fixture authority);
- production Cisco pricing authority;
- broad Cisco-general configuration authority.

## 6. Demo Blockers

Priority key: P0 blocks a credible demo. P1 means the demo can proceed with a
visible manual workaround. P2 is polish/follow-up. Blockers resolved since Prompt
65 are kept for the audit trail and marked Done with the prompt that closed them;
see Sections 5B-5D for the proven path.

| ID | Priority | Area | Issue | Evidence from repo | Demo impact | Status / next prompt |
|----|----------|------|-------|--------------------|-------------|----------------------|
| B1 | P0 | Orchestration | End-to-end Quick BoM wiring at the runner level and app route/action level. | The pure in-memory runner `src/lib/projects/quick-bom-runner.ts` composes the spine end to end and is proven by `honeywell-quick-bom-demo-e2e.test.ts` (Section 5B). A seeded app-level surface drives the Honeywell demo Project (Section 5D, P77-P81), and the P83-P97 app route/action chain proves a non-seeded arbitrary Project path on reduced catalog-resolvable input (Section 5E). | The demo path runs in-memory via the runner; the seeded demo runs through the app routes/UI; the arbitrary route/action chain is proven under the test harness/in-memory store. | Done at runner level (P67); seeded-demo app surface done (P77-P81); route/action chain done (P83-P97); Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open (B10/B12) |
| B2 | P0 | Expansion pack selection | Active runtime selector/composer for the Batch 1+2+3 packs. | `getHoneywellMvpConfigExpansionRulePack` (`src/lib/projects/honeywell-config-expansion-rule-pack.ts`) reads the committed Batch 1+2+3 approved pack JSON and composes them via `composeApprovedConfigExpansionRulePacks` into the active pack that `buildConfigurationExpansionDraft` accepts. | Expansion now runs from disk-loaded approved packs; pricing and export are reachable. Composition only - no new approval, no pricing. | Done (P66) |
| B3 | P0 | Demo fixture | A reproducible Honeywell demo run through the spine. | The committed fixture `data/quick-bom/honeywell-demo-pricing-fixture.json` plus the runner carry one Honeywell-shaped run `normalize-input -> expand -> review -> price -> Mantle model`, proven by the P71 e2e test. A persisted Honeywell demo Project fixture now seeds the same run through the Project stores (`honeywell-demo-project-fixture.ts`, P78), exercised against an in-memory store in the P81 app E2E. Prompt 135 proves the Project-store layer against local Docker Postgres (B10). | The in-memory demo and the seeded demo Project are reproducible and proven; Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137, Section 5H); browser-driven UI/live DB and production deployment remain open. | In-memory demo proven (P68/P71); seeded demo Project present (P78); Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open (B10) |
| B4 | P1 | Review surfaces | Product-facing review/approval surface for the approval-gated Quick BoM artifacts. | A review/approval service (`project-quick-bom-approval.ts`, P79) and POST route (`approvals/route.ts`) record an approve/reject decision against an EXACT artifact version for the four gated types, and the UI page (`page.tsx`, P80/P96) offers approve/reject plus the workflow action rail; proven by the P81 and P97 app E2Es. Per-line SKU/config review routes (`.../sku-resolution/review` P87, `.../configuration-expansion/review` P89) and the priced review route (`.../priced-boq/review` P91) exist. Line-level SKU/config/pricing review UI screens now exist (P126-P131, `tests/ui/project-quick-bom-page.test.tsx`). | Reviewers can approve/reject gated artifacts and record per-line SKU/config decisions; line-level review UI now exists (P126-P131). | Minimally present (P79/P80); per-line review routes present (P87/P89/P91); line-level review UI done (P126-P131) |
| B5 | P1 | Orchestration | Driving the spine no longer needs hand-built artifacts. | The runner advances input -> expand -> review -> price -> Mantle model deterministically; `quick-bom-readiness.ts` remains a read-only report alongside it. The P77-P81 seeded-demo app surface renders readiness for the Honeywell demo Project, and the P83-P97 route/action chain drives upload -> normalize -> review -> price -> export -> download for a non-seeded arbitrary Project under test. | Operator no longer hand-assembles each step in-memory; seeded and reduced arbitrary app flows have driver/readiness surfaces. Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open; line-level review UI is done (P126-P131). | Done at runner level (P67); seeded-demo readiness surface done (P77-P81); arbitrary route/action chain done (P83-P97); Quick BoM API route/action chain against real DB exists (P137) |
| B6 | P1 | Staleness | Upstream changes automatically mark downstream artifacts stale at runtime. | Prompt 133 wired `planStaleArtifactUpdates` (`staleness.ts`) into `createProjectArtifactVersion` (`project-artifact-store.ts`): after inserting a new artifact version the store calls the planner inside the same tenant-scoped transaction and marks latest eligible downstream artifact versions stale. Immutable history preserved; only `status -> stale` and `updatedAt` on planned downstream artifacts; missing/stale/not_applicable latest downstream skipped. Verified by `tests/lib/db/project-artifact-store.test.ts` (normalized_boq, sku_resolution, configuration_expansion, and priced_boq regeneration stale correct downstream artifacts). | Regenerating an upstream artifact now marks downstream artifacts stale automatically; the canonical "auto-stale" rule is enforced. | Done (P133) |
| B7 | P1 | Demo data | Committed SAR price source and Mantle category map for the Honeywell scope. | The committed demo fixture supplies a SAR `unitListPriceSarBySku` map and a SKU->Mantle-category map for exactly the 50 demo SKUs (loader `honeywell-demo-pricing-fixture.ts`); the P71 e2e test prices all 60 lines with correct category totals and no warnings. Fixture pricing is temporary demo-fixture evidence only, never production authority (Section 3). | Pricing and category totals are correct for the Honeywell demo scope. | Done (P68) |
| B8 | P1 | Mantle export tests | Real-input Mantle export proof for the Honeywell shape. | `honeywell-quick-bom-demo-e2e.test.ts` writes the Honeywell Mantle model to a temporary workbook and re-opens it to assert rows, order, category footers, and totals against the committed template. Marafiq/EnergyTech real-input export tests are still not present. | Honeywell "customer-ready without manual reformatting" is now proven; other customer formats remain unproven. | Done for Honeywell (P71); other formats later |
| B9 | P2 | Catalog coverage | SKU resolution resolves only against a committed local STC mock catalog; Prompt 102 verified which Honeywell-scope SKUs that mock resolves and misses. | `catalog-lookup.ts` reads `getCatalogMock()` (`LOCAL_CATALOG_SOURCE = local_stc_historical_mock`); exact + normalized only, no fuzzy/AI. The read-only Prompt 102 audit (`docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md`, `src/lib/projects/honeywell-catalog-coverage-audit.ts`, `tests/lib/projects/honeywell-catalog-coverage-audit.test.ts`) records customer rows 7 total, 4 matched, 3 not_found, 0 ambiguous (missing CW9178I-CFG, C9300X-48HX-A, C9300L-24P-4X-A) and broader demo SKUs 50 total, 30 matched, 20 not_found, 0 ambiguous, against local_stc_historical_mock only. Audit-only: no pricing, configuration, production catalog, or substitution authority. | A full uploaded Honeywell BoQ through real SKU resolution would still leave those missing rows unresolved unless explicit catalog-fixture/authority work is approved later; the demo runner sidesteps this by taking human-accepted SKU decisions (acceptedSku == originalSku). | Coverage verified (P102); missing-SKU gap still open |
| B10 | P2 | DB provisioning | Project-table provisioning against a real Postgres DB is now proven for the local/provisioned Project-store layer by Prompt 135. | Committed migration SQL exists under `src/lib/db/migrations/` (the `drizzle.config.ts` `out` path), including `0004_project_state.sql`, which creates the six Project tables plus their RLS tenant-isolation policies. `withTenantDb` (`src/lib/db/index.ts`) sets PostgreSQL `app.tenant_id` transaction-locally and is covered by `tests/lib/db/tenant-db.test.ts` (P100). Prompt 135 added `scripts/prove-project-real-db.ts` and ran it against local Docker Postgres: required tables present (tenants, projects, project_stages, project_artifacts, project_approvals); stage count 5; wrong-tenant read null; approval count 1; downstream staleness propagation verified; cleanup ok (see Section 5G). | Local/provisioned Project-store real-DB proof run (P135, `scripts/prove-project-real-db.ts`); Quick BoM API route/action chain against real DB exists (P137, `scripts/prove-project-quick-bom-route-real-db.ts`); browser-driven UI/live DB and production deployment remain open. | Migration SQL + tenant wrapper present and unit-tested (P100); local/provisioned Project-store proof run (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open |
| B11 | P0 | Operator command | Operator-facing command/script that writes the Honeywell Mantle demo workbook on demand. | `scripts/write-honeywell-quick-bom-demo.ts` (P73) invokes `runHoneywellQuickBomDemoMantleExportModel` + `writeMantlePriceEstimateWorkbook` to write a fresh `.xlsx` an operator can open (`--output <path>`; default under the OS temp dir), and prints an operator summary derived from the computed model. | An operator can regenerate the demo workbook live without the test harness. | Done (P73) |
| B12 | P1 | App-level wiring | Broad canonical Project/API/UI/DB flow for the Quick BoM path beyond the seeded fixture. | The app route/action chain now exists beyond the seeded demo Project: create Project (`POST /api/projects/quick-bom`), upload (`.../quick-bom/files`), normalize, SKU draft/review, configuration draft/review, pricing, pricing review, export creation, and export download, wired into `src/app/projects/[id]/quick-bom/page.tsx` and proved for an arbitrary Project by `tests/app/project-quick-bom-arbitrary-flow-e2e.test.tsx` (P83-P97, Section 5E). Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open; full customer/general production readiness remains future; the legacy estimate/pipeline UI remains the E2 path. Line-level SKU/config/pricing review UI now exists (P126-P131). | The arbitrary-Project chain runs through the app routes/UI on reduced catalog-resolvable input; Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open; line-level review UI is done (P126-P131); broad app wiring must not shortcut through legacy E2. | Seeded-demo surface done (P77-P81); route/action chain done (P83-P97); line-level review UI done (P126-P131); Project-store local real-DB proof exists (P135); Quick BoM API route/action chain against real DB exists (P137); browser-driven UI/live DB and production deployment remain open |

## 7. Missing Functions / Product Gaps

Grouped by workflow stage. Each item is a missing capability, not a vague
improvement. The P77-P81 surface added a narrow seeded-demo path and the P83-P97 chain
added the broader app route/action wiring (Section 5E); the gaps below are what remains
beyond them.

Intake/upload:
- A general BoQ upload endpoint now exists (`POST /api/projects/[id]/quick-bom/files`,
  P84) and records an arbitrary customer BoQ `project_file`; an arbitrary quick_bom
  Project is created by `POST /api/projects/quick-bom` (P83). Remaining gap: the chain
  is proved on a reduced catalog-resolvable CSV subset (P97) and does not prove full
  uploaded Honeywell BoQ through real SKU resolution or full local catalog coverage for
  Honeywell parent SKUs.

Normalization:
- The normalize route (`POST /api/projects/[id]/quick-bom/files/[fileId]/normalize`,
  P85) turns an uploaded BoQ file into a `normalized_boq` artifact in one
  product-facing action, proved end to end for an arbitrary Project by P97. Remaining
  gap: broad customer-format coverage beyond the locked Format #1/#2 is still future.

SKU review:
- No deterministic fuzzy (step 3) or AI-assisted (step 4) suggestion path; only
  exact + normalized lookup is wired. Both remaining steps are suggestion-only and
  human-approved by design - never a runtime AI decision.
- A per-line SKU review route now exists (`.../sku-resolution/review`, P87) and records
  explicit per-line accept/reject decisions. A line-level SKU review UI now exists in
  `src/app/projects/[id]/quick-bom/page.tsx` (P126-P131, tested by
  `tests/ui/project-quick-bom-page.test.tsx`).

Configuration expansion review:
- Active selector/composer exists (P66, Section 5B) and a per-line configuration
  expansion review route now exists (`.../configuration-expansion/review`, P89) that
  records explicit per-line accept/reject decisions. A line-level configuration
  expansion review UI now exists in `src/app/projects/[id]/quick-bom/page.tsx`
  (P126-P131, tested by `tests/ui/project-quick-bom-page.test.tsx`).

Pricing review:
- Committed Honeywell demo SAR price map exists (P68, B7), demo-fixture authority
  only. The `priced_boq` artifact is created by `.../priced-boq` (P90) and reviewed
  through the dedicated `.../priced-boq/review` route (P91), driven UI-only by the
  Project Quick BoM page. Still missing: production catalog->SAR sourcing/conversion
  (no production pricing authority beyond the demo fixture). A line-level pricing
  review UI now exists in `src/app/projects/[id]/quick-bom/page.tsx` (P126-P131,
  tested by `tests/ui/project-quick-bom-page.test.tsx`).

Export approval:
- The `export_package` artifact is created by `.../export-package` (P94) and
  approve/reject gated; an approved export workbook is served by the download route
  (`GET .../export-package/download`, P95), wired into the UI as an approved-export
  download link (P96) and proved for an arbitrary Project by P97. The Prompt 73
  operator command still writes the seeded demo workbook on demand. Remaining gap: a
  full customer production (non-seeded) export path beyond the reduced P97 proof.

Demo data/fixtures:
- In-memory Honeywell demo run is proven (P68/P71, Section 5B), a persisted Honeywell
  demo Project fixture exists (P78), and the P81 seeded and P97 arbitrary-flow app E2Es
  both run against an in-memory store. Committed schema/migration SQL
  (`src/lib/db/migrations/0004_project_state.sql`) and the `withTenantDb` tenant-context
  wrapper (proven by `tests/lib/db/tenant-db.test.ts`) exist and are unit-tested, but a
  local Docker Postgres Project-state proof now exists (P135,
  `scripts/prove-project-real-db.ts`); Quick BoM API route/action chain against real
  DB exists (P137, `scripts/prove-project-quick-bom-route-real-db.ts`); browser-driven
  UI against a live DB and production deployment verification remain open (B10).
- Honeywell SKU coverage in the local mock catalog is now verified by the Prompt 102
  read-only audit (`docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md`,
  `src/lib/projects/honeywell-catalog-coverage-audit.ts`,
  `tests/lib/projects/honeywell-catalog-coverage-audit.test.ts`), which documented the
  gaps against local_stc_historical_mock: the seven customer rows resolve 4 matched, 3
  not_found and the broader 50-SKU demo universe 30 matched, 20 not_found. A full
  uploaded Honeywell BoQ through real SKU resolution still stays a gap because three
  customer rows (CW9178I-CFG, C9300X-48HX-A, C9300L-24P-4X-A) and twenty broader demo
  SKUs are absent from the local mock catalog; the demo path uses human-accepted SKU
  decisions, and P97 uses a reduced catalog-resolvable CSV subset (B9).
- Marafiq and EnergyTech app-level/real-input paths remain unproven (B8).

Error handling/readiness/status display:
- The readiness report's next-step/blocking-step is rendered by the Project Quick BoM
  UI (P80) and its workflow action rail (P96); no broader status surface exists.
- Prompt 133 wired automatic staleness propagation into the artifact repository
  (B6 closed); upstream artifact regeneration now marks downstream artifacts stale
  inside the same transaction.

Out of scope for this slice:
- RFP remains out of current scope (Section 9).

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

## 9. Completed Demo-Readiness Slice And Follow-Ups

The Honeywell Quick BoM MVP path was the roughly 10-14 prompt slice that makes one
real demo path runnable before any broad UI polish; that narrow Quick BoM path was
the first target and RFP remains out of current scope. Each prompt stayed narrow
(one verifiable success criterion). With Prompt 82 the seeded demo-readiness slice was
closed: Prompts P65-P82 are complete, and the proof lives in Sections 5B-5D. With
Prompt 98 the follow-on app-readiness sequence is also closed: Prompts P83-P97 added
and proved the broader Quick BoM app route/action chain, and the proof lives in
Section 5E.

Completed (P65-P82) - the closed demo-readiness slice, kept as the execution record:

- P65 - Backlog refresh (prior; superseded by later refreshes).
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
- P72 - Backlog refresh + Honeywell Quick BoM demo operator runbook - DONE
  (`docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md`).
- P73 - Local Honeywell Mantle demo command/script - DONE
  (`scripts/write-honeywell-quick-bom-demo.ts`); writes the workbook on demand.
- P74 - Honeywell CCW parity evidence doc/test - DONE
  (`docs/quick-bom/HONEYWELL_CCW_PARITY_EVIDENCE.md`,
  `tests/lib/projects/honeywell-ccw-parity-evidence.test.ts`).
- P75 - CCW-like switch child ordering - DONE (in
  `honeywell-config-expansion-rule-pack.ts`; reorders only).
- P76 - Exact 60-row CCW sequence parity proof - DONE (Section 5C).
- P77 - Read-only Quick BoM workspace read model + GET route - DONE
  (`project-quick-bom-workspace.ts`, `api/projects/[id]/quick-bom/route.ts`).
- P78 - Persisted Honeywell demo Project fixture - DONE
  (`honeywell-demo-project-fixture.ts`).
- P79 - Quick BoM artifact approval service + POST route - DONE
  (`project-quick-bom-approval.ts`,
  `api/projects/[id]/quick-bom/approvals/route.ts`).
- P80 - Minimal Project Quick BoM UI - DONE
  (`src/app/projects/[id]/quick-bom/page.tsx`).
- P81 - App-level Honeywell Quick BoM E2E - DONE
  (`tests/app/honeywell-quick-bom-app-e2e.test.tsx`); generates the export workbook
  on disk.
- P82 - Demo-readiness closure: the seeded-slice closure refresh (this doc and the
  runbook, plus their doc regression tests).

Completed (P83-P98) - the app-readiness closure slice, kept as the execution record:

- P83 - Create quick_bom Project route - DONE
  (`POST /api/projects/quick-bom`, `src/app/api/projects/quick-bom/route.ts`).
- P84 - BoQ upload route - DONE (`POST /api/projects/[id]/quick-bom/files`).
- P85 - Normalize route creating `normalized_boq` - DONE
  (`.../quick-bom/files/[fileId]/normalize`).
- P86 - SKU resolution draft route - DONE
  (`.../artifacts/[artifactId]/sku-resolution`).
- P87 - SKU resolution per-line review route - DONE (`.../sku-resolution/review`).
- P88 - Configuration expansion draft route - DONE
  (`.../artifacts/[artifactId]/configuration-expansion`).
- P89 - Configuration expansion per-line review route - DONE
  (`.../configuration-expansion/review`).
- P90 - Priced BoQ route from accepted configuration_expansion - DONE
  (`.../artifacts/[artifactId]/priced-boq`).
- P91 - Pricing review route - DONE (`.../priced-boq/review`).
- P92 - Pricing/export action-chain route/service tests extended - DONE
  (test extensions as committed, not new files).
- P93 - App/workspace readiness wiring for the post-review chain extended - DONE
  (wiring extensions as committed, not new files).
- P94 - Export package route from approved priced_boq - DONE
  (`.../artifacts/[artifactId]/export-package`).
- P95 - Approved export download route - DONE (`.../export-package/download`).
- P96 - Project Quick BoM UI action rail - DONE
  (`src/app/projects/[id]/quick-bom/page.tsx`: upload+normalize, create draft/action
  buttons, priced review, export creation, approved-export download link).
- P97 - App-level arbitrary Project E2E - DONE
  (`tests/app/project-quick-bom-arbitrary-flow-e2e.test.tsx`).
- P98 - App-readiness closure: this refresh (this doc and the runbook, plus their
  doc regression tests).

Completed (P104-P138) - the UI/evidence hardening, staleness wiring, real-DB proof,
Quick BoM API route/action-chain real-DB proof, and docs/test alignment slice, kept
as the execution record:

- P104-P114 - Honeywell demo catalog supplement explicit opt-in and authority-safe UI
  wiring - DONE.
- P115-P125 - Authority/catalog hardening (closed by the existing authority story) - DONE.
- P126-P131 - Line-level SKU/config/pricing review UI screens and full seven-line
  Honeywell BoQ app proof - DONE (`src/app/projects/[id]/quick-bom/page.tsx`,
  `tests/ui/project-quick-bom-page.test.tsx`; Prompt 131 proved 7 customer rows,
  7 SKU decisions, 60 config/priced/export rows, totalPriceSar 2185708.76,
  totalIncVatSar 2513565.07).
- P132 - Docs/test alignment refresh (prior refresh) - DONE.
- P133 - Automatic downstream artifact staleness propagation in
  `src/lib/db/project-artifact-store.ts`: `createProjectArtifactVersion` now calls
  `planStaleArtifactUpdates` inside the same tenant-scoped transaction, marking
  latest eligible downstream artifact versions stale. B6 closed. - DONE.
- P134 - Docs/test alignment refresh (prior refresh) - DONE.
- P135 - Local Docker Postgres Project-state proof script - DONE
  (`scripts/prove-project-real-db.ts`); proves `createQuickBomProject`,
  `getProjectById` tenant-scoped read, `createProjectArtifactVersion`/
  `listProjectArtifacts`, `createProjectApproval`/`listProjectApprovals`, and
  downstream staleness propagation against a real DB (5 stages; wrong-tenant read
  null; approval count 1; downstream staleness verified; cleanup ok). B10 closed
  for local/provisioned Project-store real-DB proof.
- P136 - Docs/test alignment refresh (prior refresh) - DONE.
- P137 - Live-DB Quick BoM API route/action chain proof script - DONE
  (`scripts/prove-project-quick-bom-route-real-db.ts`); proves the full Honeywell
  seven-line Quick BoM API route/action chain against a real local/provisioned
  Postgres DB (7 normalized lines, 7 accepted SKUs, 60 config/priced/export rows,
  totalPriceSar 2185708.76, totalIncVatSar 2513565.07, downloaded XLSX 14315 bytes,
  cleanup ok). See Section 5H.
- P138 - Docs/test alignment cleanup (this refresh) - DONE.

Post-closure follow-ups (no prompt numbers assigned; ordering is a recommendation,
not a commitment):

- Local Docker Postgres Project-state proof exists (P135,
  `scripts/prove-project-real-db.ts`): proves `createQuickBomProject`,
  `getProjectById` tenant-scoped read, `createProjectArtifactVersion`/
  `listProjectArtifacts`, `createProjectApproval`/`listProjectApprovals`, and
  downstream staleness propagation against real required tables.
- Quick BoM API route/action chain against real DB exists (P137,
  `scripts/prove-project-quick-bom-route-real-db.ts`): proves the full Honeywell
  seven-line Quick BoM API route/action chain against a real local/provisioned
  Postgres DB. Browser-driven UI against a live/provisioned DB (full Next.js
  API/UI/browser route chain including browser-driven UI) and production deployment
  verification remain open.
- Full uploaded Honeywell BoQ through real SKU resolution: Prompt 102 verified the
  current local mock coverage and documented the gaps (customer rows 4/7 matched, 3
  not_found; broader 30/50 matched, 20 not_found), so this remains a gap because three
  customer rows (CW9178I-CFG, C9300X-48HX-A, C9300L-24P-4X-A) and twenty broader demo
  SKUs are not found in the local mock catalog; closing it needs explicit
  catalog-fixture/authority work beyond the reduced catalog-resolvable subset P97 used.
- Production pricing authority (catalog->SAR sourcing/conversion) beyond the demo
  fixture.
- Broad Cisco-general configuration authority beyond the approved Honeywell Batch
  1+2+3 packs.
- Deterministic fuzzy SKU suggestion (step 3), then human-approved AI-assisted
  suggestion (step 4) - suggestions only, never a runtime AI decision.
- Marafiq and EnergyTech real-input/app-level paths.
- Manual browser QA of the arbitrary-Project app flow.
- RFP workflow (out of current scope).

## 10. Open Questions

- Q1: Batch 1+2+3 rules are human-approved and committed and the active selector/
  composer is now wired and proven (Section 5B, P66); the open question is now
  only who signs off on any future Batch 4 expansion pack (optics and replacements
  stay out of expansion until then).
- Q2: Resolved - the local command/script (P73), the seeded-demo app surface
  (P77-P81), the broader app route/action chain (P83-P97, Section 5E), and the
  line-level SKU/config/pricing review UI (P126-P131, Section 5F) are all shipped.
  Production provisioning remains a follow-up (Section 9).
- Q3: The seeded-demo app E2E (P81) and the arbitrary-flow app E2E (P97) both run
  against an in-memory store. A local Docker Postgres Project-state proof now exists
  (P135) and Quick BoM API route/action chain against real DB exists (P137), but
  whether the first live demo uses browser-driven UI against a live DB remains open.
- Q4: Which files are allowed as regression references for the demo, and what is
  the committed/sanitized source for the Honeywell SAR price and category maps
  (B7)? Benchmark/priced workbooks are references only, never rule sources.
- Q5: Is exact + normalized SKU resolution sufficient for the Honeywell demo, or
  is deterministic fuzzy suggestion (step 3) needed before the demo?

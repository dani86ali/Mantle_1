# BOMATIC Prompt 42-98 Delivery Story

Status: historical execution record and forward roadmap.

This document explains what was built from Prompt 42 through Prompt 98, why it was
built in that order, what succeeded, what failed or needed correction, and what still
requires human approval. It is not the architecture source of truth.
`C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md` remains the source of
truth.

## 1. Executive Summary

Prompts 42-98 converted BOMATIC Quick BoM from a Project-domain architecture with
partial library pieces into a verified Honeywell demo path and a broader app
route/action chain:

- The Mantle workbook path is real: approved priced BoQ -> export package -> generated
  `.xlsx` in the committed Mantle/STC template.
- Configuration expansion became approval-gated and deterministic: no runtime AI,
  no silent replacement, no pricing decisions inside configuration rules.
- The Honeywell MVP rule authority was narrowed into approved Batch 1+2+3 rule packs.
- Batch 4 was explicitly kept out of runtime authority: optics remain standalone
  customer BoQ lines, and replacements remain deferred.
- The Honeywell seeded demo path is proven at 60 rows with CCW row-sequence parity.
- The Project Quick BoM app route/action chain now exists beyond the seeded fixture:
  create Project, upload BoQ, normalize, SKU review, configuration review, pricing,
  pricing review, export, approval, and download.
- Prompt 97 proves that route/action chain for a non-seeded arbitrary quick_bom
  Project under an in-memory test harness on a reduced catalog-resolvable input.

What is still not true:

- Production DB provisioning/RLS/migrations are not proven.
- Full uploaded Honeywell BoQ through real SKU resolution is not proven.
- Full local catalog coverage for Honeywell parent SKUs is not proven.
- Production pricing authority is not implemented.
- Broad Cisco-general configuration authority is not implemented.
- Line-level SKU/config/pricing review UI screens are not implemented.
- Manual browser QA is not done.
- RFP remains mostly planning plus legacy paths, not rebuilt on the evidence-chain
  architecture.

## 2. Evidence Used

This record was reconstructed from:

- Git history through `a41d043 docs(projects): close quick bom app readiness`.
- Prompt files in `C:\tmp\bomatic-prompts`, especially P42, P44, and P48-P98.
- Harness run summaries in `C:\tmp\bomatic-runs`.
- `docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md`.
- `docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md`.
- Current source and tests under `src/lib/projects`, `src/app/api/projects`, `src/app/projects`, `tests/lib/projects`, `tests/api`, `tests/app`, and `tests/ui`.

Some early prompt files are not present in `C:\tmp\bomatic-prompts` anymore. Where a
prompt file is missing, this document uses the nearest committed evidence and later
prompt references. Those entries are marked as inferred.

## 3. Delivery Narrative By Phase

### Phase A - Export and Approval Gates (Prompts 42-44)

Objective:

Turn the Mantle export path and the Quick BoM approval gates into enforceable Project
behavior before adding more orchestration.

What happened:

- P42 added a real workbook integration test for the export artifact service. It proved
  `createMantleExportArtifact` can call the real Mantle model and workbook writer,
  write a real `.xlsx`, preserve row order, keep unpriced lines in place, and create an
  `export_package` artifact only from an approved `priced_boq`.
- P43, inferred from commit `2e9d30a`, fixed pricing so `priced_boq` creation requires
  an approved `configuration_expansion` source.
- P44 fixed the upstream gate so `configuration_expansion` cannot be persisted from an
  unapproved `sku_resolution` artifact.

Result:

- Achieved. Pricing and export now depend on reviewed/approved upstream artifacts rather
  than raw or unreviewed intermediate data.

Bugs fixed:

- Pricing was allowed too early. It now requires an approved expansion artifact.
- Configuration expansion was allowed from unapproved SKU decisions. It now requires an
  approved SKU resolution artifact.

Why it mattered:

Without these gates, later UI/API work could create customer deliverables from unreviewed
decisions. This would violate the core rule: evidence -> approved rules/artifacts ->
deterministic processing -> human approval -> customer deliverable.

### Phase B - Readiness, Review Discipline, and First Honeywell Approval Packet (Prompts 45-48)

Objective:

Create a way to show blockers/readiness, then build a human-review path for Honeywell
configuration rules without making candidate rules runtime authority.

What happened:

- P45 is inferred from commit `d981655`: added the Quick BoM readiness helper.
- P46 is inferred from commit `2484c84`: added the first Quick BoM demo-readiness
  backlog.
- P47 created the first Honeywell rule approval packet. It was a human-review packet
  only, not runtime authority.
- P48 created the rule-model gap report after review found that some candidate rules
  froze Honeywell/CCW observed quantities instead of reusable configuration logic.

Result:

- Partially achieved, then corrected. The approval packet was useful evidence, but P48
  correctly stopped runtime-pack approval until model gaps were documented.

Bugs or architectural defects found:

- Wireless license quantities were modeled as fixed `12`, which matched Honeywell only
  because Honeywell had 12 APs. That was not reusable.
- Some default accessories, support terms, power-cord quantities, and replacements were
  mixed into candidate rules without enough model separation.

How fixed:

- P48 documented the rule-model gaps and explicitly blocked approved runtime pack
  creation until the model was extended.

Why it mattered:

This was a major architecture correction. It prevented BOMATIC from turning one CCW
quote into unsafe global runtime behavior.

### Phase C - Rule Model Extension and Validator Hardening (Prompts 49-55)

Objective:

Extend the configuration rule model enough to describe Honeywell logic safely, then
validate candidate/review artifacts deterministically before creating any runtime pack.

What happened:

- P49 added type-only advanced configuration expansion contracts.
- P50 created model-aware Honeywell candidate and approval packet v2 assets.
- P51 aligned project-store stage expectations. The harness run initially failed tests,
  which exposed expectation drift rather than product behavior.
- P52 added a deterministic Honeywell v2 rule artifact validator.
- P53 initially failed and produced no changes. A retry created the Honeywell rule
  approval batch strategy document and tests.
- P54 tightened validator behavior around required CAB child presence.
- P55 is represented by commit `1058d2b`: added Batch 1 evaluator support.

Result:

- Achieved after cleanup/retry. The model gained enough structure for safe batch-based
  approval, and validator evidence became stricter.

Bugs fixed:

- Test expectations around materialized Project stages drifted from current Project
  store behavior. Tests were aligned.
- The v2 validator needed stricter CAB child presence checks. P54 added that guard.
- The first P53 harness attempt failed with no changes. The work was retried and
  completed.

Why it mattered:

This phase separated "candidate extraction" from "approved runtime authority." It also
proved why Codex review could not just accept Claude output: harness summaries and
actual diff/test inspection caught real sequencing problems.

### Phase D - Approved Honeywell Rule Packs and Batch 4 Boundary (Prompts 56-64)

Objective:

Create approved Honeywell MVP runtime rule authority in narrow batches, compose those
batches safely, and explicitly keep optics/replacements out of runtime expansion.

What happened:

- P56 created approved Honeywell Batch 1 runtime rules. The first run failed tests and
  required cleanup before acceptance.
- P58 created approved Honeywell Batch 2 runtime rules. The first run also failed tests
  and required cleanup before acceptance.
- P59 added the approved configuration rule-pack composer for Batch 1+2.
- P60 created the Batch 3 approval packet.
- P61 created approved Honeywell Batch 3 runtime rules.
- P62 added tests proving Batch 1+2+3 can compose safely.
- P63 created the Batch 4 human-review approval packet for optics, replacements, and
  deferred oddities.
- P64 created the Batch 4 decision record: no approved runtime expansion authority from
  Batch 4.

Result:

- Achieved. Runtime configuration expansion authority exists only for approved
  Honeywell Batch 1+2+3. Batch 4 does not create expansion authority.

Bugs or risks fixed:

- Shared parent SKUs across batches could have created duplicate-parent collisions. P59
  introduced a composer to merge separately approved packs safely.
- Optics could have been incorrectly auto-attached under switches. P64 explicitly
  records them as standalone customer BoQ lines only.
- Historical-to-current replacement candidates could have become silent substitutions.
  P64 explicitly keeps them deferred.

Why it mattered:

This phase established the authority model: approved structured rule packs can drive
runtime expansion, but benchmark/configured quotes and candidate packets cannot.

### Phase E - Honeywell Demo Spine (Prompts 65-71)

Objective:

Turn approved Honeywell rules, demo pricing evidence, and the Mantle model into a
repeatable in-memory Quick BoM demo path.

What happened:

- P65 refreshed the Quick BoM demo-readiness backlog.
- P66 added the active Honeywell Batch 1+2+3 selector/composer.
- P67 added the pure Quick BoM expansion runner skeleton.
- P68 added the committed Honeywell demo pricing and Mantle category fixture.
- P69 added deterministic demo pricing from that fixture.
- P70 built the Honeywell Quick BoM Mantle model.
- P71 added end-to-end validation that writes and re-opens a generated Mantle workbook.

Result:

- Achieved. The in-memory Honeywell demo path is proven end to end.

Proven outcomes:

- 60 lines through draft, review, priced BoQ, and Mantle model.
- 50 unique priced SKUs.
- 0 unpriced lines in the seeded Honeywell demo.
- 7 customer lines and 53 accepted expansion lines.
- Every expansion line accepted through explicit engineer decisions.
- Optics remain standalone customer BoQ lines.
- Mantle totals and category totals are pinned by tests.

Bugs fixed:

- P70 required a cleanup turn to keep Mantle model composition scoped and clean.
- The demo path stayed in-memory and deterministic; no runtime AI/catalog decision was
  introduced.

Why it mattered:

This was the first credible vertical Honeywell Quick BoM demo slice.

### Phase F - Operator Command and CCW Parity (Prompts 72-76)

Objective:

Make the Honeywell demo reproducible for an operator and prove parity against the
current configured CCW reference.

What happened:

- P72 added the Honeywell demo runbook.
- P73 added `scripts/write-honeywell-quick-bom-demo.ts`, an operator command that writes
  the Honeywell Mantle workbook on demand.
- P74 added Honeywell CCW parity evidence and tests against `Estimate_NB167337237YA.xlsx`.
- P75 reordered switch children to match CCW-like row ordering without adding,
  removing, repricing, or approving anything.
- P76 proved exact 60-row CCW row sequence parity.

Result:

- Achieved. Honeywell demo parity is strong for the seeded path.

Bugs fixed:

- Generated workbook row order differed from CCW print order for switch children. P75
  fixed ordering for the two switch parents only.

Why it mattered:

The demo output now matches not only totals and quantities but also the 60-row CCW item
sequence, which improves demo credibility.

### Phase G - Seeded Project App Surface (Prompts 77-82)

Objective:

Move from in-memory runner proof to a minimal Project-centered app surface for the
seeded Honeywell demo Project.

What happened:

- P77 added a read-only Quick BoM workspace model and GET route.
- P77 needed cleanup because the initial workspace summary omitted `tenantId` and
  `pricingConfig`, and the route lacked a safe unexpected-error 500 response.
- P78 added the persisted Honeywell demo Project fixture.
- P79 added the exact-version Quick BoM artifact approval service and POST route.
- P80 added the minimal Project Quick BoM UI.
- P81 added the app-level Honeywell Quick BoM E2E.
- P82 closed the seeded Honeywell demo readiness docs.

Result:

- Achieved for the seeded Honeywell demo Project path.

Bugs fixed:

- Workspace contract omission: project summary now includes tenant and pricing config.
- Route error handling: unexpected workspace loader errors now map to controlled JSON
  500 responses.
- Approval safety: approvals are against exact artifact ids and versions, not latest by
  type.

Why it mattered:

The demo moved from library proof to app-level proof while still keeping payloads out of
the UI and preserving approval gates.

### Phase H - Arbitrary Project Route/Action Chain (Prompts 83-98)

Objective:

Move beyond the seeded Honeywell fixture toward arbitrary customer Project flow:

```text
create Project -> upload BoQ -> normalize -> review -> expand -> price -> approve -> export/download
```

What happened:

- P83 added `POST /api/projects/quick-bom` to create a quick_bom Project shell.
- P84 added BoQ upload to a Project-owned file.
- P85 added normalization from uploaded file to `normalized_boq`.
- P86 added SKU resolution draft creation.
- P87 added explicit per-line SKU review.
- P88 added configuration expansion draft creation.
- P89 added explicit per-line configuration expansion review.
- P90 added priced BoQ creation from accepted/approved configuration expansion.
- P91 added priced BoQ review.
- P92-P93 extended tests and readiness/workspace wiring for the post-review chain.
- P94 added export package creation from approved priced BoQ.
- P95 added approved export workbook download.
- P96 wired the UI action rail for upload/normalize/create/review/export/download.
- P97 added an app-level arbitrary Project E2E.
- P98 closed the app-readiness docs and tests.

Result:

- Achieved for a reduced arbitrary Project proof under test harness/in-memory store.
- Not achieved for production arbitrary customer flow yet.

Bugs and corrections:

- Several Claude runs timed out or over-explored. P96, P97, and P98 required recovery
  review-current evidence or manual cleanup.
- The full Honeywell CSV could not be used as the P97 arbitrary flow proof because key
  Honeywell parent SKUs are not exact/normalized matches in the current local mock
  catalog. The P97 test therefore used a reduced catalog-resolvable CSV subset.
- SKU and configuration per-line reviews exist as routes, but P97 drives those route
  calls directly. The UI only shows line-review-required notices for those stages.

Why it mattered:

This phase proves the app route/action chain exists beyond seeded Honeywell. It does not
yet prove production database execution, full Honeywell upload through catalog-backed
SKU resolution, or a complete review UI.

## 4. Harness and Process Lessons

The harness became essential, but the runs exposed several friction points:

- Claude frequently timed out on broad or doc-heavy prompts while still producing useful
  scoped changes. Recovery worked, but it was manual and repetitive.
- Manual `review-current` commands were long and error-prone to reconstruct, especially
  with many `--allowed-path` and repeated `--test-command` arguments.
- Harness evidence distinguishes skipped checks, failed checks, and incomplete Claude
  runs, but the operator still has to inspect several files manually to decide the next
  action.
- Stale prompt files and missing prompt numbers made historical reconstruction harder.
- Early run summaries sometimes showed `(no diff)` for untracked-file-only changes,
  which later harness improvements corrected by including untracked files in evidence.
- Sequential test commands were needed because one broad test command was too blunt and
  made it harder to identify whether a focused prompt actually passed its required
  suite.
- Native ASCII checks were useful and should remain built in rather than delegated to
  brittle PowerShell regex commands.

Harness improvements already made during this period:

- Supervised Claude harness.
- Verbose Claude stream output.
- Handoff to BOMATIC reviewer.
- External reviewer command.
- Reviewer background pack.
- Untracked files included in diff evidence.
- Sequential harness test commands.
- Noncritical reviewer artifact caps.
- Prompt suffix preservation in run directories.
- Harness moved out of the BOMATIC product repo.
- Native ASCII checks and recovery evidence.

Recommended next harness improvement:

- Add a first-class timeout recovery/report command that reads an incomplete run and
  emits a ready, copy-safe recovery plan plus an optional `review-current` rerun command.
- Add a prompt manifest/ledger writer so every run records prompt number, objective,
  status, commit hash, changed files, checks, and follow-up notes in one machine-readable
  artifact.
- Add a docs-only/test-only fast path that can classify scoped docs/test diffs and still
  run required verification without re-invoking Claude after timeout.
- Add a `--strict-allowed-files` mode that fails when Claude omits an expected file or
  touches an unlisted file, making scope failures obvious earlier.
- Add a run comparison summary that states what changed between the original timed-out
  run and the cleanup/review-current run.

## 5. Current Roadmap

### Immediate Quick BoM hardening

1. Harness improvement prompt.
2. Real DB tenant/RLS execution proof for Project stores and Quick BoM route chain.
3. Full Honeywell uploaded BoQ SKU-resolution coverage assessment.
4. Decision on how to handle missing Honeywell parent SKUs in the local catalog:
   temporary demo catalog fixture, controlled GPL/SAR import, or manual accepted SKU
   decisions for demo only.
5. Manual browser QA for the current Project Quick BoM page.
6. Line-level review UI for SKU resolution.
7. Line-level review UI for configuration expansion.
8. Line-level pricing review UI.
9. Automatic staleness application when upstream artifact versions change.
10. Marafiq and EnergyTech real-input/app-level tests.

### Production Quick BoM

1. Controlled production pricing authority from a deterministic catalog/price source.
2. Controlled Cisco configuration expansion authority beyond Honeywell Batch 1+2+3,
   family by family.
3. Deterministic fuzzy SKU suggestions.
4. AI-assisted candidate SKU/rule suggestions only after evidence capture and human
   approval, never runtime authority.
5. Tenant knowledge reuse for approved mappings, with no silent auto-apply in MVP.
6. Production deployment/DB/object-storage/file-retention validation.

### RFP long-term

1. RFP package validation.
2. Text/table extraction from approved input_package files.
3. Extraction quality gate.
4. Evidence chunking and ProjectEvidenceItem persistence.
5. Requirements baseline generation from evidence IDs only.
6. Human approval of requirements_baseline.
7. Compliance from approved requirements_baseline.
8. HLD/design delta from approved artifacts.
9. Proposal draft from approved artifacts and locked templates.
10. Export approval.

## 6. Human Approval Gates Ahead

Required human/business approval:

- Any new Cisco configuration expansion rule pack beyond approved Honeywell Batch
  1+2+3.
- Any Batch 4 runtime expansion authority. Current decision is no Batch 4 runtime pack.
- Any SKU replacement mapping. No silent substitution is approved.
- Any decision to treat a benchmark/configured quote as more than regression/demo
  evidence.
- Any production pricing authority source or temporary demo pricing source beyond the
  already approved Honeywell fixture/local GPL-SAR demo scope.
- Any AI-assisted rule extraction output before it becomes runtime structured authority.
- Any move from reduced arbitrary Project proof to claiming full customer production
  readiness.

Not requiring business approval, but requiring technical verification:

- Harness improvements.
- Real DB/RLS test harness.
- Manual browser QA.
- UI review screen implementation.
- Staleness propagation implementation.
- Additional test coverage for Marafiq/EnergyTech.

## 7. Bottom Line

Prompts 42-98 achieved a substantial milestone: BOMATIC now has a defensible,
Project-centered Honeywell Quick BoM demo path and a broader app route/action chain.
The remaining gap is no longer "does the spine exist?" It is now productionization:
real DB execution, full catalog coverage, real review UI depth, production pricing
authority, broader approved configuration authority, and RFP evidence-chain rebuild.

# BOMATIC MVP Canonical Project State

> **Current interpretation notice (2026-08-07):** This document remains the baseline MVP product and authority contract for the Project spine, canonical files/artifacts, BoQ/configuration/pricing separation, and runtime-AI guardrails. Use `PRAXIS_CURRENT_STATE.md` for current repo/runtime status. Use `PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md` for the approved target flow for BoMatic Quick BoM and the RFP/HLD/Technical Proposal chain. Where this document conflicts with the blueprint on application flow, stage order, approvals, HLD, compliance, TP generation, or processing status, the blueprint controls.
**Status:** Product source of truth for the next architecture repair.
> **Quick BoM application-flow revision (2026-08-05):** Sections 8 through 11A and the Quick BoM work in Section 19 now define the approved exception-driven target flow. That target removes routine SKU, configuration, pricing, and export approval blockers. It is approved architecture with implementation pending; `PRAXIS_CURRENT_STATE.md` continues to describe the implemented runtime until the code is aligned.
> **RFP/HLD/TP application-flow revision (2026-08-07):** Section 12 and the RFP/HLD/TP work in Section 19 are superseded by the approved blueprint. The target flow moves BoM configuration earlier, removes RFP pricing, places compliance after Approved HLD Design Model, removes old HLD repair/retry/manual-draw.io authority paths, and generates the full Technical Proposal from approved/current artifacts.
**Application flow blueprint:** `PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`
**Date locked:** 2026-05-21
**Supersedes:** `prd.md`, `mvp-scope.md`, `user-flow.md`, `BOMATIC_Runtime_Architecture.md`, and `HANDOFF-fix8.md` where they conflict with this document.

This document locks the MVP product shape for BOMATIC after the full repo audit and architecture review. Older planning documents describe a broader Cisco/CCW autonomous BoM agent and a five-engine pipeline. That history is useful, but the MVP now narrows to a controlled STC-native pre-sales workspace centered on a durable `Project` state.

## RFP Evidence Extraction Architecture Lock

This checkpoint gates all RFP extraction, compliance, HLD, and proposal implementation. No RFP extraction code is written until the controlled flow, the evidence model, the downstream-read rules, and the HLD/proposal quality targets in Section 12 are locked, and the explicit RFP tasks in Section 19 are named.

BOMATIC must not follow the old weak RFP pattern:

```text
PDF/DOCX -> raw text string -> requirements extractor -> compliance/proposal
```

That pattern loses traceability, durable evidence chunks, extraction coverage, and approved-baseline control. It also lets downstream stages reread raw files or reinterpret unstable source text. The current E1 path is exactly this weak pattern: file content is flattened to raw text strings, a text map is built, and the requirements extractor runs directly on raw text — with no evidence chunks, no `ProjectEvidenceItem` persistence, no extraction quality gate, and requirements that carry only a source filename instead of evidence IDs and locator metadata.

The locked pattern is:

```text
approved input_package
  -> extract all text/tables
  -> create evidence chunks
  -> store ProjectEvidenceItem records
  -> LLM extracts candidate requirements from evidence IDs
  -> create requirements_baseline artifact
  -> human review/approval
  -> downstream compliance/HLD/proposal read approved artifacts only
```

Exit criteria for this checkpoint:

- Section 12 defines the 12-step RFP controlled flow, the RFP evidence rules, and the HLD/proposal quality rebuild targets.
- Section 19 names the explicit RFP implementation tasks.

Until those exist, RFP extraction implementation is blocked.

## Quick BoM Mantle-Format Export Lock

This checkpoint gates all priced BoQ/BoM export implementation. No Mantle-format export code is written or extended until the Priced Output Contract (Section 10), the Quick BoM Workflow output (Section 11), and the export subtasks in Section 19 are locked to the requirements below.

**Quick BoM is not complete unless the generated customer-facing priced BoQ/BoM workbook matches the Mantle benchmark closely enough to be sent to a customer without manual reformatting.**

Exact Mantle-format output is a core MVP requirement, not polish. The exported workbook must be customer-ready without manual reformatting — no manual column re-ordering, restyling, formula repair, or totals fix-up after BOMATIC produces it.

The permanent benchmark the generated workbook must match is:

```text
C:\Pre-Sales\Benchmarck_Files\Mantle_Priced_BoQBoM.xlsx
```

Exit criteria for this checkpoint:

- Section 10 requires a committed sanitized Mantle/STC output template, mapping into the exact template columns/cells, full structural fidelity, copied template rows, preserved relative order for included lines, explicit exclusion of unmatched SKUs, SAR pricing/VAT/margin or markup, one customer-facing workbook, and golden workbook tests against the Mantle benchmark.
- Section 11 states the Quick BoM output is the Mantle-format customer-facing workbook, that deterministic processing progresses automatically when no actionable exceptions exist, that the customer-uploaded workbook stays untouched as evidence, and that the output must be customer-ready without manual reformatting.
- Section 19 names the explicit Mantle export subtasks, including golden workbook tests and real benchmark input tests for Honeywell, Marafiq, and EnergyTech formats.

Until those exist, Mantle-format export implementation is blocked.

## Quick BoM Configuration Expansion Lock

This checkpoint gates all **further** Quick BoM export/API/UI work. No new Quick BoM export, API, or UI work is started until the configuration expansion architecture, the authoritative-source rules, the first-scope strategy, the exception-driven expansion flow, and the configuration-expansion requirements (Section 11A), the updated Quick BoM Workflow (Section 11), and the configuration expansion subtasks (Section 19) are locked to the requirements below. The already-built Mantle export slices stay; this lock gates the *remaining* export/API/UI work, not a rebuild of what is done.

This checkpoint must state:

- **Quick BoM is not commercially complete with only SKU lookup, pricing, and Mantle export.** A trustworthy customer-facing Quick BoM cannot be produced from SKU lookup and pricing alone, because customer BoQs often carry parent SKUs, family descriptions, or incomplete item lists.
- **Quick BoM requires a configuration expansion layer before customer-facing export can be considered complete.**
- **Configuration expansion determines** required/default/optional accessories, support, software, licensing, regional power/cable items, included zero-price components, and parent-child BoM structure that belong with a customer SKU or product family.
- **Runtime expansion must use approved structured rule packs only.**
- **Runtime AI must not invent, approve, or silently apply** accessories, licenses, support SKUs, replacement SKUs, or pricing during a customer BoQ run.
- **AI may assist only in controlled rule authoring** by extracting candidate rules from authoritative documents with citations.
- **Human pre-sales approval is required before rules become active.** Candidate rules become active runtime rules only after human pre-sales approval.

This is consistent with the BOMATIC commandment: runtime math, lookups, and rule-based decisions are deterministic TypeScript/DB operations, never live LLM calls. Configuration expansion at runtime is rule-pack evaluation, not AI interpretation.

Exit criteria for this checkpoint:

- Section 11A defines the authoritative-source rules, the Honeywell first-scope strategy, the required Quick BoM expansion flow, the configuration-exception requirements, and the future rule-authoring direction.
- Section 11 makes configuration expansion deterministic for recognized SKUs and requires user intervention only for actionable configuration choices, conflicts, or coverage gaps before pricing continues.
- Section 19 names the explicit configuration expansion subtasks and orders them before the remaining Quick BoM export/API/UI work.

Until those exist, further Quick BoM export/API/UI implementation is blocked.

## 1. Product Intent

BOMATIC is a pre-sales deliverable workspace for Systems Integrators. For MVP, it serves two workflows:

1. **Quick BoM** — price a customer-provided BoQ/BoM quickly and export a customer-facing priced workbook.
2. **RFP** — ingest a controlled RFP package, extract/review requirements and compliance, produce HLD/design deltas, price the customer BoQ, generate proposal content, and export approved artifacts.

RFI/discovery remains a future workflow. Do not optimize the MVP architecture around RFI yet.

## 2. Primary Object

The primary product object is `Project`.

Do not treat `intake`, `pipeline`, `estimate`, `bomDraft`, `proposal`, or `export` as competing sources of truth. They are inputs, stages, or artifacts belonging to a Project.

`Project.mode` is immutable after creation.

Supported MVP modes:

- `quick_bom`
- `rfp`

Out of scope for MVP:

- `rfi`
- arbitrary requirements-only BoM generation
- LLD generation
- autonomous equipment invention
- arbitrary BoQ parser expansion

## 3. Canonical State Model

Use a hybrid model:

```text
projects
project_files
project_evidence_items
project_stages
project_artifacts
project_approvals
```

Rules:

- Project, stage, artifact, approval, and file metadata are normalized.
- Artifact payloads are JSONB and versioned.
- Large generated files are stored as file paths or object-storage references, not inline blobs.
- Every generated artifact records `sourceFileIds` and `sourceArtifactIds`.
- Manual edits create new artifact versions.
- Approved artifact versions freeze.
- Rejected approvals mark the artifact rejected; the next edit/regeneration creates a new version.
- Upstream changes automatically mark downstream artifacts stale.
- Approval records are created only where a workflow explicitly requires approval. The approved Quick BoM target uses recorded exception decisions and an audited download/release action instead of routine artifact approvals; RFP/HLD approval requirements remain unchanged.
- Stage ordering is hardcoded in TypeScript for MVP and materialized into `project_stages` per Project.
- Evidence retention is modeled with `retainUntil`; automatic deletion is deferred.

Canonical state means one Project aggregate and one versioned artifact/approval model. It does not mean one giant mutable JSON blob.

## 4. Evidence Retention

Original uploaded files and extracted evidence must be retained for at least one year.

For MVP:

- Set `retainUntil = uploadedAt + 1 year` for uploaded files and extracted evidence.
- Do not implement automatic deletion yet.
- Add cleanup/archive jobs later after tenant policy, legal hold, and backup behavior are designed.

## 5. File Roles

`project_files.fileRole` uses:

- `rfp`
- `boq`
- `scope_of_work`
- `compliance`
- `addendum`
- `other`

Manual file-role correction must be supported. If the system misclassifies a file, the pre-sales engineer can correct it during Intake Package Review.

## 6. BoQ / BoM Input Contract

MVP supports exactly two BoQ/BoM input formats.

Supported upload extensions:

- `.xlsx`
- `.csv`

Unsupported for MVP:

- `.xls`
- `.txt`
- arbitrary workbook layouts

### Format #1

Reference file:

```text
C:\Pre-Sales\Benchmarck_Files\EnergyTech_BoQ_Format#1.xlsx
```

Required columns:

- `Line Number`
- `Item Name`
- `Description`
- `Quantity`

### Format #2

Reference file:

```text
C:\Pre-Sales\Benchmarck_Files\Honeywell_Doc_RFP\Honeywell_BoQ.xlsx
```

Required columns:

- `#`
- `Description`
- `Part Number`
- `Qty`

### Invalid Format Behavior

If required columns are missing, return this exact message:

```text
Your BoQ/BoM format does not match the 2 formats accepted by Bomatic. Check FAQ formatting for more details.
```

For Quick BoM, the workflow pauses until the user uploads a valid format.

For RFP, the RFP/context documents may still be stored, but the BoQ pricing stage is blocked until a valid BoQ is uploaded.

## 7. Canonical BoQ Line

Both accepted input formats normalize into one internal shape before downstream processing.

```ts
CanonicalBoqLine {
  sourceFormat: "format_1_line_item" | "format_2_number_part_qty";
  sourceFileId: string;
  sourceSheetName?: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  sku: string;
  description: string;
  quantity: number;
  parentLineNumber?: string;
  originalCells: Record<string, string>;
}
```

Reasons:

- Pricing, SKU resolution, export, warnings, and HLD delta checks should not care which accepted format was uploaded.
- Customer line order and line numbers must be preserved.
- Parent/child hierarchy is preserved when present.
- Original uploaded BoQ remains the legal/source evidence; normalized rows are derived operational data.

## 8. SKU Resolution

Praxis is catalog agnostic. A Project uses the current approved catalog connected to its tenant or authority pack; the runtime flow does not assume that every uploaded SKU exists in that catalog.

For the approved Quick BoM target flow:

1. Run an exact deterministic lookup against the current approved catalog.
2. Accept only unique, active exact matches as recognized SKUs.
3. Record missing, ambiguous, and non-exact lines in the versioned `sku_resolution` artifact as unmatched.
4. Show a non-blocking alert such as `5 unmatched SKUs will be excluded from the final package`, with a small detail view listing the affected source lines and names.
5. Exclude unmatched lines from configuration expansion, pricing, and the Mantle export package.
6. Continue automatically with recognized SKUs only.

Quick BoM has no routine SKU review queue. Runtime AI, fuzzy confidence, or guessed aliases must not replace an uploaded SKU or turn an unmatched line into a recognized line. The original `project_file`, `input_package`, and `normalized_boq` retain the complete customer input, including every excluded line, so exclusion never mutates or erases source evidence.

This exception-driven Quick BoM behavior does not change the RFP authority chain in Section 12. RFP SKU/configuration behavior remains governed by its own reviewed artifacts until the RFP application flow is separately redesigned and approved.

## 9. Pricing Contract

Pricing is deterministic.

Rules:

- Currency: SAR.
- VAT default: 15% for Saudi projects.
- Support margin or markup mode.
- A Project chooses exactly one pricing mode.
- Capture pricing mode, rate percentage, and VAT percentage when the user creates the Quick BoM Project; currency remains fixed to SAR for MVP.
- Currency values round to 2 decimals.
- BOMATIC calculates final values and writes them; Excel formulas are not the source of truth.
- Quick BoM and RFP use the same pricing engine/config.
- Quick BoM pricing consumes recognized configured lines only.
- Missing or stale catalog prices, invalid prices, unexpected zero prices, invalid quantities, and pricing-policy conflicts are actionable pricing gaps.
- A zero-price component is valid when the active approved configuration rule explicitly marks it as included at zero price.
- When pricing gaps exist, the user may apply only supported classifications or corrections, such as excluding an out-of-scope line, marking an allowed pass-through line, or correcting source data through a traceable override/re-upload. Praxis must not invent a price.
- When no actionable pricing gaps remain, pricing proceeds automatically without a routine pricing review or approval stage.

The priced workbook includes margin/markup, VAT, and final sell price according to the Mantle output template.

## 10. Priced Output Contract

Permanent priced-output benchmark:

```text
C:\Pre-Sales\Benchmarck_Files\Mantle_Priced_BoQBoM.xlsx
```

This workbook was generated from:

```text
C:\Pre-Sales\Benchmarck_Files\Estimate_ZP164681679XP.xlsx
```

The Mantle workbook is the visual and structural source of truth for the customer-facing priced BoQ/BoM output. Matching it is a hard MVP requirement, gated by the **Quick BoM Mantle-Format Export Lock** checkpoint above: the generated workbook must be customer-ready **without manual reformatting**.

Required rules:

- **Create a committed sanitized Mantle/STC output template derived from the benchmark.** Strip the benchmark's confidential/customer-specific data, commit the sanitized template into the repo, and treat it — not the original benchmark file — as the production template.
- **Map normalized BoQ fields into the exact template columns/cells.** Write each normalized/priced value into the exact column or cell the template defines; never invent or shift columns.
- **Preserve sheet names, column order, widths, merged cells, styles, formulas, totals layout, and visual structure** of the template.
- **Copy template rows** when adding line items, so added rows inherit the template's styling, widths, and formatting rather than being built from scratch.
- **Preserve included-line order** — preserve the relative customer line order for recognized lines included in the primary priced output.
- **Exclude unmatched SKUs from the generated package** — record them in `sku_resolution`, show the non-blocking exclusion alert defined in Section 8, and do not carry them into configuration, pricing, or export for the prototype target flow.
- **Include SAR pricing, margin/markup, VAT, and final sell price** in the workbook, computed by BOMATIC per Section 9 (Excel formulas are not the source of truth).
- **Generate one customer-facing workbook only** — no separate internal/customer views for MVP.
- Use the same output template for Quick BoM and RFP priced BoQ.
- Keep the customer-uploaded workbook untouched as evidence.
- Create the Quick BoM `export_package` from the latest current `priced_boq` version. The package records that source artifact version.
- Any upstream upload, configuration, pricing-setting, pricing-authority, or exclusion change marks the existing Quick BoM export stale. A stale package is not downloadable and is regenerated from the latest priced BoQ.
- Quick BoM does not require a separate pricing review, export review, or approval gate. The user's explicit download action is the final customer-release action and must be recorded for audit.

Testing requirements:

- **Add golden workbook tests** comparing the generated output structure to the Mantle benchmark (sheet names, column order/widths, merged cells, formula locations, totals layout). The existing Mantle workbook inspector and layout locator produce the deterministic structural snapshots these tests compare against.
- **Test with real benchmark inputs, especially Honeywell, Marafiq, and EnergyTech formats**, to prove the export survives the real customer BoQ shapes BOMATIC must accept.

Implementation guidance:

- Treat Mantle as a strict template, not something to recreate visually from scratch.
- Use ExcelJS or equivalent to write values into known cells/rows and preserve template formatting; do not rebuild the layout with a from-scratch sheet builder.
- Golden-file tests compare generated workbooks against the benchmark structure, not against hand-coded expectations.

## 11. Quick BoM Workflow (Approved Target)

```text
Start Quick BoM
-> create durable Project shell
-> capture customer/project details and SAR pricing settings
-> attach uploaded BoQ/BoM as immutable project_file
-> create input_package that references the current project_file version
-> validate supported file type and one of the two locked BoQ layouts
-> normalize valid input into current normalized_boq
-> resolve unique active exact catalog matches
-> record and alert on unmatched SKUs; exclude them downstream
-> evaluate approved configuration rules for recognized SKUs only
-> if configuration choices/conflicts/gaps exist: user resolves them, then rebuild
-> build current configuration_expansion
-> apply deterministic approved catalog pricing, margin/markup, and VAT
-> if actionable pricing gaps exist: user classifies/corrects them, then reprice
-> create current priced_boq
-> create Mantle export_package from the latest priced_boq
-> user downloads the customer-ready Mantle workbook
```

The default Quick BoM path is automatic. User intervention occurs only when the deterministic configuration or pricing stages produce an actionable choice, conflict, gap, or supported classification. Unmatched SKUs are not actionable exceptions in the prototype flow: they are recorded, shown through a subtle non-blocking alert, and excluded from configuration, pricing, and export.

There is no routine SKU review, Configuration Expansion Review, Pricing Review Approval, final summary review, or Export Approval in this target flow. Once all actionable exceptions are resolved, downstream deterministic processing resumes automatically. The explicit download action records which user released which current `export_package`; it is not a separate review screen or approval blocker.

Quick BoM output:

- The output is the **Mantle-format customer-facing workbook** defined in Section 10 — one priced BoQ/BoM workbook that matches the Mantle benchmark.
- The workbook contains recognized, configured, and priced lines only. Unmatched SKUs are excluded as defined in Section 8.
- **The customer-uploaded workbook remains untouched evidence** — the Mantle-format output is a separate generated artifact, never the customer's file mutated in place.
- **The generated output must be customer-ready without manual reformatting** (Quick BoM Mantle-Format Export Lock).
- Only a current export derived from the latest current priced BoQ is downloadable.

Quick BoM does not produce:

- HLD
- compliance matrix
- proposal
- RFI questionnaire
- LLD

Quick BoM uses automatic deterministic progression by default and user intervention only for actionable configuration or pricing exceptions. Existing code and stage definitions that still require routine Quick BoM approvals are implementation debt against this approved target.

## 11A. Quick BoM Configuration Expansion

This section defines the configuration expansion layer locked by the **Quick BoM Configuration Expansion Lock** checkpoint. It is the deterministic, catalog-agnostic layer that knows, from authoritative vendor sources and human-approved rules, which required/default/optional accessories, support, software, licensing, cables, and included zero-price lines belong with a recognized customer SKU or product family. Without it, a Quick BoM built from SKU lookup and pricing alone is not trustworthy enough to send to a customer.

### 11A.1 Authoritative-Source Rules

- **Authoritative configuration knowledge comes from** vendor ordering guides, approved catalog/price exports, vendor data sheets/install guides where relevant, and human-approved pre-sales rules. The first Honeywell authority pack is Cisco-specific, but the runtime contract is vendor/catalog agnostic.
- **Benchmark/priced/configured quote files are regression references only**, not rule sources. `Estimate_NB167337237YA.xlsx` is the current configured quote/reference for Honeywell MVP demo parity, while `Honeywell_BoQ_priced.xlsx` is older historical/regression-only evidence. The Mantle benchmark remains a priced-output structure reference. None of these files defines configuration rules.
- **Current vendor ordering guidance wins** over old benchmark outputs when they conflict. For the Honeywell first-scope authority pack, current Cisco ordering guidance remains authoritative over historical benchmark output.
- **Catalog/price data controls SKU existence, descriptions, and pricing.**
- **Ordering/configuration rules control what gets added, defaulted, or offered as options.**
- **Do not mix pricing authority with configuration authority.** Pricing comes from the catalog/price source (Section 9); what to add/default/offer comes from the approved rule packs.

### 11A.2 First-Scope Strategy (Honeywell)

For the first implementation, do not attempt all Cisco families. Start with the Honeywell benchmark scope:

- **Input format:** `Honeywell_BoQ.xlsx` / BOMATIC Format #2 (Section 6).
- **Build a narrow approved rule pack** only for the Cisco product families/SKUs present in the Honeywell input.
- **Use current Cisco ordering guides/CCW/catalog evidence** for those families to author the rules.
- **Use `Estimate_NB167337237YA.xlsx` as the current configured quote/reference for Honeywell MVP demo parity**. Treat `Honeywell_BoQ_priced.xlsx` as older historical/regression-only evidence. Neither file is a source of configuration rules.

### 11A.3 Required Quick BoM Expansion Flow

```text
normalized BoQ
  -> exact active catalog matching
  -> record/alert/exclude unmatched SKUs
  -> evaluate approved rules for recognized SKUs
  -> user resolves configuration choices/conflicts/gaps only when present
  -> current configuration_expansion
  -> pricing
  -> Mantle-format export
```

Pricing runs automatically after the current configuration expansion has no actionable configuration choices, conflicts, or coverage gaps. Mantle-format export consumes the latest current priced BoM.

### 11A.4 Configuration Expansion Requirements

- **Parent-child structure:** expanded lines must be parent-child/nested under the source customer line where applicable.
- **Preserve recognized customer lines:** recognized customer lines should be preserved in their relative source order. Unmatched lines remain in source evidence but are excluded downstream per Section 8.
- **Add missing required/default lines:** if required/default lines are missing, BOMATIC adds them deterministically from the active approved rule pack.
- **Included zero-price components:** included zero-price child components should be included when required by the approved rule pack.
- **Optional lines:** optional lines should be offered only when the approved rule pack says they are applicable, or when customer text implies them.
- **Actionable choices only:** where an engineer must choose among valid options, such as 3-year versus 5-year licenses/support, place only that choice in the configuration exception queue. Do not require review of deterministic lines.
- **Conflicts and coverage gaps:** conflicting rules, missing required rule coverage, or unsupported configuration choices enter the same configuration exception queue.
- **Traceability:** every auto-added line must carry its source rule ID and evidence/citation.
- **Pricing readiness:** pricing may run when configuration evaluation is complete, the artifact is current, and no actionable configuration exception remains.
- **No routine configuration approval:** a clean deterministic expansion proceeds directly to pricing; user decisions are required only for actionable exceptions.

### 11A.5 Future Rule-Authoring Direction

**Near-term:**

```text
Vendor docs/approved catalog exports
  -> AI-assisted candidate extraction with citations
  -> human approval
  -> committed JSON/TypeScript rule pack
  -> deterministic runtime expansion
```

**Later (productized):**

```text
Upload vendor ordering guide/catalog documents
  -> extract text/tables
  -> chunk evidence
  -> AI drafts candidate rules
  -> human approves in UI
  -> approved rule pack version becomes active
```

Even in the later productized workflow, **runtime customer BoQ processing must use approved structured rules only**, not live AI interpretation of ordering guides. AI assists rule authoring offline; runtime expansion is deterministic rule-pack evaluation.

## 12. RFP Workflow

Minimum required RFP inputs:

- RFP document: `.pdf` or `.docx`
- BoQ/BoM: `.xlsx` or `.csv` in one of the two locked formats

Optional supporting inputs:

- scope of work
- compliance documents
- addenda
- other relevant documents

The approved target flow is defined in `PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`. The summary below is only a compact canonical-state reminder. The blueprint controls exact box names, connectors, processing status, and risks.

### 12.1 Target RFP Chain Summary

The RFP flow is no longer an approval-heavy evidence -> compliance -> HLD -> pricing -> export chain. It is:

```text
RFP input package
-> immutable original files
-> extraction and bounded AI evidence cleanup
-> candidate requirements baseline with item-level confidence
-> SE requirements review
-> Approved Requirements Baseline
-> BoMatic configuration-only flow
-> Current Configured BoM
-> HLD intake/questionnaire where needed
-> AI-drafted Candidate HLD Design Model and HLD Diagram Draft
-> SE HLD review
-> Approved HLD Design Model
-> Candidate Compliance Matrix
-> SE compliance review
-> Approved Compliance Matrix
-> full Technical Proposal candidate
-> SE TP review/finalization
-> Final Technical Proposal
-> audited download
```

RFP/TP does **not** create a priced BoM. It consumes the current unpriced Configured BoM created by the BoMatic configuration-only path.

### 12.2 RFP Evidence And Requirements Rules

- Store original uploaded files first as immutable `project_file` versions.
- Initial supported extraction scope is readable text and tables. OCR/image reading is out of scope until explicitly added.
- Technical file failures for required sources become user action. Extraction imperfections should be surfaced through confidence, findings, and item-level review rather than package-level loops.
- AI may compare extracted text/tables with readable source content only within the bounded evidence-cleanup stage. It may add source-supported misses and suppress repeated headers, footers, notices, and signature lines with audit.
- `Extracted Evidence Result` and `Evidence Package Draft` are distinct artifacts.
- The user does not review the whole evidence package. Candidate requirements carry source refs, item confidence, reasons, and AI-added flags.
- Requirements baseline receives one focused SE review. Praxis applies SE decisions and creates the Approved Requirements Baseline.

### 12.3 BoMatic Configuration-Only In RFP

- RFP sends the current BoQ `project_file` version into BoMatic normalization, exact SKU resolution, unmatched-SKU exclusion, approved-rule configuration expansion, and configuration-exception handling.
- RFP consumes only `Current Configured BoM`.
- RFP does not run pricing and does not create a priced BoM/export workbook.

### 12.4 HLD Rules

- HLD requires `Approved Requirements Baseline` plus `Current Configured BoM`.
- `Prepare HLD Intake Context` and `Assemble HLD Drafting Context` are Praxis scoping/provenance boundaries. They do not retrieve Wiki content or design the HLD.
- The LLM Wiki connects directly only to allowed AI drafting stages named in the blueprint. It is separate from the product catalog/pricing authority.
- AI drafts the HLD clarification questionnaire, candidate HLD design model, and HLD diagram draft from bounded project context plus governed LLM Wiki retrieval.
- Praxis compilers/renderers record schema, source-chain, parity, render, and coverage findings. They always create candidate artifacts and are not design-quality authorities.
- No automatic HLD repair/retry loop, no `AI Quality Chk` lane, and no manual draw.io final-authority path.
- SE reviews the candidate HLD design and diagram together. Praxis applies SE decisions and creates the Approved HLD Design Model.

### 12.5 Compliance And Technical Proposal Rules

- Compliance matrix comes **after** Approved HLD Design Model.
- Compliance review is requirement-by-requirement; the user confirms or corrects requirement-response statuses and rationales.
- Technical Proposal generation uses exactly four direct authoritative inputs:
  1. Approved Requirements Baseline
  2. Current Configured BoM
  3. Approved HLD Design Model
  4. Approved Compliance Matrix
- AI drafts the full TP narrative from bounded context plus governed LLM Wiki retrieval.
- Praxis templates/renders the proposal and embeds locked approved/current artifacts without rewriting them.
- One SE review/finalization creates the Final Technical Proposal. Download records the user, time, and exact artifact version.

### 12.6 Processing Status Rule

Both Quick BoM and RFP/HLD/TP require a persistent Project Processing Status surface. It should show queued/running/completed/completed-with-findings/waiting/action-required state, current operation, timestamps, output artifact/version, findings count, and next action. It must persist across refresh and must not expose prompts, hidden reasoning, secrets, stack traces, or fake AI percentages.

## 13. Stage Statuses

Use:

- `not_started`
- `blocked`
- `in_progress`
- `completed`
- `needs_review`
- `approved`
- `rejected`
- `not_applicable`

Quick BoM may materialize RFP-only stages as `not_applicable` if doing so simplifies API/UI consistency.

`completed` means a deterministic stage finished successfully without requiring approval. Quick BoM clean-path stages use `completed`; `needs_review`, `approved`, and `rejected` remain available only when a workflow actually requires human review or an actionable exception decision.

## 14. Artifact Statuses

Use:

- `missing`
- `generated`
- `needs_review`
- `approved`
- `stale`
- `failed`
- `not_applicable`

Flowchart labels such as `current` or `ready` are derived readiness descriptions, not additional artifact lifecycle statuses. A `generated` Quick BoM artifact is usable only when it is current, its source versions are current, and no actionable exception blocks the next deterministic step.

## 15. Artifact Types

MVP artifact types:

- `input_package`
- `normalized_boq`
- `sku_resolution`
- `configuration_expansion`
- `priced_boq`
- `extraction_delta`
- `evidence_package`
- `requirements_baseline`
- `hld_intake_questionnaire`
- `hld_intake`
- `hld_design_model`
- `hld_diagram`
- `compliance_matrix`
- `technical_proposal`
- `export_package`

## 16. Approval Model

Where approval is required, approval is per stage/artifact, not per engine.

Rules:

- Approvals point to exact artifact versions.
- Approved versions freeze.
- Manual edits create new versions.
- Rejections mark the artifact rejected.
- Regeneration/edit after rejection creates a new version.
- Upstream changes automatically mark downstream artifacts stale.

The approved Quick BoM target does not create routine approvals for SKU resolution, configuration expansion, pricing, or export. Configuration and pricing exception decisions record the user, time, affected line/choice, and reason. The final download/release event records the user and exact current `export_package` version.

The approved RFP/HLD/TP target also removes redundant blockers. It keeps SE judgment where it changes customer-facing authority: Requirements Baseline, HLD Design Model/diagram, Compliance Matrix, and Technical Proposal. Evidence package, mechanical check findings, diagram rendering, and deterministic BoM configuration clean paths are not routine approval gates.

## 17. Engine Positioning

The product is not the engines. The product is a Project workspace that converts controlled inputs into defensible pre-sales outputs.

Engines/capabilities may remain internally, but they must report into the canonical Project artifact model.

For MVP:

- E2 should be a locked-template reader plus deterministic pricing engine, not a generic arbitrary BoQ parser.
- E1 supports RFP text/table extraction, evidence cleanup handoff, and requirements baseline candidate generation.
- BoMatic configuration-only support is required early in the RFP chain; RFP does not consume priced BoM output.
- HLD support produces candidate HLD design model and diagram draft from bounded AI drafting plus governed LLM Wiki retrieval.
- Compliance support runs after Approved HLD Design Model.
- E3/proposal support generates the full Technical Proposal from the four approved/current inputs named in Section 12.
- E4/RFI is deferred.

## 18. Explicitly Superseded Ideas

The following older planning ideas are not MVP source of truth:

- Autonomous Cisco/CCW-first BoM agent as the primary product shape.
- Arbitrary BoQ parser expansion as MVP strategy.
- Five equal runtime engines as the user-facing product architecture.
- Engine checkpoints as the approval model.
- RFI as an MVP workflow.
- LLD as an MVP deliverable.
- Quick BoM producing proposals or design documents.
- Mutating/filling the customer-uploaded workbook directly.
- AI doing math, pricing, catalog lookup, validation, or silent SKU substitution.
- Routine Quick BoM SKU/configuration/pricing/export approvals.
- RFP pricing as an input to HLD or Technical Proposal generation.
- Compliance-before-HLD ordering.
- Automatic HLD repair/retry loops.
- `AI Quality Chk` as a validation-authority lane.
- Manual draw.io upload as final HLD authority.
- LLM Wiki as product catalog, pricing, BoM mutation, or SKU authority.

## 19. Implementation Sequence

### Foundation and Quick BoM

1. Clean repo and freeze feature work. (Done — repo hygiene complete.)
2. Introduce canonical Project tables alongside existing tables.
3. Implement Project creation and stage materialization for Quick BoM and RFP.
4. Implement locked BoQ format detection and canonical normalization.
5. Implement exact active catalog resolution, versioned unmatched-SKU recording, non-blocking exclusion alerts, and automatic downstream exclusion for unmatched Quick BoM lines. Do not add runtime fuzzy/AI substitution authority.
6. Implement deterministic SAR pricing with VAT/margin/markup.
7. Implement Mantle-template priced BoQ export. This is no longer one broad line; it is built as the explicit subtasks below, gated by the **Quick BoM Mantle-Format Export Lock** checkpoint. The output must be customer-ready without manual reformatting (Section 10).
   1. **Sanitized Mantle template creation/commit** — Derive a sanitized Mantle/STC output template from the benchmark, strip confidential/customer data, and commit it into the repo as the production template.
   2. **Template structure locator/writer** — Locate the template's structure (the existing Mantle workbook inspector and layout locator do this read-only) and build the writer that opens the committed template and writes into it while preserving sheet names, column order, widths, merged cells, styles, formulas, totals layout, and visual structure.
   3. **Row mapping into exact Mantle columns/cells** — Map included priced lines into the exact template columns/cells, copy template rows when adding line items, preserve their relative customer source order, and exclude unmatched Quick BoM SKUs recorded in `sku_resolution`.
   4. **Summary/footer/totals handling** — Fill the summary, footer, and totals blocks with SAR pricing, margin/markup, VAT, and final sell price computed by BOMATIC (not Excel formulas).
   5. **Golden workbook structure tests** — Add golden workbook tests comparing the generated output structure to the Mantle benchmark.
   6. **Real benchmark input tests for Honeywell, Marafiq, and EnergyTech** — Test the export against the real benchmark customer BoQ formats, especially Honeywell, Marafiq, and EnergyTech.
   7. **Current-source export artifact and staleness** — Create the `export_package`/Mantle-format workbook from the latest current `priced_boq`, record its source version, hide stale downloads, and regenerate after upstream changes without adding a routine export approval gate.
   8. **Audited download release** — Record the user and exact current `export_package` version when the customer-ready workbook is downloaded.
8. Wire Quick BoM end-to-end against Project state.

### Quick BoM configuration expansion (gates remaining export/API/UI work)

Per the **Quick BoM Configuration Expansion Lock** checkpoint and Section 11A, these tasks come before the remaining Quick BoM export/API/UI work. The already-built Mantle export slices stay; the remaining export/API/UI work does not resume until the configuration expansion layer is locked and the Honeywell-scope rule pack exists. Lettered to avoid renumbering the RFP items below.

- **8a. Quick BoM Configuration Expansion Lock** — Lock the checkpoint, Section 11A, the updated Section 11 workflow, and these subtasks. The target flow was revised and approved on 2026-08-05; implementation remains pending.
- **8b. Rule-pack schema/types** — Define the approved structured rule-pack schema and TypeScript types (required/default/optional lines, parent-child structure, zero-price components, source rule ID, evidence/citation), independent of pricing authority.
- **8c. Honeywell-scope Cisco source evidence gathering** — Gather current Cisco ordering-guide/CCW/catalog evidence for the Cisco families/SKUs present in `Honeywell_BoQ.xlsx` (Format #2). `Estimate_NB167337237YA.xlsx` is the current configured quote/reference for Honeywell MVP demo parity; `Honeywell_BoQ_priced.xlsx` is older historical/regression-only evidence. Neither is configuration-rule authority.
- **8d. AI-assisted candidate rule extraction workflow (offline/planning support only)** — Build the controlled rule-authoring workflow that extracts candidate rules with citations from authoritative documents. This is offline/planning support, not runtime behavior; runtime customer BoQ processing must use approved structured rules only.
- **8e. Committed approved Honeywell-scope rule pack** — After human pre-sales approval, commit the narrow Honeywell-scope rule pack (committed JSON/TypeScript) into the repo as the active runtime rule source.
- **8f. Configuration expansion helper** — Pure deterministic helper that turns recognized normalized BoQ lines plus the approved rule pack into a configuration expansion (required/default/optional lines and included zero-price components), each auto-added line carrying its source rule ID and evidence/citation.
- **8g. Parent-child structural/display model** — Build the parent-child structural/display model for configuration expansion lines, with expanded lines nested under their recognized source customer line while preserving included-line relative order.
- **8h. Configuration exception-decision helper** — Apply explicit human decisions only when rule evaluation produces actionable options, conflicts, waivers, or coverage gaps (for example, 3-year versus 5-year support/license). Deterministic required/default lines do not require review.
- **8i. Expansion artifact/service** — Persist the current configuration expansion and any exception-decision provenance as a versioned Project artifact. Do not require a routine artifact approval for the Quick BoM clean path.
- **8j. Pricing from current exception-resolved expansion** — Pricing runs when the current configuration expansion has no actionable exception, reusing the deterministic SAR pricing path (Section 9).
- **8k. Mantle export from latest current priced BoM** — The Mantle-format export consumes the latest current priced BoM and preserves all Mantle output requirements (Section 10).
- **8l. Exception-driven Quick BoM stage/readiness alignment** — Update Quick BoM stage IDs, statuses, readiness checks, APIs, and UI so deterministic stages complete automatically, only actionable configuration/pricing exceptions request user decisions, and old approval blockers are removed.
- **8m. Unmatched-SKU alert/detail surface** — Show the non-blocking excluded-SKU count with a small source-line detail view; do not route unmatched lines into a review queue.

### RFP/HLD/Technical Proposal rebuild implementation (sequential)

The approved RFP/HLD/TP target is implemented from `PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`, not from the old approval-heavy roadmap. The practical build should be sliced so Codex can guard Claude prompts file-by-file.

9. **RFP upload, file roles, original file storage** - Required RFP plus BoQ minimum, optional SOW/compliance/addenda, immutable original `project_file` versions, and no premature source rejection for extractor imperfections.
10. **Extraction and bounded evidence cleanup** - Extract readable text/tables, create `extraction_delta`, let AI add only source-supported misses and suppress repeated noise within the bounded cleanup stage, and create `Evidence Package Draft`.
11. **Requirements baseline candidate and item-level review** - Draft requirements with source refs, item confidence, reasons, and AI-added flags; avoid package-level evidence review; provide one focused SE requirements review.
12. **Approved Requirements Baseline finalization** - Apply SE decisions, record identity/time/source versions, and create the approved artifact.
13. **RFP BoMatic configuration-only connector** - Reuse BoMatic normalization, exact SKU resolution, unmatched exclusion, approved configuration rules, and configuration-exception decisions; output only Current Configured BoM.
14. **HLD intake and LLM Wiki boundary** - Build `Prepare HLD Intake Context`, AI `Draft HLD Clarification Questionnaire`, conditional `Complete HLD Intake`, and `Confirmed HLD Intake`; keep LLM Wiki separate from catalog/pricing and accessible only to allowed AI drafting stages.
15. **Candidate HLD design model and diagram** - Assemble HLD drafting context, AI drafts the candidate design model, Praxis records mechanical findings, AI composes the HLD diagram draft, and Praxis renders/records findings without retry loops or validation authority.
16. **Approved HLD Design Model finalization** - SE reviews candidate model and diagram together; Praxis applies decisions, preserves configured BoM, records accepted diagram version, and creates Approved HLD Design Model.
17. **Compliance after HLD** - AI drafts Candidate Compliance Matrix from Approved Requirements Baseline, Current Configured BoM, and Approved HLD Design Model; Praxis records coverage/reference findings; SE reviews requirement-response statuses and rationales; Praxis finalizes Approved Compliance Matrix.
18. **Full Technical Proposal generation** - Assemble TP context from exactly four direct inputs: Approved Requirements Baseline, Current Configured BoM, Approved HLD Design Model, and Approved Compliance Matrix. AI drafts full TP content with governed LLM Wiki retrieval. Praxis templates/renders the proposal and embeds locked artifacts without rewriting them.
19. **Final TP review, finalization, and audited download** - SE reviews/corrects customer-facing TP content, Praxis applies decisions and creates Final Technical Proposal, and download records user/time/exact artifact version.
20. **Project Processing Status** - Implement a durable non-modal processing status surface and backend event stream early enough to cover long-running Quick BoM and RFP/HLD/TP jobs.

Do not revive arbitrary parser work, RFP pricing, export approval gates, automatic HLD repair loops, or manual draw.io authority paths while implementing this sequence.

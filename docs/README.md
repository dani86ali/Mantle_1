# BOMATIC Documentation Index

This folder contains a mix of current product guidance, evidence records, runtime
fixtures, and historical planning material. Do not treat every file here as a source
of truth.

## Current Source Of Truth

Read these first for current BOMATIC work:

1. `C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md`
2. This file: `docs/README.md`
3. The code and tests for the feature being changed.

The current architecture is Project-centered:

`Project -> files -> artifacts -> approvals -> export/download`

Quick BoM work must preserve deterministic authority boundaries:

- SKU lookup uses the active approved Quick BoM catalog.
- Configuration expansion uses approved structured rule packs.
- Pricing uses an approved price book/fixture.
- Runtime AI must not make SKU, pricing, catalog, replacement, or configuration decisions.
- Human approval gates remain explicit.

## Current Quick BoM Evidence

These are current evidence/regression docs for the Honeywell MVP authority pack. They
are not generic Cisco authority and should not be copied into user-facing product
language without abstraction.

- `docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md`
- `docs/quick-bom/HONEYWELL_CCW_PARITY_EVIDENCE.md`
- `docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md`
- `docs/quick-bom/HONEYWELL_DEMO_PRICING_FIXTURE.md`
- `docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md`
- `docs/config-expansion/RULE_MODEL_GAP_REPORT.md`
- `docs/config-expansion/HONEYWELL_*`

Use these only as scoped Honeywell evidence until the authority-pack abstraction is
introduced.

## Runtime/Test Fixtures In This Folder

Do not move these without updating runtime imports/tests:

- `docs/BOMATIC_Device_Specs.json`
- `docs/Q22026_USD for MIDDLE EAST & AFRICA_Recommended_Enduser_PriceList_05042026 1.xlsx`
- `docs/SS2_Reference_Data.json`
- `docs/BOMATIC_Capability_Matrix.xlsx`
- `docs/DEMO_TEST_TRACKER.xlsx`

Some legacy app pages still read these directly. That is a product cleanup task, not
a documentation cleanup task.

## Historical Or Future-Scope Reference

These documents may contain useful RFP/HLD/proposal knowledge, but they are not
current Project-spine implementation authority unless a prompt explicitly targets
that area and verifies them against current code:

- `docs/BOMATIC_Runtime_Architecture.md`
- `docs/BoQ_Template_Patterns.md`
- `docs/ccw_workflow_patterns.md`
- `docs/Design_Patterns.md`
- `docs/Discovery_Patterns.md`
- `docs/E1_RFP_Parser_Process_Flow.md`
- `docs/Fortinet_Catalog_Model.md`
- `docs/Network_PreSales_Playbook_Final_Consolidated.md`
- `docs/RFP_Compliance_Patterns.md`
- `docs/STC_Complete_Packages.md`
- `docs/STC_Data_Inventory.md`
- `docs/TP_Template_Model.md`
- `docs/Tender_Analyzer_Model.md`
- `docs/shahid-cisco-ground-truth.md`
- `docs/flowcharts/*.svg`

## Execution History

Prompt/story docs are historical evidence only. Use them to understand why a change
exists, not to decide current behavior:

- `docs/BOMATIC_PROMPTS_042_098_STORY.md`
- `docs/BOMATIC_PROMPTS_104_125_AUTHORITY_STORY.md`
- `docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md`

## Archive

Archived docs are retained for history and should not be read by default:

- `docs/archive/`

## Product Spine Guard Checklist

Use this checklist before and after implementation prompts:

- Does the feature read/write through Project-owned files, artifacts, approvals, or
  approved authority packs?
- Are approved SKU/config/pricing/export artifacts still visible read-only after
  approval?
- Does the UI distinguish included downstream rows from excluded/deferred rows?
- Do batch actions avoid overwriting explicit user choices silently?
- Are Dashboard, Projects, Catalog, and Quick BoM spokes aligned to the Project spine?
- Is Honeywell-specific evidence hidden behind generic product language unless the
  view is explicitly an evidence/regression view?
- Are deterministic config/pricing authorities still separate?
- Are missing prices reported instead of invented?
- Are replacement/substitution decisions deferred unless explicitly approved?

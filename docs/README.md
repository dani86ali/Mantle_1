# Praxis Documentation Index

This folder contains product docs, runtime fixtures, execution history, reference material, and archived historical planning. Do not treat every file here as current authority.

## Current Source Of Truth

Read these first for current Praxis work:

1. `docs/architecture/PRAXIS_CURRENT_STATE.md`
2. `docs/architecture/PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`
3. `docs/architecture/MVP_CANONICAL_PROJECT_STATE.md`
4. `docs/architecture/BUILD_PROCESS_ARCHITECTURE.md` only when coordinating branches, worktrees, harness use, or parallel implementation
5. This file: `docs/README.md`
6. The exact source and test files for the feature being changed

Current workspace root:

`C:\Users\dani8\OneDrive - Mantle\System Integrator`

Product repo:

`C:\Users\dani8\OneDrive - Mantle\System Integrator\Praxis\bomatic`

Historical planning and build-ledger folder:

`C:\Users\dani8\OneDrive - Mantle\System Integrator\Praxis\bomatic_planning`

## Product Spine

```text
Project
-> immutable source files
-> versioned artifacts
-> deterministic processing or bounded AI candidate drafting
-> exception-focused SE decisions and required finalizations
-> current deliverable
-> audited download
```

BoMatic, RFP, HLD, and TP work must preserve deterministic authority boundaries:

- SKU lookup uses approved SKU authority only.
- Configuration expansion uses approved structured rules/artifacts only.
- Pricing uses approved pricing authority only.
- Runtime AI must not make SKU, pricing, catalog, replacement, validation, final design, or configuration decisions.
- Product catalog/pricing authority and LLM Wiki remain separate.
- Human/SE finalization remains explicit where the target flow requires customer-facing authority; deterministic clean paths must not gain routine approval gates.
- Processing status informs the user about queued/running/completed/waiting/action-required operations; it is not another approval system.

## Current BoMatic Evidence

These are current evidence/regression docs for the Honeywell MVP authority pack. They are not generic Cisco authority and should not be copied into customer-facing product language without abstraction.

- `docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md`
- `docs/quick-bom/HONEYWELL_CCW_PARITY_EVIDENCE.md`
- `docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md`
- `docs/quick-bom/HONEYWELL_DEMO_PRICING_FIXTURE.md`
- `docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md`
- `docs/config-expansion/RULE_MODEL_GAP_REPORT.md`
- `docs/config-expansion/HONEYWELL_*`

Use these only as scoped Honeywell evidence until the authority-pack abstraction is expanded.

## Runtime Fixtures Kept In Root

These stay in `docs/` root because runtime code still imports or discovers them by path:

- `docs/BOMATIC_Device_Specs.json`
- `docs/Q22026_USD for MIDDLE EAST & AFRICA_Recommended_Enduser_PriceList_05042026 1.xlsx`

Moving these is a product cleanup task because it requires source/test updates.

## Reference Material

Reference docs may contain useful RFP, HLD, proposal, catalog, or historical workflow knowledge, but they are not current implementation authority unless a prompt explicitly targets that area and verifies them against current code:

- `docs/reference/catalog/`
- `docs/reference/rfp/`
- `docs/reference/hld/`
- `docs/reference/flowcharts/`

## Execution History And Archive

Prompt/story docs are historical evidence only. Use them to understand why a change exists, not to decide current behavior.

Archived docs are retained for history and should not be read by default:

- `docs/archive/`
- `docs/archive/superseded/`

## Product Spine Guard Checklist

Use this checklist before and after implementation prompts:

- Does the feature read/write through Project-owned files, artifacts, decisions/finalizations, or approved authority packs?
- Are current and approved artifacts still visible with their exact source versions?
- Does the UI distinguish included downstream rows from excluded/deferred rows?
- Do batch actions avoid overwriting explicit user choices silently?
- Are Dashboard, Projects, Catalog, and BoMatic spokes aligned to the Project spine?
- Is Honeywell-specific evidence hidden behind generic product language unless the view is explicitly an evidence/regression view?
- Are deterministic config/pricing authorities still separate?
- Are the product catalog/pricing authority and LLM Wiki technically separate?
- Are missing prices reported instead of invented?
- Are replacement/substitution decisions deferred unless explicitly approved?
- Are mechanical findings shown without becoming hidden retry loops or design/compliance approval authority?

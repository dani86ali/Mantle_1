# Praxis

Praxis is a pre-sales delivery workspace for System Integrator teams. It manages RFP evidence, requirements, BoQ/configuration artifacts, compliance matrices, HLD artifacts, technical proposals, and audited downloads through a Project-centered workflow.

The repository folder is still named `bomatic`. The Quick BoM feature inside Praxis is called BoMatic.

## Current Product Spine

```text
Project
-> immutable source files
-> versioned artifacts
-> deterministic processing or bounded AI candidate drafting
-> exception-focused SE decisions and required finalizations
-> current deliverable
-> audited download
```

The approved target flow is defined in `docs/architecture/PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`. Current code still contains older approval-heavy paths and should be migrated to that blueprint.

Core implementation areas:

- `src/app/projects/[id]/...`: Project UI and API routes.
- `src/lib/projects/...`: artifact services, validators, readiness checks, source-chain checks, and workflow logic.
- `src/types/project.ts`: Project and artifact types.
- `tests/...`: Vitest coverage for services, routes, and UI.

Older engine-style docs and folders may still exist. Current work should follow inspected code and tests, not stale planning assumptions.

## Major Flows

BoMatic / Quick BoM:

- Normalizes supported BoQ inputs.
- Resolves SKUs by exact active catalog match.
- Shows a non-blocking alert for unmatched SKUs and excludes them from configuration, pricing, and export.
- Expands configuration through deterministic approved rules.
- Prices through approved pricing authority using Project-level SAR/VAT/margin or markup settings.
- Uses user intervention only for invalid input and actionable configuration/pricing exceptions.
- Produces a current Mantle export package for audited download without routine SKU/configuration/pricing/export approvals.

RFP chain:

- Stores immutable RFP package files and extracts text/tables.
- Uses bounded AI evidence cleanup and item-level confidence to draft a reviewable requirements baseline.
- Runs BoMatic configuration-only early and consumes the current unpriced Configured BoM.
- Uses AI plus governed LLM Wiki retrieval to draft HLD intake questions, HLD design model, and HLD diagram candidates.
- Places compliance matrix after Approved HLD Design Model.
- Generates the full Technical Proposal from Approved Requirements Baseline, Current Configured BoM, Approved HLD Design Model, and Approved Compliance Matrix.

Current runtime status:

- Current runtime still has older RFP/HLD approval gates, manual diagram/final HLD paths, RFP pricing/export approval assumptions, and TP handoff behavior.
- Rebuild work should replace those paths with the approved blueprint flow.

## Authority Rules

- Runtime AI does not perform math, pricing, SKU replacement, catalog lookup, configuration decisions, validation authority, or final design authority.
- Configuration authority and pricing authority stay separate.
- Product catalog/pricing authority and LLM Wiki stay separate.
- No silent SKU substitution.
- No raw source document rereads downstream once approved artifacts exist.
- AI drafting outputs are candidates until SE finalization makes the artifact authoritative.
- Human/business/SE approval remains final runtime/customer-deliverable authority.

## First Read For Agents

Use these entry points before changing code:

1. `docs/architecture/PRAXIS_CURRENT_STATE.md`
2. `docs/architecture/PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`
3. `docs/architecture/MVP_CANONICAL_PROJECT_STATE.md`
4. `docs/README.md`
5. The exact source and tests for the task

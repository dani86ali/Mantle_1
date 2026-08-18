# Praxis Current State

Date: 2026-08-07

Purpose: first-read source of truth for future Codex/Claude/Govern AI sessions. This file summarizes repo location, current runtime reality, approved target-flow authority, and hard authority rules. It does not replace code inspection, tests, ledgers, or human review.

## Names And Locations

- Product name: Praxis.
- Product repo folder: `bomatic` for now.
- Quick BoM feature name: BoMatic.
- Product repo: `C:\Users\dani8\OneDrive - Mantle\System Integrator\Praxis\bomatic`.
- Canonical architecture: `C:\Users\dani8\OneDrive - Mantle\System Integrator\Praxis\bomatic\docs\architecture`.
- Historical planning/ledgers: `C:\Users\dani8\OneDrive - Mantle\System Integrator\Praxis\bomatic_planning`.
- Harness: `C:\Users\dani8\OneDrive - Mantle\System Integrator\Praxis\bomatic-harness`.
- Benchmark/source folders live outside the product repo under `C:\Pre-Sales\` and vendor/catalog folders under `vendor_data_price_guide_instructions\`.

## Current Repo State To Reconfirm

Every new session must run `git status --short -b` in the product repo and inspect relevant diffs before acting. Do not assume this file is newer than the repo.

Known local dirt at the time this file was updated:

- `.claude/settings.local.json`
- `CLAUDE.md`
- `README.md`
- `docs/README.md`
- `docs/execution-history/DEMO_FINDINGS_2026-07-01.md`

Do not revert user or generated changes unless explicitly asked.

## Target Flow Authority

The approved rebuild authority is:

```text
docs/architecture/PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md
```

That document controls the target application flow for:

- BoMatic Quick BoM.
- RFP / HLD / Technical Proposal chain.
- Project Processing Status box and processing-event behavior.
- LLM Wiki boundaries and allowed AI retrieval points.

Current code may still implement older approval-heavy behavior. Treat such behavior as migration debt when it conflicts with the blueprint.

## Architecture Spine

Praxis remains Project-centered. The approved target shape is:

```text
Project
-> immutable source files
-> versioned artifacts
-> deterministic processing or bounded AI candidate drafting
-> exception-focused SE decisions and required finalizations
-> current deliverable
-> audited download
```

The current implementation is mostly in:

- `src/app/projects/[id]/...` for UI and API routes.
- `src/lib/projects/...` for project artifact services, validators, readiness, and source-chain logic.
- `src/types/project.ts` for project/artifact types.
- `tests/...` for Vitest coverage.

Older engine-style planning may still exist, but new work must inspect current code before following old `src/engines` assumptions.

## Current Runtime Reality

BoMatic / Quick BoM:

- The approved target removes routine SKU, configuration, pricing, export, and final-summary approvals.
- The current runtime still contains approval-heavy stages and must be migrated to the exception-driven flow.
- Unmatched SKUs should become a non-blocking exclusion alert in the target flow, not a review queue.
- Pricing remains deterministic and uses SAR, VAT, margin/markup settings captured at Project creation.

RFP / HLD / Technical Proposal:

- The approved target performs BoMatic configuration-only early in the RFP chain and does not price the RFP BoM.
- Requirements baseline comes before HLD.
- HLD design is drafted by AI using bounded project context and direct governed LLM Wiki retrieval.
- Compliance matrix comes after Approved HLD Design Model.
- Technical Proposal generation produces the full TP from four authoritative inputs: Approved Requirements Baseline, Current Configured BoM, Approved HLD Design Model, and Approved Compliance Matrix.
- Current runtime still contains older HLD gates, manual draw.io/final HLD authority paths, compliance-before-HLD assumptions, RFP pricing/export approvals, and TP handoff behavior. Rebuild work should replace those with the blueprint flow.

## Runtime Authority Rules

- Runtime AI must not perform math, pricing, SKU replacement, catalog lookup, configuration expansion, configuration decisions, validation authority, or final design authority.
- No silent SKU substitution.
- Configuration authority and pricing authority remain separate.
- Product catalog/pricing authority and LLM Wiki are separate databases and permission boundaries.
- LLM Wiki content is advisory context for allowed AI drafting stages only; it cannot mutate configured BoM/SKU lines or pricing.
- No raw PDF/DOCX/XLSX rereads downstream once approved/candidate artifacts exist except within explicitly bounded extraction/evidence cleanup stages.
- No Cisco-certified, CVD-certified, Praxis-certified, BOMATIC-certified, AI-certified, Cisco-approved, or equivalent claims.
- AI outputs are advisory or candidate outputs until SE review/finalization makes the structured artifact authoritative.
- Deterministic checkers record schema, source-chain, render, or coverage findings; they are not design/compliance approval authorities.
- Human/business/SE approval remains final runtime/customer-deliverable authority.

## Reference Material Rule

Planning reference folders are not current implementation authority by themselves. They are useful only when a task explicitly targets that area and the code/tests are inspected.

- `../bomatic_planning/reference/compliance/`: useful compliance framework reference.
- `../bomatic_planning/reference/data_dictionary/`: historical/current data dictionary reference.
- `../bomatic_planning/reference/parser_strategies/`: historical parser research only. Runtime parser authority lives in code/tests.

Do not bulk-load archives or large inventories by default.

## Next Rebuild Priorities

1. Use `PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md` as the implementation prompt authority.
2. Add the Project Processing Status backend/UI early because both flows have many asynchronous processing events.
3. Rebuild Quick BoM first around exception-driven deterministic progression.
4. Rebuild RFP/HLD/TP stages around the approved artifact order and remove obsolete retry/review blockers.
5. Keep generated worktrees, run artifacts, and temporary harness output outside OneDrive where possible.

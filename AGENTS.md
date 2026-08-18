# AGENTS.md

## Current Product Context

Product name: Praxis. The repository folder is still named `bomatic`. The Quick BoM product feature is called BoMatic.

Before implementation, read only the current entry points needed for the task:

1. `docs/architecture/PRAXIS_CURRENT_STATE.md`
2. `docs/architecture/PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`
3. `docs/architecture/MVP_CANONICAL_PROJECT_STATE.md`
4. `docs/architecture/BUILD_PROCESS_ARCHITECTURE.md` only when branch/worktree/harness process matters
5. `docs/README.md`
6. The exact source and test files for the task

Do not bulk-load archived docs or planning reference folders by default.

## Current Architecture

Praxis is Project-centered:

```text
Project
-> immutable source files
-> versioned artifacts
-> deterministic processing or bounded AI candidate drafting
-> exception-focused SE decisions and required finalizations
-> current deliverable
-> audited download
```

Approvals are required only where the current workflow explicitly calls for SE/customer-facing authority. Do not add routine approval blockers to deterministic clean paths.

New Project-chain work usually lives in:

- `src/app/projects/[id]/...` for UI and API routes
- `src/lib/projects/...` for services, artifact builders, validators, readiness, and source-chain checks
- `src/types/project.ts` for Project/artifact types
- `tests/...` for Vitest coverage

Older `src/engines` and legacy planning may exist. Inspect current code before extending any old pattern.

## Hard Guardrails

- Do not touch `stc-knowledge/`.
- Do not modify `.claude/settings.local.json`.
- Do not touch stash.
- Do not install packages unless explicitly approved.
- Do not use legacy runtime code for new runtime behavior.
- Do not reread raw PDF/DOCX/XLSX/customer source files downstream once approved artifacts exist.
- Do not add pricing, SKU, catalog, or configuration authority casually.
- Runtime AI must not perform math, pricing, SKU replacement, validation authority, catalog lookup, configuration decisions, or final design authority.
- No silent SKU substitution.
- Keep configuration authority and pricing authority separate.
- Keep the product catalog/pricing authority and LLM Wiki as separate data stores and permission boundaries.
- Do not claim Praxis, BoMatic, BOMATIC, Codex, Claude, OpenAI, Anthropic, Cisco, CVD, or any AI output is certified, Cisco-approved, CVD-certified, BOMATIC-certified, Praxis-certified, or AI-certified.
- Human/business/SE approval remains final runtime/customer-deliverable authority.

## AI Authority Boundaries

- OpenAI question drafting is advisory.
- Engineer/SE answers become authority only after approval.
- Claude/Anthropic/OpenAI design, compliance, and proposal generation is candidate drafting only.
- LLM Wiki retrieval is allowed only from the AI drafting stages named in `PRAXIS_APPLICATION_FLOW_BLUEPRINTS.md`.
- Do not reintroduce an `AI Quality Chk` lane, automatic HLD repair loop, manual draw.io final authority path, compliance-before-HLD ordering, RFP pricing, or old approval-heavy stages.
- Deterministic checkers record schema, source-chain, render, and coverage findings. They are not design/compliance approval authorities.

## Work Style

- Start with `git status --short -b` and inspect relevant diffs.
- Keep changes narrow and aligned to the current Project spine.
- Write or update tests in the same stage as implementation.
- Run focused Vitest, impacted suites, `npm.cmd run typecheck`, `git diff --check`, and `npm.cmd run build` before claiming completion.
- Do not commit or push until actual verification has passed.
- Keep future worktrees, run artifacts, and harness output outside OneDrive unless explicitly directed.

# BOMATIC Build Process Architecture

Status: current build/governance process.
Updated: 2026-06-09.
Supersedes: `../bomatic_planning/archive/superseded/BOMATIC_Build_Architecture.md`.

This document defines how BOMATIC should be built and fixed using Codex as the hub
and Claude sessions as implementation spokes. It is development-process guidance,
not runtime product architecture. Product architecture remains governed by
`MVP_CANONICAL_PROJECT_STATE.md`.

## 1. Operating Model

BOMATIC is built through a guarded hub-and-spoke process:

```text
User / business authority
        |
Codex hub: architect, reviewer, gatekeeper
        |
External harness: evidence collector only
        |
Claude spokes: isolated implementation sessions
        |
Repo tests, diffs, browser/DB proof
```

Roles:

- User: approves business/Cisco authority, pricing authority, replacement policy,
  and scope changes.
- Codex hub: reads current repo/planning state, decomposes work, writes narrow
  prompts, reviews actual repo diffs/evidence, controls commits and integration.
- Claude spoke: implements exactly one narrow task in exactly one branch/worktree.
- Harness: launches/records evidence. It is not an authority and cannot approve work.
- Tests/browser/DB proof: verify behavior. Summaries alone are never sufficient.

## 2. Non-Negotiable Architecture Rules

Every spoke prompt must preserve these rules:

- Project spine remains the product center:
  `Project -> files -> artifacts -> approvals -> export/download`.
- Runtime AI must not do math, pricing, SKU replacement, validation, catalog lookup,
  or configuration decisions.
- Configuration authority and pricing authority are separate.
- SKU replacement/substitution is never silent.
- Unknown catalog/config relationships are deferred unless explicitly approved.
- Benchmark or priced files are regression/configured quote references unless the
  user grants scoped temporary authority.
- No prompt may claim BOMATIC, Codex, Claude, or the app is Cisco-certified.

## 3. Parallel Work Principle

Parallel Claude sessions are allowed only when the hub can give each session a
non-overlapping ownership lane.

Safe parallel work has all of these:

- Separate branch or worktree per Claude session.
- Narrow prompt per session.
- Explicit allowed files and forbidden files.
- One owner for any shared page, API route, artifact service, schema, or fixture.
- Independent tests for each lane.
- Codex review before merge.

Unsafe parallel work:

- Two sessions editing the same large page or service.
- One session changing DTO/API shape while another depends on old shape.
- One session changing authority data while another changes runtime behavior.
- Any prompt that says "fix the UI" or "clean up the chain" without file ownership.

If the target files are too entangled, do one small serial seam-setting task first.
Example: extract `src/app/projects/[id]/quick-bom/page.tsx` sections into separate
review components without behavior changes. After that, run parallel bug-fix spokes
against those separate files.

## 4. Branch And Worktree Strategy

Default integration branch:

```text
fix/canonical-project-types
```

For three Claude sessions, use separate branches and preferably separate worktrees:

```text
C:\Pre-Sales\bomatic-worktrees\qbm-sku-review
  branch: bug/qbm-sku-review-checkbox

C:\Pre-Sales\bomatic-worktrees\qbm-config-review
  branch: bug/qbm-config-review-checkbox

C:\Pre-Sales\bomatic-worktrees\qbm-projects-catalog
  branch: bug/qbm-projects-catalog-nav
```

Worktree command pattern:

```powershell
git fetch origin
git worktree add C:\Pre-Sales\bomatic-worktrees\qbm-sku-review -b bug/qbm-sku-review-checkbox origin/fix/canonical-project-types
git worktree add C:\Pre-Sales\bomatic-worktrees\qbm-config-review -b bug/qbm-config-review-checkbox origin/fix/canonical-project-types
git worktree add C:\Pre-Sales\bomatic-worktrees\qbm-projects-catalog -b bug/qbm-projects-catalog-nav origin/fix/canonical-project-types
```

Do not run three Claude sessions in the same working directory.

## 5. Current Quick BoM Bug-Fix Lanes

### Lane A - SKU Review UX And Authority

Branch:

```text
bug/qbm-sku-review-checkbox
```

Scope:

- Replace per-line Accept/Reject SKU review UX with a checkbox/table review model.
- Eligible same-SKU priced rows selected by default.
- Deferred/non-priced rows unselected and impossible to approve for MVP.
- One submit action records explicit decisions.
- Approved SKU decision view remains readable after approval.

Likely allowed paths:

- `src/app/projects/[id]/quick-bom/_components/sku-review*`
- `src/app/projects/[id]/quick-bom/page.tsx` only if this lane owns the seam.
- SKU review routes/actions/services.
- SKU review tests.

Forbidden:

- Configuration expansion review semantics.
- Pricing source changes.
- Catalog/rule authority changes.
- Export workbook writer changes.

### Lane B - Configuration Review UX And Authority

Branch:

```text
bug/qbm-config-review-checkbox
```

Scope:

- Replace per-line Accept/Reject config review UX with checkbox/table review model.
- Expansion lines selected by default.
- User deselects exclusions and submits once.
- Bulk accept must not overwrite explicit rejects/deselections.
- Approved configuration decision view remains readable after approval.

Likely allowed paths:

- `src/app/projects/[id]/quick-bom/_components/config-review*`
- `src/app/projects/[id]/quick-bom/page.tsx` only if this lane owns the seam.
- Configuration review routes/actions/services.
- Configuration review tests.

Forbidden:

- SKU resolution semantics.
- Pricing source changes.
- Rule JSON authority changes unless user explicitly approves.
- Export workbook writer changes.

### Lane C - Project Navigation And Catalog Surface

Branch:

```text
bug/qbm-projects-catalog-nav
```

Scope:

- Rename/rewire `Estimates` surface to Project-centered listing where appropriate.
- Ensure Quick BoM Projects appear in Dashboard/Projects listing.
- Fix Catalog tab backend/content to show active Quick BoM catalog coverage,
  price coverage, config-rule coverage, and authority boundaries.
- Keep the visible nav label `Catalog` unless user changes the decision.

Likely allowed paths:

- Dashboard/Projects listing routes/components/read models.
- Catalog route/components/read models.
- Navigation labels/components.
- Catalog surface tests.

Forbidden:

- Quick BoM SKU/config/pricing processing services.
- Pricing fixtures or authority data.
- Configuration rule JSONs.
- Export behavior.

## 6. Shared File Protocol

Shared files require one of these treatments:

- Assign one branch as owner.
- Do a serial seam-setting prompt first.
- Split into new files/components before parallel work starts.

For current bugs, avoid concurrent edits to:

- `src/app/projects/[id]/quick-bom/page.tsx`
- Quick BoM workspace DTO/read model files.
- Project artifact/approval stores.
- Pricing/config authority fixtures.
- Root docs/index files.

If two branches need the same DTO, do the DTO change first as a serial foundation
branch, merge it, then rebase all spokes.

## 7. Prompt Contract For Every Claude Spoke

Each prompt must include:

- Objective: one sentence.
- Branch/worktree: exact location.
- Allowed files: explicit list or narrow glob.
- Forbidden files: explicit list.
- Required behavior: user-visible expected result.
- Architecture guardrails: Project spine, no runtime AI decisions, no silent SKU
  substitution, pricing/config separation.
- Tests to run: focused first, then broader impacted suite.
- Evidence required: git status, diff stat, test logs, browser proof when UI changes.
- Stop condition: stop if approval/authority change is needed.

Claude must not be asked to "also clean up" unrelated files.

## 8. Review And Merge Gate

Codex must review each spoke branch before merge:

```powershell
git status --short -u
git diff --stat origin/fix/canonical-project-types...HEAD
git diff origin/fix/canonical-project-types...HEAD -- <allowed paths>
npm.cmd run typecheck
npx.cmd vitest run <focused tests>
```

For UI changes, require at least one of:

- Browser proof against running app.
- Playwright/headless proof.
- Component test proving the changed workflow state.

Do not merge on Claude summary alone.

Merge order for the current Quick BoM bugs:

1. Serial seam-setting branch if needed.
2. Lane A SKU review.
3. Lane B configuration review.
4. Lane C project/catalog navigation can merge independently if it does not touch
   Quick BoM workflow files.
5. Final integration branch runs full impacted Quick BoM tests and one manual browser
   QA pass.

## 9. Human Approval Gates

No extra user approval is needed for normal bug fixes that only change UI workflow,
read models, tests, or visibility.

Stop for user approval if a spoke proposes:

- New pricing authority or pricing source.
- New configuration rule authority.
- SKU replacement/substitution mappings.
- Treating a benchmark/priced quote as broader Cisco authority.
- Database migration or destructive data cleanup.
- Scope expansion beyond Quick BoM bug fixing.
- Any claim of production Cisco pricing or Cisco certification.

## 10. Quality Guards

Before launching three Claude sessions, assign these guard roles to the review plan:

- Architecture guard: checks Project spine, artifacts, approvals, stale behavior.
- Authority guard: checks catalog/config/pricing boundaries and no runtime AI decisions.
- UI workflow guard: checks user state, bulk actions, visibility after approval.
- Regression guard: checks Honeywell end-to-end output and download behavior.

These can be separate review prompts or checklists, but they do not replace Codex
inspection of actual diffs and tests.

## 11. Current Recommendation For Next Bug-Fix Run

Do not launch three sessions against the current Quick BoM page until file ownership
is clear.

Recommended sequence:

1. Inspect `src/app/projects/[id]/quick-bom/page.tsx` and current review components.
2. If SKU and config review are still embedded in the same page, run one serial
   seam-setting prompt to extract review panels without behavior changes.
3. Launch three Claude sessions in separate worktrees:
   - Lane A: SKU review checkbox/table and approved-read visibility.
   - Lane B: configuration review checkbox/table and approved-read visibility.
   - Lane C: Projects listing and Catalog backend surface.
4. Merge through Codex only after focused tests and browser proof.

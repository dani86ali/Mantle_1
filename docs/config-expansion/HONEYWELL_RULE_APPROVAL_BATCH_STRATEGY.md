# Honeywell Rule Approval Batch Strategy

> WARNING: This is a planning and review sequencing document only. It is
> not runtime authority, it is not an approved rule pack, and it approves
> nothing. No rule, child line, option group, term group, term, or replacement
> is approved or activated here. It exists to freeze the order in which later
> prompts implement runtime support for, and approve, the model-aware Honeywell
> v2 rule improvements - safest slice first.

## 1. Status

This document is a planning and review sequencing document only. It is
not runtime authority, it is not an approved rule pack, and it approves
nothing. It records no per-item approval decision and changes no runtime
evaluation. The
model-aware candidate pack
(data/config-expansion/honeywell-candidate-rules-v2.json), the v1 candidate pack
(data/config-expansion/honeywell-candidate-rules.json), and the approval packets
(docs/config-expansion/HONEYWELL_RULE_APPROVAL_PACKET_V2.md and its companion
JSON) are unchanged by this document and remain candidate/pending. Configuration
authority (what to add, default, or offer) stays strictly separate from pricing
authority (the catalog/price source resolved deterministically at runtime); this
document carries no pricing decision and no pricing field.

## 2. Why Batches Exist

The model-aware v2 work (docs/config-expansion/RULE_MODEL_GAP_REPORT.md) bundles
several different kinds of rule improvement: related-SKU quantities,
selected-option quantities, duplicate policies, option groups, term option
groups, evidence-scope classification, and separate replacement candidates.
Implementing or approving them all at once is risky. Every advanced model
primitive the runtime evaluator learns to read is a new way it can overreach:
emit a quantity nobody reviewed, force a Honeywell quote selection onto a
different deployment, or silently substitute a SKU. Batches keep the runtime
evaluator from overreaching and keep approval scoped: a later prompt implements
runtime support for, and a reviewer approves, only one well-understood slice at a
time - smallest and safest first - so the blast radius of any mistake stays
contained and reviewable.

## 3. Batch Definitions

The batches below are an implementation/approval ordering, not an approval. Every
item in every batch stays candidate/pending until a separate later prompt
implements runtime support and a human/business reviewer records explicit
decisions.

### Batch 1 - MVP deterministic model safety

Purpose: support only the model features needed to avoid frozen Honeywell
quantities - nothing more.

Includes:

- same_as_related_sku_total for LIC-CW-A and LIC-SPACES-ADV derived from the
  CW9178I-CFG project quantity, so the wireless license counts track the
  access-point total instead of a frozen 12.
- selected_option_count for CAB-C15-CBN derived from the selected AC PSU option
  groups, so the power-cord count follows the selected power supplies.
- project_sku duplicatePolicy with existing_satisfies_required for the wireless
  subscription lines, so a per-project license is not re-added per parent segment.
- AC PSU option groups c9300x-ac-power-supplies and c9300l-ac-power-supplies.

Excludes:

- 5Y/7Y SKU alternatives (deferred to Batch 2).
- replacement candidates (deferred to Batch 3).
- UI/API/coordinator wiring.
- pricing changes.
- approved runtime pack creation.

### Batch 2 - term-coupled support/licensing

Purpose: model the 3Y default and the 5Y/7Y engineer-review alternatives for the
term-coupled subscription and support lines.

Includes:

- termOptionGroups.
- defaultTermMonths 36.
- allowedTermMonths 36/60/84.

Excludes:

- invented 5Y/7Y SKUs.
- runtime approval of 5Y/7Y alternatives without Cisco SKU evidence.

### Batch 3 - replacement candidates

Purpose: handle historical-to-current SKU mappings separately from configuration
expansion. Replacements must not be silent runtime SKU substitutions; each
replacement is an explicit, separately approved decision.

Includes:

- replacementCandidates review model.
- explicit non-silent replacement decisions.

Excludes:

- automatic SKU substitution.
- replacement during configuration expansion unless separately approved.

### Batch 4 - broader Cisco generalization

Purpose: move beyond Honeywell-scope toward reusable Cisco-family packs.

Includes:

- more Cisco ordering evidence.
- non-Honeywell CCW/catalog validation.
- evidence-scope hardening.

Excludes:

- assuming Honeywell quote choices are universal.

## 4. Batch 1 Runtime Boundary

Prompt 54 should implement runtime evaluator support only for the Batch 1 model
primitives and their tests: same_as_related_sku_total, selected_option_count, the
project_sku duplicatePolicy with existing_satisfies_required, and the AC PSU
option groups c9300x-ac-power-supplies and c9300l-ac-power-supplies. Today the
deterministic builder (src/lib/projects/config-expansion.ts) evaluates only the
v1 quantityRule union (same_as_parent, fixed, fixed_per_parent) with
parent-segment-local duplicate detection, and ignores every advanced model field.
Prompt 54 must not create or activate an approved rule pack: it adds evaluator
support and tests only, and the v2 candidate pack stays candidate.

## 5. Approval Boundary

An approved runtime Honeywell rule pack must be a separate later prompt, and it
must be built only from explicit human/business decisions recorded per parent
rule, child line, option group, term group, and replacement candidate. No batch
in this document approves anything. The v1 and v2 candidate packs and the
approval packets remain unchanged and stay candidate/pending; an approved pack is
authored as a NEW artifact, never by flipping a candidate pack's status.

## 6. Evidence Boundary

- CCW evidence is strong configured-quote evidence: the current CCW export shows
  exactly what was configured and ordered for the Honeywell scope.
- CCW-only evidence may be valid for Honeywell MVP decisions, but it should be
  marked quote_observed unless it is converted into reusable_logic backed by
  ordering-guide or data-sheet evidence. A value seen once in a quote is not, by
  itself, reusable logic.
- needs_more_evidence items cannot become generic Cisco rules without more
  evidence. At most they may be approved as Honeywell-scoped decisions; they must
  not be promoted into universal Cisco-family rules until more evidence exists
  (see Batch 4).

## 7. Next Prompt Sequence

- Prompt 54: Batch 1 runtime evaluator support only. Evaluator support and tests
  for the Batch 1 model primitives; no approved pack is created or activated.
- Prompt 55: Batch 1 approved Honeywell runtime pack from explicit decisions, if
  decisions are available. Authored as a new artifact from recorded
  human/business decisions over the Batch 1 scope.
- Prompt 56: demo orchestration / fixture runner after the approved pack exists.
- Later prompts: Batch 2 terms, Batch 3 replacements, and Batch 4 generalization,
  each gated on its own evidence and explicit decisions.

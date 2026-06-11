# Configuration Expansion Rule Model Gap Report

> WARNING: This document is an architecture and modeling gap report. It is not
> runtime authority and it is not an approved rule pack. It approves no rule,
> child line, or replacement, activates no configuration-expansion behavior, and
> changes no runtime evaluation. It exists to record the rule-model gaps that must
> be closed before an approved Honeywell runtime rule pack can be safely authored.

## 1. Status

This is an architecture/modeling gap report only. It is not runtime authority and
it is not an approved rule pack. Nothing here is active, approved, or runtime
enabled. Pricing authority (the catalog/price source resolved deterministically at
runtime) and configuration authority (what to add, default, or offer) stay
strictly separate; this report carries configuration-model analysis only and makes
no pricing decision. The companion candidate pack and approval packet are
unchanged by this report and remain pending human review.

## 2. Why This Exists

During advisor review of the Prompt 47 Honeywell rule approval packet we found a
critical modeling issue: some candidate rules encode observed Honeywell/CCW
quantities or selections instead of reusable configuration logic.

- The candidate rules contain useful CCW and ordering-guide/data-sheet evidence.
  That evidence is worth keeping for review and rule authoring.
- Some candidate rules are shaped by Honeywell observed quantities and options
  rather than by reusable logic. The clearest case: `LIC-CW-A` and
  `LIC-SPACES-ADV` are encoded as `quantityRule: "fixed"` with `quantityValue: 12`.
  That `12` matches the Honeywell estimate only because Honeywell has 12
  `CW9178I-CFG` access points. It is not reusable: the real logic is one wireless
  license per access point, derived from the related AP count.
- Approved runtime rules must encode configuration logic, not frozen Honeywell
  estimate values. A rule that emits `12` regardless of how many access points a
  new customer orders is wrong for every deployment except this one.

This means active-pack approval is paused until the rule-model gaps below are
documented and addressed.

## 3. Current Runtime Model Limits

The current type contract (`src/lib/projects/config-expansion-types.ts`) and the
deterministic builder (`src/lib/projects/config-expansion.ts`) impose these limits:

- Quantity rules are only `same_as_parent`, `fixed`, and `fixed_per_parent`. There
  is no way to derive a quantity from a related SKU or from a selected option.
- Duplicate detection is parent-segment local. `buildConfigurationExpansionDraft`
  builds its `present` set from a single parent segment, so it cannot detect a
  duplicate that spans segments or that should be unique per project.
- There is no cross-parent bundle/link model. A child line can only reference its
  own parent's quantity, never a related SKU under a different parent.
- There is no option-group model. A default selection cannot be expressed as a
  default with engineer-review alternatives.
- There is no term-option model. A 3-year term cannot be expressed as a default
  with longer-term alternatives.
- Replacements are not formalized separately from expansion approval. Historical
  to current SKU mappings have no model of their own.
- Evidence does not classify quote-observed values vs reusable logic. A value seen
  once in the CCW looks identical to logic taken from an ordering guide.

## 4. Blocker Matrix

Severity key: P0 blocks safe authoring of an approved pack; P1 produces wrong or
unreviewable output on reuse; P2 is a correctness/freshness follow-up.

| ID | Severity | Model gap | Affected Honeywell examples | Why current model is unsafe | Required model capability |
| --- | --- | --- | --- | --- | --- |
| GAP-1 | P0 | Related-SKU quantity rule missing | `LIC-CW-A`, `LIC-SPACES-ADV` encoded as fixed 12, which is the `CW9178I-CFG` access-point count | Reuse this rule on a deployment with a different access-point count and it still emits 12 licenses. The quantity is frozen to the Honeywell estimate instead of derived from the `CW9178I-CFG` AP count, so it is wrong for every other deployment. | Related-SKU quantity reference such as `same_as_related_sku_total`, so the license quantity tracks the total `CW9178I-CFG` quantity |
| GAP-2 | P0 | Cross-parent subscription/bundle dependency | `LIC-CW-A` and `LIC-SPACES-ADV` are child lines under `CISCO-NETWORK-SUB`, but their correct quantity is the `CW9178I-CFG` AP count under a different parent | The wireless licenses live under `CISCO-NETWORK-SUB` while the access points live under `CW9178I-CFG`. With only parent-local rules the license count cannot reference the AP count, so it was hardcoded to 12 and breaks whenever the AP count changes. | Cross-parent bundle/link model that lets a child reference a related SKU group (`related_sku_group`) spanning parents |
| GAP-3 | P1 | Selected-option-dependent quantities | `CAB-C15-CBN` encoded as `fixed_per_parent` 2 (two cords per switch) | The multiplier of 2 assumes both AC power supplies were selected. If only one PSU is chosen the rule still emits 2 cords per switch. The cord count must derive from the selected AC power-supply count, which is itself an engineer-review option. | Selected-option count quantity: power cable count = selected AC power-supply count |
| GAP-4 | P1 | Option/default selections need review; no option-group model | secondary PSU (`PWR-C1-1100WAC-P/2`, `PWR-C1-715WAC-P/2`), network modules (`C9300X-NM-8Y`), mounting accessories (`AIR-AP-BRACKET-2`, `AIR-AP-T-RAIL-F`), SSD none (`C9300-SSD-NONE`, `C9300L-SSD-NONE`), stack kits (`STACK-T1-50CM`, `C9300L-STACK-KIT2`) | These are `default_selected` only because they were selected in the Honeywell CCW. The model cannot express them as options with a default plus engineer-review alternatives, so a copied rule silently forces the Honeywell selections onto every deployment. | Option groups with a default selection and engineer-review alternatives |
| GAP-5 | P1 | Term-coupled subscriptions/support not modeled as term options | 3Y DNA licenses and support (`C9300-DNA-A-48-3Y`, `C9300L-DNA-A-24-3Y`, the `CON-*` term lines) defaulted from the CCW | The 3-year term is copied from the Honeywell CCW and frozen as if universal; 5Y/7Y alternatives cannot be offered. Term length is an engineer-review decision and must be a term option with a 3Y default and 5Y/7Y alternatives. | Term option groups with a 3Y default and 5Y/7Y alternatives at engineer review |
| GAP-6 | P1 | Duplicate detection too local | subscription/support lines such as `NETWORK-PNP-LIC` and `TE-C9K-SW` can appear under more than one parent segment | `buildConfigurationExpansionDraft` only de-duplicates within a single parent segment, so a SKU that should be unique per project or per related-SKU group can be added more than once across segments. | Duplicate policies with scopes such as `parent_segment`, `project_sku`, and `related_sku_group` |
| GAP-7 | P1 | Replacement mappings must stay separate from expansion rules | the 11 historical-to-current replacements (for example `SC9300UK9-1712` -> `SC9300UK9-1715`, `S9300LUK9-1712` -> `S9300LUK9-1718`) | A replacement is a different decision from configuration expansion. Folding replacements into expansion approval risks an unapproved runtime SKU substitution. They must be modeled and approved as their own artifact. | A replacement mapping model separate from configuration expansion |
| GAP-8 | P2 | Versioned/current software SKUs need refresh/version scope | `SC9300UK9-1715`, `S9300LUK9-1718` (universal image SKUs with version-coded suffixes) | The `1715`/`1718` suffix encodes the exact software image observed in this CCW. Frozen into a rule it goes stale as Cisco refreshes the image, so the rule would emit an outdated image SKU. | Version/refresh scope for current software image SKUs instead of a frozen value |
| GAP-9 | P1 | CCW-only evidence must be scoped as quote-observed unless converted into reusable logic | the 45 child lines backed only by the current CCW estimate | A quantity or selection seen once in the Honeywell CCW is treated identically to reusable ordering-guide logic. Without an evidence scope, quote-observed values get promoted into universal rules. | Evidence scope classification: `quote_observed`, `reusable_logic`, `needs_more_evidence` |

## 5. Proposed Model Capabilities

These are future model capabilities. This report does not implement them; it only
names the shapes a later type-only extension should add.

- Related SKU quantity references, e.g. `same_as_related_sku_total`: a child line's
  quantity tracks the total quantity of a related SKU (such as a wireless license
  tracking the `CW9178I-CFG` access-point total).
- Selected option count quantities, e.g. power cable count = selected AC
  power-supply count: a quantity derived from how many of an option were selected.
- Option groups with a default selection and engineer-review alternatives, for
  secondary PSU, network modules, mounting accessories, SSD-none, and stack kits.
- Term option groups with a 3Y default and 5Y/7Y alternatives, decided at engineer
  review rather than frozen from the CCW.
- Duplicate policies with scopes such as `parent_segment`, `project_sku`, and
  `related_sku_group`, so de-duplication is not limited to a single parent segment.
- Evidence scope classification: `quote_observed`, `reusable_logic`, and
  `needs_more_evidence`, so a value seen once in a quote is not treated as reusable
  logic.
- A replacement mapping model separate from configuration expansion, so historical
  to current SKU mappings are reviewed and approved on their own.

## 6. Honeywell-Specific Examples

- Wireless license quantities should follow access-point quantity: `LIC-CW-A` and
  `LIC-SPACES-ADV` should derive from the `CW9178I-CFG` access-point count, not a
  frozen 12.
- `CAB-C15-CBN` should follow the selected AC power-supply count, not a frozen 2
  cords per switch, because the cord count depends on how many AC power supplies
  were selected.
- 3Y DNA/support defaults should be term option defaults (a 3Y default with 5Y/7Y
  alternatives at engineer review), not hardcoded as universal.
- CCW support SKUs (for example the `CON-*` support lines and `SVS-L0SPT-CN`) are
  strong Honeywell evidence, but they should not become universal defaults without
  an evidence scope (`quote_observed` vs `reusable_logic`) and human review.

## 7. Approval Impact

- Do not create the approved Honeywell runtime pack until these model gaps are addressed.
  An approved pack authored on the current model would freeze Honeywell quantities and
  selections into runtime behavior.
- The existing candidate pack
  (`data/config-expansion/honeywell-candidate-rules.json`) and the approval packet
  (`data/config-expansion/honeywell-rule-approval-packet.json` and
  `docs/config-expansion/HONEYWELL_RULE_APPROVAL_PACKET.md`) remain useful evidence
  and review artifacts. This report does not retract or modify them.
- The next implementation prompt should extend the type contract first
  (`src/lib/projects/config-expansion-types.ts`), without changing runtime
  evaluation (`src/lib/projects/config-expansion.ts`). The type-only extension adds
  the shapes; runtime support and an approved pack come later.

## 8. Recommended Next Prompts

- Prompt 49: type-only rule model extension. Add the new quantity, option, term,
  duplicate-scope, evidence-scope, and replacement shapes to the type contract
  only. No runtime evaluation change.
- Prompt 50: candidate/approval packet v2 modeling update. Re-express the Honeywell
  candidate rules and approval packet on the extended model (related-SKU
  quantities, option groups, term options, evidence scope), still candidate and
  unapproved.
- Prompt 51: runtime evaluator support for the new quantity/option/duplicate model.
  Extend `buildConfigurationExpansionDraft` to evaluate related-SKU quantities,
  selected-option quantities, option and term groups, and duplicate scopes.
- Prompt 52: approved Honeywell runtime pack from explicit decisions. After human
  per-item decisions, author the approved Honeywell runtime rule pack on the
  extended model.

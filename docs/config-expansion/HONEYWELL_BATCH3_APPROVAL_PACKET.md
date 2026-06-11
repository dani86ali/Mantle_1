# Honeywell Batch 3 Approval Packet (Non-Term Hardware / Accessories)

> WARNING: REVIEW-ONLY. This packet is NOT runtime authority and is NOT an
> approved rule pack. It approves nothing and activates nothing. Every entry
> stays pending_human_approval and recommendedDecision is advisory only. No
> approved Batch 3 runtime pack is created here, and no runtime evaluator,
> pricing, catalog, API, UI, DB, or export behavior is added. Configuration
> authority stays strictly separate from pricing authority; this packet carries
> no pricing fields.

## 1. Status

Review-only non-term hardware/accessory approval packet, derived mechanically
from the model-aware v2 candidate pack (honeywell-candidate-rules-v2, status
candidate). It is not runtime authority. Human approval happens after this
packet. Until a human/business reviewer records explicit decisions and a separate
later prompt authors an approved Batch 3 runtime pack as a new artifact, every
item here stays pending. The v2 candidate pack and v2 approval packet remain
candidate/pending, and the already-approved Batch 1 and Batch 2 packs are
unchanged.

## 2. Sequencing Note (Important)

This packet treats the current implementation prompt as the sequencing authority.
Here, Batch 3 is the set of non-term hardware/accessory child lines. This
intentionally differs from
docs/config-expansion/HONEYWELL_RULE_APPROVAL_BATCH_STRATEGY.md, which earlier
labelled Batch 3 as replacement candidates. That strategy document is unchanged
by this packet and is not edited here. Under this packet, replacement candidates
AND optics both remain deferred and are not approved; no silent runtime SKU
substitution is modeled. Deferred entries here carry the deferred_not_batch_3
flag for clarity.

## 3. Batch 1 and Batch 2 Already Approved (Unchanged)

Batch 1 is already approved as a separate runtime pack
(honeywell-batch1-approved-rules, scope Honeywell MVP / Batch 1) and covers only
deterministic model-safety decisions:

- wireless license quantity from the access-point total (LIC-CW-A, LIC-SPACES-ADV)
- power-cord quantity from the selected PSU count (CAB-C15-CBN)
- the project-level duplicate policy for the wireless licenses
- the C9300X/C9300L AC PSU option groups

Batch 2 is already approved as a separate runtime pack
(honeywell-batch2-approved-rules, scope Honeywell MVP / Batch 2) and covers the
term/support/software decisions:

- C9300X and C9300L term-coupled licenses/support at the 3Y (36-month) default
- the C9300X and C9300L included zero-price software/subscriptions
- the wireless support/subscription-support attach
- the phone support attach using the current CON-L1NBD-P7PK94P1

Both Batch 1 and Batch 2 are unchanged by this packet. This Batch 3 packet adds
no approval and does not modify either approved pack.

## 4. Batch 3 Scope

Batch 3 (per this packet's sequencing authority) is the non-term
hardware/accessory child-line review batch. It groups, for human review:

- the default-selected wireless mounting/bracket/single-pack accessories under
  CW9178I-CFG,
- the default-selected and bundled zero-price non-term hardware accessories under
  the C9300X-48HX-A and C9300L-24P-4X-A switches (stacking kit/module/cables,
  power/stack cables, SSD placeholders, fan modules, rack rubber feet/screws/cable
  guides, and the selected uplink network module).

Default-selected lines are advisory engineer-review options, not silently forced
universal defaults. Bundled zero-price hardware may be recommended for Honeywell
MVP review with quote-observed/CCW-only caveats. Where a line carries a
fixed_per_parent quantity multiplier (FAN-T2 at 3 per parent, C9300L-STACK-A at 2
per parent), the multiplier is flagged for engineer review.

## 5. Out Of Scope

- Optics (SFP-10G-LR-S=, SFP-10/25G-LR-S=) - remain deferred; not part of Batch 3.
- All replacement candidates (historical-to-current SKU mappings) - remain deferred; no silent runtime SKU substitution.
- Batch 1 deterministic model-safety lines - stay in the separate approved Batch 1 pack.
- Batch 2 term/support/software lines - stay in the separate approved Batch 2 pack.
- Broader Cisco generalization beyond Honeywell scope.
- Pricing, catalog, API, UI, DB, and export behavior - configuration authority only; no pricing fields.
- Any runtime evaluator behavior or an approved Batch 3 runtime pack - this packet is review-only.

## 6. Batch 3 Entries (18 non-term hardware/accessory lines)

The 18 Batch 3 approval entries, grouped by wireless accessories, C9300X non-term
hardware/accessories, and C9300L non-term hardware/accessories. Every entry stays
pending_human_approval; the Recommended column is advisory only.

### 6.1 Wireless non-term hardware accessories (CW9178I-CFG)

| SKU | Parent | Relationship | Quantity | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| AIR-AP-BRACKET-2 | CW9178I-CFG | default_selected | same_as_parent | reusable_logic | review_option_only | default_selected_requires_review |
| AIR-AP-T-RAIL-F | CW9178I-CFG | default_selected | same_as_parent | reusable_logic | review_option_only | default_selected_requires_review |
| CW9178-SINGLE | CW9178I-CFG | default_selected | same_as_parent | quote_observed | review_option_only | default_selected_requires_review, ccw_only_evidence |

### 6.2 Catalyst 9300X non-term hardware/accessories (C9300X-48HX-A)

| SKU | Parent | Relationship | Quantity | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| C9300-SSD-NONE | C9300X-48HX-A | default_selected | same_as_parent | quote_observed | review_option_only | default_selected_requires_review, ccw_only_evidence |
| STACK-T1-50CM | C9300X-48HX-A | default_selected | same_as_parent | reusable_logic | review_option_only | default_selected_requires_review |
| CAB-SPWR-30CM | C9300X-48HX-A | default_selected | same_as_parent | quote_observed | review_option_only | default_selected_requires_review, ccw_only_evidence |
| C9K-ACC-RBFT | C9300X-48HX-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |
| C9K-ACC-SCR-4 | C9300X-48HX-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |
| CAB-GUIDE-1RU | C9300X-48HX-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |
| C9300X-NM-8Y | C9300X-48HX-A | default_selected | same_as_parent | reusable_logic | review_option_only | default_selected_requires_review |

### 6.3 Catalyst 9300L non-term hardware/accessories (C9300L-24P-4X-A)

| SKU | Parent | Relationship | Quantity | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| FAN-T2 | C9300L-24P-4X-A | included_zero_price | fixed_per_parent x3 | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, fixed_per_parent_multiplier_requires_review, ccw_only_evidence |
| C9300L-SSD-NONE | C9300L-24P-4X-A | default_selected | same_as_parent | quote_observed | review_option_only | default_selected_requires_review, ccw_only_evidence |
| C9K-ACC-RBFT | C9300L-24P-4X-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |
| C9K-ACC-SCR-4 | C9300L-24P-4X-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |
| CAB-GUIDE-1RU | C9300L-24P-4X-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |
| C9300L-STACK-KIT2 | C9300L-24P-4X-A | default_selected | same_as_parent | reusable_logic | review_option_only | default_selected_requires_review |
| C9300L-STACK-A | C9300L-24P-4X-A | included_zero_price | fixed_per_parent x2 | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, fixed_per_parent_multiplier_requires_review, ccw_only_evidence |
| STACK-T3A-50CM | C9300L-24P-4X-A | included_zero_price | same_as_parent | quote_observed | approve_for_honeywell_mvp | included_zero_price_hardware, ccw_only_evidence |

Recommendation split: the 9 default_selected lines are recommended review_option_only
(advisory engineer-review options, never silently forced universal defaults); the 9
included_zero_price hardware lines may be recommended approve_for_honeywell_mvp for
review, each carrying the ccw_only_evidence (quote-observed/CCW-only) caveat.

## 7. Explicitly Deferred From Batch 3

These items are intentionally NOT approved in Batch 3. They are listed for audit
completeness only. None is an approval entry; each stays pending_human_approval
with a defer recommendation. No silent runtime SKU substitution is modeled.

### 7.1 Optics

| SKU | Type | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- |
| SFP-10G-LR-S= | standalone | quote_observed | defer_needs_more_evidence | deferred_not_batch_3, catalog_existence_only, ccw_only_evidence |
| SFP-10/25G-LR-S= | standalone | quote_observed | defer_needs_more_evidence | deferred_not_batch_3, catalog_existence_only, ccw_only_evidence |

### 7.2 Replacement candidates

| Historical SKU | Current SKU(s) | Recommended | Risk flags |
| --- | --- | --- | --- |
| C9300-DNX-A-48-3Y | C9300-DNA-A-48-3Y | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| C9300L-DNX-A-24-3Y | C9300L-DNA-A-24-3Y | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| SC9300UK9-1712 | SC9300UK9-1715 | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| S9300LUK9-1712 | S9300LUK9-1718 | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| SPACES-EXT-S | D-DNAS-EXT-S-T, D-DNAS-EXT-S-3Y | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| CON-L1NBX-C9300XY4 | CON-L1NCD-C9300XY4 | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| CON-L1SWX-93XA48MY | CON-L1SWT-C93A48 | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| CON-L1NBX-C93024PX | CON-L1NCD-C93024PX | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| CON-L1SWX-3LXA24MY | CON-L1SWT-C93LA24 | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| CON-SNT-P7PK94P1 | CON-L1NBD-P7PK94P1 | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |
| C9300L-STACK-BLANK | C9300L-STACK-KIT2, C9300L-STACK-A, STACK-T3A-50CM | defer_needs_more_evidence | deferred_not_batch_3, historical_sku_mismatch |

Optics and replacement candidates remain deferred. This packet approves no optic
and no replacement, and it models no silent SKU substitution.

## 8. Questions for Human Approval

These are the exact approval decisions a human reviewer must record before an
approved Batch 3 runtime pack can be authored:

1. Approve the wireless non-term accessories (AIR-AP-BRACKET-2, AIR-AP-T-RAIL-F, CW9178-SINGLE) under CW9178I-CFG as advisory engineer-review options (not forced universal defaults) for Honeywell MVP?
2. Approve the C9300X-48HX-A bundled zero-price rack hardware (C9K-ACC-RBFT, C9K-ACC-SCR-4, CAB-GUIDE-1RU) for Honeywell MVP review?
3. Approve the C9300X-48HX-A default-selected hardware options (C9300-SSD-NONE, STACK-T1-50CM, CAB-SPWR-30CM, C9300X-NM-8Y) as advisory engineer-review options for Honeywell MVP?
4. Approve the C9300L-24P-4X-A bundled zero-price rack/stacking hardware (FAN-T2 at 3 per parent, C9K-ACC-RBFT, C9K-ACC-SCR-4, CAB-GUIDE-1RU, C9300L-STACK-A at 2 per parent, STACK-T3A-50CM) for Honeywell MVP review?
5. Approve the C9300L-24P-4X-A default-selected hardware options (C9300L-SSD-NONE, C9300L-STACK-KIT2) as advisory engineer-review options for Honeywell MVP?
6. Confirm the FAN-T2 (3 per parent) and C9300L-STACK-A (2 per parent) fixed_per_parent quantity multipliers at engineer review before any MVP runtime pack uses them?
7. Confirm that the optics (SFP-10G-LR-S=, SFP-10/25G-LR-S=) and all 11 replacement candidates remain DEFERRED and are NOT part of Batch 3, with no silent runtime SKU substitution?
8. Confirm that Batch 3 approval, once recorded, is authored as a separate later runtime pack artifact, flips no candidate status, and does not modify the approved Batch 1 or Batch 2 packs?

## 9. Batch 3 Approval Boundary

Batch 3 approval, once recorded, still does NOT approve optics or replacement
candidates, and authorizes no silent runtime SKU substitution. Optics and
replacements remain separate deferred decisions. An approved Batch 3 runtime pack,
if any, is authored by a separate later prompt as a new artifact; this packet
flips no candidate status and approves nothing. No pricing, catalog, API, UI, DB,
export, or runtime behavior is added by this packet.

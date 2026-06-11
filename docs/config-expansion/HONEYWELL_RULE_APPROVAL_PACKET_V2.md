# Honeywell Configuration Rule Approval Packet v2

> WARNING: This document and its companion JSON (data/config-expansion/honeywell-rule-approval-packet-v2.json) are a model-aware human review packet only. This packet is not runtime authority and it is not an approved rule pack. No rule, child line, replacement, option group, or term group described here is active, approved, or runtime-enabled. Nothing here becomes active until a human/business reviewer records explicit decisions and a separate later prompt builds an approved runtime rule pack from those decisions. Status: all decisions pending.

## 1. What This Packet Is

This v2 packet is derived mechanically from the model-aware candidate pack honeywell-candidate-rules-v2 (version 0.2.0-candidate, status candidate), which is itself derived from the v1 candidate pack honeywell-candidate-rules (0.1.0-candidate). Both candidate packs stay candidate-only and inert: the deterministic expansion builder only evaluates an approved pack, and the advanced model fields are type-contract-only (no runtime evaluator reads them yet). This packet lays out each candidate item for human review so a later prompt can author a SEPARATE approved runtime rule pack from explicit decisions. It approves nothing and changes no runtime behavior. Configuration authority (what to add, default, or offer) is kept strictly separate from pricing authority (the catalog/price source resolved at runtime); this packet carries no pricing fields.

## 2. What Changed From v1

- Fixed Honeywell quote quantities are now represented as quote-observed compatibility data where needed, not as reusable logic. The legacy quantityRule/quantityValue fields are retained only as quote-observed evidence.
- Wireless license quantities (LIC-CW-A, LIC-SPACES-ADV) are modeled as the related access-point quantity via quantityModel same_as_related_sku_total tracking the CW9178I-CFG total, instead of a frozen quantity 12.
- Power cable quantities (CAB-C15-CBN) are modeled as the selected AC PSU count via quantityModel selected_option_count, not a frozen 2 cords per switch.
- Term defaults are modeled as a 3Y default with 5Y/7Y review alternatives via term option groups (defaultTermMonths 36, allowedTermMonths 36/60/84), without inventing any 5Y/7Y SKUs; 5Y/7Y alternatives require Cisco SKU evidence first.
- Historical-to-current replacements are kept as separate replacementCandidates, distinct from the expansion rules, and authorize no silent runtime substitution.

## 3. Summary Counts

| Count | Value |
| --- | --- |
| Parent rules | 7 |
| Child lines | 53 |
| Standalone parents | 2 |
| Replacement candidates | 11 |
| Option groups | 2 |
| Term option groups | 8 |
| Total pending decisions | 71 |

Total pending decisions = parent rules + child lines + replacement candidates (7 + 53 + 11 = 71). Option groups and term option groups are modeling tables that carry engineerReviewRequired and are reviewed alongside the lines that reference them. Every decision is pending.

## 4. Modeling Blockers Resolved In v2

- LIC-CW-A: quantity is now same_as_related_sku_total against the CW9178I-CFG access-point total (scope project). The legacy fixed 12 is marked quote-observed and is not reusable logic. A project_sku duplicatePolicy prevents per-segment double counting.
- LIC-SPACES-ADV: same related-SKU quantity model and project_sku duplicatePolicy as LIC-CW-A; the legacy fixed 12 is quote-observed only.
- CAB-C15-CBN: quantity is now selected_option_count against the AC power-supply option group; the legacy fixed_per_parent multiplier 2 is quote-observed only and follows the selected AC PSU count instead.
- Duplicate policy: per-project subscription de-duplication is modeled with duplicatePolicy scope project_sku, so it is no longer only parent-segment local. Per-switch subscription/support lines (for example NETWORK-PNP-LIC, TE-C9K-SW) are legitimately same_as_parent and are flagged for human duplicate-policy review rather than auto-deduplicated.
- Term option groups: 3Y subscription/support defaults are modeled as term option groups with a 3Y default and 5Y/7Y review alternatives. No 5Y/7Y SKU is invented; the option lists contain only the existing 3Y SKUs.
- Replacement separation: the 11 historical-to-current mappings are modeled as separate replacementCandidates with their own approval gate; they authorize no silent runtime substitution.

## 5. Parent-By-Parent Review

Each parent below lists its evidenceScope, then a table of its child lines with the legacy quantityRule, the advanced quantityModel and duplicatePolicy summaries, the evidenceScope, and risk/model notes. Every decision shown is pending.

### 5.1 CW9178I-CFG - Cisco Wireless 9178I(W7,4 radio,3 band 4x4,UWB), Global

- ruleId: honeywell-cw9178i-cfg
- parent evidenceScope: reusable_logic
- parent decision: pending

| child SKU | relationshipType | legacy quantityRule | quantityModel | duplicatePolicy | evidenceScope | risk/model notes | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-ROB-CW9178IC | service_or_support | same_as_parent | - | - | quote_observed | - | pending |
| AIR-AP-BRACKET-2 | default_selected | same_as_parent | - | - | reusable_logic | - | pending |
| AIR-AP-T-RAIL-F | default_selected | same_as_parent | - | - | reusable_logic | - | pending |
| CW9178-SINGLE | default_selected | same_as_parent | - | - | quote_observed | - | pending |

### 5.2 CISCO-NETWORK-SUB - Cisco Networking Subscription

- ruleId: honeywell-cisco-network-sub
- parent evidenceScope: reusable_logic
- parent decision: pending

| child SKU | relationshipType | legacy quantityRule | quantityModel | duplicatePolicy | evidenceScope | risk/model notes | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LIC-CW-A | subscription | fixed (12) | same_as_related_sku_total(CW9178I-CFG, project) | project_sku/sku/existing_satisfies_required | reusable_logic | license qty follows CW9178I-CFG AP total; legacy fixed 12 is quote-observed, not reusable | pending |
| LIC-SPACES-ADV | subscription | fixed (12) | same_as_related_sku_total(CW9178I-CFG, project) | project_sku/sku/existing_satisfies_required | reusable_logic | license qty follows CW9178I-CFG AP total; legacy fixed 12 is quote-observed, not reusable | pending |
| SVS-L0SPT-CN | service_or_support | same_as_parent | - | - | reusable_logic | - | pending |

### 5.3 C9300X-48HX-A - Catalyst 9300 48-port mGig UPoE+, Network Advantage

- ruleId: honeywell-c9300x-48hx-a
- parent evidenceScope: reusable_logic
- parent decision: pending

| child SKU | relationshipType | legacy quantityRule | quantityModel | duplicatePolicy | evidenceScope | risk/model notes | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-L1NCD-C9300XY4 | service_or_support | same_as_parent | - | - | quote_observed | - | pending |
| C9300-DNA-A-48 | subscription | same_as_parent | - | - | quote_observed | - | pending |
| CON-L1SWT-C93A48 | service_or_support | same_as_parent | - | - | quote_observed | - | pending |
| C9300-DNA-A-48-3Y | subscription | same_as_parent | - | - | quote_observed | - | pending |
| TE-EMBEDDED-T | subscription | same_as_parent | - | - | quote_observed | - | pending |
| TE-EMBEDDED-T-3Y | subscription | same_as_parent | - | - | quote_observed | - | pending |
| D-DNAS-EXT-S-T | subscription | same_as_parent | - | - | quote_observed | - | pending |
| D-DNAS-EXT-S-3Y | subscription | same_as_parent | - | - | quote_observed | - | pending |
| C9300-NW-A-48 | subscription | same_as_parent | - | - | quote_observed | - | pending |
| SC9300UK9-1715 | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| TE-C9K-SW | subscription | same_as_parent | - | - | quote_observed | - | pending |
| PWR-C1-1100WAC-P | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| PWR-C1-1100WAC-P/2 | default_selected | same_as_parent | - | - | quote_observed | - | pending |
| C9300-SSD-NONE | default_selected | same_as_parent | - | - | quote_observed | - | pending |
| STACK-T1-50CM | default_selected | same_as_parent | - | - | reusable_logic | - | pending |
| CAB-SPWR-30CM | default_selected | same_as_parent | - | - | quote_observed | - | pending |
| C9K-ACC-RBFT | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| C9K-ACC-SCR-4 | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| CAB-GUIDE-1RU | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| C9300X-NM-8Y | default_selected | same_as_parent | - | - | reusable_logic | - | pending |
| NETWORK-PNP-LIC | subscription | same_as_parent | - | - | quote_observed | - | pending |
| CAB-C15-CBN | default_selected | fixed_per_parent (2) | selected_option_count(c9300x-ac-power-supplies) | - | needs_more_evidence | cord qty follows selected AC PSU count; legacy x2 per switch is quote-observed | pending |

### 5.4 C9300L-24P-4X-A - Catalyst 9300L 24p PoE, Network Advantage ,4x10G Uplink

- ruleId: honeywell-c9300l-24p-4x-a
- parent evidenceScope: reusable_logic
- parent decision: pending

| child SKU | relationshipType | legacy quantityRule | quantityModel | duplicatePolicy | evidenceScope | risk/model notes | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-L1NCD-C93024PX | service_or_support | same_as_parent | - | - | quote_observed | - | pending |
| C9300L-DNA-A-24 | subscription | same_as_parent | - | - | quote_observed | - | pending |
| CON-L1SWT-C93LA24 | service_or_support | same_as_parent | - | - | quote_observed | - | pending |
| C9300L-DNA-A-24-3Y | subscription | same_as_parent | - | - | quote_observed | - | pending |
| TE-EMBEDDED-T | subscription | same_as_parent | - | - | quote_observed | - | pending |
| TE-EMBEDDED-T-3Y | subscription | same_as_parent | - | - | quote_observed | - | pending |
| D-DNAS-EXT-S-T | subscription | same_as_parent | - | - | quote_observed | - | pending |
| D-DNAS-EXT-S-3Y | subscription | same_as_parent | - | - | quote_observed | - | pending |
| S9300LUK9-1718 | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| C9300L-NW-A-24 | subscription | same_as_parent | - | - | quote_observed | - | pending |
| TE-C9K-SW | subscription | same_as_parent | - | - | quote_observed | - | pending |
| FAN-T2 | included_zero_price | fixed_per_parent (3) | - | - | quote_observed | - | pending |
| PWR-C1-715WAC-P | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| PWR-C1-715WAC-P/2 | default_selected | same_as_parent | - | - | quote_observed | - | pending |
| CAB-C15-CBN | default_selected | fixed_per_parent (2) | selected_option_count(c9300l-ac-power-supplies) | - | needs_more_evidence | cord qty follows selected AC PSU count; legacy x2 per switch is quote-observed | pending |
| C9300L-SSD-NONE | default_selected | same_as_parent | - | - | quote_observed | - | pending |
| C9K-ACC-RBFT | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| C9K-ACC-SCR-4 | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| CAB-GUIDE-1RU | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| C9300L-STACK-KIT2 | default_selected | same_as_parent | - | - | reusable_logic | - | pending |
| C9300L-STACK-A | included_zero_price | fixed_per_parent (2) | - | - | quote_observed | - | pending |
| STACK-T3A-50CM | included_zero_price | same_as_parent | - | - | quote_observed | - | pending |
| NETWORK-PNP-LIC | subscription | same_as_parent | - | - | quote_observed | - | pending |

### 5.5 SFP-10G-LR-S= - 10GBASE-LR SFP Module, Enterprise-Class

- ruleId: honeywell-sfp-10g-lr-s
- parent evidenceScope: quote_observed
- parent decision: pending

No child lines (standalone parent).

### 5.6 SFP-10/25G-LR-S= - 10/25GBASE-LR SFP28 Module

- ruleId: honeywell-sfp-10-25g-lr-s
- parent evidenceScope: quote_observed
- parent decision: pending

No child lines (standalone parent).

### 5.7 CP-7841-K9= - Cisco IP Phone 7841

- ruleId: honeywell-cp-7841-k9
- parent evidenceScope: reusable_logic
- parent decision: pending

| child SKU | relationshipType | legacy quantityRule | quantityModel | duplicatePolicy | evidenceScope | risk/model notes | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-L1NBD-P7PK94P1 | service_or_support | same_as_parent | - | - | quote_observed | - | pending |

## 6. Replacement Candidates

Each historical-to-current mapping below is a candidate only and is reviewed separately from configuration expansion. None performs a runtime substitution until approved in a separate runtime rule pack. Every decision shown is pending.

| historical SKU | current SKU(s) | evidenceScope | decision |
| --- | --- | --- | --- |
| C9300-DNX-A-48-3Y | C9300-DNA-A-48-3Y | quote_observed | pending |
| C9300L-DNX-A-24-3Y | C9300L-DNA-A-24-3Y | quote_observed | pending |
| SC9300UK9-1712 | SC9300UK9-1715 | quote_observed | pending |
| S9300LUK9-1712 | S9300LUK9-1718 | quote_observed | pending |
| SPACES-EXT-S | D-DNAS-EXT-S-T, D-DNAS-EXT-S-3Y | quote_observed | pending |
| CON-L1NBX-C9300XY4 | CON-L1NCD-C9300XY4 | quote_observed | pending |
| CON-L1SWX-93XA48MY | CON-L1SWT-C93A48 | quote_observed | pending |
| CON-L1NBX-C93024PX | CON-L1NCD-C93024PX | quote_observed | pending |
| CON-L1SWX-3LXA24MY | CON-L1SWT-C93LA24 | quote_observed | pending |
| CON-SNT-P7PK94P1 | CON-L1NBD-P7PK94P1 | quote_observed | pending |
| C9300L-STACK-BLANK | C9300L-STACK-KIT2, C9300L-STACK-A, STACK-T3A-50CM | quote_observed | pending |

## 7. Still Not Ready For Runtime Until...

This packet is not runtime authority and does not make the v2 candidate pack usable at runtime. Before any approved Honeywell runtime rule pack can be authored, all of the following must happen, and until then all decisions pending remains the state of every item here:

1. A human/business reviewer records explicit per-item decisions (approve_for_honeywell_mvp, defer, reject, or needs_more_evidence) for every parent rule, child line, and replacement candidate. No decision is implied by a parent decision.
2. The advanced model fields (quantityModel, duplicatePolicy, optionGroups, termOptionGroups, evidenceScope, replacementCandidates) gain runtime evaluator support; today the deterministic builder evaluates only the v1 quantityRule union and ignores these fields.
3. The 5Y/7Y term alternatives are backed by real Cisco SKU evidence before any 5Y/7Y SKU is added; no 5Y/7Y SKU is invented in this packet.
4. A separate later prompt authors an approved runtime rule pack as a NEW artifact from those explicit decisions. This packet and both candidate packs stay unchanged and remain not runtime authority.

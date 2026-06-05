# Honeywell Batch 2 Approval Packet (Term / Support / Software)

> WARNING: REVIEW-ONLY. This packet is NOT runtime authority and is NOT an
> approved rule pack. It approves nothing and activates nothing. Every entry
> stays pending_human_approval and recommendedDecision is advisory only. No
> approved Batch 2 runtime pack is created here, and no runtime evaluator,
> pricing, catalog, API, UI, DB, or export behavior is added. Configuration
> authority stays strictly separate from pricing authority; this packet carries
> no pricing fields.

## 1. Status

Review-only term/support/software approval packet, derived mechanically from the
model-aware v2 candidate pack (honeywell-candidate-rules-v2, status candidate).
It is not runtime authority. Human approval happens after this packet. Until a
human/business reviewer records explicit decisions and a separate later prompt
authors an approved Batch 2 runtime pack as a new artifact, every item here stays
pending. The v2 candidate pack and v2 approval packet remain candidate/pending and
the Batch 1 approved pack is unchanged.

## 2. Batch 1 Already Approved

Batch 1 is already approved as a separate runtime pack
(honeywell-batch1-approved-rules, scope Honeywell MVP / Batch 1) and covers only
deterministic model-safety decisions:

- wireless license quantity from the access-point total (LIC-CW-A, LIC-SPACES-ADV)
- power-cord quantity from the selected PSU count (CAB-C15-CBN)
- the project-level duplicate policy for the wireless licenses
- the C9300X/C9300L AC PSU option groups

Batch 1 is unchanged by this packet.

## 3. Batch 2 Scope

Batch 2 is the higher-risk term/support/software review batch. It groups, for
human review, the software subscriptions, support/service attach, included
zero-price software, and term-coupled licenses (3Y default with 5Y/7Y
engineer-review alternatives) for the C9300X and C9300L switches, the wireless
support/subscription-support lines, and the phone support line.

## 4. Out Of Scope

- Batch 3 replacement candidates (historical-to-current SKU mappings) - reviewed separately; no silent runtime substitution.
- Batch 4 broader Cisco generalization beyond Honeywell scope.
- Invented 5Y/7Y term SKUs - none are created; 5Y/7Y remain engineer-review alternatives only until backed by Cisco SKU evidence.
- Optics and non-term hardware accessories outside the Batch 1 and Batch 2 scope.
- Pricing, catalog, API, UI, DB, and export behavior - configuration authority only; no pricing fields.
- Any runtime evaluator behavior or an approved Batch 2 runtime pack - this packet is review-only.

## 5. Catalyst 9300X Software / Support / Term Bundle

| SKU | Parent | Relationship | Term | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| CON-L1NCD-C9300XY4 | C9300X-48HX-A | service_or_support | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | support_service_attach, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| C9300-DNA-A-48 | C9300X-48HX-A | subscription | - | quote_observed | review_option_only | software_subscription, ccw_only_evidence |
| CON-L1SWT-C93A48 | C9300X-48HX-A | service_or_support | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | support_service_attach, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| C9300-DNA-A-48-3Y | C9300X-48HX-A | subscription | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | software_subscription, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| TE-EMBEDDED-T | C9300X-48HX-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| TE-EMBEDDED-T-3Y | C9300X-48HX-A | subscription | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | software_subscription, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| D-DNAS-EXT-S-T | C9300X-48HX-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| D-DNAS-EXT-S-3Y | C9300X-48HX-A | subscription | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | software_subscription, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| C9300-NW-A-48 | C9300X-48HX-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| SC9300UK9-1715 | C9300X-48HX-A | included_zero_price | - | quote_observed | approve_for_honeywell_mvp | included_zero_price_software, ccw_only_evidence |
| TE-C9K-SW | C9300X-48HX-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| NETWORK-PNP-LIC | C9300X-48HX-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |

## 6. Catalyst 9300L Software / Support / Term Bundle

| SKU | Parent | Relationship | Term | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| CON-L1NCD-C93024PX | C9300L-24P-4X-A | service_or_support | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | support_service_attach, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| C9300L-DNA-A-24 | C9300L-24P-4X-A | subscription | - | quote_observed | review_option_only | software_subscription, ccw_only_evidence |
| CON-L1SWT-C93LA24 | C9300L-24P-4X-A | service_or_support | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | support_service_attach, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| C9300L-DNA-A-24-3Y | C9300L-24P-4X-A | subscription | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | software_subscription, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| TE-EMBEDDED-T | C9300L-24P-4X-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| TE-EMBEDDED-T-3Y | C9300L-24P-4X-A | subscription | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | software_subscription, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| D-DNAS-EXT-S-T | C9300L-24P-4X-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| D-DNAS-EXT-S-3Y | C9300L-24P-4X-A | subscription | 3Y default (36; 5Y/7Y=60/84 review) | quote_observed | review_option_only | software_subscription, term_coupled, term_default_36_months, term_alternatives_60_84_months, ccw_only_evidence |
| S9300LUK9-1718 | C9300L-24P-4X-A | included_zero_price | - | quote_observed | approve_for_honeywell_mvp | included_zero_price_software, ccw_only_evidence |
| C9300L-NW-A-24 | C9300L-24P-4X-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| TE-C9K-SW | C9300L-24P-4X-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |
| NETWORK-PNP-LIC | C9300L-24P-4X-A | subscription | - | quote_observed | approve_for_honeywell_mvp | software_subscription, included_zero_price_software, ccw_only_evidence |

## 7. Wireless Support / Subscription Support

| SKU | Parent | Relationship | Term | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| CON-ROB-CW9178IC | CW9178I-CFG | service_or_support | 12mo | quote_observed | review_option_only | support_service_attach, term_coupled, ccw_only_evidence |
| SVS-L0SPT-CN | CISCO-NETWORK-SUB | service_or_support | - | reusable_logic | review_option_only | support_service_attach |

## 8. Phone Support

| SKU | Parent | Relationship | Term | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- | --- |
| CON-L1NBD-P7PK94P1 | CP-7841-K9= | service_or_support | 12mo | quote_observed | review_option_only | support_service_attach, term_coupled, ccw_only_evidence, historical_sku_mismatch |

Historical SKU note: the current CCW uses CON-L1NBD-P7PK94P1. The older historical
CON-SNT-P7PK94P1 appears only in prior/historical evidence and is handled as a
separate Batch 3 replacement candidate (see Section 9.1), not approved here.

## 9. Explicitly Deferred From Batch 2

These items are intentionally NOT approved in Batch 2. They are listed for audit
completeness; broader Cisco generalization is recorded under Out Of Scope above.

### 9.1 Replacement candidates

| Historical SKU | Current SKU(s) | Recommended | Risk flags |
| --- | --- | --- | --- |
| C9300-DNX-A-48-3Y | C9300-DNA-A-48-3Y | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| C9300L-DNX-A-24-3Y | C9300L-DNA-A-24-3Y | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| SC9300UK9-1712 | SC9300UK9-1715 | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| S9300LUK9-1712 | S9300LUK9-1718 | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| SPACES-EXT-S | D-DNAS-EXT-S-T, D-DNAS-EXT-S-3Y | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| CON-L1NBX-C9300XY4 | CON-L1NCD-C9300XY4 | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| CON-L1SWX-93XA48MY | CON-L1SWT-C93A48 | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| CON-L1NBX-C93024PX | CON-L1NCD-C93024PX | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| CON-L1SWX-3LXA24MY | CON-L1SWT-C93LA24 | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| CON-SNT-P7PK94P1 | CON-L1NBD-P7PK94P1 | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |
| C9300L-STACK-BLANK | C9300L-STACK-KIT2, C9300L-STACK-A, STACK-T3A-50CM | defer_needs_more_evidence | deferred_not_batch_2, historical_sku_mismatch |

### 9.2 Optics

| SKU | Type | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- |
| SFP-10G-LR-S= | standalone | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, catalog_existence_only, ccw_only_evidence |
| SFP-10/25G-LR-S= | standalone | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, catalog_existence_only, ccw_only_evidence |

### 9.3 Non-term hardware accessories outside Batch 1

| SKU | Parent | Relationship | Evidence scope | Recommended | Risk flags |
| --- | --- | --- | --- | --- | --- |
| AIR-AP-BRACKET-2 | CW9178I-CFG | default_selected | reusable_logic | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review |
| AIR-AP-T-RAIL-F | CW9178I-CFG | default_selected | reusable_logic | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review |
| CW9178-SINGLE | CW9178I-CFG | default_selected | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review, ccw_only_evidence |
| C9300-SSD-NONE | C9300X-48HX-A | default_selected | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review, ccw_only_evidence |
| STACK-T1-50CM | C9300X-48HX-A | default_selected | reusable_logic | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review |
| CAB-SPWR-30CM | C9300X-48HX-A | default_selected | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review, ccw_only_evidence |
| C9K-ACC-RBFT | C9300X-48HX-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| C9K-ACC-SCR-4 | C9300X-48HX-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| CAB-GUIDE-1RU | C9300X-48HX-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| C9300X-NM-8Y | C9300X-48HX-A | default_selected | reusable_logic | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review |
| FAN-T2 | C9300L-24P-4X-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| C9300L-SSD-NONE | C9300L-24P-4X-A | default_selected | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review, ccw_only_evidence |
| C9K-ACC-RBFT | C9300L-24P-4X-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| C9K-ACC-SCR-4 | C9300L-24P-4X-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| CAB-GUIDE-1RU | C9300L-24P-4X-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| C9300L-STACK-KIT2 | C9300L-24P-4X-A | default_selected | reusable_logic | defer_needs_more_evidence | deferred_not_batch_2, default_selected_requires_review |
| C9300L-STACK-A | C9300L-24P-4X-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |
| STACK-T3A-50CM | C9300L-24P-4X-A | included_zero_price | quote_observed | defer_needs_more_evidence | deferred_not_batch_2, ccw_only_evidence |

## 10. Questions for Human Approval

These are the exact approval decisions a human reviewer must record before an
approved Batch 2 runtime pack can be authored:

1. Approve the C9300X included zero-price software/subscriptions bundled with C9300X-48HX-A (C9300-NW-A-48, SC9300UK9-1715, TE-EMBEDDED-T, D-DNAS-EXT-S-T, TE-C9K-SW, NETWORK-PNP-LIC) for Honeywell MVP?
2. Approve the C9300X term-coupled licenses/support at the 3Y default (C9300-DNA-A-48, C9300-DNA-A-48-3Y, TE-EMBEDDED-T-3Y, D-DNAS-EXT-S-3Y, CON-L1NCD-C9300XY4, CON-L1SWT-C93A48), with 5Y/7Y as engineer-review-only alternatives and no 5Y/7Y SKU invented?
3. Approve the C9300L included zero-price software/subscriptions bundled with C9300L-24P-4X-A (C9300L-NW-A-24, S9300LUK9-1718, TE-EMBEDDED-T, D-DNAS-EXT-S-T, TE-C9K-SW, NETWORK-PNP-LIC) for Honeywell MVP?
4. Approve the C9300L term-coupled licenses/support at the 3Y default (C9300L-DNA-A-24, C9300L-DNA-A-24-3Y, TE-EMBEDDED-T-3Y, D-DNAS-EXT-S-3Y, CON-L1NCD-C93024PX, CON-L1SWT-C93LA24), with 5Y/7Y as engineer-review-only alternatives and no 5Y/7Y SKU invented?
5. Approve the wireless support/subscription-support attach (CON-ROB-CW9178IC under CW9178I-CFG, SVS-L0SPT-CN under CISCO-NETWORK-SUB) for Honeywell MVP?
6. Approve the phone support attach (CON-L1NBD-P7PK94P1 under CP-7841-K9=) for Honeywell MVP, and confirm the current CON-L1NBD-P7PK94P1 SKU rather than the historical CON-SNT-P7PK94P1?
7. Confirm that replacement candidates, optics, non-term hardware accessories, and broader Cisco generalization remain DEFERRED and are NOT part of Batch 2?
8. Confirm that Batch 2 approval, once recorded, still does NOT approve replacement candidates or broader Cisco generalization, and that a separate later prompt authors any approved Batch 2 runtime pack as a new artifact?

## 11. Batch 2 Approval Boundary

Batch 2 approval, once recorded, still does NOT approve replacements or broader
Cisco generalization. Replacement candidates remain a separate Batch 3 decision
(no silent runtime SKU substitution), and broader Cisco generalization remains a
separate Batch 4 decision. An approved Batch 2 runtime pack, if any, is authored
by a separate later prompt as a new artifact; this packet flips no candidate
status and approves nothing.

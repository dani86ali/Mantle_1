# Honeywell Configuration Rule Approval Packet

> WARNING: This document and its companion JSON (data/config-expansion/honeywell-rule-approval-packet.json) are a human review packet only. This packet is not runtime authority. No rule, child line, or replacement described here is active, approved, or runtime-enabled. Nothing here becomes active until a human/business reviewer records explicit decisions and a separate later prompt builds an approved runtime rule pack from those decisions. Every decision in this packet is pending.

## 1. What This Packet Is

- Candidate pack vs approved runtime pack: the source pack (honeywell-candidate-rules, version 0.1.0-candidate, status candidate) is a CANDIDATE. A candidate pack is inert: the deterministic expansion builder (src/lib/projects/config-expansion.ts) rejects any pack that is not status approved with every parent and child rule approved. This packet does not change that. It only lays out each candidate item for human review so that a later prompt can author a SEPARATE approved runtime rule pack from explicit decisions. This packet never makes a rule active.
- Why human/business approval is required: configuration expansion adds services, subscriptions, default accessories, and included components to a customer BoM. Those additions are commercial and engineering commitments. They may only be activated by human/business authorization, not by AI and not by a status flip. Each parent rule, child line, and replacement requires an explicit human decision.
- Pricing authority vs configuration authority: configuration authority is WHAT to add, default, or offer, and comes from approved rule packs. Pricing authority is the catalog/price source resolved deterministically at runtime. They are kept strictly separate. This packet carries configuration review data only and contains no pricing fields of any kind.

## 2. Summary Counts

| Count | Value |
| --- | --- |
| Parent rules | 7 |
| Child lines | 53 |
| Standalone parent rules | 2 |
| Replacement reviews | 11 |
| Total pending decisions | 71 |

Total pending decisions = parent rules + child lines + replacement reviews (7 + 53 + 11 = 71). Every one of these decisions is currently pending.

## 3. Decision Vocabulary

| Decision | Meaning |
| --- | --- |
| pending | No human decision recorded yet. The only state present in this packet. |
| approve_for_honeywell_mvp | Reviewer approves this item for inclusion when a separate approved Honeywell MVP runtime rule pack is later authored. Recording it here does not activate it. |
| defer | Reviewer postpones this item: neither approved nor rejected for now. |
| reject | Reviewer rejects this item: it must not enter an approved runtime rule pack. |
| needs_more_evidence | Reviewer requires additional authoritative evidence before deciding. |

## 4. High-Risk Review Notes

These notes flag assumptions a human reviewer must examine. They are review prompts only and do not approve or reject anything.

- Fixed AP subscription quantity assumptions: 2 child line(s) carry a fixed quantity copied from this CCW rather than a per-parent multiplier. In the current CCW the wireless subscription quantities equal the deployed access-point count (12); generalizing that quantity to other deployments requires human approval. Items: LIC-CW-A (CISCO-NETWORK-SUB), LIC-SPACES-ADV (CISCO-NETWORK-SUB).
- Fixed-per-parent accessory assumptions: 4 child line(s) use a per-parent multiplier (for example power cords, fan modules, or stack modules per switch). The multiplier observed in this CCW requires human confirmation. Items: CAB-C15-CBN (C9300X-48HX-A), FAN-T2 (C9300L-24P-4X-A), CAB-C15-CBN (C9300L-24P-4X-A), C9300L-STACK-A (C9300L-24P-4X-A).
- Support/service term assumptions: 7 child line(s) are service/support items with a term in months taken from this CCW. Term length and whether the support line is required are human-review decisions. Items: CON-ROB-CW9178IC (CW9178I-CFG), SVS-L0SPT-CN (CISCO-NETWORK-SUB), CON-L1NCD-C9300XY4 (C9300X-48HX-A), CON-L1SWT-C93A48 (C9300X-48HX-A), CON-L1NCD-C93024PX (C9300L-24P-4X-A), CON-L1SWT-C93LA24 (C9300L-24P-4X-A), CON-L1NBD-P7PK94P1 (CP-7841-K9=).
- Secondary power supply and default accessory assumptions: 13 child line(s) were default-selected in this CCW (including secondary/redundant power supplies and configurator default accessories). Redundancy and default-accessory inclusion are engineer-review decisions. Items: AIR-AP-BRACKET-2 (CW9178I-CFG), AIR-AP-T-RAIL-F (CW9178I-CFG), CW9178-SINGLE (CW9178I-CFG), PWR-C1-1100WAC-P/2 (C9300X-48HX-A), C9300-SSD-NONE (C9300X-48HX-A), STACK-T1-50CM (C9300X-48HX-A), CAB-SPWR-30CM (C9300X-48HX-A), C9300X-NM-8Y (C9300X-48HX-A), CAB-C15-CBN (C9300X-48HX-A), PWR-C1-715WAC-P/2 (C9300L-24P-4X-A), CAB-C15-CBN (C9300L-24P-4X-A), C9300L-SSD-NONE (C9300L-24P-4X-A), C9300L-STACK-KIT2 (C9300L-24P-4X-A).
- Included zero-price accessory behavior: 13 child line(s) are included components bundled with the parent (rubber feet, screws, cable guides, universal images, stacking hardware, and similar). They carry no price by design; whether each is retained is a human-review decision. Items: SC9300UK9-1715 (C9300X-48HX-A), PWR-C1-1100WAC-P (C9300X-48HX-A), C9K-ACC-RBFT (C9300X-48HX-A), C9K-ACC-SCR-4 (C9300X-48HX-A), CAB-GUIDE-1RU (C9300X-48HX-A), S9300LUK9-1718 (C9300L-24P-4X-A), FAN-T2 (C9300L-24P-4X-A), PWR-C1-715WAC-P (C9300L-24P-4X-A), C9K-ACC-RBFT (C9300L-24P-4X-A), C9K-ACC-SCR-4 (C9300L-24P-4X-A), CAB-GUIDE-1RU (C9300L-24P-4X-A), C9300L-STACK-A (C9300L-24P-4X-A), STACK-T3A-50CM (C9300L-24P-4X-A).
- Historical-to-current replacement mappings: 11 candidate replacement(s) map a historical SKU seen in prior regression context to the current CCW SKU(s). None may drive a runtime substitution without explicit human approval. See section 6.
- CCW-only evidence cases: 45 child line(s) are backed only by the current CCW configured estimate, with no corroborating ordering guide, data sheet, or install guide. These rely on the configured estimate alone and warrant closer human review. Items: CON-ROB-CW9178IC (CW9178I-CFG), CW9178-SINGLE (CW9178I-CFG), CON-L1NCD-C9300XY4 (C9300X-48HX-A), C9300-DNA-A-48 (C9300X-48HX-A), CON-L1SWT-C93A48 (C9300X-48HX-A), C9300-DNA-A-48-3Y (C9300X-48HX-A), TE-EMBEDDED-T (C9300X-48HX-A), TE-EMBEDDED-T-3Y (C9300X-48HX-A), D-DNAS-EXT-S-T (C9300X-48HX-A), D-DNAS-EXT-S-3Y (C9300X-48HX-A), C9300-NW-A-48 (C9300X-48HX-A), SC9300UK9-1715 (C9300X-48HX-A), TE-C9K-SW (C9300X-48HX-A), PWR-C1-1100WAC-P (C9300X-48HX-A), PWR-C1-1100WAC-P/2 (C9300X-48HX-A), C9300-SSD-NONE (C9300X-48HX-A), CAB-SPWR-30CM (C9300X-48HX-A), C9K-ACC-RBFT (C9300X-48HX-A), C9K-ACC-SCR-4 (C9300X-48HX-A), CAB-GUIDE-1RU (C9300X-48HX-A), NETWORK-PNP-LIC (C9300X-48HX-A), CAB-C15-CBN (C9300X-48HX-A), CON-L1NCD-C93024PX (C9300L-24P-4X-A), C9300L-DNA-A-24 (C9300L-24P-4X-A), CON-L1SWT-C93LA24 (C9300L-24P-4X-A), C9300L-DNA-A-24-3Y (C9300L-24P-4X-A), TE-EMBEDDED-T (C9300L-24P-4X-A), TE-EMBEDDED-T-3Y (C9300L-24P-4X-A), D-DNAS-EXT-S-T (C9300L-24P-4X-A), D-DNAS-EXT-S-3Y (C9300L-24P-4X-A), S9300LUK9-1718 (C9300L-24P-4X-A), C9300L-NW-A-24 (C9300L-24P-4X-A), TE-C9K-SW (C9300L-24P-4X-A), FAN-T2 (C9300L-24P-4X-A), PWR-C1-715WAC-P (C9300L-24P-4X-A), PWR-C1-715WAC-P/2 (C9300L-24P-4X-A), CAB-C15-CBN (C9300L-24P-4X-A), C9300L-SSD-NONE (C9300L-24P-4X-A), C9K-ACC-RBFT (C9300L-24P-4X-A), C9K-ACC-SCR-4 (C9300L-24P-4X-A), CAB-GUIDE-1RU (C9300L-24P-4X-A), C9300L-STACK-A (C9300L-24P-4X-A), STACK-T3A-50CM (C9300L-24P-4X-A), NETWORK-PNP-LIC (C9300L-24P-4X-A), CON-L1NBD-P7PK94P1 (CP-7841-K9=).

## 5. Parent-By-Parent Review

Each parent below lists its evidence and risk flags, then a table of its child lines. Every decision shown is pending.

### 5.1 CW9178I-CFG - Cisco Wireless 9178I(W7,4 radio,3 band 4x4,UWB), Global

- ruleId: honeywell-cw9178i-cfg
- parent evidence: ccw_export L2; datasheet p7; ordering_guide p18
- parent risk flags: (none)
- parent decision: pending

| child SKU | description | relationshipType | quantityRule | quantityValue | evidence summary | risk flags | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-ROB-CW9178IC | RMA UPGRADE 8X5XNBD Cisco Wireless 9178I | service_or_support | same_as_parent |  | ccw_export L3 | service_or_support_term_requires_review, ccw_only_evidence | pending |
| AIR-AP-BRACKET-2 | 802.11 AP Universal Mounting Bracket | default_selected | same_as_parent |  | ccw_export L4; install_guide p19 | default_selection_requires_review | pending |
| AIR-AP-T-RAIL-F | Flush Mount for APs & Cellular Gateways-Recessed | default_selected | same_as_parent |  | ccw_export L5; install_guide p20 | default_selection_requires_review | pending |
| CW9178-SINGLE | SINGLE PACK OPTION | default_selected | same_as_parent |  | ccw_export L6 | default_selection_requires_review, ccw_only_evidence | pending |

### 5.2 CISCO-NETWORK-SUB - Cisco Networking Subscription

- ruleId: honeywell-cisco-network-sub
- parent evidence: ccw_export L8; subscription_datasheet p3; ordering_guide p17
- parent risk flags: (none)
- parent decision: pending

| child SKU | description | relationshipType | quantityRule | quantityValue | evidence summary | risk flags | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LIC-CW-A | Cisco Wireless License - Advantage | subscription | fixed | 12 | ccw_export L9; subscription_datasheet p8 | fixed_quantity_requires_review, subscription_requires_review | pending |
| LIC-SPACES-ADV | Cisco Spaces Advantage for Cisco Wireless Advantage License | subscription | fixed | 12 | ccw_export L10; subscription_datasheet p1 | fixed_quantity_requires_review, subscription_requires_review | pending |
| SVS-L0SPT-CN | Cisco Network Product Support | service_or_support | same_as_parent |  | ccw_export L11; subscription_datasheet p6 | service_or_support_term_requires_review | pending |

### 5.3 C9300X-48HX-A - Catalyst 9300 48-port mGig UPoE+, Network Advantage

- ruleId: honeywell-c9300x-48hx-a
- parent evidence: ccw_export L13; datasheet p62; ordering_guide p20; gpl L561
- parent risk flags: (none)
- parent decision: pending

| child SKU | description | relationshipType | quantityRule | quantityValue | evidence summary | risk flags | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-L1NCD-C9300XY4 | CX LEVEL 1 8X7NCD Catalyst 9300 48-port mGig UPoE+, Networ | service_or_support | same_as_parent |  | ccw_export L14 | service_or_support_term_requires_review, ccw_only_evidence | pending |
| C9300-DNA-A-48 | C9300 DNA Advantage, 48-Port Term Licenses | subscription | same_as_parent |  | ccw_export L15 | subscription_requires_review, ccw_only_evidence | pending |
| CON-L1SWT-C93A48 | CX LEVEL 1 SW SUB C9300 DNA Advantage | service_or_support | same_as_parent |  | ccw_export L16 | service_or_support_term_requires_review, ccw_only_evidence | pending |
| C9300-DNA-A-48-3Y | C9300 DNA Advantage, 48-Port, 3 Year Term License | subscription | same_as_parent |  | ccw_export L17 | subscription_requires_review, ccw_only_evidence | pending |
| TE-EMBEDDED-T | Cisco ThousandEyes Enterprise Agent IBN Embedded | subscription | same_as_parent |  | ccw_export L18 | subscription_requires_review, ccw_only_evidence | pending |
| TE-EMBEDDED-T-3Y | ThousandEyes - Enterprise Agents | subscription | same_as_parent |  | ccw_export L19 | subscription_requires_review, ccw_only_evidence | pending |
| D-DNAS-EXT-S-T | Cisco DNA Spaces Extend Term License for Catalyst Switches | subscription | same_as_parent |  | ccw_export L20 | subscription_requires_review, ccw_only_evidence | pending |
| D-DNAS-EXT-S-3Y | Cisco DNA Spaces Extend for Catalyst Switching - 3Year | subscription | same_as_parent |  | ccw_export L21 | subscription_requires_review, ccw_only_evidence | pending |
| C9300-NW-A-48 | C9300 Network Advantage, 48-port license | subscription | same_as_parent |  | ccw_export L22 | subscription_requires_review, ccw_only_evidence | pending |
| SC9300UK9-1715 | CAT9300/9400/9500/9600 UNIVERSAL | included_zero_price | same_as_parent |  | ccw_export L23 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| TE-C9K-SW | TE agent for IOSXE on C9K | subscription | same_as_parent |  | ccw_export L24 | subscription_requires_review, ccw_only_evidence | pending |
| PWR-C1-1100WAC-P | 1100W AC 80+ platinum Config 1 Power Supply | included_zero_price | same_as_parent |  | ccw_export L25 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| PWR-C1-1100WAC-P/2 | 1100W AC 80+ platinum Config 1 Secondary Power Supply | default_selected | same_as_parent |  | ccw_export L26 | default_selection_requires_review, ccw_only_evidence | pending |
| C9300-SSD-NONE | No SSD Card Selected | default_selected | same_as_parent |  | ccw_export L27 | default_selection_requires_review, ccw_only_evidence | pending |
| STACK-T1-50CM | 50CM Type 1 Stacking Cable | default_selected | same_as_parent |  | ccw_export L28; ordering_guide p29 | default_selection_requires_review | pending |
| CAB-SPWR-30CM | Catalyst Stack Power Cable 30 CM | default_selected | same_as_parent |  | ccw_export L29 | default_selection_requires_review, ccw_only_evidence | pending |
| C9K-ACC-RBFT | RUBBER FEET FOR TABLE TOP SETUP 9200 and 93xx | included_zero_price | same_as_parent |  | ccw_export L30 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| C9K-ACC-SCR-4 | 12-24 and 10-32 SCREWS FOR RACK INSTALLATION, QTY 4 | included_zero_price | same_as_parent |  | ccw_export L31 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| CAB-GUIDE-1RU | 1RU CABLE MANAGEMENT GUIDES 9200 and 9300 | included_zero_price | same_as_parent |  | ccw_export L32 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| C9300X-NM-8Y | Catalyst 9300 8 x 10G/25G Network Module SFP+/SFP28 | default_selected | same_as_parent |  | ccw_export L33; ordering_guide p28 | default_selection_requires_review | pending |
| NETWORK-PNP-LIC | Network Plug-n-Play Connect for zero-touch device deployment | subscription | same_as_parent |  | ccw_export L34 | subscription_requires_review, ccw_only_evidence | pending |
| CAB-C15-CBN | Cabinet Jumper Power Cord, 250 VAC 13A, C14-C15 Connectors | default_selected | fixed_per_parent | 2 | ccw_export L35 | fixed_per_parent_requires_review, default_selection_requires_review, ccw_only_evidence | pending |

### 5.4 C9300L-24P-4X-A - Catalyst 9300L 24p PoE, Network Advantage ,4x10G Uplink

- ruleId: honeywell-c9300l-24p-4x-a
- parent evidence: ccw_export L37; datasheet p66; ordering_guide p20; gpl L499
- parent risk flags: (none)
- parent decision: pending

| child SKU | description | relationshipType | quantityRule | quantityValue | evidence summary | risk flags | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-L1NCD-C93024PX | CX LEVEL 1 8X7NCDCatalyst 9300L 24p PoE Network Advantag | service_or_support | same_as_parent |  | ccw_export L38 | service_or_support_term_requires_review, ccw_only_evidence | pending |
| C9300L-DNA-A-24 | C9300L Cisco DNA Advantage, 24-port Term Licenses | subscription | same_as_parent |  | ccw_export L39 | subscription_requires_review, ccw_only_evidence | pending |
| CON-L1SWT-C93LA24 | CX LEVEL 1 SW SUB C9300L Cisco DNA Adv | service_or_support | same_as_parent |  | ccw_export L40 | service_or_support_term_requires_review, ccw_only_evidence | pending |
| C9300L-DNA-A-24-3Y | C9300L Cisco DNA Advantage, 24-port, 3 Year Term license | subscription | same_as_parent |  | ccw_export L41 | subscription_requires_review, ccw_only_evidence | pending |
| TE-EMBEDDED-T | Cisco ThousandEyes Enterprise Agent IBN Embedded | subscription | same_as_parent |  | ccw_export L42 | subscription_requires_review, ccw_only_evidence | pending |
| TE-EMBEDDED-T-3Y | ThousandEyes - Enterprise Agents | subscription | same_as_parent |  | ccw_export L43 | subscription_requires_review, ccw_only_evidence | pending |
| D-DNAS-EXT-S-T | Cisco DNA Spaces Extend Term License for Catalyst Switches | subscription | same_as_parent |  | ccw_export L44 | subscription_requires_review, ccw_only_evidence | pending |
| D-DNAS-EXT-S-3Y | Cisco DNA Spaces Extend for Catalyst Switching - 3Year | subscription | same_as_parent |  | ccw_export L45 | subscription_requires_review, ccw_only_evidence | pending |
| S9300LUK9-1718 | CAT9300/9400/9500/9600 UNIVERSAL | included_zero_price | same_as_parent |  | ccw_export L46 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| C9300L-NW-A-24 | C9300L Network Advantage, 24-port license | subscription | same_as_parent |  | ccw_export L47 | subscription_requires_review, ccw_only_evidence | pending |
| TE-C9K-SW | TE agent for IOSXE on C9K | subscription | same_as_parent |  | ccw_export L48 | subscription_requires_review, ccw_only_evidence | pending |
| FAN-T2 | Cisco Type 2 Fan Module | included_zero_price | fixed_per_parent | 3 | ccw_export L49 | fixed_per_parent_requires_review, included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| PWR-C1-715WAC-P | 715W AC 80+ platinum Config 1 Power Supply | included_zero_price | same_as_parent |  | ccw_export L50 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| PWR-C1-715WAC-P/2 | 715W AC 80+ platinum Config 1 SecondaryPower Supply | default_selected | same_as_parent |  | ccw_export L51 | default_selection_requires_review, ccw_only_evidence | pending |
| CAB-C15-CBN | Cabinet Jumper Power Cord, 250 VAC 13A, C14-C15 Connectors | default_selected | fixed_per_parent | 2 | ccw_export L52 | fixed_per_parent_requires_review, default_selection_requires_review, ccw_only_evidence | pending |
| C9300L-SSD-NONE | No SSD Card Selected | default_selected | same_as_parent |  | ccw_export L53 | default_selection_requires_review, ccw_only_evidence | pending |
| C9K-ACC-RBFT | RUBBER FEET FOR TABLE TOP SETUP 9200 and 93xx | included_zero_price | same_as_parent |  | ccw_export L54 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| C9K-ACC-SCR-4 | 12-24 and 10-32 SCREWS FOR RACK INSTALLATION, QTY 4 | included_zero_price | same_as_parent |  | ccw_export L55 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| CAB-GUIDE-1RU | 1RU CABLE MANAGEMENT GUIDES 9200 and 9300 | included_zero_price | same_as_parent |  | ccw_export L56 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| C9300L-STACK-KIT2 | Cisco Catalyst 9300L and 9300LM Stacking Kit | default_selected | same_as_parent |  | ccw_export L57; ordering_guide p29 | default_selection_requires_review | pending |
| C9300L-STACK-A | Catalyst 9300L & 9300LM Stack Module | included_zero_price | fixed_per_parent | 2 | ccw_export L58 | fixed_per_parent_requires_review, included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| STACK-T3A-50CM | C9300L & C9300LM 50CM Type 3A Stacking Cable | included_zero_price | same_as_parent |  | ccw_export L59 | included_zero_price_accessory_requires_review, ccw_only_evidence | pending |
| NETWORK-PNP-LIC | Network Plug-n-Play Connect for zero-touch device deployment | subscription | same_as_parent |  | ccw_export L60 | subscription_requires_review, ccw_only_evidence | pending |

### 5.5 SFP-10G-LR-S= - 10GBASE-LR SFP Module, Enterprise-Class

- ruleId: honeywell-sfp-10g-lr-s
- parent evidence: ccw_export L62; gpl L2307
- parent risk flags: (none)
- parent decision: pending

No child lines (standalone parent).

### 5.6 SFP-10/25G-LR-S= - 10/25GBASE-LR SFP28 Module

- ruleId: honeywell-sfp-10-25g-lr-s
- parent evidence: ccw_export L64; gpl L2286
- parent risk flags: (none)
- parent decision: pending

No child lines (standalone parent).

### 5.7 CP-7841-K9= - Cisco IP Phone 7841

- ruleId: honeywell-cp-7841-k9
- parent evidence: ccw_export L66; datasheet p3; datasheet p11; gpl L842
- parent risk flags: (none)
- parent decision: pending

| child SKU | description | relationshipType | quantityRule | quantityValue | evidence summary | risk flags | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CON-L1NBD-P7PK94P1 | CX LEVEL 1 8X5XNBDCisco UC Phone 7841 | service_or_support | same_as_parent |  | ccw_export L67 | service_or_support_term_requires_review, ccw_only_evidence | pending |

## 6. Replacement Review

Each historical-to-current mapping below is a candidate only. A reviewer must explicitly decide each one; none performs a runtime substitution until approved in a separate runtime rule pack. Every decision shown is pending.

| historical SKU | current SKU(s) | evidence summary | risk flags | decision |
| --- | --- | --- | --- | --- |
| C9300-DNX-A-48-3Y | C9300-DNA-A-48-3Y | ccw_export L17 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| C9300L-DNX-A-24-3Y | C9300L-DNA-A-24-3Y | ccw_export L41 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| SC9300UK9-1712 | SC9300UK9-1715 | ccw_export L23 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| S9300LUK9-1712 | S9300LUK9-1718 | ccw_export L46 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| SPACES-EXT-S | D-DNAS-EXT-S-T, D-DNAS-EXT-S-3Y | ccw_export L20; ccw_export L21 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| CON-L1NBX-C9300XY4 | CON-L1NCD-C9300XY4 | ccw_export L14 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| CON-L1SWX-93XA48MY | CON-L1SWT-C93A48 | ccw_export L16 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| CON-L1NBX-C93024PX | CON-L1NCD-C93024PX | ccw_export L38 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| CON-L1SWX-3LXA24MY | CON-L1SWT-C93LA24 | ccw_export L40 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| CON-SNT-P7PK94P1 | CON-L1NBD-P7PK94P1 | ccw_export L67 | replacement_requires_explicit_approval, ccw_only_evidence | pending |
| C9300L-STACK-BLANK | C9300L-STACK-KIT2, C9300L-STACK-A, STACK-T3A-50CM | ccw_export L57; ccw_export L58; ccw_export L59 | replacement_requires_explicit_approval, ccw_only_evidence | pending |

## 7. How To Approve For The Next Prompt

This packet does not approve anything. To let a later prompt build an approved runtime rule pack, the user and advisor must record explicit, itemized human decisions outside this packet (every decision here stays pending):

1. For each parent rule (by ruleId/parentSku), state one decision from the decision vocabulary: approve_for_honeywell_mvp, defer, reject, or needs_more_evidence.
2. For each child line (by parent ruleId + child SKU), state one decision from the same vocabulary. Do not approve a parent's children implicitly; each child needs its own decision.
3. For each candidate replacement (by candidateReplacementId / historical SKU), state one decision from the same vocabulary.
4. Capture quantity, term, redundancy, and default-accessory confirmations for every item flagged in section 4.

Only after those explicit approved/deferred/rejected decisions are recorded by a human/business owner may a separate later prompt author an approved runtime rule pack. That approved pack is a NEW artifact. This packet and the candidate pack stay unchanged and remain not runtime authority.

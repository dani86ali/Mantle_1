# BOMatic — Business Strategy Reference

**Source:** Mohammad's Executive Brief (April 2026) + Production Implementation Spec v1.0. This is sales and strategy material, not a build document. Extracted here so it's available for pitches, investor conversations, and GTM planning without cluttering the build docs.

---

## Competitive capability matrix

|  | BOMatic | StrataVAR | ConnectWise CPQ | Salesforce CPQ | Responsive/SiftHub |
|---|---|---|---|---|---|
| Cisco API orchestration | ✓ Strong | ✓ Strong | ✗ Absent | ✗ Absent | ✗ Absent |
| LLM intake (messy emails/BoMs) | ✓ Strong | ✗ Absent | ✗ Absent | ✓ Partial | ✓ Partial |
| Generative config (partial reqs → BoM) | ✓ Strong | ✗ Absent | ✗ Absent | ✗ Absent | ✗ Absent |
| Human-in-the-Loop review | ✓ Strong | ✓ Partial | ✓ Partial | ✓ Partial | ✗ Absent |
| Channel-neutral by design | ✓ Strong | ✓ Partial | ✓ Strong | ✓ Strong | ✓ Strong |

**The gap:** StrataVAR has API depth but no LLM. RFP tools have LLM but no Cisco depth. Generic CPQs have neither. Our position is uncontested.

---

## Per-region cost savings per engineer

| Region | Yearly savings per presales engineer |
|---|---|
| United States | $90K |
| Germany | $65K |
| United Kingdom | $58K |
| GCC (UAE, KSA, etc.) | $35K |

Sources: BLS OOH 2024 (US median $121.5K loaded) · ERI / Cooper Fitch UAE / KSA · ERI Germany. Realistic 60% net coverage of the ~75% automatable share of repetitive quoting work.

---

## Key metrics

| Metric | Value | Source |
|---|---|---|
| Time per estimate (manual) | 30–60 minutes | Cisco partner documentation, NTT internal data |
| Time per estimate (with BOMatic) | 5–10 minutes (review only) | Target based on automation of Steps 1–4 of presales workflow |
| Average loaded cost per engineer | $185K (US) | BLS OOH 2024 |
| Quote conversion rate | 20–30% | Arphie / Presales Collective |
| Presales effort that produces no revenue | 70%+ | Arphie / Presales Collective |
| NTT scale: estimates per day | 5,000 | Shahid's NTT pitch deck |
| NTT scale: monthly cost of manual quoting | ~$5.5M | 5,000/day × $50/hr |
| Presales engineer daily target | 5 full submissions | Shahid's daily checklist |
| Cisco SLA for estimate requests | 48 hours | Shahid's daily checklist |

---

## Market sizing

| Region | TAM | SAM | SOM |
|---|---|---|---|
| GCC / Middle East | $30–90M | $10–25M | $2–5M |
| Europe | $150–360M | $45–90M | $5–12M |
| United States | $120–300M | $30–60M | $3–8M |
| **Global** | **$0.3B–$1.9B** | | **$10–25M** |

Based on 50K–125K Cisco-aligned presales engineers globally × $6–12K/seat/year.

---

## Pricing model

### Subscription tiers

| Tier | Price | Includes |
|---|---|---|
| Tier 1: Co-Pilot | $99/user/month ($1,188/yr) | Up to 50 estimates/user/month. LLM intake + read-only APIs. Email + UI form intake. Best for junior engineers. |
| Tier 2: Quote Engine | $249/user/month ($2,988/yr) | Up to 250 estimates/user/month. Full Estimate + Quote API write-back. Customer Registry + deal-reg drafting. CRM/CPQ integrations. Overage at $2/estimate. |
| Tier 3: Channel Suite | $25K platform/year + $300/user/yr | Unlimited estimates. CCW-R renewal automation. EA management. Multi-distributor reconciliation. SSO/SCIM + audit trails. Best for 20+ engineers. |

### Enterprise license (alternative)

$250K–$500K one-time license fee. Buyer self-hosts and self-maintains. Source code, training, and 90-day handover included. No recurring fees.

### Pricing strategy

~50–80% below Salesforce CPQ ($1,800–$2,400/user/yr), StrataVAR (enterprise license), and ConnectWise CPQ (~$840/user/yr). Aggressively low entry to block new entrants and accelerate land-and-expand.

---

## ROI

| Metric | Value |
|---|---|
| Payback period (Tier 2) | <2 weeks |
| First-year ROI (US) | 30–40× ($2,988 cost vs $90K savings) |
| First-year ROI (GCC) | 12–17× |
| Manual cost per quote | ~$50 (NTT internal labor rate) |

---

## Go-to-market

### Phase 01 — Months 0–6: GCC launch
- Bahrain, UAE, KSA, Qatar, Oman, Kuwait simultaneously
- 5–10 design-partner SIs
- Closed beta → general availability by Month 6
- Target: 100–300 paid seats, $0.5–1.5M ARR

### Phase 02 — Months 6–12: EU + US in parallel
- EU: UK, Germany, Netherlands, Nordics
- US: California, NY, Texas
- Cisco Marketplace + AppExchange listing
- EU data residency live (Frankfurt) by Month 9
- Target: 500–1,500 seats, $3–8M ARR

### Phase 03 — Months 12–24: Global scale
- Multi-vendor adapters (Juniper, Arista, Palo Alto, Aruba)
- Enterprise license deals to top-50 SIs
- Self-serve product-led growth in EU + US
- Target: 3,000–8,000 seats + 5–10 enterprise licenses, $15–30M ARR

### Target segments
- Tier-1 SIs (>500 engineers): GBM, e& enterprise, STC, Atos, T-Systems, WWT, Insight, CDW
- Tier-2 SIs (50–500 engineers): regional specialists
- MSPs and resellers: Cisco-aware MSPs/VARs
- Distributors: Westcon-Comstor, TD SYNNEX, Ingram, Arrow (white-label deals)

### Channels
- Direct sales (inside + field)
- Distributor co-sell
- Cisco Marketplace + Salesforce AppExchange (Month 9–12)
- Product-led growth (Year 2)

---

## Risk analysis

### High risks

**Cisco acquires StrataVAR.** StrataVAR already has direct CCW API depth and sits on Salesforce AppExchange. Acquisition would bundle the closest competitor as free/near-free for Cisco-tier partners.
- Mitigation: Out-execute on LLM depth (StrataVAR's structural weakness). Move first in MEA. Build to vendor-agnostic Phase 2. Reach 100+ paying SIs by Month 18 to become acquisition target ourselves.

**1up / SiftHub vertical pivot.** Series-B-funded horizontal RFP/presales AI tools could verticalize on Cisco in <12 months.
- Mitigation: Lock GCC with 12-month exclusive design-partner agreements. Establish Cisco-specialist brand in Channel Partners, CRN MEA, Channel Futures within Year 1. Be vendor-agnostic before they verticalize.

### Medium risks

**Cisco builds it themselves.** Currently focused on Webex AI, ops AI, security AI — not presales tooling. But Cisco 360 transition could redirect resources.
- Mitigation: Channel-neutrality is structural (Cisco won't build for all four distributors equally). Stay below $50M ARR until Year 4. Phase 2 vendor-agnostic scope is Cisco-proof.

**Cisco API breaking changes.** 60-day notice per partner agreement.
- Mitigation: Versioned adapter layer. Per-API SLA tracking. Graceful degradation to cached data.

**Tenant data leakage.** Multi-tenant architecture risk.
- Mitigation: Per-tenant RLS, per-tenant Secrets Manager, per-tenant KMS, no shared vector space, audit logs, SOC 2 Type 1 by Month 12.

### Low risks

**Anthropic API outage.** Deterministic validation + cached Catalog continue without LLM. Summary/design queues for retry.

**LLM cost runaway.** Two-model routing (Haiku-first). Structured intake reduces tokens. Design-proposal cache. Per-tier estimate quotas.

---

## Cost model (reference from Mohammad's spec)

### Infrastructure (5-tenant steady state)
~$3,250/month ($39K/year)

### Per-estimate variable cost
- Path A (BoM provided): $0.03–$0.09
- Path B (requirements only): $0.30–$0.60
- Blended (60% A / 40% B): $0.15–$0.30

### Unit economics at scale
- 25 seats × $4,800/seat/yr = $120K revenue, ~41% gross margin (Year 1, includes SOC 2)
- 80 seats × $4,800/seat/yr = $384K revenue, ~84% gross margin (Year 2+)

---

## Open team decisions

1. **Phase 2 direction:** Horizontal (multi-vendor: Juniper, Arista, Palo Alto, Aruba) vs. vertical (deeper Cisco: all domains, design, renewals). Both are valid. The executive brief assumes horizontal. The product docs are currently Cisco-vertical. Needs alignment.

2. **Pricing finalization:** Tiers above are a strong starting point but haven't been validated with prospects. Defer until closer to market.

3. **Enterprise license option:** $250K–$500K one-time is interesting for large SIs but changes the revenue model. Decide based on first customer conversations.

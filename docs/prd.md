# BOMatic — Product Requirements Document

## What this is

BOMatic is an AI-powered tool that automates Cisco presales engineering work. It does what a Cisco presales engineer does manually — SKU lookup, BoM assembly, configuration validation, estimate creation, quote retrieval, and customer delivery — but autonomously, with human review before anything goes out.

The product is a multi-tenant SaaS for System Integrators, VARs, and distributors that sell Cisco products. It is an independent ISV offering, not affiliated with or endorsed by Cisco Systems.

## The problem

Cisco presales engineers spend the majority of their time on repetitive pre-ordering work. Cisco's own documentation acknowledges that partners spend over 70% of their time on pre-ordering processes.

This work is:
- **Repetitive** — the same product families, the same configuration patterns, the same validation checks, hundreds of times per month
- **Slow** — a single estimate takes 30–60 minutes manually; engineers handle queues of 5+ requests per day (48-hour SLA at NTT)
- **Error-prone** — wrong SKUs, missing licenses, incorrect PoE calculations, EoX products, region-blocked items, mismatched distributor quotes
- **Expensive** — ~$185K loaded cost per engineer (US), and 50%+ of that time goes to data entry instead of complex design work
- **Low-converting** — 70%+ of presales effort produces no revenue (Arphie / Presales Collective); slow quotes lose deals

The compound cost at scale: ~$5.5M/month wasted on manual quoting at one large SI (NTT DATA: 5,000 estimates/day × $50/hr).

## Who it's for

System Integrators, VARs, and distributors that sell Cisco products. Examples: NTT DATA, CDW, Insight, Presidio, WWT, Dimension Data, GBM, e& enterprise, STC, Atos, T-Systems, and thousands of smaller Cisco partners globally.

The product has four user types:
1. **Customer or salesperson** — submits requirements via email or the intake portal
2. **Presales engineer** — reviews the agent's output, adjusts, approves, exports, and sends to customer
3. **Tenant admin** — configures credentials, standards, branding, mailbox, and integrations
4. **Account manager** — receives the final deliverable and tracks the opportunity

## What it does

### Three-step canonical workflow

**Step 1 — User provides requirements**
Via email to a tenant-monitored mailbox, via the UI intake form, or via BoM upload. The system handles messy text, dirty BoMs, and partial requirements.

**Step 2 — AI agent builds the BoM (autonomous)**
End-to-end: parses intake, suggests SKUs, validates configuration against Cisco APIs and deterministic rules, drafts the estimate, generates a summary of assumptions and open questions. No engineer involvement.

**Step 3 — Engineer reviews and approves (HILA)**
Human-in-the-Loop Approval. Per-line adjust/accept/reject. Export to CCW, CSV, or CRM/CPQ. Send to customer via tenant's own email. The engineer stays in control.

### Cisco API integration surface

The product orchestrates these Cisco Commerce Xpress Connect APIs using the tenant's own partner credentials:

| API | Protocol | Phase | Purpose |
|---|---|---|---|
| Catalog v2.0 | REST/JSON | Phase 1 | SKU search, pricing, EoX, region availability, specs |
| Estimate v1.0 | REST+SOAP/XML | Phase 1 | Create/update/acquire/share draft estimates in CCW |
| Customer Registry v2.0 | REST/JSON | Phase 1 | Customer name search and validation |
| Prepare Configuration v2.0 | SOAP/XML | Phase 2 | Authoritative configuration validation against Cisco rules |
| Quote v2.0 | SOAP/XML | Phase 2 | Retrieve deal-priced quotes created by the Cisco AM |
| CCW-R Contract Admin | REST | Phase 3+ | Subscription renewals and contract management |
| Order Status / Serial Number | REST | Phase 3+ | Post-sale order tracking and asset registration |

### Domain scope (phased)

- **Phase 1:** Access Switching (Catalyst 9200/9300/9400/9500) + Wireless (Catalyst 9800 controllers, Wi-Fi 6/6E APs)
- **Phase 2:** Security / Firepower, Meraki
- **Phase 3+:** Data Center / UCS, Collaboration, SD-WAN
- **Long-term:** Multi-vendor expansion (Juniper, Arista, Palo Alto, HPE/Aruba) — team decision pending on whether Phase 2+ goes horizontal (more vendors) or vertical (deeper Cisco)

## Positioning

**"An independent AI presales engineer. Complement to CCW, not replacement."**

This is non-negotiable — for legal reasons (Cisco API License v1.2 Section 5(a) non-compete clause prohibits products that "substantially replicate AND compete" with Cisco offerings) and commercial reasons (StrataVAR, the most successful product in this space, uses this exact positioning).

CCW remains the source of truth for Cisco catalog data and configuration validation. BOMatic automates the workflow around CCW, not a copy of CCW.

## ISV disclaimer

This product is an independent ISV offering for Cisco partners. It is not an official Cisco product, is not endorsed by Cisco Systems, and has no commercial relationship with Cisco. The product authenticates against Cisco APIs using partner credentials owned and operated by tenant SIs/VARs, never by the ISV.

## Success metric

90% of draft BoMs match what a competent Cisco presales engineer would produce for the same intake, measured against a benchmark harness of representative scenarios built from public Cisco reference architectures and validated by Shahid (Cisco-certified network engineer).

Target outcome: 60 minutes → 5–10 minutes per estimate. An 80–90% time reduction.

## Key architectural constraints

- **Never replicate the Cisco catalog.** Always call Catalog API live; cache short-lived (24h prices, 1h EoX).
- **Never replicate CCW validation logic.** Run deterministic checks for fast feedback; defer to Prepare Configuration API for authoritative validation.
- **Per-tenant Cisco credentials.** Each client brings their own CCO credentials (ROPC OAuth flow). We store them encrypted, scoped per tenant. Never share or sublicense.
- **Sensible defaults.** The product works out of the box with defaults derived from public Cisco documentation. Per-tenant standards configuration is an enhancement, not a prerequisite.
- **Human review is always mandatory.** No output is considered final until a presales engineer reviews it.
- **Global Price List Emerging (USD)** must be supported from day one (confirmed by real NTT/Dimension Data Saudi Arabia estimates).
- **Cisco adapter layer stays isolated.** All Cisco-specific logic is separated from product logic. When Cisco changes an API, only the adapter is updated.

## Long-term vision

Automate Cisco presales engineering work as deeply as the technology allows — eventually including architecture diagrams, network design, multi-domain configurations, multi-vendor quoting, and post-sale renewal management. The product approaches customers only when it is substantially complete and polished.

## Team

- **Danish** — Partner, developer
- **Claude** — AI developer (primary build capacity)
- **Mohammad** — Partner, authored the executive brief and production implementation spec
- **Shahid Khan** — Partner, Cisco-certified network engineer at NTT DATA, domain expert and output validator

## Go-to-market (reference — not build-blocking)

- **First target:** NTT DATA (Shahid is inside). However, NTT may build in-house or pass — we hedge by building a product any SI can use.
- **GCC-first GTM:** Bahrain, UAE, KSA, Qatar, Oman, Kuwait. Then EU + US in parallel.
- **No customer approach until the product is substantially built** (Phase 3 or Phase 4 complete).

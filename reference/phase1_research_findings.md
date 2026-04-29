# Presales AI Agent for Cisco Commerce — Phase 1 Research Findings

**Document purpose:** Reference material for Claude CLI / future sessions working on this project. Contains consolidated research, opportunities, constraints, recommended Phase 1 scope, and comparison with the original NTT pitch deck.

**Date:** April 27, 2026
**Author:** Danish (with Claude)

---

## 1. Project context

### 1.1 What we are building

A multi-tenant SaaS product that automates Cisco engineering work — starting with presales BoM/estimate creation, with the long-term ambition of going as deep into the engineer's workflow as the technology allows (eventually including architecture diagrams and design work). The product takes customer requirements as input, calls Cisco Commerce APIs to produce a draft Bill of Materials and CCW Estimate, validates it deterministically, and presents it to a presales engineer for review.

### 1.2 Strategic framing

**The domain is Cisco.** This product automates what Cisco presales engineers do — SKU selection, BoM assembly, configuration validation, estimate creation. Everything is grounded in public Cisco documentation, Cisco data sheets, Cisco ordering guides, Cisco APIs, and Cisco's configuration rules. That is the product.

**SIs are buyers, not the domain.** Companies like NTT DATA employ Cisco presales engineers who do this work manually. We sell them automation of it. NTT is a Cisco seller. So is every other SI we'd sell to. The product stays the same; only the buyer changes.

**NTT is the named first target customer.** Shahid is inside NTT and authored the original pitch deck. However, NTT may build in-house or pass. We assume real risk and design accordingly.

**The MVP must be demonstrable to any SI.** It should be functional out of the box and require only minimum configuration tweaks (credentials, standards, branding) to sell to a different client. We are NOT building NTT's tool. We are building a Cisco presales automation tool that NTT happens to be the first pitch for.

**The feature test for Phase 1:**

1. Does this automate real Cisco presales engineering work?
2. Would any SI running Cisco estimates find this useful out of the box?

- Passes both → core Phase 1
- Passes only one → evaluate carefully
- Passes neither → cut

**Sensible defaults over client-specific configuration.** The product ships with defaults derived from public Cisco documentation that work without per-client setup. Configuring tenant-specific standards (approved models, regional rules, etc.) is an enhancement, not a prerequisite. A new client plugs in credentials and gets a working product on day one.

### 1.3 Team

- **Danish** — Developer, partner
- **Mohammad** — Partner. Authored an earlier production implementation spec (now set aside as reference only)
- **Shahid Khan** — Partner. Senior Solution Architect at NTT DATA, Cisco-certified network engineer, Cisco domain expert. Authored the original Phase 1 PowerPoint deck

### 1.4 Source materials reviewed

- `AI_Agent-Phase1.pptx` — Shahid's NTT pitch deck
- `CDW_-_Registering_a_Meraki_Deal_in_CCW_-_Transcript.docx` — OIP deal registration walkthrough
- `Cisco_CCW_-_Learn_how_to_build_estimates_-_Transcript.docx` — Firepower estimate walkthrough
- `Cisco_Commerce_Xpress_Connect_Guide__1_.pdf` — Cisco's official partner API reference
- `How_to_create_a_quick_quote_in_CCW_-_Transcript.docx` — Quick Quote workflow walkthrough
- `Production_Implementation-1.docx` — Mohammad's earlier production spec (reference only, not authoritative)
- Earlier `phase1_research_findings.md` — internal research summaries (market, legal, API feasibility)

### 1.5 Companion documents

- `ccw_workflow_patterns.md` — Structured CCW mechanics extracted from the three transcript files. Contains the agent's behavioral reference: SKU discovery patterns, bundle vs standalone decisions, option selection, licensing, service attachment, the data sheet → ordering guide → CCW pipeline, quick quote workflow, deal registration (Phase 2+), and key rules/gotchas.

---

## 2. Executive summary

The opportunity is real and validated by independent evidence: Cisco itself documents that partners spend over 70% of their time on pre-ordering work, public forum threads describe partners losing eight-figure deals over slow quoting, and the entire VAR CPQ tooling industry exists because of this pain. There is no AI-native competitor in the space — the incumbents (StrataVAR, VARStreet, QuoteWerks, ConnectWise CPQ, Owlytica) all sell traditional CPQ/integration tooling. Owlytica's own February 2025 blog states publicly that they don't yet have a working CCW integration.

The strongest commercial and legal positioning is "complement to CCW, not replacement" — explicitly used by StrataVAR and reinforced by the API license non-compete clause. Technically, this means we never try to replicate Cisco's catalog data or configuration validation logic; CCW remains the source of truth, and we automate the workflow around it.

**Go-to-market:** NTT DATA is the named first target. Shahid (a partner) is inside NTT, which is a real strategic advantage. We assume a meaningful chance NTT passes or builds in-house, so the MVP is designed to be sellable to other SIs without a rebuild — multi-tenant architecture from day one, NTT-shaped demo on top.

**Phase 1 scope** is narrower than Shahid's deck: two domains (Access Switching + Wireless), no Security/Firepower, no full Quote API automation, no distributor reconciliation, no multi-vendor. The differentiator is the engineer review console and the configurable standards layer — those are what an SI is buying, whether the SI is NTT or someone else.

**Long-term ambition:** Automate Cisco engineering work as deeply as the technology allows — eventually including architecture diagrams and design work. Phase 1 is the entry point, not the ceiling.

---

## 3. Market research

### 3.1 Market sizing (from earlier research summaries)

- ~40,000 Cisco partners globally
- Cisco FY2024 revenue: $56.7B
- CPQ market: $3.5B in 2024, projected $10.8B by 2035
- Pricing benchmark: $50–100/user/month (SaaS subscription model standard)

### 3.2 Pain points — validated by external sources

- **Cisco's own documentation** acknowledges that partners spend more than 70% of their time on pre-ordering processes (Cisco Manage Estimate Web Services Implementation Guidelines).
- **Owlytica's February 2025 blog** cites a Reddit thread where a customer left their VAR for another over a $20MM opportunity due to slow quoting. Same post: "the process to get the data out of [CCW] and into a usable quote a customer can view is slow and painful."
- **LinkedIn industry posts** describe VAR sales operations literally suffering with large quotes, managers hiring more people, cutting corners, and delaying customer responses by hours or days. 6,000-line-item quotes are routine.
- **StrataVAR's white paper** describes the "stare and compare" problem: partners manually validate distributor quote Excel against CCW quote Excel, and approximately half of all distributor quotes are sent back for revisions at least once.

### 3.3 Cisco 360 Partner Program (launched January 2026) — context shift

This is important and recent. Per StrataVAR's December 2025 analysis:

- Cisco 360 replaced the old partner program tier structure
- Partner incentives (CPI) and Partner Value Index (PVI) scoring now depend on TCV/ACV reporting accuracy
- Slow or inconsistent quoting directly weakens TCV reporting, which directly affects CPI and PVI scores — meaning real money
- This reframes our pitch: quoting accuracy is no longer just operational efficiency; it's tied to partner incentive payments
- Developer tier is available, no fee, three-person startup can register
- DevNet Specialization requires 5 certified individuals — not feasible for current team but not blocking

---

## 4. Competitor landscape

| Competitor | Type | Key facts |
|---|---|---|
| **StrataVAR PqW** | Cisco-specific CPQ | Most direct precedent. Explicitly positions as "complement to CCW." Supports up to 50,000 line items. Integrates with Cisco CCW/CCW-R, Ingram Micro, TD SYNNEX, Westcon/Comstor. Customer-owned credentials model. |
| **Owlytica** | Renewals + asset management | Actively soliciting Cisco partners (Feb 2025 blog) to help build CCW integration. Strong on renewals (CCW-R), weak on quote/estimate generation. Confirms there's still a gap. |
| **VARStreet** | E-commerce/quoting platform | Claims $1B+ in Cisco transactions/year processed. Multi-vendor (Cisco, Dell, HP). Imports CCW estimates by ID. Generic VAR positioning, not Cisco-specialized. |
| **QuoteWerks** | Quoting tool | Integrates via Tech Data 1Source platform. Imports CCW deals/estimates/quotes. Multi-vendor. |
| **ConnectWise CPQ** | General IT CPQ | Broad MSP/VAR tool, not Cisco-specialized. |
| **Salesforce CPQ (iCPQ)** | Generic CPQ | StrataVAR explicitly markets against Salesforce CPQ end-of-life. |
| **Netformx** | Network design/BoM | Cisco-acquired, design-focused. |
| **Twyn CPQ** | CPQ platform | Newer entrant. |

### 4.1 Critical strategic insight from StrataVAR's own white paper

This is the single most important finding for our architecture:

> "Market leading CPQ tools are unable to replace CCW for two main reasons: (1) the volume and pace of changes occurring in the Cisco catalog make it virtually impossible for third party tools to maintain up to date data, and (2) the CCW validation logic cannot be duplicated. CCW output therefore remains the single source of truth for partner buy side purchases."

This validates three architectural decisions:

1. **Don't cache or replicate the Cisco catalog.** Always call Catalog API; cache short-lived.
2. **Don't replicate Cisco's configuration validation.** Run our own deterministic checks for fast feedback, but defer to `Prepare Configuration` SOAP API for authoritative validation.
3. **CCW is the source of truth.** Our value is automation around it, not replacement.

### 4.2 No AI-native competitor

None of the competitors above lead with autonomous BoM generation from natural-language intake. They all assume the BoM already exists somewhere and they're importing/reconciling it. The intake side — turning "I need a 24-port PoE switch with redundancy" into a draft BoM — is genuinely underserved.

---

## 5. Cisco API technical findings

### 5.1 Available APIs (Cisco Commerce Xpress Connect)

| API | Protocol | Format | Purpose |
|---|---|---|---|
| Catalog v2.0 | REST | JSON | SKU search, product data, pricing, EoX, region availability |
| Prepare Configuration v2.0 | SOAP | XML | Validate proposed configurations against Cisco rules |
| Estimate v1.0 | REST + SOAP hybrid | XML | Create/update/acquire/delete estimates in CCW |
| Quote v2.0 | SOAP | XML | Read-only quote access (deal-priced quotes) |
| Customer Registry v2.0 | REST | JSON | Customer search and validation |

### 5.2 Authentication

- Flow: **Resource Owner Password Credentials** (RFC 6749) — NOT client_credentials
- Each API call requires a real CCO username + password
- Token endpoint: `POST https://id.cisco.com/oauth2/default/v1/token` (post-March 2023 migration)
- Base URL: `https://apix.cisco.com` (replaces old `api.cisco.com`)
- Token validity: 60 minutes

### 5.3 Hard limits

- Catalog API `Get Item Information`, `Get Offer Details`, `Get Mandatory Attach`, `MajorMinorMapping`: max 1,000 PIDs per request (returns error if exceeded)
- Only one `priceListId` per request — multi-region tenants need to batch by region
- Cisco does not use ports other than HTTPS 443 (no firewall complications)

### 5.4 GraphQL B2B UAT API — emerging

- Found on MuleSoft Anypoint Exchange, marketed as "One API. All Commerce."
- Still UAT only (not production)
- Contact: b2bapi@cisco.com
- Could simplify integration significantly when it matures
- **Implication:** Don't bet Phase 1 on it, but design adapter layer so we can swap GraphQL in later

### 5.5 No proper sandbox for Commerce APIs

- DevNet has sandboxes for product/network APIs (Catalyst Center, ACI, Stealthwatch, Catalyst, Webex, etc.) but NOT for Commerce APIs (Estimate, Quote, Configuration, Catalog).
- An undocumented POE (Partner Onboarding Environment) exists at `/POE/v2/` paths but isn't a true sandbox.
- **Practical impact:** Development happens against production tenants. Every test costs API quota. Mistakes are visible to credential owner. Defensive code from day one.

### 5.6 Working integration patterns are public

Two GitHub repos show working CCW API integration:
- `oboehmer/Cisco-CCW` — community Python implementation
- `CiscoSE/ccwquery` — Cisco Systems Engineering's own example

We don't need to reverse-engineer auth or basic call patterns from zero.

### 5.7 Documentation fragmentation

- Xpress Connect Guide dated 2019
- Estimate WS guide on a separate Cisco subdomain
- GraphQL UAT API on MuleSoft Anypoint
- API documentation reportedly poor and outdated
- Some Cisco partner pages return 403 to automated access

Plan for "API research and confirm" tasks in every adapter buildout, not clean spec-to-code.

---

## 6. Cisco API License v1.2 (July 2024) — legal summary

- **Non-sublicensable, non-transferable** — cannot pass API access to others (forces per-tenant credentials)
- **Section 5(a) non-compete clause:** prohibits products that "substantially replicate AND compete" — the "and" is critical, our product doesn't replicate CCW, it automates around it
- **Silent on multi-tenant SaaS** — neither permits nor prohibits, gray area but navigable
- **Zero Cisco liability** for API issues
- **Positioning matters:** "complement to CCW" is both legally safer and commercially proven (StrataVAR uses this exact frame)

---

## 7. Pain points validated through forum/industry research

### 7.1 Direct forum quotes (paraphrased)

- Cisco Community thread on CCW API: confirms multiple independent sets of APIs reflecting underlying subsystems; partners rely on contacts at Cisco for guidance because docs are inconsistent.
- HubSpot Community thread (Sept 2024): partners building HubSpot↔CCW integration to update deal stage based on order status — confirms ongoing demand for CCW automation in CRM workflows.
- Cisco Community thread on price estimates: even logged-in users see "Contact Cisco Reseller for Price" if they don't have proper partner association — confirms tenant entitlement complexity.

### 7.2 Industry signals

- Owlytica (Feb 2025) publicly soliciting Cisco partners to help build CCW integration — signals a real gap in the market.
- StrataVAR publishes a public ICP-pricing-rebate-VIP integration story — signals customers will pay for this.
- LinkedIn industry post: "Cisco CCW BOM, Tech Data price updates, Cisco VIP search, and VAR margin pricing on 6,000 item quotes are painful tasks. They will drive any quote operation managers to hire more people, cut corners, and delay customer responses by hours or days."

### 7.3 UX pain points (from research findings + forums)

- Weak version control on estimates/quotes
- Poor save-and-return behavior
- No good notes/comments workflow
- Insufficient grouping/reordering
- Search and placeholder behavior is awkward
- Mixed/incomplete input handling is bad

These are addressable by the engineer review console — making it itself a competitive feature.

---

## 8. Opportunities (consolidated)

1. **Pain is validated, expensive, and acknowledged by Cisco itself** (70%+ of partner time on pre-ordering).
2. **No AI-native competitor exists** — first-mover advantage on the agent + intake side.
3. **"Complement to CCW" positioning is publicly proven** by StrataVAR's success and matches API license requirements.
4. **Cisco 360 raised the stakes** — TCV/ACV accuracy now ties to partner incentive payments (CPI/PVI), making accurate quoting financially material, not just operationally helpful.
5. **BoM-to-quote reconciliation is a wedge feature on its own** — even a narrow MVP that does "stare and compare" well is sellable.
6. **The intake side is genuinely underserved** — every competitor assumes the BoM exists. Our agent designs from requirements (Path B from Shahid's deck).
7. **Working integration patterns already public** — not starting from zero.
8. **Cisco moving toward GraphQL** — direction signal, design adapter layer to swap later.
9. **Engineer review console is itself a differentiator** — competitors lead with import; we should lead with the review experience (line diff, validation flags, version history, comments, save-and-return).
10. **Tenant standards layer is the moat** — per-tenant approved models, defaults, regional rules. Generic Cisco automation alone is a commodity; configurable standards make each deployment opinionated and renewable.
11. **Multi-region demand is real** — most SIs operate across multiple Cisco price lists/regions.

---

## 9. Constraints / limitations (consolidated)

1. **No proper Commerce API sandbox** — dev happens against production.
2. **SOAP/XML on the critical path** — Estimate and Quote APIs are SOAP. Awkward in a modern TS/Node stack.
3. **Resource Owner Password Credentials auth** — every tenant must supply working CCO username/password. Complicates UX, prevents self-serve demo, makes credential expiry a recurring support burden.
4. **Catalog API hard limits** — 1,000 PIDs per request, one priceListId per call. Forces batching for large/multi-region BoMs.
5. **Cisco catalog is volatile** — we cannot replicate it. Always call live; cache short-lived.
6. **CCW validation logic cannot be duplicated** — we get to be helpful (deterministic checks), not authoritative. Authoritative pass/fail comes from Prepare Configuration SOAP API.
7. **API license non-compete** + silent on multi-tenant — manageable via "complement" framing and per-tenant credentials, but Section 5(a) needs ongoing legal awareness.
8. **Documentation fragmentation** — every adapter likely encounters undocumented quirks. Plan accordingly.
9. **Validation rule logic lives in domain experts' heads, not code** — extracting per-domain rules into testable code is the real bottleneck on adding domains, not engineering throughput.
10. **DevNet Specialization needs 5 people** — current team is 3. Not blocking (Developer tier is fine) but worth noting.
11. **First-tenant onboarding UX is the hardest moment** — pasting CCO credentials into our app. Needs deliberate design, not discovery in the first sales call.
12. **Multi-tenant SaaS license gray area** — we should keep tenant credentials siloed (per-tenant Secrets Manager scope), positioning consistent ("complement"), and be ready to make the case if Cisco asks.

---

## 10. Recommended Phase 1 scope

Goal: smallest scope that is genuinely sellable to multiple SIs, demonstrates the differentiation, and leaves room to grow.

### 10.1 Features (in priority order)

Each feature is annotated with how it maps to the two-test principle (NTT win + future SI viability).

1. **Tenant onboarding + API readiness check** — guided UI flow: paste credentials, run Hello API exercise, validate partner association, confirm API entitlements. Stores credentials in AWS Secrets Manager, KMS-wrapped, scoped per tenant. *NTT does this once with our help; the same flow serves SI #2 onwards. Architecture is multi-tenant; UX polish is deferred until paying customers exist.*

2. **Customer intake portal (white-label-ready, not white-label-polished)** — per-tenant subdomain and theme tokens supported architecturally; manually configured for NTT in pilot. *Self-serve theming UI is a Phase 2 polish item. Architecture exists from day one to avoid a retrofit later.*

3. **Configurable standards layer (the moat, NTT-shaped in v1)** — per-tenant configuration of approved product families, preferred support terms, region/country restrictions, default accessories, approved alternates, engineering rules. *Configured for NTT's standards in pilot; reused architecturally for any future tenant. Same code, different config.*

4. **Cisco API adapter layer for three APIs** — Catalog (REST/JSON), Estimate (SOAP/XML), Customer Registry (REST/JSON). Skip Prepare Configuration full integration in v1 (use deterministic checks instead). Skip Quote API in v1 (handoff via advisor). *Generic across all tenants. Per-tenant credentials, shared adapter code.*

5. **AI agent for two domains: Access Switching + Wireless** — highest-volume, lowest-complexity-per-line. Skip Security/Firepower in v1. *Same agent for any tenant. Domain expansion is Phase 2 regardless of who the customer is.*

6. **Engineer review console (the differentiator and seat-driving surface)** — line diff (provided BoM vs proposed), validation flags, accept/edit/reject per line, comments, version history, save-and-return. *Identical UX for any tenant. SaaS revenue depends on this being good.*

7. **Deterministic validation engine** — nine rules from Shahid's deck, scoped to supported domains: SKU existence, EoX, region availability, PoE math, optics count, PSU redundancy, license-vs-scale, stacking, support attachment. All in code, all unit-tested, all using cached Catalog data (no extra Cisco calls). *Shahid's domain expertise as a partner is the input that codifies these rules — that's a real Phase 1 advantage we have over a competitor starting cold.*

8. **CCW Estimate write-back** — produce a draft Estimate via Estimate API, return Estimate ID and CCW URL. *Trust-establishing moment for any tenant: engineer opens the URL and sees the work in CCW.*

9. **Quote-path advisor (NOT automation)** — agent detects RFP/deal-priced/quote scenarios, explains why this needs the quote path, routes engineer to the correct CCW flow with context. *Same logic for any tenant. Avoids silent failure on edge cases.*

10. **Audit log + benchmark harness** — every Cisco request/response captured for support; 20–30 representative scenarios with known-good outputs run on every CI build. Target the 90% match number from Shahid's deck. *Doubly important: the benchmark is what we show NTT to make the case; if NTT passes, the same numbers are what we show SI #2.*

### 10.2 Explicitly out of Phase 1

- Full Quote API automation
- Deal registration / OIP automation
- Distributor reconciliation ("stare and compare")
- Multi-vendor quoting
- Security / Firepower domain
- Pricing approvals / discount strategy automation
- Send-to-customer email flows
- CRM/CPQ write-back (ConnectWise, Salesforce)
- Renewal management (CCW-R)
- Autonomous no-review approvals

These belong on the roadmap, not in v1.

---

## 11. Comparison with Shahid's PPT Phase 1

| Dimension | Shahid's deck | Our Phase 1 | Why different |
|---|---|---|---|
| Customer | Internal NTT presales team | Multi-tenant SaaS for SIs/telecoms | Pivot already made — independent product |
| Domain coverage | All Cisco domains (R&S, Collab, Wireless, Security, DC) | Access Switching + Wireless only | 90% match across all domains is unrealistic in v1; Firepower complexity alone would consume the build |
| Both intake paths | ✓ | ✓ | Aligned |
| AI agent | "API preferred or Cisco creds to draft/export" | API-only, Resource Owner Password Credentials | Auth flow corrected; UI scraping isn't viable at multi-tenant scale |
| Validation flags | 9 rules listed | Same 9, scoped to supported domains | Aligned but rules need codification |
| CCW export | Mentioned | Core deliverable, write-back via Estimate API | Aligned, but I'd make this the trust-establishing moment |
| Engineer review console | Implicit | Explicit, prominent, the differentiator | Forum research + SaaS unit economics make this the headline |
| Tenant standards layer | Not mentioned | Core Phase 1 feature | The moat for SaaS |
| API readiness onboarding | Not mentioned | Core Phase 1 feature | Without it, tenants fail before using the product |
| Quote scenarios | Out of scope | "Advisor + handoff" | Silently failing on RFP scenarios is worse than handling them as handoffs |
| Acceptance criteria | 90% match | 90% match, scoped to supported domains | Same target, narrower scope makes it real |
| White-labeling | Not mentioned | Core Phase 1 feature | SIs won't pilot a non-branded portal |
| Out-of-scope items | Pricing, discounts, deal reg, distributor, multi-vendor | All those + Security domain + full Quote API + send-to-customer | Cutting more to make room for review console quality |
| Business pitch | Time savings ($5.5M/mo at NTT scale) | Same + Cisco 360 CPI/PVI angle | Cisco 360 reframes accuracy as tied to incentive money — sharper pitch |

**Net:** The deck is directionally right but scope-aggressive. It tries to span all Cisco domains and treats the agent's autonomous behavior as the headline. Our Phase 1 narrows the domain to make the 90% target real, makes the engineer review console and tenant standards layer as prominent as the agent, and adds onboarding/readiness/white-labeling that the deck doesn't address.

---

## 12. MVP design principles

### 12.1 The product is Cisco-domain, not client-specific

The product automates Cisco presales engineering work. Everything it does — SKU lookup, BoM assembly, validation, estimate creation — is grounded in public Cisco documentation, Cisco APIs, and Cisco's own configuration rules. This is what makes it demonstrable to any SI without modification.

A new client should be able to:
1. Provide their Cisco partner credentials
2. Get a working product immediately (sensible Cisco defaults)
3. Optionally configure their own standards on top

### 12.2 Sensible defaults from public Cisco sources

The validation rules, SKU selection logic, licensing patterns, and service attachment rules all come from public Cisco documentation — data sheets, ordering guides, EoX bulletins, and the CCW workflow patterns documented in `ccw_workflow_patterns.md`. Shahid reviews and validates these rules as a Cisco-certified engineer, but the source of truth is Cisco's own published material, not any client's internal processes.

This means:
- Benchmark scenarios are synthetic-but-realistic, built from public Cisco reference architectures
- Validation rules work without per-client configuration
- The demo works for any SI walking up to it cold

### 12.3 Multi-tenant architecture from day one

The cost of multi-tenant architecture is small now and prohibitive to retrofit later:
- Database schema with tenant isolation (Postgres RLS or equivalent)
- Per-tenant Secrets Manager scoping for Cisco credentials
- Per-tenant configuration tables for the standards layer
- Theme token system for branding (subdomain, logo, colors)
- Adapter layer that's tenant-agnostic — same code, per-tenant credentials at call time
- Audit log keyed by tenant_id

### 12.4 What we deliberately defer

- Self-serve onboarding UI polish (manual onboarding with our help is fine for first clients)
- Self-serve white-label theming UI (manually configured per tenant in v1)
- Polished tenant admin console for managing standards (CLI or direct DB in v1; UI later)
- CRM/CPQ write-back integrations (per-tenant, expensive, not Phase 1)
- Mail platform integrations for send-to-customer (manual export in v1)

### 12.5 What does NOT change between clients

The core Phase 1 shape is the same for every client: narrow domain (Access Switching + Wireless), engineer review console, deterministic validation, CCW Estimate write-back, quote-path advisor, audit log. The only things that change per client are credentials, optional standards overrides, and branding — all configuration, never code.

---

## 13. Open questions / decisions still to make

1. **Tech stack final decisions** — Mohammad's spec proposed React/Next.js/TypeScript/ECS Fargate/Postgres+pgvector/Redis. Reasonable defaults but not locked. Especially: do we need pgvector for Phase 1, or can we defer RAG until we have real CVDs to embed?

2. **Build effort and timeline** — Mohammad's spec said ~10 weeks, ~$108K. Hasn't been validated against the revised Phase 1 scope.

3. **Validation rule codification** — How do we structure the work of turning Cisco's public documentation (data sheets, ordering guides, EoX bulletins) into testable rules? Shahid reviews/validates, but the source is Cisco's published material. This is the foundation everything else depends on.

4. **First client pipeline** — NTT is the named first target (Shahid is inside). Who are the next 3–5 SIs? Prep this list early.

5. **Pricing model** — $50–100/user/month vs. per-estimate vs. per-tenant tiered. Affects unit economics and how we frame the product.

6. **Credential onboarding UX** — biggest design problem in the product. Every client sees this flow. Needs a wireframe before build.

7. **Benchmark scenario creation** — need 20–30 synthetic-but-realistic Access Switching + Wireless scenarios from public Cisco reference architectures. This is what the 90% match number is measured against.

8. **Phase 2 roadmap visibility** — how much do we commit to publicly? Security/Firepower domain, deal registration, architecture diagrams — what order, what timeline? Prospects will ask.

9. **Resourcing for non-engineering work** — pen test, SOC 2 readiness, legal review of the multi-tenant API license question. On the path to selling but not engineering work.

---

## 14. Source references

### 14.1 Cisco official sources

- Cisco Commerce Xpress Connect Guide (PDF, 2019): https://www.cisco.com/E-Learning/gbo-ccw/cdc_bulk/Cisco_Commerce_B2B_Implementation_Guides/Access_Authorization/Xpress_Connect_Guide/Cisco_Commerce_Xpress_Connect_Guide.pdf
- Cisco Commerce Catalog Web Service Implementation Guidelines: https://www.cisco.com/E-Learning/gbo-ccw/cdc_bulk/Cisco_Commerce_B2B_Implementation_Guides/Catalog/Commerce_Catalog_Web_Services/Commerce_Catalog_Web_Services_IG.pdf
- Manage Estimate Web Services (SOAP): https://www.cisco.com/c/dam/en_us/buy/b2b/secure-tech-docs/manage-estimatews-v06-final.pdf
- Cisco Operations API Portal: https://developer.cisco.com/site/Operations-API-Portal/
- Cisco Commerce Estimates and Configurations User Guide: https://www.cisco.com/web/fw/tools/commerce/ccw-docs/Docs/Cisco_Commerce_Estimates_and_Configurations_User_Guide.pdf
- B2B GraphQL UAT API (MuleSoft Anypoint): https://anypoint.mulesoft.com/exchange/portals/cisco-prod/b93eac27-23fb-4561-b80e-ec7c68a12386/b2b-graphql-uat-api/
- DevNet Sandbox catalog: https://developer.cisco.com/site/sandbox/

### 14.2 Cisco Community / forums

- API for CCW thread (incl. StrataVAR's Raphael Epstein): https://community.cisco.com/t5/operations-exchange/api-for-ccw/td-p/2679003
- HubSpot ↔ CCW integration discussion: https://community.hubspot.com/t5/APIs-Integrations/Cisco-Commerce-API-integration/m-p/331298
- CCW price estimate (entitlement gotcha): https://community.cisco.com/t5/other-network-architecture-subjects/cisco-commerce-workspace-ccw-price-estimate/td-p/2948902

### 14.3 Competitor / industry sources

- StrataVAR PqW overview: https://www.stratavar.com/pqw-overview
- StrataVAR Cisco Partner 360 / CPI / PVI guide: https://www.stratavar.com/blog/cisco-partner-360-cpi-pvi-guide
- StrataVAR "cut time-to-quote 90%": https://www.stratavar.com/blog/cisco-var-want-to-cut-time-to-quote-by-90
- StrataVAR CCW integration benefits: https://www.stratavar.com/blog/ccw-integration-the-top-5-benefits-of-an-integrated-quoting-process
- StrataVAR "hidden cost of CPQ for VARs and MSPs": https://www.stratavar.com/blog/the-hidden-cost-of-cpq-for-vars-and-msps
- StrataVAR Design-to-Quote white paper (the source for the "cannot be duplicated" quote): http://docplayer.net/38452512-Increasing-cisco-partner-profitability-with-design-to-quote-automation.html
- Owlytica "Fix Cisco Quoting & Renewals" (Feb 2025): https://owlytica.com/fix-cisco-quoting-renewals-ccw-ccw-r/
- VARStreet Cisco marketplace: https://www.varstreetinc.com/solutions/cisco-marketplace
- QuoteWerks Cisco integration: https://www.quotewerks.com/Cisco.asp
- Salesforce AppExchange — StrataVAR PqW: https://appexchange.salesforce.com/appxListingDetail?listingId=a0N3000000B5UL8EAN
- LinkedIn industry post on VAR pain (Aug 2020): https://www.linkedin.com/pulse/cisco-ccw-bom-tech-data-price-list-without-copy-paste-epstein

### 14.4 Open source integration examples

- Community Python client: https://github.com/oboehmer/Cisco-CCW
- Cisco SE team example: https://github.com/CiscoSE/ccwquery

---

## 15. Notes for future Claude sessions

- **The domain is Cisco, not NTT.** The product automates what Cisco presales engineers do. SIs like NTT are buyers who employ people doing this work manually. Everything is grounded in public Cisco documentation, APIs, and configuration rules.

- **The MVP must work out of the box for any SI.** It ships with sensible defaults from public Cisco sources. Per-client configuration (credentials, standards, branding) is minimal. No rebuild between clients.

- **NTT is the named first target, not the product owner.** Shahid (a partner) is inside NTT, which is a sales advantage. But the product is not NTT-shaped. If NTT passes, the same product pitches to SI #2 without changes.

- **The team is three partners** — Danish (developer), Mohammad, and Shahid (Cisco-certified network engineer at NTT DATA).

- **Long-term ambition is broad** — automate Cisco engineering work as deeply as the technology allows, eventually including architecture diagrams and design work. Phase 1 is the entry point, not the ceiling.

- **Mohammad's production implementation spec** has been set aside. Do not use it as authoritative — refer back only as historical reference. Specifically, its OAuth flow assumption (client_credentials) is wrong; correct flow is Resource Owner Password Credentials.

- **Shahid's PPT is a partner brief.** It carries weight because Shahid is a partner and Cisco-certified, but Phase 1 scope is determined by what automates real Cisco engineering work generically, not by what NTT specifically needs. Access + Wireless is the agreed Phase 1 domain set.

- **Shahid's value is Cisco domain expertise**, not NTT-specific knowledge. He validates that the agent's outputs match what a competent Cisco engineer would produce. The validation rules come from public Cisco sources (data sheets, ordering guides, EoX bulletins); Shahid confirms we got them right.

- **"Complement to CCW" framing is non-negotiable** — both for legal (API license non-compete in Section 5(a)) and commercial (StrataVAR precedent) reasons. Never market as a CCW replacement.

- **Never replicate the Cisco catalog or validation logic.** Always defer to live API for catalog data; defer to Prepare Configuration for authoritative validation. Our value is the workflow around those, not a copy of them.

- **Additional reference document:** `ccw_workflow_patterns.md` contains structured CCW mechanics extracted from Cisco engineer tutorial transcripts — how SKU discovery works, bundle vs standalone decisions, licensing patterns, option selection, the data sheet → ordering guide → CCW pipeline, quick quote workflow, deal registration (Phase 2+), and key rules/gotchas. Use it as the agent's behavioral reference.

---

*End of document.*

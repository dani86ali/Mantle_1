# BOMatic — Product Scope (Phased)

## Approach

This is a comprehensive product, not a stripped-down MVP. Time is not a constraint. Features are included because they belong in the product, not cut to save build time. No customer approach until Phase 3 or Phase 4 is complete.

The phases below represent a build sequence, not a market release plan.

---

## Phase 1 — Core estimate automation

The foundation: intake → agent → validation → CCW Estimate → engineer review → export.

### Cisco API adapters
- [ ] OAuth adapter (Resource Owner Password Credentials flow, token caching in Redis at 50min TTL)
- [ ] Catalog v2.0 adapter (REST/JSON): getItem, getMappedServices, batching ≤1000, caching
- [ ] Estimate v1.0 adapter (SOAP/XML): createEstimate, updateEstimate, acquireEstimate, shareEstimate
- [ ] Customer Registry v2.0 adapter (REST/JSON): searchCustomer, validateCustomer

### AI agent
- [ ] Agent runtime: direct Anthropic SDK tool-use loop, no agent framework
- [ ] Step A — Intake parsing: Haiku normalizes free text, extracts BoM rows from uploads
- [ ] Step B — SKU suggestions: Path A (match uploaded BoM via Haiku), Path B (design from requirements via Sonnet)
- [ ] Step C — Deterministic validation: 9 rules run against candidate BoM (see validation rules below)
- [ ] Step D — BoM assembly: call Estimate API createEstimate, receive Estimate ID + CCW URL
- [ ] Step E — Summary generation: Sonnet produces assumptions, exclusions, open questions
- [ ] Fix loop: when validation fails, Sonnet proposes substitutions grounded in errors (max 3 iterations)
- [ ] Quote-path detection: Haiku scans intake for RFP/RFQ/special pricing signals, attaches advisory

### Validation rules (Access Switching + Wireless)
| Rule | What it checks |
|---|---|
| SKU existence | Every proposed SKU exists in Catalog API response |
| EoX status | No end-of-life/end-of-sale SKUs in the BoM |
| Region availability | Every SKU available in the intake's region/country + price list |
| PoE math | Sum of PoE class × port count ≤ PSU budget per switch |
| Optics count | SFP/QSFP slots in chassis ≥ transceiver line items |
| PSU redundancy | If redundancy requested: PSU count ≥ 2 × chassis count |
| License attachment | Every hardware SKU has a license attached (Network Essentials/Advantage, DNA) |
| Stacking | If stacking requested: stacking cables present, count matches topology |
| Support attachment | SmartNet or equivalent service attached to hardware SKUs |

### Intake portal
- [ ] Structured form: customer name, region/country, domain, key needs (free text), quantities/ports/capacity, PoE requirements, redundancy/stacking, license tier preference, support term, constraints
- [ ] Path A: upload existing BoM (CSV, XLSX, pasted text)
- [ ] Path B: submit requirements for AI-generated BoM
- [ ] Paste-email assist: paste a customer email, Haiku extracts and proposes field values for confirmation
- [ ] Customer name autocomplete via Customer Registry API
- [ ] File parsing: CSV (papaparse), XLSX (sheetjs)
- [ ] PDF BoM parsing

### Engineer review console
- [ ] Queue view: list of completed BoMs awaiting review
- [ ] BoM detail view: line items table with SKU, description, qty, unit price, validation status
- [ ] Diff view: side-by-side comparison (uploaded BoM vs proposed) for Path A
- [ ] Per-line actions: accept, edit, reject
- [ ] Validation flags per line with explanations
- [ ] Agent summary panel: assumptions, exclusions, open questions
- [ ] Comments per line and per BoM
- [ ] Save draft / continue later (incomplete reviews persist)
- [ ] Version history: every edit creates a version, engineer can view/compare previous versions

### Export
- [ ] CCW Estimate URL display + "Open in CCW" button
- [ ] CSV export matching the Price Estimate template format (Part Number, Smart Account Mandatory, Description, Service Duration, Lead Time, Unit List Price, Pricing Term, Qty, Unit Net Price, Disc%, Extended Net Price)
- [ ] Export header: customer name, address, date, Estimate ID, Deal ID, Price List
- [ ] Export footer: Product Total, Service Total, Subscription Total, Total Price

### Infrastructure
- [ ] Database schema with tenant isolation (Postgres RLS, tenant_id on every table)
- [ ] Per-tenant encrypted credential storage
- [ ] Redis for Catalog cache + token cache + job queues
- [ ] Background job processing (BullMQ) for agent runs
- [ ] Audit log: every Cisco API call, every agent step, every engineer action
- [ ] Benchmark harness: 20+ scenarios with known-good outputs, 90% match target

### Tenant setup
- [ ] Guided credential onboarding (10-state machine: LEAD → CCO_ID_VERIFIED → SAMT_ENTITLEMENT_GRANTED → APP_REGISTERED → HELLO_API_PASSED → API_ACCESS_REQUESTED → API_ACCESS_GRANTED → CREDS_LOADED → STAGING_VALIDATED → LIVE)
- [ ] Configurable standards with sensible defaults: approved product families, preferred license tier, default support term, region restrictions, approved alternates
- [ ] Per-tenant branding: logo, primary color, subdomain
- [ ] Global Price List Emerging (USD) as default price list

---

## Phase 2 — Authoritative validation + quote retrieval + email intake

Adds Cisco's authoritative configuration validation, quote retrieval for deal-priced scenarios, and email as a first-class intake channel.

### Cisco API adapters
- [ ] Prepare Configuration v2.0 adapter (SOAP/XML): validateConfig, findServices, searchItem
- [ ] Quote v2.0 adapter (SOAP/XML): listQuote, acquireQuote (read-only — quotes are created by the Cisco AM in CCW)

### Email intake service
- [ ] Tenant-monitored mailbox integration (Microsoft Graph API for M365, IMAP IDLE for Google Workspace)
- [ ] Body extraction (email-reply-parser), attachment handling (pdf-parse, sheetjs, mammoth)
- [ ] Haiku populates intake fields from unstructured email body
- [ ] Sender resolution against tenant's known customer list
- [ ] Failure handling: too vague → flag for engineer; unknown sender → flag for triage; corrupt attachment → proceed with body only

### Send-to-customer service
- [ ] Tenant SMTP integration (email comes from SI's own domain, not ours)
- [ ] Haiku drafts email body from agent summary using tenant-configured template
- [ ] Engineer reviews and edits draft before sending
- [ ] BoM attached as PDF (server-side rendering) + CSV
- [ ] CCW URL embedded in email body
- [ ] Fallback: mailto: link with pre-filled body if tenant SMTP unavailable
- [ ] Audit: every send event captured

### Agent enhancements
- [ ] RAG over Cisco Validated Designs (pgvector): ingest CVDs for Access Switching + Wireless, use in Path B BoM design
- [ ] Authoritative validation via Prepare Configuration validateConfig before Estimate API call
- [ ] Quote retrieval when intake indicates deal-based pricing (listQuote + acquireQuote)

### Domain expansion
- [ ] Security / Firepower domain (bundles, TMC licensing, management platform selection)
- [ ] Meraki domain (cloud-managed, different licensing model)
- [ ] Corresponding validation rules for new domains

### Platform
- [ ] Real-time notifications (SSE for new completed BoMs in engineer's browser)
- [ ] Mock-Cisco-API mode for demo/onboarding (lets engineers see value during Cisco access approval wait)
- [ ] 60-day API change SLA tracking (ingest partner-integrations newsletter, auto-create tickets)
- [ ] Multi-region price list support (multiple priceListIds per tenant)

---

## Phase 3 — CRM/CPQ integrations + deal workflows + admin polish

Adds outbound integrations, deal registration, and self-serve tenant management.

### CRM/CPQ write-back
- [ ] ConnectWise PSA integration (REST API, per-tenant API key)
- [ ] Salesforce CPQ integration (REST API, per-tenant OAuth connected app)
- [ ] QuoteWerks integration (REST API, per-tenant API key)

### Deal workflows
- [ ] Deal registration / OIP automation (questionnaire logic, technology mix, customer/AM mapping)
- [ ] Distributor reconciliation ("stare and compare" CCW estimate vs distributor quote)
- [ ] Buy method recommendation (Cisco Direct vs Distribution)

### Tenant admin console (self-serve)
- [ ] Self-serve tenant onboarding UI
- [ ] Self-serve white-label theming
- [ ] Standards management UI (approved models, alternates, regional rules)
- [ ] User management + roles
- [ ] SSO/OIDC with client's IdP (Okta, Microsoft Entra ID, Google Workspace)
- [ ] Credential rotation management
- [ ] Mailbox configuration UI
- [ ] Distributor API key management

### Platform
- [ ] CS dashboards: tenant onboarding status, stalled-state alerts, SLA tracking
- [ ] Per-engineer dashboard: in-flight estimates, completed, metrics (estimates/week, time saved, flag rates)
- [ ] Operational runbooks: incident response, credential compromise, Cisco API outage handling

---

## Phase 4 — Domain expansion + advanced features

### Domain expansion
- [ ] Data Center / UCS domain
- [ ] Collaboration domain
- [ ] SD-WAN domain

### Advanced features
- [ ] Architecture diagram generation from BoM
- [ ] Network design recommendations (topology, redundancy, capacity planning)
- [ ] Browser extensions (Outlook/Gmail "Quote this email")
- [ ] Renewal management (CCW-R Contract Admin + Subscription APIs)
- [ ] Order status tracking (Order Status + Serial Number APIs)

### Long-term (team decision pending)
- [ ] Multi-vendor expansion: Juniper, Arista, Palo Alto, HPE/Aruba vendor adapters
- [ ] OR deeper Cisco vertical: all Cisco domains + design + renewals
- [ ] Enterprise license option ($250K–$500K one-time, buyer self-hosts)

---

## What stays out permanently (by design)

- Discount negotiation / pricing strategy — handled by Cisco AM post-submission
- Autonomous no-review approvals — human-in-the-loop is a feature, not a limitation
- Replacing CCW — we complement it, never replicate it

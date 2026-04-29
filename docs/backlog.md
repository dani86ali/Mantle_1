# BOMatic — Backlog

## Approach

Work is organized by phase. Each phase is completed before moving to the next. Time is not a constraint — comprehensiveness is. No customer approach until Phase 3 or Phase 4 is complete.

---

## Phase 1 — Core estimate automation

### Foundation
- [ ] Scaffold Next.js monorepo with TypeScript, Tailwind, Drizzle ORM
- [ ] Postgres schema + initial migration (all tables from architecture.md, including indexes)
- [ ] Redis setup (cache + token store + job queues)
- [ ] BullMQ worker skeleton with dead letter queue
- [ ] Docker Compose for local dev (Postgres 16 + pgvector, Redis 7)
- [ ] Environment config (.env, secrets structure, CISCO_API_MODE)
- [ ] HTTP security headers middleware (CSP, X-Frame-Options, HSTS, etc.)
- [ ] Input validation middleware (Zod schemas, file size limits, content type checks)
- [ ] Role-based auth middleware (engineer, tenant_admin, super_admin)
- [ ] First commit with all docs in place

### Cisco API adapters
- [ ] SOAP adapter feasibility test: attempt to load Cisco Estimate WSDL with soap/strong-soap npm. If fails, plan for manual XML via fast-xml-parser. Do this FIRST.
- [ ] OAuth adapter (ROPC flow, per-tenant token caching, 50min TTL, refresh token handling, re-auth fallback)
- [ ] Catalog adapter (getItem with batching ≤1000, getMappedServices, Redis caching)
- [ ] Estimate adapter (SOAP/XML — createEstimate, updateEstimate, acquireEstimate, shareEstimate)
- [ ] Customer Registry adapter (searchCustomer, validateCustomer)
- [ ] Per-tenant Cisco API rate tracking (Redis counters, adaptive backoff on 429)
- [ ] Credential expiry mid-job handling (pause + resume, not restart)
- [ ] Adapter tests with mocked Cisco API responses
- [ ] First live Cisco API call (requires real credentials)

### AI agent
- [ ] Agent runtime (direct Anthropic SDK tool-use loop)
- [ ] Step A: intake parsing (Haiku normalizes free text, extracts BoM rows)
- [ ] Step B Path A: BoM matching (Haiku normalizes uploaded SKUs, reconciles against intake)
- [ ] Step B Path B: BoM design (Sonnet designs candidate BoM from requirements + Catalog data)
- [ ] Step C: validation orchestration (run all 9 deterministic rules)
- [ ] Fix loop: Sonnet proposes substitutions on validation failure (max 3 iterations)
- [ ] Step D: BoM assembly (call Estimate API createEstimate)
- [ ] Step E: summary generation (Sonnet produces assumptions, exclusions, open questions)
- [ ] Step F: quote-path detection (Haiku scans for RFP/quote signals)
- [ ] BullMQ job integration (intake → queue → agent → result)

### Agent guardrails
- [ ] Agent run timeout: 5 minutes max, auto-kill and notify
- [ ] Per-call LLM timeout: 60 seconds
- [ ] Per-call Cisco API timeout: 30 seconds
- [ ] Token budget per agent run: 50K input / 15K output
- [ ] Per-tenant daily token budget with 80% warn / 100% pause
- [ ] Output sanity bounds: 1–200 line items, $0–$5M total price
- [ ] Hallucination detection: every SKU must have a Catalog API lookup — no unverified SKUs
- [ ] Fix loop constraint: error count must decrease each iteration or abort
- [ ] Token usage logging per agent run

### Validation engine
- [ ] Rule runner (engine.ts)
- [ ] Rule: SKU existence
- [ ] Rule: EoX status
- [ ] Rule: Region availability
- [ ] Rule: PoE math
- [ ] Rule: Optics count
- [ ] Rule: PSU redundancy
- [ ] Rule: License attachment
- [ ] Rule: Stacking
- [ ] Rule: Support attachment
- [ ] Unit tests for all 9 rules (positive + negative cases)

### Intake portal
- [ ] Structured intake form (all fields from user-flow.md)
- [ ] Path A: file upload (CSV, XLSX) + paste BoM text
- [ ] Path B: structured requirements form
- [ ] Paste-email assist (Haiku extracts fields, proposes values for confirmation)
- [ ] PDF BoM parsing
- [ ] Customer name autocomplete via Customer Registry API
- [ ] File upload security: type whitelist (CSV, XLSX, PDF only), 10MB limit, no macro execution
- [ ] Intake submission → API route → database → BullMQ job

### Engineer review console
- [ ] Queue view (list of completed BoMs)
- [ ] BoM detail view (line items + validation flags)
- [ ] Per-line accept/edit/reject
- [ ] Diff view (Path A: uploaded vs proposed)
- [ ] Agent summary panel
- [ ] Comments per line and per BoM
- [ ] Save draft / continue later
- [ ] Version history (every edit creates a version)
- [ ] Quote-path advisory display
- [ ] Optimistic locking on bom_drafts (version column, HTTP 409 on conflict)
- [ ] Engineer assignment: one engineer per BoM, "currently being reviewed by" indicator

### Export
- [ ] CCW Estimate URL display + "Open in CCW" button
- [ ] CSV export (Price Estimate template format matching Shahid's real outputs, UTF-8 with BOM)
- [ ] XLSX export (sheetjs, formatted columns, no formulas — computed values only)
- [ ] Export header/footer (customer info, totals, Cisco legal disclaimer)

### Tenant setup
- [ ] 10-state onboarding machine (state transitions, validation at each gate)
- [ ] Guided credential entry UI
- [ ] API readiness check (Hello API, Catalog test, Estimate test)
- [ ] Configurable standards with sensible defaults
- [ ] Per-tenant branding (logo, primary color, subdomain)
- [ ] Global Price List Emerging (USD) as default
- [ ] Tenant locale config (date/time format, timezone, number format)

### Mock data layer
- [ ] CISCO_API_MODE=mock environment variable support in all adapters
- [ ] Mock Catalog API responses: ~100 SKUs (all from Shahid's estimates + common Catalyst 9000 series)
- [ ] Mock getMappedServices responses for each hardware SKU
- [ ] Mock Estimate API responses (SOAP XML — create, update, acquire)
- [ ] Mock Customer Registry responses (NTT Data, Dimension Data, 3–5 other SI names)
- [ ] Error response mocks (SKU not found, auth failure, rate limit, timeout)
- [ ] Mock latency simulation (200–500ms delay)
- [ ] Mock error injection via CISCO_MOCK_ERROR env var (rate_limit, auth_failure, timeout)
- [ ] Mock data stored as JSON files in tests/mocks/

### Infrastructure
- [ ] Audit log (every Cisco call, agent step, engineer action — append-only)
- [ ] Multi-tenant isolation (RLS, per-tenant Redis keys, per-tenant credentials)
- [ ] Database indexes (all indexes from architecture.md)
- [ ] Queue failure handling: dead letter queue, engineer notification, retry from UI, failure categorization
- [ ] Benchmark harness (20+ scenarios, 90% match target, CI integration)
- [ ] Terraform: VPC, ECS, RDS, ElastiCache, S3, Secrets Manager, KMS, CloudFront, WAF
- [ ] Dockerfile for production container
- [ ] CI/CD pipeline (GitHub Actions → ECR → ECS)
- [ ] Data retention lifecycle (see architecture.md retention table)
- [ ] Backup config: RDS automated backups (7-day PITR), nightly pg_dump to S3 cross-region

### Internationalization
- [ ] Intl.DateTimeFormat with tenant locale for all date display
- [ ] Intl.NumberFormat with tenant locale for all number/currency display
- [ ] UTC storage for all timestamps, tenant-timezone display
- [ ] No hardcoded date/number format strings anywhere

### Monitoring
- [ ] CloudWatch log groups per service
- [ ] OpenTelemetry instrumentation on agent runtime, adapters, and API routes
- [ ] Key metric dashboards (agent duration, API latency, error rates, queue depth)
- [ ] Alerting: tenant credential failure → admin email, dead letter jobs → dev team, API error rate → dev team

### Demo readiness
- [ ] Prepare demo walkthrough script (one Path A, one Path B scenario)
- [ ] Prepare demo outputs using Shahid's real estimate formats as reference
- [ ] Ensure end-to-end flow works smoothly for demo

---

## Phase 2 — Authoritative validation + email intake + send-to-customer

### Cisco API adapters
- [ ] Prepare Configuration v2.0 adapter (SOAP — validateConfig, findServices, searchItem)
- [ ] Quote v2.0 adapter (SOAP — listQuote, acquireQuote)

### Email intake service
- [ ] Microsoft Graph webhook integration (M365 tenants)
- [ ] IMAP IDLE integration (Google Workspace)
- [ ] Body extraction (email-reply-parser)
- [ ] Attachment handling (pdf-parse, sheetjs, mammoth)
- [ ] Haiku field population from unstructured email
- [ ] Sender resolution against tenant customer list
- [ ] Failure handling (too vague, unknown sender, corrupt attachment)

### Send-to-customer service
- [ ] Tenant SMTP integration (Microsoft Graph / Gmail API)
- [ ] Haiku email draft from agent summary + tenant template
- [ ] Engineer review before send
- [ ] BoM PDF attachment (server-side rendering via Puppeteer)
- [ ] CSV attachment
- [ ] Fallback: mailto: link
- [ ] Audit logging for every send event

### Agent enhancements
- [ ] RAG corpus: ingest CVDs for Access Switching + Wireless into pgvector
- [ ] RAG retrieval in Path B BoM design (domain × scale × constraints filter)
- [ ] Authoritative validation via Prepare Configuration validateConfig
- [ ] Quote retrieval via Quote API when deal-based pricing detected
- [ ] Design-proposal cache (Redis, reuse similar requests)

### Domain expansion
- [ ] Security / Firepower domain support
- [ ] Meraki domain support
- [ ] Validation rules for new domains

### Platform
- [ ] Real-time notifications (SSE push for new completed BoMs)
- [ ] Mock-Cisco-API mode (demo/onboarding value during access approval wait)
- [ ] 60-day API change SLA tracking (newsletter ingestion → alert)
- [ ] Multi-region price list support
- [ ] Cisco API outage fallback (cached-data draft + "unvalidated" flag)

---

## Phase 3 — CRM/CPQ integrations + deal workflows + admin

### CRM/CPQ write-back
- [ ] ConnectWise PSA integration
- [ ] Salesforce CPQ integration
- [ ] QuoteWerks integration

### Deal workflows
- [ ] Deal registration / OIP automation
- [ ] Distributor reconciliation ("stare and compare")
- [ ] Buy method recommendation

### Self-serve tenant admin
- [ ] Self-serve onboarding UI
- [ ] Self-serve white-label theming
- [ ] Standards management UI
- [ ] User management + roles
- [ ] SSO/OIDC (Okta, Entra ID, Google Workspace)
- [ ] Credential rotation management
- [ ] Mailbox configuration UI

### Operations
- [ ] CS dashboards (tenant status, stalled alerts, SLA tracking)
- [ ] Per-engineer dashboard (queue, metrics, time saved)
- [ ] Operational runbooks (incident response, credential compromise, API outage)

---

## Phase 4 — Domain expansion + advanced features

- [ ] Data Center / UCS domain
- [ ] Collaboration domain
- [ ] SD-WAN domain
- [ ] Architecture diagram generation from BoM
- [ ] Network design recommendations
- [ ] Browser extensions (Outlook/Gmail "Quote this email")
- [ ] Renewal management (CCW-R APIs)
- [ ] Order status tracking (Order Status + Serial Number APIs)
- [ ] Multi-vendor expansion OR deeper Cisco vertical (team decision)

---

## Permanently out of scope

- Discount negotiation / pricing strategy (handled by Cisco AM)
- Autonomous no-review approvals (human-in-the-loop is a feature)
- Replacing CCW (we complement it)

---

## Rules

- Complete each phase before moving to the next
- Do not skip Phase 1 items to start Phase 2 work
- When implementing a feature, keep changes small and focused
- If a change appears outside the current phase, flag it instead of implementing it
- Do not change architecture without updating the docs
- Prefer checkpoints and incremental progress

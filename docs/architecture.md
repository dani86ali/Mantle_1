# BOMatic — Architecture

## Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Single language across frontend + backend. Consistent types everywhere. |
| Framework | Next.js 14 (App Router) | Portal + review console + admin + API routes in one deployable unit. |
| Styling | Tailwind CSS | Fast iteration, utility-first, per-tenant theming via CSS variables. |
| Database | Amazon RDS PostgreSQL + pgvector | Relational data, tenant isolation via RLS, JSONB for flexible BoM storage. pgvector for RAG over CVDs (Phase 2). Multi-AZ for HA. |
| ORM | Drizzle ORM | Type-safe, lightweight, good migration support. |
| Cache | Amazon ElastiCache Redis | Cisco Catalog API response cache, OAuth token cache, job queues, design-proposal cache. Primary + replica for HA. |
| Background jobs | BullMQ (Redis-backed) | Agent runs are long-running (10–60s). Queues, retries, concurrency control. |
| LLM | Anthropic Claude via @anthropic-ai/sdk | Haiku for extraction/parsing. Sonnet for BoM design and reasoning. Direct tool-use loop, no agent framework. |
| SOAP client | soap or strong-soap (npm) | For Estimate API (SOAP/XML) and future Prepare Configuration + Quote adapters. |
| Validation | Zod | Form validation on intake. Schema validation on API responses and LLM outputs. |
| Auth | NextAuth.js + Amazon Cognito | Engineer login. Cognito with OIDC federation to tenant IdP (Okta, Entra ID, Google Workspace). |
| Email (Phase 2) | Microsoft Graph API / Gmail API | Monitored mailbox intake + send-to-customer via tenant SMTP. |
| PDF rendering | Puppeteer or @react-pdf/renderer | Server-side BoM PDF generation for email attachments (Phase 2). |
| Compute | AWS ECS Fargate | Stateless containers for Next.js app and BullMQ worker. Auto-scaling based on queue depth. No server management. |
| CDN / Edge | Amazon CloudFront + AWS WAF | CDN for static assets, WAF for basic protection, per-tenant subdomain routing. |
| API Gateway | Amazon API Gateway | Public-facing API entry. Rate limiting, request validation. |
| Storage | Amazon S3 | Uploaded BoM artifacts, raw email archives, audit log archive. SSE-KMS encryption. Object Lock on audit bucket for immutability. S3 Glacier lifecycle for archives. |
| Secrets | AWS Secrets Manager + KMS | Per-tenant Cisco credentials encrypted at rest. Per-tenant KMS CMK. Every secret read logged via CloudTrail. |
| Monitoring | Amazon CloudWatch + OpenTelemetry | Logs, metrics, APM. Datadog or Grafana Cloud for dashboards (decision pending). |
| Security | AWS GuardDuty + Security Hub + Config | Security baseline across the AWS Organization. |
| CI/CD | GitHub Actions + Terraform | OIDC federation to AWS. Terraform for infra-as-code. ECR for container images. |
| Networking | VPC + private subnets + NAT Gateway | Database and cache in private subnets. VPC endpoints for S3/Secrets/KMS. |
| Region strategy | Single-region per tenant cluster | me-central-1 (GCC), eu-central-1 (EU), us-east-1 (US). Region-pinned data residency. |

## System components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AWS                                        │
│                                                                         │
│  CloudFront (CDN) → WAF → API Gateway → Cognito (Auth)                 │
│         │                                                               │
│  ┌──────┴──────────────────────────────────────────────────────────┐    │
│  │                    ECS Fargate Cluster                           │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │              Next.js App (Service)                       │   │    │
│  │  │                                                         │   │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │    │
│  │  │  │ Intake   │ │ Review   │ │ Admin    │ │Dashboard │  │   │    │
│  │  │  │ Portal   │ │ Console  │ │ Pages    │ │ Pages    │  │   │    │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │   │    │
│  │  │       └────────────┴────────────┴────────────┘         │   │    │
│  │  │                    API Routes (/api/*)                   │   │    │
│  │  └─────────────────────────┬───────────────────────────────┘   │    │
│  │                            │                                   │    │
│  │  ┌─────────────────────────┴───────────────────────────────┐   │    │
│  │  │              BullMQ Worker (Service)                      │   │    │
│  │  │              Agent Runtime                               │   │    │
│  │  └─────────────────────────┬───────────────────────────────┘   │    │
│  └────────────────────────────┼───────────────────────────────────┘    │
│                               │                                        │
│          ┌────────────────────┼────────────────────┐                   │
│          │                    │                    │                    │
│   ┌──────┴───────┐    ┌─────┴──────┐    ┌───────┴──────┐             │
│   │ RDS Postgres  │    │ElastiCache │    │     S3       │             │
│   │ + pgvector    │    │  Redis     │    │              │             │
│   │ Multi-AZ      │    │ Primary +  │    │ - artifacts  │             │
│   │               │    │ Replica    │    │ - audit logs │             │
│   │ - tenants     │    │            │    │ - email      │             │
│   │ - intakes     │    │ - catalog  │    │   archive    │             │
│   │ - bom_drafts  │    │   cache    │    │ - exports    │             │
│   │ - reviews     │    │ - token    │    │              │             │
│   │ - audit_log   │    │   cache    │    │ Object Lock  │             │
│   │ - rag_chunks  │    │ - queues   │    │ on audit     │             │
│   └───────────────┘    └────────────┘    └──────────────┘             │
│                                                                        │
│   ┌───────────────┐    ┌────────────┐    ┌──────────────┐             │
│   │ Secrets       │    │ KMS        │    │ CloudWatch   │             │
│   │ Manager       │    │ Per-tenant │    │ + OTel       │             │
│   │ Per-tenant    │    │ CMKs       │    │              │             │
│   │ credentials   │    │            │    │ Logs/Metrics │             │
│   └───────────────┘    └────────────┘    └──────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
  ┌─────┴──────┐        ┌─────┴──────┐        ┌─────┴──────┐
  │ Catalog    │        │ Estimate   │        │ Customer   │
  │ Adapter    │        │ Adapter    │        │ Registry   │
  │ (REST)     │        │ (SOAP)     │        │ Adapter    │
  └─────┬──────┘        └─────┬──────┘        └─────┬──────┘
        │                     │                      │
┌───────┴────── Phase 2 ──────┴──────────────────────┤
│                                                    │
  ┌─────┴──────┐                              ┌─────┴──────┐
  │ Prepare     │                              │ Quote      │
  │ Config      │                              │ Adapter    │
  │ Adapter     │                              │ (SOAP)     │
  └─────┬───────┘                              └─────┬──────┘
        │                                            │
        └────────────────┬───────────────────────────┘
                         │
                  ┌──────┴────────────────────────┐
                  │    Cisco Commerce APIs         │
                  │    (apix.cisco.com)            │
                  │    + OAuth (id.cisco.com)      │
                  └────────────────────────────────┘
```

## Repo structure

```
bomatic/
├── AGENTS.md                    # Claude CLI rules and guardrails
├── README.md                    # Repo overview
├── docker-compose.yml           # Local dev: Postgres + Redis
├── Dockerfile                   # Production container build
├── docs/
│   ├── prd.md                   # Product requirements
│   ├── mvp-scope.md             # Phased scope (Phase 1–4)
│   ├── user-flow.md             # How the product works
│   ├── architecture.md          # This file
│   ├── backlog.md               # Prioritized work
│   └── progress.md              # Current status
├── reference/
│   ├── phase1_research_findings.md    # Market research + competitive analysis
│   ├── ccw_workflow_patterns.md       # CCW mechanics from Cisco engineer transcripts
│   ├── business-strategy.md           # Pricing, GTM, competitive matrix, risk analysis
│   └── shahid-ground-truth.md         # Real estimate outputs + daily workflow
├── infra/                       # Terraform infrastructure-as-code
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── modules/
│   │   ├── vpc/
│   │   ├── ecs/
│   │   ├── rds/
│   │   ├── elasticache/
│   │   ├── s3/
│   │   ├── secrets/
│   │   ├── cdn/
│   │   └── monitoring/
│   └── environments/
│       ├── dev/
│       ├── staging/
│       └── prod-gcc/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (portal)/            # Customer-facing intake portal routes
│   │   ├── (console)/           # Engineer review console routes
│   │   ├── (admin)/             # Tenant admin routes
│   │   ├── (dashboard)/         # Dashboard routes
│   │   ├── api/                 # API routes
│   │   │   ├── intake/
│   │   │   ├── review/
│   │   │   ├── export/
│   │   │   ├── admin/
│   │   │   └── onboarding/
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── agent/               # AI agent runtime
│   │   │   ├── agent.ts         # Main agent loop (tool-use)
│   │   │   ├── tools.ts         # Tool definitions for Claude
│   │   │   ├── prompts.ts       # System prompts
│   │   │   └── steps/
│   │   │       ├── parse.ts       # Step A: intake parsing
│   │   │       ├── suggest.ts     # Step B: SKU suggestions
│   │   │       ├── validate.ts    # Step C: validation orchestration
│   │   │       ├── assemble.ts    # Step D: BoM assembly + Estimate API
│   │   │       ├── summarize.ts   # Step E: engineer summary
│   │   │       └── detect-quote.ts # Step F: quote-path detection
│   │   ├── adapters/            # Cisco API adapters
│   │   │   ├── auth.ts          # OAuth token management (ROPC flow)
│   │   │   ├── catalog.ts       # Catalog v2.0 (REST/JSON)
│   │   │   ├── estimate.ts      # Estimate v1.0 (SOAP/XML)
│   │   │   ├── customer.ts      # Customer Registry v2.0 (REST/JSON)
│   │   │   ├── prepare-config.ts # Prepare Configuration v2.0 (SOAP) — Phase 2
│   │   │   ├── quote.ts         # Quote v2.0 (SOAP) — Phase 2
│   │   │   └── types.ts         # Cisco API request/response types
│   │   ├── validation/          # Deterministic validation engine
│   │   │   ├── engine.ts        # Rule runner
│   │   │   ├── rules/
│   │   │   │   ├── sku-exists.ts
│   │   │   │   ├── eox.ts
│   │   │   │   ├── region.ts
│   │   │   │   ├── poe.ts
│   │   │   │   ├── optics.ts
│   │   │   │   ├── psu.ts
│   │   │   │   ├── license.ts
│   │   │   │   ├── stacking.ts
│   │   │   │   └── support.ts
│   │   │   └── types.ts
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle ORM schema
│   │   │   ├── queries.ts
│   │   │   └── migrations/
│   │   ├── queue/
│   │   │   └── agent-job.ts
│   │   ├── tenant/
│   │   │   ├── context.ts       # Tenant context middleware
│   │   │   ├── credentials.ts   # Credential retrieval + decryption
│   │   │   ├── standards.ts     # Tenant standards loader
│   │   │   └── onboarding.ts    # 10-state machine
│   │   ├── email/               # Phase 2
│   │   │   ├── intake.ts        # Monitored mailbox service
│   │   │   ├── send.ts          # Send-to-customer service
│   │   │   └── templates.ts     # Tenant email templates
│   │   └── export/
│   │       ├── csv.ts           # CSV generation (Price Estimate format)
│   │       ├── pdf.ts           # PDF rendering — Phase 2
│   │       └── crm.ts           # CRM/CPQ write-back — Phase 3
│   ├── components/
│   │   ├── portal/              # Intake form components
│   │   ├── console/             # Review console components
│   │   ├── admin/               # Admin components
│   │   ├── dashboard/           # Dashboard components
│   │   └── shared/              # Common UI components
│   └── types/
│       ├── intake.ts
│       ├── bom.ts
│       ├── validation.ts
│       ├── tenant.ts
│       └── cisco.ts
├── tests/
│   ├── benchmark/               # 90% match benchmark harness
│   │   ├── scenarios/           # Test scenario files (JSON)
│   │   ├── expected/            # Expected outputs
│   │   └── runner.ts
│   ├── adapters/                # Cisco API adapter tests
│   ├── validation/              # Validation rule unit tests
│   └── agent/                   # Agent integration tests
├── worker.ts                    # BullMQ worker entry point
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── tailwind.config.ts
└── .env.example
```

## Key database tables

```sql
-- Tenant isolation via RLS; every table has tenant_id
tenants (id, name, slug, region, price_list_id, branding_config, standards_config, onboarding_state, created_at)
tenant_credentials (id, tenant_id, cco_username_enc, cco_password_enc, client_id_enc, client_secret_enc, updated_at)

-- Intake records
intakes (id, tenant_id, path, source, customer_name, region, domain, requirements_json, uploaded_file_url, raw_email_s3_url, status, created_at)
-- source: 'ui_form' | 'paste_email' | 'email_monitor'

-- Agent processing
agent_runs (id, tenant_id, intake_id, step, status, llm_calls_json, cisco_calls_json, started_at, completed_at)

-- BoM drafts (optimistic locking via version column)
bom_drafts (id, tenant_id, intake_id, agent_run_id, version, assigned_engineer_id, lines_json, validation_report_json, summary, estimate_id, ccw_url, quote_advisory, status, created_at, updated_at)
-- version: integer, starts at 1, incremented on every update. Used for optimistic locking.
-- assigned_engineer_id: only one engineer can actively review a BoM at a time

-- Reviews
reviews (id, tenant_id, bom_draft_id, engineer_id, decision, line_overrides_json, comments_json, created_at)

-- Export / delivery tracking
exports (id, tenant_id, bom_draft_id, type, destination, payload_json, created_at)
-- type: 'csv' | 'ccw' | 'crm' | 'email_to_customer'

-- Audit log (append-only)
audit_log (id, tenant_id, event_type, actor_id, payload_json, created_at)

-- Onboarding state tracking
onboarding_events (id, tenant_id, from_state, to_state, notes, created_at)

-- RAG corpus (Phase 2)
rag_chunks (id, tenant_id, source_doc, chunk_text, embedding vector(1536), metadata_json, created_at)
```

## Cisco API adapter layer

### Auth flow (Resource Owner Password Credentials — ROPC)
```
POST https://id.cisco.com/oauth2/default/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
&client_id={tenant_client_id}
&client_secret={tenant_client_secret}
&username={tenant_cco_username}
&password={tenant_cco_password}

→ { access_token, token_type, expires_in }
→ Cache in Redis with 50-minute TTL (10min safety margin under 60min validity)
```

### Adapter design rules
- Every adapter call goes through `auth.ts` to get a valid token
- Token is per-tenant (keyed by tenant_id in Redis)
- Catalog responses cached in Redis: prices 24h TTL, EoX flags 1h TTL, keyed (tenant_id, sku, price_list_id)
- Catalog getItem: batch ≤1000 SKUs per request, one price_list_id per request
- Estimate adapter handles SOAP envelope construction and XML parsing
- All requests and responses logged to audit_log
- Retry with exponential backoff: max 3 attempts, initial delay 1s
- Each adapter pinned to a specific API version
- When Cisco changes an API (60-day notice), only the affected adapter file is updated
- Adapter layer is the ONLY code that talks to Cisco — no direct HTTP calls from any other module

### Cisco API outage fallback
If Cisco APIs are completely unavailable (not a transient error but a full outage):
- Agent creates draft BoM from cached Catalog data where available
- Deterministic validation runs against cached data
- BoM flagged as "unvalidated — Cisco APIs unavailable"
- Estimate write-back queued for retry when APIs recover
- Engineer sees clear warning and can still review the draft

## Multi-tenant isolation

- **Database:** RDS PostgreSQL Row-Level Security. Every row has `tenant_id`. Every query filtered.
- **Credentials:** AWS Secrets Manager with per-tenant KMS CMK. Every secret read logged via CloudTrail.
- **Cache:** ElastiCache Redis keys prefixed with `tenant:{tenant_id}:`
- **Storage:** S3 with SSE-KMS encryption. Per-tenant bucket or prefix isolation. Object Lock on audit bucket.
- **Jobs:** BullMQ jobs carry `tenant_id` in payload. Worker loads tenant context before processing.
- **API routes:** Tenant resolved from Cognito auth session. No tenant_id in URL paths.
- **RAG embeddings:** Per-tenant vector space in pgvector. No shared embedding space across tenants.
- **Networking:** VPC with private subnets for database, cache, and secrets. No public access to data layer.
- **Region:** Data stays in the tenant's assigned region (me-central-1, eu-central-1, or us-east-1).

## LLM usage

| Step | Model | Input tokens (est.) | Output tokens (est.) | Purpose |
|---|---|---|---|---|
| Intake parsing | Haiku | ~500 | ~200 | Normalize free-text fields, extract BoM rows from uploads |
| Email field extraction | Haiku | ~1K | ~300 | Populate intake fields from unstructured email body |
| BoM design (Path B) | Sonnet | ~5K | ~2K | Design candidate BoM from requirements |
| BoM design with RAG (Phase 2) | Sonnet | ~20K | ~4K | Design BoM with CVD context |
| BoM cross-check (Path A) | Haiku | ~1K | ~500 | Compare uploaded BoM against intake requirements |
| Fix loop (when validation fails) | Sonnet | ~3K | ~1K | Propose substitutions grounded in validation errors |
| Engineer summary | Sonnet | ~3K | ~500 | Generate assumptions, exclusions, open questions |
| Quote-path detection | Haiku | ~500 | ~200 | Scan intake for quote signals |
| Email draft (Phase 2) | Haiku | ~1K | ~500 | Draft customer-facing email from summary |

Estimated per-estimate cost: $0.02–$0.15 (Path A), $0.30–$0.60 (Path B with RAG).

## Design rules

- Keep Cisco logic isolated in the adapter layer
- Keep shared types centralized in `src/types/`
- All validation rules are deterministic — no LLM in validation decisions
- Agent uses direct Anthropic SDK tool-use — no LangChain, LangGraph, or CrewAI
- Frontend components do not import from `src/lib/adapters/` — adapters are server-only
- Human review is always mandatory — no auto-approval path
- Do not change architecture without updating the docs
- Prefer checkpoints and incremental progress — small, focused changes
- All AWS infrastructure defined in Terraform — no manual console changes
- No secrets or credentials in the repo — ever
- Per-tenant data never leaves its assigned AWS region

## Local development

For local development, use Docker Compose to run Postgres + Redis locally. The application code is identical — only the connection strings change. Cisco API calls use mock mode (`CISCO_API_MODE=mock`) until real credentials are available.

```
docker-compose.yml provides:
- postgres:16 with pgvector extension
- redis:7
- application connects via DATABASE_URL and REDIS_URL env vars
```

AWS infrastructure is used for staging and production only. Local development does not require an AWS account.

---

## Application security

### Input validation
- All intake form inputs validated with Zod schemas on both client and server
- HTML entities escaped in all user-supplied text before storage and display
- SQL injection prevented by Drizzle ORM parameterized queries (never raw SQL in application code)
- File upload types restricted: CSV, XLSX, PDF only. All other types rejected.
- File upload size limit: 10MB per file. Enforced at API Gateway and application layer.
- Uploaded files scanned for malicious content before parsing (sheetjs, pdf-parse, papaparse all run in sandboxed context)
- Free-text fields (key needs, constraints, comments) capped at 5,000 characters

### Authentication and authorization
- All API routes require authentication via NextAuth.js + Cognito session
- Three roles: `engineer` (intake, review, export), `tenant_admin` (settings, credentials, standards, users), `super_admin` (cross-tenant, internal only)
- Route-level role checks enforced in middleware, not in individual handlers
- Public routes: none. Not even the intake portal — it requires at minimum a tenant-scoped session
- Session tokens: httpOnly, secure, sameSite=strict cookies. 24-hour expiry. Refresh on activity.

### HTTP security headers
- Content-Security-Policy: strict, no inline scripts
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=31536000; includeSubDomains
- Referrer-Policy: strict-origin-when-cross-origin
- CORS: per-tenant origin whitelist. No wildcard.

### Rate limiting
- API Gateway: 100 requests/second per tenant (burst), 50 sustained
- Per-tenant Cisco API call tracking: warn at 80% of observed Cisco rate limit ceiling, pause at 95%
- Agent job submission: max 20 concurrent jobs per tenant (prevents one tenant from exhausting worker capacity)

### File upload security
- Files stored in S3 with tenant-scoped prefix, never served directly to client
- File content parsed server-side only — never executed, never rendered as HTML
- PDF parsing uses pdf-parse in read-only mode (no JavaScript execution)
- XLSX parsing uses sheetjs in read-only mode (no macro execution)
- Original uploaded files preserved in S3 for audit; parsed output stored separately

---

## Agent guardrails

### Timeouts
- Maximum agent run duration: 5 minutes. If exceeded, job is marked AGENT_TIMEOUT and engineer is notified.
- Maximum LLM call duration: 60 seconds per call. If exceeded, retry once, then fail the step.
- Maximum Cisco API call duration: 30 seconds per call. Retry with backoff, then fail the step.

### Token budgets
- Maximum input tokens per agent run: 50,000 (prevents runaway context in fix loops)
- Maximum output tokens per agent run: 15,000
- Per-tenant daily token budget: 500,000 input + 150,000 output. Warn at 80%, pause new jobs at 100%. Resets at midnight UTC.
- Token usage logged per agent run for cost tracking

### Output sanity bounds
- Maximum BoM line items per estimate: 200. If the agent produces more, flag for engineer review with warning "unusually large BoM."
- Minimum BoM line items: 1. If the agent produces zero lines, mark AGENT_ERROR.
- Every SKU in the agent's output MUST have a corresponding Catalog API lookup. If a SKU appears in the BoM without a Catalog response, it is flagged as "unverified SKU" — this catches hallucinated SKUs.
- BoM total list price sanity check: if total exceeds $5M or is $0, flag for engineer review.

### Hallucination detection
- After the agent proposes a BoM, every SKU is cross-checked against the Catalog API response cache. Any SKU not present in a Catalog response is flagged.
- The agent is NOT allowed to invent SKUs. Its tool-use loop must call Catalog API before including any SKU.
- If the agent proposes a SKU that returns "not found" from Catalog API, the fix loop must either find a valid substitute or remove the line and flag it.

### Fix loop constraints
- Maximum 3 fix iterations (already specified)
- Each iteration must reduce the error count or change the approach. If error count doesn't decrease after an iteration, abort the loop and pass to engineer.
- Fix loop cannot add SKUs that weren't retrieved from Catalog API

### Graceful degradation
- If Anthropic API is down: agent cannot run. Jobs queue with status WAITING_FOR_LLM. Engineer notified. No partial execution.
- If Cisco API is down: agent uses cached data where available, flags output as "unvalidated." See Cisco API outage fallback section.
- If both are down: jobs queue. No processing. Engineer sees clear status.

---

## Concurrent access and optimistic locking

### Problem
Two engineers may open the same BoM for review. If both edit and save, the second save would silently overwrite the first.

### Solution
Optimistic locking via `version` column on `bom_drafts` table:
- Every bom_draft row has a `version` integer, starting at 1
- When the review console loads a BoM, it receives the current version
- When the engineer saves changes, the API route checks: `WHERE id = :id AND version = :expected_version`
- If the version matches: save succeeds, version increments
- If the version doesn't match: save fails with HTTP 409 Conflict. UI shows "This BoM was modified by another user. Please reload."
- Same pattern applies to reviews table

### Additional rules
- Only one engineer can be assigned to a BoM at a time (queue assignment model, not free-for-all)
- If an engineer has a BoM open for review and another engineer tries to open it: show "Currently being reviewed by [name]" with option to take over (which notifies the first engineer)

---

## Cisco API rate limiting

### Problem
Cisco's per-tenant API rate limits are not publicly documented. We must discover and respect them.

### Strategy
- Track all Cisco API calls per tenant per hour in Redis: `tenant:{id}:cisco_calls:{api}:{hour}`
- Log every 429 (Too Many Requests) response with full context
- On first 429: record the request count at which it occurred as the observed ceiling for that API + tenant
- Adaptive backoff: when call count reaches 80% of observed ceiling, slow down (add 500ms delay between calls)
- At 95% of observed ceiling: pause new agent jobs for that tenant, notify tenant admin
- Per-tenant dashboard: show current API usage vs observed limit
- If no 429 ever observed: use a conservative default of 100 calls/hour/API as starting estimate

### Queue throttling
- BullMQ concurrency per tenant: configurable, default 3 concurrent agent jobs
- If a tenant's Cisco API is rate-limited, reduce their concurrency to 1 and add inter-call delays
- Other tenants are unaffected — rate limiting is per-tenant, never global

---

## ROPC token refresh strategy

### How ROPC tokens work with Cisco
- ROPC grant returns an `access_token` (60min validity) and may return a `refresh_token`
- If `refresh_token` is present: use it to obtain new access tokens without re-sending credentials
- If `refresh_token` is NOT present: re-authenticate with username/password every ~50 minutes

### Implementation
- On first auth: store both access_token (50min TTL) and refresh_token (if present) in Redis
- Before each API call: check if access_token is still valid in cache
- If expired and refresh_token exists: call token endpoint with `grant_type=refresh_token`
- If expired and no refresh_token: call token endpoint with `grant_type=password` using stored credentials from Secrets Manager
- If refresh fails (e.g., refresh_token expired): fall back to full re-auth with password
- If full re-auth fails: mark tenant credentials as invalid, pause all jobs, notify tenant admin

### Security
- Access tokens stored in Redis only (volatile, per-tenant key, 50min TTL)
- Refresh tokens stored in Secrets Manager alongside credentials (persistent, encrypted)
- Raw CCO passwords are NEVER logged, NEVER cached in Redis — only read from Secrets Manager at auth time

---

## Data retention and lifecycle

### Retention periods
| Data type | Retention | Storage | Lifecycle |
|---|---|---|---|
| Intake records | 3 years | RDS Postgres | Archived to S3 after 1 year, deleted after 3 years |
| BoM drafts | 3 years | RDS Postgres | Same as intakes |
| Reviews | 3 years | RDS Postgres | Same as intakes |
| Audit log | 7 years | RDS Postgres + S3 | Postgres rows archived to S3 after 90 days. S3 transitions to Glacier after 1 year. Deleted after 7 years. Object Lock prevents early deletion. |
| Uploaded files | 1 year | S3 | Transition to Glacier after 90 days. Deleted after 1 year. |
| Raw email archives (Phase 2) | 1 year | S3 | Same as uploaded files |
| Agent run logs | 1 year | RDS Postgres | Archived to S3 after 90 days. Deleted after 1 year. |
| Cisco API response cache | 24 hours (prices), 1 hour (EoX) | Redis | Auto-expires via TTL |
| OAuth tokens | 50 minutes | Redis | Auto-expires via TTL |

### Tenant offboarding
When a tenant terminates their subscription:
1. All active jobs are cancelled
2. Cisco credentials are deleted from Secrets Manager immediately
3. Tenant data is soft-deleted (marked `deleted_at`) in Postgres
4. After 30-day grace period: data is exported to S3 as a tenant archive (encrypted, tenant-accessible)
5. After 90-day grace period: all tenant data permanently deleted from Postgres and S3
6. Audit log entries retained for the full 7-year retention period (regulatory requirement)
7. Tenant admin receives confirmation of deletion at each stage

### GDPR compliance (EU tenants)
- Data subject access request: export all data for a specific customer name across intakes, BoMs, and reviews
- Right to erasure: delete all records referencing a specific customer name (except audit log entries required for regulatory compliance, which are anonymized instead)
- Processing records maintained in audit log
- Data stays in eu-central-1 for EU tenants — never transferred outside the region

---

## Database indexes

```sql
-- Primary access patterns: tenant-scoped queries with status/time filters
CREATE INDEX idx_intakes_tenant_status ON intakes (tenant_id, status);
CREATE INDEX idx_intakes_tenant_created ON intakes (tenant_id, created_at DESC);
CREATE INDEX idx_intakes_customer ON intakes (tenant_id, customer_name);

CREATE INDEX idx_bom_drafts_tenant_status ON bom_drafts (tenant_id, status);
CREATE INDEX idx_bom_drafts_tenant_created ON bom_drafts (tenant_id, created_at DESC);
CREATE INDEX idx_bom_drafts_estimate_id ON bom_drafts (tenant_id, estimate_id);
CREATE INDEX idx_bom_drafts_intake ON bom_drafts (tenant_id, intake_id);

CREATE INDEX idx_reviews_tenant_bom ON reviews (tenant_id, bom_draft_id);
CREATE INDEX idx_reviews_engineer ON reviews (tenant_id, engineer_id, created_at DESC);

CREATE INDEX idx_agent_runs_tenant_intake ON agent_runs (tenant_id, intake_id);
CREATE INDEX idx_agent_runs_status ON agent_runs (tenant_id, status);

CREATE INDEX idx_audit_log_tenant_time ON audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log (tenant_id, event_type, created_at DESC);

CREATE INDEX idx_exports_tenant_bom ON exports (tenant_id, bom_draft_id);

-- Trigram index for customer name search / autocomplete
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_intakes_customer_trgm ON intakes USING gin (customer_name gin_trgm_ops);
```

---

## Queue failure handling

### Job lifecycle
```
PENDING → ACTIVE → (success) COMPLETED
                  → (transient failure) RETRY (max 3 attempts, exponential backoff)
                  → (permanent failure) FAILED → DEAD_LETTER
```

### When a job fails permanently
1. Job moves to BullMQ dead letter queue
2. Intake record status set to `AGENT_FAILED`
3. Failure reason stored in agent_runs table (error message, last successful step, Cisco/LLM error details)
4. Engineer notified: "Your request could not be processed. Reason: [specific error]. You can retry or review manually."
5. Tenant admin notified if the failure is credential-related (expired, invalid, rate-limited)
6. Retry button available in the UI: creates a new agent run for the same intake

### Failure categories and handling
| Failure type | Handling |
|---|---|
| Cisco API auth failure | Pause all tenant jobs. Notify admin. Resume when credentials updated. |
| Cisco API rate limit (429) | Requeue with delay. Reduce tenant concurrency. |
| Cisco API server error (5xx) | Retry with backoff. After 3 retries: fail, notify engineer. |
| Anthropic API error | Retry with backoff. After 3 retries: fail, notify engineer. |
| Agent timeout (>5min) | Fail immediately. Log last known state. Notify engineer. |
| Agent token budget exceeded | Fail immediately. Log token usage. Notify engineer with explanation. |
| SOAP parsing error | Fail immediately. Log raw XML response. Flag for developer investigation. |
| Unexpected error | Fail. Log full stack trace. Notify engineer with generic message. Alert dev team. |

---

## Internationalization

### Phase 1 baseline
- UI language: English only
- Date formatting: use `Intl.DateTimeFormat` with tenant locale. Default: `en-US` for US, `en-GB` for GCC/EU. Never hardcode date format strings.
- Number formatting: use `Intl.NumberFormat` with tenant locale. Respects decimal separators (1,000.00 vs 1.000,00).
- Currency: always USD (Cisco's pricing is in USD on all price lists). Display with `Intl.NumberFormat` currency formatting.
- Timezone: store all timestamps in UTC. Display in tenant's configured timezone.

### Phase 2+ considerations
- RTL layout for Arabic-speaking GCC tenants: use CSS `direction: rtl` and logical properties (`margin-inline-start` instead of `margin-left`). Tailwind CSS supports RTL via the `rtl:` variant.
- Arabic UI text: defer until GCC demand confirms need. English is the working language for most SI engineering teams even in GCC.
- The Cisco estimate output (CSV/XLSX/PDF) stays in English regardless — Cisco SKUs, descriptions, and legal text are English-only.

### Implementation rule
- Never use `new Date().toLocaleDateString()` without explicit locale
- Never format numbers with string concatenation — always use `Intl.NumberFormat`
- All date/time display components accept a `locale` and `timezone` prop sourced from tenant config

---

## Export format details

### CSV export
- Uses the Price Estimate template format from Shahid's real outputs (documented in `reference/shahid-ground-truth.md`)
- Exported with computed values, not formulas (the formulas in Shahid's XLSX are for his internal use — our export is the computed result)
- Header section populated from intake record + tenant config
- Cisco legal disclaimer included verbatim (standard Cisco text, same for all tenants)
- Character encoding: UTF-8 with BOM (for Excel compatibility)

### XLSX export
- Same format as CSV but as a proper Excel workbook
- Generated using sheetjs (xlsx npm package)
- Includes formatting: bold headers, column widths, number formatting on price columns
- No formulas — all values computed
- Single sheet named "Price Estimate"

### PDF export (Phase 2)
- Use @react-pdf/renderer (lighter than Puppeteer, no headless browser needed on Fargate)
- Same content as CSV/XLSX but formatted as a professional document
- Tenant branding: logo in header, company name, contact info
- Generated server-side, stored in S3, attached to customer emails

---

## Backup and disaster recovery

### Database backups
- RDS automated backups: 7-day retention with Point-in-Time Recovery (PITR) enabled
- Nightly logical dumps (pg_dump) to S3 cross-region bucket (e.g., GCC primary in me-central-1, backup in eu-central-1)
- Monthly manual snapshot retained for 1 year

### S3 backups
- S3 cross-region replication enabled for the audit bucket
- Versioning enabled on all S3 buckets
- Object Lock on audit bucket prevents accidental or malicious deletion

### Redis
- ElastiCache daily snapshots retained for 7 days
- Redis data is cache-only (Catalog, tokens, queues) — loss requires re-fetch, not restore

### Recovery procedures
| Scenario | Recovery |
|---|---|
| Database corruption | Restore from PITR to any point in last 7 days |
| Accidental data deletion | Restore from PITR or nightly logical dump |
| Region failure | Restore from cross-region S3 backup to new region. RDS would need manual recreation from logical dump. |
| Redis failure | Failover to replica (automatic with ElastiCache Multi-AZ). Cache rebuilds on first access. |
| S3 data loss | Restore from cross-region replicated bucket |

### RTO / RPO targets
- RTO (Recovery Time Objective): 4 hours for full region failure, <15 minutes for single-service failure
- RPO (Recovery Point Objective): <5 minutes (PITR) for database, <24 hours for cross-region restore

---

## Tenant credential expiry mid-job

### Problem
A tenant's CCO password or OAuth credentials may expire or be rotated while an agent job is in progress. Some Cisco API calls succeed, others fail with auth errors.

### Handling
1. On first auth failure during a job: do NOT immediately fail the entire job
2. Attempt token refresh (if refresh_token exists)
3. If refresh succeeds: continue the job from the current step (not restart from scratch)
4. If refresh fails: attempt full re-auth with stored credentials
5. If re-auth fails: mark the job as `PAUSED_AUTH_FAILURE`
   - Store the current step and all partial results in the agent_runs table
   - Notify tenant admin: "Your Cisco credentials need to be updated"
   - Do NOT discard partial work
6. When admin updates credentials: system offers to resume paused jobs from where they stopped
7. Partial results (e.g., Catalog lookups already done) are preserved in cache and agent_runs — no redundant Cisco API calls on resume

---

## SOAP adapter strategy

### Risk
The npm SOAP libraries (soap, strong-soap) are notoriously unreliable with complex WSDLs like Cisco's OAGIS BOD schemas. This could become a multi-week blocker.

### Strategy
1. **First task when building the Estimate adapter:** attempt to load Cisco's Estimate WSDL with both `soap` and `strong-soap` npm packages
2. If either library parses the WSDL and can construct a valid SOAP envelope: use that library
3. If neither works cleanly: fall back to manual XML construction using `fast-xml-parser`:
   - Hand-build the SOAP envelope as an XML string template
   - Use `fast-xml-parser` to parse XML responses
   - This is more work but eliminates WSDL parsing issues entirely
4. **Test early:** the SOAP adapter feasibility test should be one of the first things built. If it fails, we need to know immediately — not after building everything else around it.
5. The same decision applies to Prepare Configuration and Quote adapters in Phase 2

### Mock SOAP responses
- Mock data for the Estimate adapter should include realistic SOAP XML response bodies
- These can be captured from Cisco's documentation examples or from a single real API call (when credentials are available)
- Mock mode returns these XML responses parsed through the same code path as live mode

---

## Mock data layer

### Purpose
Development proceeds with `CISCO_API_MODE=mock` until real Cisco credentials are available. The mock layer must be realistic enough that:
1. The benchmark harness produces meaningful results
2. The entire UI can be demonstrated end-to-end
3. Switching from mock to live requires zero code changes — only the env var

### Mock data required

**Catalog API mocks:**
- Full getItem responses for all SKUs in Shahid's three real estimates (~50 unique SKUs)
- Additional getItem responses for common Catalyst 9200, 9300, 9400, 9500, 9800, and C9120AX SKUs (~100 total)
- getMappedServices responses for each hardware SKU (which licenses, SmartNet levels, and accessories are valid)
- Responses should include: list price, EoX flag, region availability list, spec data (PoE budget, port count, SFP slots)
- Error responses: SKU not found, region not available, EoX flagged

**Estimate API mocks:**
- createEstimate response: returns a mock Estimate ID and mock CCW URL
- updateEstimate response: returns updated Estimate ID
- acquireEstimate response: returns full estimate with line items
- Error responses: invalid configuration, auth failure, rate limit

**Customer Registry mocks:**
- searchCustomer: returns mock results for "NTT Data", "Dimension Data", and 3–5 other SI names
- validateCustomer: returns validation pass/fail for known test customers
- Error responses: no results found, multiple matches

### Mock data source
- SKU data extracted from Shahid's real XLSX exports (real SKUs, real prices, real descriptions)
- Additional SKUs from public Cisco data sheets and ordering guides
- Stored as JSON files in `tests/mocks/` directory
- Loaded by adapters when `CISCO_API_MODE=mock`

### Mock mode behavior
- Adapter functions have identical signatures in mock and live mode
- Mock responses include realistic latency simulation (200–500ms delay) to test timeout handling
- Mock mode supports error injection: set `CISCO_MOCK_ERROR=rate_limit` to simulate 429s, `auth_failure` for credential errors, `timeout` for slow responses

---

## Monitoring and alerting

### Key metrics
| Metric | Source | Alert threshold |
|---|---|---|
| Agent run duration | Agent runtime | >3 minutes (warn), >5 minutes (critical — timeout) |
| Agent success rate | Agent runtime | <90% over 1 hour |
| Cisco API latency (p95) | Adapter layer | >5 seconds |
| Cisco API error rate | Adapter layer | >5% over 15 minutes |
| Cisco API 429 rate | Adapter layer | Any 429 → warn tenant admin |
| Anthropic API latency (p95) | Agent runtime | >10 seconds |
| Anthropic API error rate | Agent runtime | >2% over 15 minutes |
| Queue depth | BullMQ | >50 jobs waiting (indicates processing bottleneck) |
| Queue oldest job age | BullMQ | >30 minutes (job stuck) |
| Validation pass rate | Validation engine | <70% over 1 day (may indicate data quality issue) |
| Database connection pool | RDS | >80% utilization |
| Redis memory | ElastiCache | >80% utilization |
| Failed jobs (dead letter) | BullMQ | Any → notify engineer + dev team |
| Tenant credential failure | Auth adapter | Any → notify tenant admin immediately |

### Dashboards
- **Ops dashboard:** queue depth, active jobs, agent success rate, API latencies, error rates — for the dev team
- **Tenant dashboard (Phase 3):** estimates processed, average time, validation flag rates, API usage vs limits — for tenant admins
- **Per-engineer dashboard (Phase 3):** queue, completed, in-progress, time saved metrics — for engineers

### Alerting channels
- Critical alerts: PagerDuty or equivalent (dev team)
- Tenant credential alerts: email to tenant admin
- Engineer notifications: in-app (SSE in Phase 2, polling in Phase 1)
- Weekly summary: automated email to dev team with key metrics

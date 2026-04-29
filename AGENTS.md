# AGENTS.md — Rules for AI agents working in this repo

## What this project is

BOMatic automates Cisco presales engineering work — BoM creation, validation, CCW Estimate generation, and customer delivery. It is an independent ISV offering, not affiliated with or endorsed by Cisco Systems. Read `docs/prd.md` for the product definition and `docs/mvp-scope.md` for phased scope.

## Critical Cisco API rules

1. **Never hardcode Cisco credentials.** Always load from per-tenant encrypted storage.
2. **OAuth flow is ROPC (Resource Owner Password Credentials).** NOT client_credentials. Token endpoint: `https://id.cisco.com/oauth2/default/v1/token`. Base URL: `https://apix.cisco.com`. This is non-negotiable — it's how Cisco Commerce APIs work.
3. **Cache OAuth tokens for 50 minutes** (10-minute safety margin under Cisco's 60-minute validity).
4. **Never batch more than 1000 SKUs** in a single Catalog API call. The API returns an error above this limit.
5. **Never send more than one priceListId** per Catalog API call.
6. **Cache Catalog prices for 24 hours, EoX flags for 1 hour.** Cisco catalog changes constantly. Never cache longer.
7. **Always log every Cisco API request and response** to the audit log. No exceptions.
8. **Never create customers in Cisco's Customer Registry automatically.** Flag for engineer review.
9. **The Estimate API uses SOAP/XML.** Do not try to send JSON to it. Use the soap/strong-soap npm package.
10. **All Cisco API calls must go through the adapter layer** (`src/lib/adapters/`). No direct HTTP calls to Cisco from any other module.
11. **There is no proper Commerce API sandbox.** POE paths exist but are undocumented. Development happens against production APIs with defensive code, aggressive caching, and careful testing.
12. **Use `CISCO_API_MODE` environment variable.** Set to `mock` during development (returns mock data from local JSON files), `live` when real credentials are available. Same adapter interface, same types, same error handling — different data source.

## AWS rules

1. **All infrastructure is defined in Terraform.** No manual AWS console changes. Everything reproducible.
2. **Per-tenant credentials go in AWS Secrets Manager** with per-tenant KMS CMK. Never in environment variables, never in the database unencrypted.
3. **S3 audit bucket uses Object Lock.** Immutable audit trail for compliance.
4. **Database and cache live in private subnets.** No public access. VPC endpoints for AWS services.
5. **Every secret read is logged via CloudTrail.** Tied to the requesting service.
6. **Local development uses Docker Compose** (Postgres + Redis). No AWS account needed for dev.

## Architectural rules

1. **Every database table must have a `tenant_id` column.** Multi-tenant isolation is non-negotiable.
2. **Every database query must filter by `tenant_id`.** Use PostgreSQL RLS or enforce in the query layer.
3. **Never access one tenant's data from another tenant's context.**
4. **Agent runs are background jobs (BullMQ).** Never run agent processing in API route handlers — they'll timeout.
5. **The validation engine does NOT call the LLM.** Every validation rule is deterministic with a traceable source of truth. LLM is used for fix suggestions, not for validation decisions.
6. **The agent uses direct Anthropic SDK tool-use.** No LangChain, LangGraph, CrewAI, or other agent frameworks.
7. **Never replicate the Cisco catalog locally.** Always call Catalog API live (with caching).
8. **Never replicate CCW's configuration validation logic.** Our deterministic checks are for fast feedback. Cisco's Prepare Configuration API (Phase 2) is the authority.
9. **Human review is always mandatory.** No auto-approval path exists in the product.
10. **"Complement to CCW, not replacement"** is the non-negotiable product positioning.
11. **Optimistic locking on bom_drafts.** Every save checks the `version` column. Return HTTP 409 on conflict. Never silently overwrite.
12. **Every SKU in agent output must have a Catalog API lookup.** No unverified SKUs. This catches hallucinations.
13. **Agent runs have a 5-minute timeout.** If exceeded, kill the job and notify the engineer.
14. **File uploads are restricted:** CSV, XLSX, PDF only. 10MB max. No macros, no script execution.
15. **All dates stored as UTC.** Display in tenant's configured timezone. Use `Intl.DateTimeFormat`, never hardcoded format strings.
16. **All numbers/currencies formatted via `Intl.NumberFormat`.** Never string concatenation for prices.

## Code rules

1. **TypeScript strict mode.** No `any` types except when interfacing with SOAP responses (document why).
2. **Zod schemas for all external inputs.** Intake forms, Cisco API responses, LLM outputs.
3. **All validation rules must have unit tests.** Each rule in `src/lib/validation/rules/` gets a corresponding test file with positive and negative cases.
4. **Error handling: never swallow errors silently.** Log to audit, surface to user with actionable message.
5. **Use Drizzle ORM for database access.** No raw SQL except in migrations.
6. **Keep components small.** No React component file should exceed 200 lines. Extract sub-components.
7. **Do not use localStorage or sessionStorage** in frontend components. Use React state or server state.
8. **Do not import from `@/lib/adapters/`** in frontend components. Adapters are server-only. Use API routes.

## Workflow rules

1. **Before making major changes, read:**
   - `docs/mvp-scope.md` (what's in which phase)
   - `docs/user-flow.md` (how the product works)
   - `docs/architecture.md` (system design)
   - `docs/backlog.md` (current priorities)
2. **Do not change architecture without updating the docs.** If you restructure adapters, change the database schema, or modify the agent flow, update the relevant docs in the same commit.
3. **Prefer checkpoints and incremental progress.** Keep changes small and focused. Commit often.
4. **Complete each phase before moving to the next.** Do not skip Phase 1 items to start Phase 2 work.
5. **If a requested change appears outside the current phase, flag it** instead of implementing it.

## What NOT to do

1. **Do not build features for domains not yet in scope.** Phase 1 is Access Switching + Wireless. Security, Data Center, Collaboration come later.
2. **Do not automate quote creation.** Phase 1 only advises on quote paths. Phase 2 adds read-only Quote API (listQuote, acquireQuote) but never creates quotes.
3. **Do not build deal registration / OIP features.** Phase 3.
4. **Do not add LangChain or any agent framework.** Direct tool-use with Anthropic SDK.
5. **Do not assume client_credentials OAuth.** The correct flow is ROPC. Always.
6. **Do not assume a Cisco Commerce API sandbox exists.** It doesn't (for our APIs). Code defensively against production.
7. **Do not send emails from our domain.** Customer-facing emails go through the tenant's own SMTP. Phase 2.
8. **Do not auto-create customers in Cisco's registry.** Flag for engineer.

## Reference documents

Read these before working on related areas:

| Area | Document |
|---|---|
| Product definition | `docs/prd.md` |
| Phased scope | `docs/mvp-scope.md` |
| User flows | `docs/user-flow.md` |
| System architecture | `docs/architecture.md` |
| Current priorities | `docs/backlog.md` |
| Where we are | `docs/progress.md` |
| Cisco CCW mechanics | `reference/ccw_workflow_patterns.md` |
| Market research | `reference/phase1_research_findings.md` |
| Business strategy | `reference/business-strategy.md` |
| Real estimate outputs | `reference/shahid-ground-truth.md` |

## Naming conventions

- Files: `kebab-case.ts`
- Components: `PascalCase.tsx`
- Functions/variables: `camelCase`
- Database tables: `snake_case`
- Environment variables: `UPPER_SNAKE_CASE`
- Cisco-specific types: prefix with `Cisco` (e.g., `CiscoCatalogItem`, `CiscoEstimateResponse`)

## Testing

- Unit tests: `tests/validation/` for rules, `tests/adapters/` for Cisco API adapters (mocked)
- Benchmark: `tests/benchmark/` — the 90% match harness. Run with `npm run benchmark`.
- Integration tests: `tests/agent/` — end-to-end agent runs against mocked Cisco APIs
- Before committing: `npm run typecheck && npm run test`

## Environment variables

```env
# Database (local: Docker Compose Postgres; prod: RDS endpoint)
DATABASE_URL=postgresql://...

# Redis (local: Docker Compose Redis; prod: ElastiCache endpoint)
REDIS_URL=redis://...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Cisco OAuth
CISCO_TOKEN_ENDPOINT=https://id.cisco.com/oauth2/default/v1/token
CISCO_API_BASE_URL=https://apix.cisco.com

# Cisco API mode: 'mock' for development, 'live' for real API calls
CISCO_API_MODE=mock

# AWS (production only — not needed for local dev)
AWS_REGION=me-central-1
AWS_ACCOUNT_ID=...

# App
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

Per-tenant Cisco credentials are stored in AWS Secrets Manager (production) or the database encrypted column (development). Never in environment variables.

## ISV disclaimer

This product is an independent ISV offering for Cisco partners. It is not an official Cisco product, is not endorsed by Cisco Systems, and has no commercial relationship with Cisco. The product authenticates against Cisco APIs using partner credentials owned and operated by tenant SIs/VARs, never by the ISV.

# BOMatic — Progress

## Current status: Phase 1 build complete (code written, needs testing)

All 12 build steps completed. Application code covers the full Phase 1 scope.

---

## Completed

### Research
- [x] Market research and competitive analysis
- [x] Cisco API feasibility assessment (all 7 API families)
- [x] Cisco API License v1.2 legal review
- [x] Competitor landscape mapping (StrataVAR, Owlytica, VARStreet, QuoteWerks, ConnectWise, Salesforce CPQ, Responsive/SiftHub, Vivun/Consensus)
- [x] CCW workflow patterns extracted from Cisco engineer transcripts
- [x] Shahid's real estimate outputs analyzed (Routing/Switching, Wireless, Data Center)
- [x] Shahid's presales daily checklist analyzed (10-step workflow, 48hr SLA, 5 submissions/day)
- [x] Mohammad's executive brief reviewed (pricing, GTM, competitive matrix, risk analysis)
- [x] Mohammad's production implementation spec reviewed (10-state onboarding, Cisco API detail, cost model)
- [x] OpenAI/ChatGPT docs reviewed for gaps

### Documentation
- [x] prd.md — Product requirements
- [x] mvp-scope.md — Phased scope (Phase 1–4)
- [x] user-flow.md — All user flows (8 flows including email intake, send-to-customer)
- [x] architecture.md — Tech stack, system components, database schema, adapter layer
- [x] backlog.md — Prioritized by phase
- [x] progress.md — This file
- [x] AGENTS.md — Claude CLI rules and guardrails
- [x] README.md — Repo overview

### Reference docs
- [x] phase1_research_findings.md — Market research, opportunities, constraints
- [x] ccw_workflow_patterns.md — CCW mechanics from Cisco engineer transcripts
- [x] business-strategy.md — Pricing, GTM, competitive matrix, per-region economics, risk analysis
- [x] shahid-ground-truth.md — Real estimate outputs, daily checklist, output format spec

### Phase 1 Build
- [x] Step 1: Project scaffold (Next.js 14, TypeScript strict, Tailwind, Drizzle, Docker Compose, Dockerfile)
- [x] Step 2: Shared TypeScript types (intake, bom, validation, tenant, cisco)
- [x] Step 3: Database schema + migration (all tables, indexes, RLS, optimistic locking)
- [x] Step 4: Mock data layer (30+ SKUs from ground truth, Estimate/Customer mocks, error injection)
- [x] Step 5: Cisco API adapters (auth ROPC, catalog, estimate SOAP/XML, customer registry — all with mock mode)
- [x] Step 6: Validation engine + 9 rules (sku-exists, eox, region, poe, optics, psu, license, stacking, support)
- [x] Step 7: Agent runtime (Anthropic SDK tool-use loop, 6 tools, all step implementations)
- [x] Step 8: BullMQ worker (dead letter queue, error categorization, concurrency control)
- [x] Step 9: Security middleware (auth skeleton, Zod schemas, file upload restrictions)
- [x] Step 10: API routes (intake, review with optimistic locking, export CSV, admin, onboarding 10-state machine)
- [x] Step 11: Frontend pages (intake portal Path A/B, review console with line-level review, admin pages)
- [x] Step 12: Benchmark harness (5 scenarios from ground truth, 90% target, CI exit codes)
- [x] Adapter tests (catalog, estimate, customer — mock mode)
- [x] Validation rule unit tests (all 9 rules, positive + negative cases)

---

## Post-build flags

Features and items identified during post-build review that need attention:

1. **Agent runtime prompt tuning** — System prompts need iteration once the agent is testable end-to-end with real LLM calls. Current prompts are first-draft.
2. **XLSX export not built** — CSV export is implemented; XLSX export (sheetjs, formatted columns, no formulas) is specified in backlog but not yet coded.
3. **Review console diff view not built** — Path A diff view (uploaded BoM vs proposed) is specified but not yet in the review UI.
4. **Review console comments UI not built** — Per-line and per-BoM comment fields are in the API and data model but not yet wired into the review frontend.
5. **Review console version history UI not built** — Version column and optimistic locking work in the API, but the UI for viewing/comparing previous versions is not yet built.
6. **Tenant credential encryption code not written** — Schema and API routes reference encrypted credential columns, but the actual encrypt/decrypt logic (AES-256 for dev, Secrets Manager for prod) is not implemented.
7. **Mock catalog needs expansion** — Currently ~30 SKUs from Shahid's ground truth estimates. Architecture calls for ~100 SKUs covering common Catalyst 9200/9300/9400/9500/9800 and C9120AX/C9130AX/C9136AX series.

### Known issues (code cleanup)

1. **`NETWORK-PNP-LIC` mock description** — `tests/mocks/catalog-responses.json` has garbage repeated words in the description for this SKU.
2. **Unused `pgPolicy` import** — `src/lib/db/schema.ts` imports `pgPolicy` from Drizzle but RLS is handled in the raw SQL migration. Remove the unused import.
3. **Worker dynamic import** — `worker.ts` uses `await import()` for `getIntakeById` to work around circular imports. Refactor to a static import.
4. **Agent parse step is embedded** — The parse step (Haiku normalization) is folded into the suggest prompt rather than being a separate LLM call. Works but is less modular than architecture specifies.
5. **Worker credentials are mock placeholders** — `worker.ts` has hardcoded mock credentials with a TODO. Production path loads from `tenant_credentials` table via Secrets Manager.
6. **`next-env.d.ts` not yet generated** — Created automatically on first `next dev` or `next build`. Referenced in tsconfig.json.
7. **Typecheck not yet verified** — Need `npm install` to complete, then `npm run typecheck`. Expect a few type errors given the code volume.

---

## What's next

1. Run `npm install`
2. Run `npm run typecheck` and fix any type errors
3. Run `docker compose up -d` (Postgres + Redis)
4. Run database migration: `npm run db:push`
5. Run test suite: `npm run test`
6. Run benchmark: `npm run benchmark`
7. Start dev server: `npm run dev` and test UI end-to-end
8. Fix any issues found during testing
9. Address post-build flags (XLSX export, diff view, comments, version history, credential encryption, mock expansion, prompt tuning)

---

## Blockers

- **Cisco API credentials needed.** Cannot test adapters against production Cisco APIs without a working CCO account with partner-level access and a registered application. One of the partners needs to provide or arrange this.

---

## Demo readiness criteria

The product is demo-ready when:
1. End-to-end flow works: intake → agent → validation → CCW Estimate → review → export
2. Both paths work (Path A: BoM provided, Path B: requirements only)
3. All 9 validation rules produce correct results on benchmark scenarios
4. Benchmark harness shows ≥90% match rate
5. Review console is polished enough to walk through with a prospect
6. CSV export matches the Price Estimate template format (matching Shahid's real outputs)
7. At least 2 demo scenarios are scripted and rehearsed (one Path A, one Path B)

---

## Log

| Date | What happened |
|---|---|
| 2026-04-27 | Research phase started. Source documents reviewed. |
| 2026-04-29 | Research phase complete. All product docs written. Mohammad's exec brief and production spec reviewed. Shahid's real estimates and daily checklist analyzed. Ready to start build. |
| 2026-04-29 | Phase 1 build complete. 12 steps implemented: scaffold, types, schema, mocks, adapters, validation (9 rules), agent runtime, BullMQ worker, security middleware, API routes, frontend pages, benchmark harness. ~10K lines of code. Post-build review identified 7 flags (XLSX export, diff view, comments UI, version history UI, credential encryption, mock expansion, prompt tuning) and 7 code cleanup items. |

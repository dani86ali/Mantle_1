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
- [x] XLSX export (sheetjs, formatted columns, number formatting, Price Estimate template)
- [x] File upload on intake form (drag-and-drop CSV/XLSX/PDF, 10MB limit, auto-parse CSV)
- [x] Mock catalog expanded from 30 to 173 SKUs (C9200/9300/9300L/9300X/9800/APs/optics/licenses)
- [x] UI redesign: dark theme enterprise SaaS (9 pages, collapsible sidebar, top bar, design system)
- [x] Persistent AI chat widget (floating panel, drag-drop files, inline BoM tables, quick replies)
- [x] Command palette (Ctrl+K) with search, navigation, quick actions
- [x] Keyboard shortcuts modal (? key) with all shortcuts listed
- [x] Notification center (bell icon dropdown, categorized, unread indicators)
- [x] Customer directory page (/customers) with search, expandable detail, estimate history
- [x] Dashboard charts (cost breakdown donut, status bars, domain distribution, validation flags)
- [x] Product configurator (step-by-step guided SKU configuration with bundle suggestions)
- [x] Print CSS (clean print layout for estimate detail pages)
- [x] WCAG focus indicators (focus-visible outlines on all interactive elements)
- [x] Estimate detail page with 7 sub-tabs (Configuration, Validation, Summary, Export, Sharing, History, Comments)
- [x] Catalog browser with search, domain/family/category/EoX filters, expandable specs
- [x] Coming Soon pages (Deals & Quotes, Orders, Services, Distributor) with feature previews

---

## Post-build flags

Features and items identified during post-build review that need attention:

1. **Agent runtime prompt tuning** — System prompts need iteration once the agent is testable end-to-end with real LLM calls. Current prompts are first-draft.
2. ~~**XLSX export not built**~~ — Done.
3. **Review console diff view not built** — Path A diff view (uploaded BoM vs proposed) is specified but not yet in the review UI.
4. **Review console comments UI not built** — Per-line and per-BoM comment fields are in the API and data model but not yet wired into the review frontend. Estimate detail has a Coming Soon placeholder.
5. **Review console version history UI not built** — Version column and optimistic locking work in the API, but the UI for viewing/comparing previous versions has a Coming Soon placeholder.
6. **Tenant credential encryption code not written** — Schema and API routes reference encrypted credential columns, but the actual encrypt/decrypt logic (AES-256 for dev, Secrets Manager for prod) is not implemented.
7. ~~**Mock catalog needs expansion**~~ — Done. Expanded from 30 to 173 SKUs.

### Skipped UI features (not yet built)

- Side-by-side estimate comparison (select 2-3 estimates and compare)
- @mention in comments (tag engineers or account managers)
- Activity feed per estimate (who viewed, who edited, when)
- "Being edited by" indicator (concurrent editing awareness)
- Bulk import (upload CSV of multiple estimates)
- Templates (save estimate as template, create from template)
- Duplicate estimate (one-click copy with new ID)
- Quick edit mode on estimates table (inline edit without opening detail)
- Dashboard widget drag-and-drop customization
- Table column visibility toggle (show/hide columns)
- Saved filters (save commonly used filter combinations)
- Theme toggle (dark/light mode switch)
- Guided tour (first-time user walkthrough)
- Contextual tooltips on complex UI elements
- "What's new" changelog in user menu

### Known issues (code cleanup)

1. **`NETWORK-PNP-LIC` mock description** — `tests/mocks/catalog-responses.json` has garbage repeated words in the description for this SKU.
2. **Unused `pgPolicy` import** — `src/lib/db/schema.ts` imports `pgPolicy` from Drizzle but RLS is handled in the raw SQL migration. Remove the unused import.
3. **Worker dynamic import** — `worker.ts` uses `await import()` for `getIntakeById` to work around circular imports. Refactor to a static import.
4. **Agent parse step is embedded** — The parse step (Haiku normalization) is folded into the suggest prompt rather than being a separate LLM call. Works but is less modular than architecture specifies.
5. **Worker credentials are mock placeholders** — `worker.ts` has hardcoded mock credentials with a TODO. Production path loads from `tenant_credentials` table via Secrets Manager.
6. ~~**`next-env.d.ts` not yet generated**~~ — Resolved. Generated on first `next dev`.
7. ~~**Typecheck not yet verified**~~ — Resolved. Typecheck clean, 0 errors. 48/48 tests passing.
8. **Old route group directories removed** — `(admin)`, `(console)`, `(portal)`, `(dashboard)` deleted to resolve conflicts with new flat route structure.

---

## What's next

1. **Resolve Anthropic API key issue** — Account has $40 credits but API returns "credit balance too low". Need to activate the account or generate a working key. Chat and agent are blocked until this is resolved.
2. Test chat agent end-to-end with a working API key
3. Tune agent prompts based on real LLM output quality
4. Build diff view for Path A estimates (uploaded vs proposed)
5. Wire up comments and version history UIs to real data
6. Implement tenant credential encryption (AES-256 for dev)
7. Address remaining skipped UI features as needed

---

## Blockers

- **Cisco API credentials needed.** Cannot test adapters against production Cisco APIs without a working CCO account with partner-level access and a registered application. One of the partners needs to provide or arrange this.
- **Anthropic API key not working.** Account shows $40 credits (Default workspace) but API returns "credit balance too low" on all requests. Key is valid and correctly set in .env. Likely needs account activation or support ticket. Chat widget and agent runtime are blocked until resolved.

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
| 2026-04-29 | Phase 1 build complete. 12 steps implemented: scaffold, types, schema, mocks, adapters, validation (9 rules), agent runtime, BullMQ worker, security middleware, API routes, frontend pages, benchmark harness. ~10K lines of code. Post-build review identified 7 flags and 7 code cleanup items. |
| 2026-04-29 | UI redesign complete. Dark theme enterprise SaaS with 9 full pages, collapsible sidebar, top bar, design system. Added XLSX export, file upload, persistent AI chat widget, command palette (Ctrl+K), keyboard shortcuts (?), notification center, customer directory, dashboard charts (donut/bars), product configurator, print CSS, WCAG focus indicators. Mock catalog expanded to 173 SKUs. Old route groups removed. Typecheck clean, 48/48 tests passing, all pages returning 200. Anthropic API key issue unresolved — chat/agent blocked. |

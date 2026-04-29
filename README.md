# BOMatic

AI-powered Cisco presales automation. Takes customer requirements in, produces validated CCW Estimates out.

**Independent ISV. Not affiliated with or endorsed by Cisco Systems.**

## What it does

BOMatic automates the repetitive work Cisco presales engineers do daily:
- Accepts intake via UI form, pasted email, file upload, or monitored mailbox
- Looks up SKUs from Cisco's catalog via Commerce APIs
- Assembles Bills of Materials with correct licenses, services, and accessories
- Validates configurations deterministically (PoE math, EoX, region, stacking, and more)
- Creates draft Estimates in Cisco Commerce Workspace (CCW)
- Presents everything to a human engineer for review and approval
- Exports to CCW, CSV, CRM/CPQ, and directly to the customer via the SI's own email

It complements CCW — it doesn't replace it. CCW remains the source of truth.

## Phased build

- **Phase 1:** Core estimate automation (Access Switching + Wireless)
- **Phase 2:** Authoritative Cisco validation, email intake, send-to-customer, Security/Meraki domains
- **Phase 3:** CRM/CPQ integrations, deal workflows, self-serve admin
- **Phase 4:** Additional domains, architecture diagrams, multi-vendor expansion

No customer approach until Phase 3 or Phase 4 is complete.

## Tech stack

- **Framework:** Next.js 14 (TypeScript)
- **Database:** PostgreSQL + pgvector (multi-tenant via RLS)
- **Cache:** Redis
- **Background jobs:** BullMQ
- **LLM:** Anthropic Claude (Haiku + Sonnet via tool-use)
- **Cisco APIs:** Catalog v2.0, Estimate v1.0, Customer Registry v2.0, Prepare Configuration v2.0, Quote v2.0

## Repo structure

```
docs/           Product definition, scope, flows, architecture, backlog, progress
reference/      Research findings, CCW workflow patterns, business strategy, ground truth data
src/
  app/          Next.js pages and API routes
  lib/
    agent/      AI agent runtime (tool-use loop)
    adapters/   Cisco API adapters (Catalog, Estimate, Customer Registry, + Phase 2)
    validation/ Deterministic validation engine (9 rules)
    db/         Database schema and queries
    queue/      Background job definitions
    tenant/     Multi-tenant utilities (context, credentials, standards, onboarding)
    email/      Email intake + send-to-customer (Phase 2)
    export/     CSV, PDF, CRM write-back
  components/   React components (portal, console, admin, dashboard)
  types/        Shared TypeScript types
tests/
  benchmark/    90% match benchmark harness
  adapters/     Cisco API adapter tests
  validation/   Validation rule tests
  agent/        Agent integration tests
```

## Documentation

| Document | Purpose |
|---|---|
| [AGENTS.md](./AGENTS.md) | Rules and guardrails for AI agents working in this repo |
| [docs/prd.md](./docs/prd.md) | Product requirements |
| [docs/mvp-scope.md](./docs/mvp-scope.md) | Phased scope (Phase 1–4) |
| [docs/user-flow.md](./docs/user-flow.md) | How the product works end to end |
| [docs/architecture.md](./docs/architecture.md) | System architecture and tech stack |
| [docs/backlog.md](./docs/backlog.md) | Prioritized backlog by phase |
| [docs/progress.md](./docs/progress.md) | Current build status |
| [reference/phase1_research_findings.md](./reference/phase1_research_findings.md) | Market research and competitive analysis |
| [reference/ccw_workflow_patterns.md](./reference/ccw_workflow_patterns.md) | CCW mechanics from Cisco engineer tutorials |
| [reference/business-strategy.md](./reference/business-strategy.md) | Pricing, GTM, competitive matrix, risk analysis |
| [reference/shahid-ground-truth.md](./reference/shahid-ground-truth.md) | Real estimate outputs and daily workflow |

## Team

- **Danish** — Partner, developer
- **Claude** — AI developer (primary build)
- **Mohammad** — Partner, business strategy
- **Shahid Khan** — Partner, Cisco-certified network engineer, domain expert

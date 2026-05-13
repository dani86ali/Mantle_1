# BOMATIC — Multi-Vendor Pre-Sales Deliverable Generation Platform

BOMATIC ingests RFPs, RFIs, and raw requirements and produces the artifacts a pre-sales team owes the customer: compliance matrices, priced Bills of Materials, technical proposals, and HLD/LLD design documents. First tenant is **STC Solutions**; first supported vendors are **Cisco** and **Fortinet**.

## Five Sweet Spots

| ID  | Sweet Spot                | Gate | Engine | Intake Path     | Automation       |
|-----|---------------------------|------|--------|-----------------|------------------|
| SS1 | RFP Parser + Compliance   | 2    | E1     | RFP             | AI + validation  |
| SS2 | BoM Construction          | 4    | E2     | RFP / Quick / RFI | Deterministic  |
| SS3 | Proposal Authorship       | 5    | E3     | RFP / Quick / RFI | AI + templates |
| SS4 | RFI Questionnaire         | 2    | E4     | RFI             | AI + validation  |
| SS5 | Design (HLD/LLD)          | 3    | E5     | RFI             | AI + tool-use    |

## Three Intake Modes

- **RFP** — `E1 → E2 → E3`. Parse RFP package, build BoM against the client BoQ, author proposal.
- **Quick BoM** — `E2 → E3`. Skip discovery; price a known component list and wrap a short proposal.
- **RFI** — `E4 → E5 → E2 → E3`. Generate questionnaire, design from responses, build BoM, author proposal.

## Architecture

- **5 engines** (`src/engines/e1`…`e5`) — each owns one Sweet Spot, never imports from another engine.
- **Pipeline coordinator** (`src/coordinator/`) — routes by intake mode, passes typed pipeline state between engines.
- **Deterministic-first** — 65% TypeScript functions, 26% AI-with-validation, 9% pure AI. E2 has zero pure-AI tasks.
- **5 human checkpoints** — one per engine, where an engineer reviews/edits/approves before the next stage runs.

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **PostgreSQL** — tenant-isolated pipeline + catalog data
- **Anthropic Claude** via the `callAI` wrapper (single chokepoint for all AI calls, with retry + post-gate validation)
- **Zod** — runtime validation at every engine boundary

## Key Principles

- **No LLM math.** Arithmetic, catalog lookups, and rule checks are TypeScript functions or DB queries — never Claude calls.
- **200-line file cap.** Split when longer. Engines compose small pure functions.
- **Typed I/O.** Every public function has explicit input and output types; no `any` at engine boundaries.
- **Graceful AI degradation.** AI failure never halts the pipeline: retry once with the error injected, then flag for the engineer and proceed.

## Repository Layout

```
src/
  engines/
    e1/   RFP Parser + Compliance Matrix
    e2/   BoM Construction (BoQ parsers, validation, cost stack)
    e3/   Proposal Authorship (boilerplate + narrative sections)
    e4/   RFI Discovery (questionnaire + response interpretation)
    e5/   Design (topology, HLD, LLD, diagrams)
  coordinator/   Pipeline router, state types, per-engine drivers
  app/           Next.js routes (API + UI)
  lib/           Shared adapters, validation rules, DB, AI wrapper
tests/           Vitest suites alongside engine implementations
docs/            Runtime + build architecture, data inventory
```

## Team

- **Danish** — architect
- **Claude** — AI developer
- **Mohammad** — business strategy
- **Shahid Khan** — domain expert (pre-sales / network engineering)

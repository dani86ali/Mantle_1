# CLAUDE.md

## Karpathy Rules
1. Think before coding — state assumptions, surface tradeoffs, ask if unclear
2. Simplicity first — minimum code that solves the problem, nothing speculative
3. Surgical changes — touch only what you must, match existing style
4. Goal-driven execution — define success criteria, loop until verified

## BOMATIC First Commandment
Never let the LLM do math, lookups, or rule-based validation at runtime. Those are TypeScript functions and DB queries. If you're writing an engine step that does arithmetic, catalog lookup, or rule checking — it is a function, not a Claude API call.

## Architecture Reference
Runtime architecture: ../bomatic_planning/BOMATIC_Runtime_Architecture.md
Build architecture: ../bomatic_planning/BOMATIC_Build_Architecture.md
Task classification: 65% deterministic code, 26% AI+validation, 9% pure AI
E2 (BoM) has ZERO pure-AI tasks — all TypeScript.

## Existing Code — Preserve These
- src/lib/validation/ — 9 deterministic validation rules. Working. Tested. EXTEND, don't rewrite.
- src/lib/adapters/ — Cisco API adapters (auth, catalog, estimate, customer). Working. KEEP.
- src/lib/agent/ — Phase 1 chat agent. FROZEN. Don't modify. Build new engines in src/engines/.
- src/types/ — Existing type definitions. EXTEND with new types, don't break existing.
- src/lib/db/ — Drizzle ORM schema. EXTEND with pipeline tables.

## File Ownership (when both devs are active)
- src/coordinator/, src/engines/e3/, src/engines/e5/, src/ui/ → Lead only
- src/engines/e1/, src/engines/e2/, src/engines/e4/, knowledge-packs/ → Junior only
- src/lib/ → coordinate before editing

## Code Rules
- Max 200 lines per file. Split if longer.
- Every function has typed input and output — no `any` in public interfaces.
- Engine directories never import from other engine directories.
- All inter-engine data flows through the pipeline state types.
- Tests written in same session as implementation, not deferred.

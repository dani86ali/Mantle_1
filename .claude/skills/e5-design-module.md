# Skill: E5 Design Engine Module

For any module inside `src/engines/e5/`. Covers deterministic calculators,
AI-assisted generators, and integration modules.

---

## Architecture context

E5 is the Design Engine (Gate 3). Runtime pattern: **Tool-use** — AI decides
WHAT (topology, narratives), code does IT (sizing, IP planning, port maps,
templates).

Inputs: `requirementsBaseline` from E4 or E1, `frameworksSelected` from E1.
Outputs: `hldDocument`, `lldDocument`, `diagrams`, `ipVlanPlan`,
`componentList` (feeds E2 BoM).

3 AI calls total. Everything else is deterministic code. Source of truth:
Runtime Architecture §4.5, `Design_Patterns.md`, Playbook §3.

---

## E5 pipeline steps

**Phase 1 — HLD:**
1. `selectMethodology` — decision tree (deterministic)
2. `recommendTopology` — AI picks 1 of 6 valid `TopologyPattern` values
3. `calculateSizing` — device specs lookup (deterministic)
4. `checkCompatibility` — DB lookup (deterministic)
5. `generateHLDNarrative` — AI writes 4 sections (deterministic fallback)
6. `populateHLDTemplate` — 12-section docx (deterministic)
7. `generateDiagrams` — draw.io XML (deterministic)
8. **CHECKPOINT** `e5-hld`

**Phase 2 — LLD:**
9. `planIPVlans` — subnet calculation (deterministic)
10. `generatePortMap` — model → port assignment (deterministic)
11. `generateCableSchedule` — topology → cable list (deterministic)
12. `generateQoSPolicy` — vendor-specific templates (deterministic)
13. `selectMigrationApproach` — decision tree (deterministic)
14. `generateLLDNarrative` — AI writes detail sections (deterministic fallback)
15. `populateLLDTemplate` — 21-section docx (deterministic)
16. `generateRackElevation` — device specs → layout (deterministic)
17. `validateCompatibility` — optics, stacking, versions (deterministic)
18. **CHECKPOINT** `e5-lld`

**Output:**
19. `buildComponentList` — aggregate devices for E2 (deterministic)

---

## Deterministic module pattern (steps 1, 3, 4, 9–13, 16–17, 19)

Same as `.claude/skills/e2-deterministic-fn.md` with E5 specifics:

- Import types from `src/engines/e5/types.ts` — never redefine
- Import device data from `src/engines/e5/device-specs.ts` (embedded const
  arrays from `BOMATIC_Device_Specs.json`)
- Pure function, Zod-validated input, JSDoc, no side effects
- Never call AI — these are CODE-only steps
- Return typed output, never throw

Signature pattern:

```ts
export function calculateSizing(
  input: SizingInput,
  topology: TopologyPattern,
  vendor: "cisco" | "fortinet"
): SizingResult
```

---

## AI module pattern (steps 2, 5, 14)

Same as `.claude/skills/ai-task.md` with E5 specifics:

- **Deterministic first**: validate constraints before calling AI
- `callAI` from `src/lib/ai/client.ts` with tight Zod output schema
- **Post-gate validation** after AI returns:
  - Topology recommender: result must be one of 6 valid `TopologyPattern`
    enum values
  - HLD narrative: must reference correct topology name and selected vendor
  - LLD narrative: IP addresses must be valid, port counts must match device
    specs
- On AI failure: return deterministic fallback (never throw)

```ts
const result = await callAI({
  systemPrompt: "You are a network design architect...",
  prompt: `Given these requirements: ...`,
  outputSchema: TopologyRecommendationSchema,
  taskId: "topology-recommender:project-brief",
});
if (!result.success) return deterministicFallback;
// post-gate: validate against known patterns
if (!VALID_TOPOLOGIES.includes(result.data.pattern)) return deterministicFallback;
return result.data;
```

---

## Data sources (deterministic, never AI)

| Data | Source | Used by |
|------|--------|---------|
| Device port counts, PoE, rack units | `src/engines/e5/device-specs.ts` | sizing, port map, rack elevation |
| Topology patterns (6) | `Design_Patterns.md` §6.2 | topology recommender post-gate |
| Security decision tree | `Design_Patterns.md` §6.3 | compatibility validator |
| HLD template (12 sections) | Playbook §3.6 | HLD template population |
| LLD template (21 sections) | Playbook §3.7 | LLD template population |
| Design principles (7) | Playbook §3.2 | HLD/LLD narrative prompts |
| PPDIOO phases | Playbook §3.1 | methodology selector |
| Sizing guidelines | `BOMATIC_Device_Specs.json` `sizing_guidelines` | sizing calculator |

---

## 6 valid topology patterns

| Pattern | When | Key models (Cisco) |
|---------|------|--------------------|
| `two_tier_collapsed_core` | <500 ports, single building | C9500 core + C9300 access |
| `three_tier_core_dist_access` | >1000 ports, multi-building | N9K/C9500 core → C9606R dist → C9200L access |
| `fat_tree_superpod` | NVIDIA DGX HPC | Quantum-2 NDR InfiniBand |
| `slingshot_dragonfly` | HPE Cray HPC | Slingshot-11/400 |
| `hub_and_spoke_gpon` | Hospitality, fiber-to-room | Cisco OLT → ONT per room |
| `ot_it_segmented` | Oil & gas, industrial OT/IT | Industrial firewall + segmentation |

---

## File conventions

- All modules: `src/engines/e5/`
- Types: `src/engines/e5/types.ts` (single source)
- Device data: `src/engines/e5/device-specs.ts`
- Tests: `tests/engines/e5/`
- 200-line cap per file — split into helpers if needed
- Never import from other engines — data flows through `PipelineState`

---

## Testing requirements

- Deterministic modules: concrete inputs → expected outputs, boundary cases
- AI modules: 4 paths (high-confidence bypass, AI success, AI failure →
  fallback, Zod reject → fallback)
- Mock `callAI` with `vi.mock("@/lib/ai/client")`
- Every module gets its own test file

---

## Anti-patterns

- ❌ AI for sizing, port counts, IP math, cable calculations — those are code
- ❌ Importing from other engines (E1/E2/E3/E4) — use `PipelineState` artifacts
- ❌ Hard-coding device specs in `.ts` files — use `device-specs.ts` from JSON
- ❌ More than 6 topology patterns without updating `types.ts` enum
- ❌ Throwing on AI failure — return deterministic fallback
- ❌ Skipping post-gate validation on AI output

---

## Reference files

- `src/engines/e5/types.ts` — all E5 types
- `src/engines/e5/methodology-selector.ts` — deterministic decision tree example
- `src/engines/e5/device-specs.ts` — device data lookup tables
- `src/coordinator/types.ts` — `PipelineState`, `E5Artifacts`, `EngineInput/Output`
- `docs/BOMATIC_Device_Specs.json` — raw device spec data
- `docs/Design_Patterns.md` — topology patterns, security trees, TP structures
- `docs/Network_PreSales_Playbook_Final_Consolidated.md` §3 — HLD/LLD templates

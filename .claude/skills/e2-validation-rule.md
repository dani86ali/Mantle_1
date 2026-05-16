# Skill: E2 Validation Rule

Deterministic check that runs over a BoM. ZERO AI calls. Pure TypeScript + Zod
+ JSON device-spec lookups.

---

## Input / Output contract

Input: `ValidationContext` — `{ lines: BomLine[] }` where each line carries
`id`, `sku`, `quantity`, `category` (and other fields from `src/types/validation.ts`).

Output (two flavors):

- **Engine-registered rule:** implement `ValidationRule` and return
  `ValidationResult[]` from `run(context)`. Shape per result:
  `{ ruleId, ruleName, severity: "error"|"warning"|"info", passed, message, affectedLineIds, details? }`.
- **Standalone helper:** return `{ valid: boolean, severity, message }`. Wire it
  into the engine via `src/lib/validation/adapter.ts`.

Device specs live in `docs/BOMATIC_Device_Specs.json`. Parse them once at module
load through a Zod schema — never read JSON untyped.

---

## Rules

1. Load specs with Zod at module scope, e.g.
   `const AP_SPECS = z.array(ApSpecSchema).parse(rawSpecs.cisco_wireless_aps);`
   so a malformed JSON file fails fast at import.
2. Match SKUs by `sku === spec.model || sku.startsWith(spec.model + "-")` so
   suffix variants are recognised without false hits on substrings.
3. If the rule does not apply (no matching lines), still emit one
   `severity: "info", passed: true` result with a clear "not applicable" message
   — the UI shows what was checked.
4. When the rule fails, push one result per offending line/group. Populate
   `affectedLineIds` with the AP line **and** the dependent accessory lines so
   the BoM page can highlight both.
5. Put computed numbers (required vs actual qty, per-AP ratios, etc.) into
   `details` — the UI renders them.
6. Register the rule by adding it to `ALL_RULES` in `src/lib/validation/engine.ts`.
7. Tests (same session as implementation):
   - correct BoM → single info/passed result
   - deliberately broken BoM → exactly the expected error result(s)
   - Zod input validation throws on malformed `BomLine` shape

---

## Anti-patterns

- ❌ Calling Claude / `callAI` from a rule. Validation is deterministic.
- ❌ `lines.find(l => l.sku.includes(model))` — too loose; use the model+suffix
  match from rule 2.
- ❌ Reading `BOMATIC_Device_Specs.json` inside `run()`. Load once at module load.
- ❌ Silently returning `[]` when the rule does not apply. Emit the info result.
- ❌ `any` in public types. Schemas are Zod-typed, results are
  `ValidationResult[]`.

---

## Reference files

- `src/lib/validation/rules/antenna-count.ts` — model+suffix lookup, info-on-empty.
- `src/lib/validation/rules/fan-count.ts` — per-model accessory qty.
- `src/lib/validation/rules/poe-budget.ts` — budget arithmetic across line items.
- `src/lib/validation/engine.ts` — `ALL_RULES` registration array.
- `src/lib/validation/adapter.ts` — wraps `{valid, severity, message}` helpers.
- `src/types/validation.ts` — `ValidationRule`, `ValidationResult`, `BomLine`.

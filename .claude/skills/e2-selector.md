# Skill: E2 Selector Function (accessory / licensing / support)

E2 selectors map a normalized device model + qty + config → typed line
items. Pure TypeScript, JSON-driven, ZERO AI. Tested against Shahid's
ground-truth quotes.

---

## Input / Output contract

Input:
- `model: string` — pre-normalized via `src/lib/utils/normalize-model.ts`
  (collapses `C9300-48P-A` / `C9300-48P` / `9300-48P` family suffixes).
- `qty: number` — positive integer.
- `config?: T` — discriminated-union or fields-with-defaults options
  (e.g. `{ poe: "full" | "partial", stackingKit?: boolean }`).

Output: a typed line-item array — `Array<{ sku, description, qty, category }>`.
`category` is one of `"hardware" | "license" | "support" | "accessory"` (match
the BoM types in `src/types/`).

Device specs live in `docs/BOMATIC_Device_Specs.json` and load through Zod
once at module scope.

---

## Rules

1. **Normalize at the entry point.** Call `normalizeModel(model)` first thing.
   Downstream lookups assume the canonical form, so every later branch is
   ignorant of suffix variants. Don't sprinkle `model.startsWith` everywhere.
2. **Vendor split is explicit.** Either two top-level helpers
   (`selectCiscoAccessories`, `selectFortinetAccessories`) plus a dispatch by
   inferred vendor, or a single function with a leading
   `if (isFortinet(model))` branch. Don't mix vendor logic in one giant table.
3. **Per-model lookups via the JSON spec** — PSU count, fan count, antenna
   ratio, stacking kit SKU all come from `BOMATIC_Device_Specs.json`. If a
   needed field isn't in the spec, **add it to the JSON**, not as a constant in
   the .ts file.
4. **Config defaults at the top of the function:**
   `const { poe = "full", stackingKit = false } = config ?? {};` — keep call
   sites short. Defaults must match Shahid's ground-truth assumption.
5. **Quantity arithmetic** is `qty × per_unit_count` from the spec. Push every
   computed line into the result; no implicit "if zero, skip" inside the spec
   — let the caller decide.
6. **Pure function**, Zod-validate the input shape (`model`, `qty`,
   `config`). Throw on negative qty or unknown model — the orchestrator
   catches.
7. **Tests against ground truth.** Each function gets a test that reproduces
   one of Shahid's documented quotes from `docs/shahid-cisco-ground-truth.md`:
   "C9300-48P × 3 with redundant PSU → these exact 4 lines". Hand-typed
   expected array, full sku/qty match.

---

## Anti-patterns

- ❌ Calling AI to pick accessories. The spec table is the source of truth.
- ❌ Hard-coding "C9300-48P-A" / "C9300-48P-E" branches throughout — normalize
  once.
- ❌ Cisco and Fortinet logic interleaved in the same `switch`. Split them.
- ❌ Returning `string[]` of SKUs. Always typed line items with description,
  qty, category.
- ❌ Putting spec data in `const ANTENNAS_BY_MODEL = {...}` in the .ts file.
  Spec data lives in `BOMATIC_Device_Specs.json`.
- ❌ Skipping the ground-truth test "because the math is obvious". Shahid's
  quotes are the contract.

---

## Reference files

- `src/engines/e2/accessory-selector.ts` — PSU / fan / antenna selection by
  spec lookup.
- `src/engines/e2/licensing-calculator.ts` — DNA / Smart Net qty math.
- `src/engines/e2/support-selector.ts` — support SKU per device family.
- `src/lib/utils/normalize-model.ts` — canonical model-string normaliser.
- `docs/BOMATIC_Device_Specs.json` — spec source of truth.
- `docs/shahid-cisco-ground-truth.md` — quote fixtures for tests.

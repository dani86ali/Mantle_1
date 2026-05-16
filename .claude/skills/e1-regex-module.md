# Skill: E1 Regex / Deterministic Module

Every E1 deterministic module (file classifier, missing-doc detector, legal
trap flagger, sector detector, deadline finder, …) follows the same shape:
pure function, regex-driven, Zod-typed output, no AI.

---

## Input / Output contract

Input varies by module — typically `text: string`, `filename: string`,
or `sheets: Record<string, string[][]>`. Always Zod-validate at the entry.

Output is a typed object — usually `{ items: T[], stats? | summary? }`. Each
item carries an auto-incremented id (`R-001`, `CQ-001`, `RF-001`), a
`severity`, and any anchor fields the UI needs (page #, source file,
matched span).

---

## Rules

1. **Three-priority detection** — emit `confidence` proportional to signal:
   - exact / strong pattern match → `0.9+`
   - partial / weaker pattern     → `0.7 – 0.9`
   - fallback (folder, keyword count, position) → below `0.7`, set
     `needsReview: true` when applicable.
   Cascade stages: stop at the first stage with `confidence > threshold`.
2. **Case-insensitive regex with explicit word boundaries.** Use lookaround:
   `/(?<![a-zA-Z])TERM(?![a-zA-Z])/i`. **Do not** use `\b` — JavaScript treats
   `_` as a word char, so `\bNDA\b` matches `_NDA_test` but
   `(?<![a-zA-Z])NDA(?![a-zA-Z])` does not.
3. **Pattern table, not if/else.** Define rules as a typed array
   (`{pattern, type, subtype, weight}`) and loop. Adding a new pattern is a
   one-line append.
4. **Auto-increment ids** via a local counter:
   `id: \`R-${String(counter++).padStart(3, "0")}\``. Prefix per module
   (`R-`, `CQ-`, `RF-`, `MD-`).
5. **Severity vocabulary** — pick one and use it consistently within the
   module: `critical|high|medium|low` for risks/legal traps,
   `error|warning|info` for validation-style flags. Match the UI's badge map.
6. **Pure functions.** No fetch, no fs, no Claude. If a sibling AI step
   exists, it lives in a separate file and consumes this module's output.
7. **Zod-validate output** when it crosses an engine boundary (returned to
   the orchestrator). Internal helpers can rely on TS types alone.
8. **Tests in same session.** One positive match per pattern category, one
   negative (the regex should NOT fire), one boundary (`_NDA_` should not
   match if rule 2 is implemented correctly).

---

## Anti-patterns

- ❌ `\b` word boundaries on tokens that include letters next to `_` / `-`.
- ❌ Throwing on no matches — return `{items: [], stats: {...zeros}}`.
- ❌ Calling `callAI` from this module. AI escalation belongs in a wrapper.
- ❌ Hand-rolled ids (`"req-" + Math.random()`). Use the padded counter.
- ❌ Mixing severity vocabularies (`"critical"` and `"error"` in the same
  module).
- ❌ Inlining a 30-rule table at the top of the function body — extract a
  module-level `const RULES = [...]`.

---

## Reference files

- `src/engines/e1/file-classifier.ts` — 3-stage cascade, lookaround
  boundaries, pattern table.
- `src/engines/e1/missing-doc-detector.ts` — reference extraction + severity.
- `src/engines/e1/legal-trap-flagger.ts` — severity vocabulary, weighted
  patterns.
- `src/engines/e1/sector-detector.ts` — keyword scoring with fallback.

# Skill: AI-Assisted Task

For the 26% of work where deterministic rules can't get all the way. Run
regex / lookup / scoring FIRST; call AI only on what's left ambiguous.

---

## Input / Output contract

Wrap `callAI<T>` from `src/lib/ai/client.ts`. Never import the Anthropic SDK
directly — `callAI` handles auth, retries, JSON parsing, and Zod validation.

`callAI` shape (paraphrased):

```ts
const result = await callAI({
  systemPrompt: "You are a Cisco/Fortinet catalog expert. Return strict JSON only.",
  prompt: `<task-specific user message>`,
  outputSchema: MyZodSchema,
  taskId: `module-name:short-disambiguator`,
});
if (!result.success) return deterministicFallback;
return result.data; // typed as z.infer<typeof MyZodSchema>
```

Output of the surrounding function must match a typed shape — AI failure
must degrade to a deterministic answer, never throw, never return nothing.

---

## Rules

1. **Deterministic first.** Compute `confidence` from rules. Only escalate when
   `confidence < HIGH_CONFIDENCE` (≈ 0.8) AND `>= MIN_CONFIDENCE` (≈ 0.5).
   Below `MIN_CONFIDENCE` → drop the item (too noisy to even ask AI about).
2. **One Zod schema per AI call.** `callAI` validates `result.data` against it;
   downstream code gets typed output for free. Keep the schema tight (enums
   over strings where possible).
3. **Batch when the task is repetitive.** Compliance matrix mapping calls AI
   once per batch of ≈ 5 requirements, not 500 times. Batching is purely a
   latency/cost optimization — don't batch if it complicates the prompt.
4. **System prompt = role + output contract.** E.g.
   `"You are a Cisco/Fortinet catalog expert. Return strict JSON only."`
   Keep it under 3 sentences; specifics belong in the user prompt.
5. **`taskId` per logical task** so the cache and trace logs are useful. Pattern:
   `"<module>:<short-disambig>"`, e.g. `"requirements-extractor:<first-40-chars>"`.
6. **Graceful degradation.** Branch on `result.success`:
   ```ts
   if (!result.success) return initial;     // keep deterministic answer
   return { ...result.data, source: "ai" };
   ```
7. **Tests** must cover all four paths:
   - high-confidence deterministic path **bypasses** AI (assert `callAI` not called)
   - ambiguous path **invokes** AI (mock returns a success)
   - AI failure (`result.success === false`) returns the deterministic fallback
   - Zod schema rejects malformed AI output (mock returns wrong shape →
     `result.success` is `false` → fallback path runs)
   Mock with `vi.mock("@/lib/ai/client", () => ({ callAI: vi.fn() }))`.

---

## Anti-patterns

- ❌ `import Anthropic from "@anthropic-ai/sdk"` inside an engine. Use `callAI`.
- ❌ Asking AI to do arithmetic, look up a SKU price, or count items.
  Those are TypeScript. See the First Commandment in CLAUDE.md.
- ❌ Sending every requirement to AI "just in case". The deterministic
  classifier handles ≥ 80% — only escalate the in-between band.
- ❌ Re-parsing the AI string. Define the schema, let `callAI` parse.
- ❌ `throw` on AI failure. The pipeline must still produce a result.
- ❌ Vague system prompt (`"You are a helpful assistant"`). Be specific.

---

## Reference files

- `src/lib/ai/client.ts` — `callAI<T>`, success-discriminated result type.
- `src/engines/e2/fuzzy-sku-matcher.ts` — deterministic-first + AI tiebreak.
- `src/engines/e1/requirements-extractor.ts` — confidence-gated escalation,
  per-sentence `taskId`.
- `src/engines/e1/compliance-matrix-status.ts` — batched AI call (5 per req.).

# Skill: E2 Deterministic Cost Stack Function (CS-003 … CS-009)

E2 has ZERO AI calls. Every cost stack formula is a pure TypeScript function.

---

## Step 1 — Read the formula from docs/Tender_Analyzer_Model.md

Open **Section 2 — Line-Item Formulas**. Find the step that owns CS-XXX:

| CS # | TA Step | Section ref |
|------|---------|-------------|
| CS-003 | Inhouse margin deduction | Step 3 |
| CS-004 | Overhead loading (sum) | Step 4 |
| CS-005 | WHTax special logic | Step 4 |
| CS-006 | Cost w/ overhead (unit) | Step 5 |
| CS-007 | Selling price — Margin mode | Step 6 |
| CS-008 | Selling price — Markup mode | Step 6 |
| CS-009 | Embed discounts (3 types) | Step 7 |

Copy the Excel formula. Each input variable becomes a typed parameter.

---

## Step 2 — Write the function in src/engines/e2/pricing-engine.ts

Rules: no `any`, no AI calls, no I/O, return `number`, stay under 10 lines.

```ts
// CS-XXX: <one-line description>
export function fnName(param1: number, param2: number): number {
  return /* direct translation of TA Excel formula */;
}
```

For the Margin/Markup toggle (CS-007/CS-008) use a union type:

```ts
export function applyProfit(
  costWithOverhead: number,
  profitPct: number,
  mode: "Margin" | "Markup"
): number {
  return mode === "Margin"
    ? costWithOverhead / (1 - profitPct)
    : costWithOverhead * (1 + profitPct);
}
```

---

## Step 3 — Write tests in tests/engines/e2/pricing-engine.test.ts

Pick inputs where you can hand-compute the result. Show arithmetic in a comment.

```ts
describe("fnName (CS-XXX)", () => {
  it("<scenario>: <inputs> -> <expected>", () => {
    // e.g. 100000 * 0.65 * 0.92 = 59800
    expect(fnName(input1, input2)).toBe(expected);
  });

  it("zero input returns zero", () => {
    expect(fnName(0, ...)).toBe(0);
  });
});
```

Minimum: one representative value + one boundary case per function.

---

## Step 4 — Verify

```
npx vitest run tests/engines/e2/pricing-engine.test.ts
```

All tests must pass before committing. If a test fails, fix the code — never
adjust the expected value to match wrong arithmetic.

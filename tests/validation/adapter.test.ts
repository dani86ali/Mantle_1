import { describe, it, expect } from "vitest";
import { adaptSimpleRule } from "@/lib/validation/adapter";
import type { SimpleRuleResult } from "@/lib/validation/adapter";
import type { ValidationContext } from "@/types/validation";

function makeMinimalContext(lines: unknown[] = []): ValidationContext {
  return {
    lines: lines as ValidationContext["lines"],
    requirements: {},
    region: "EMEAR",
    country: "SA",
    tenantStandards: {
      requireRedundantPsu: false,
      preferredLicenseTier: "advantage",
      preferredDnaTier: "advantage",
      defaultSupportLevel: "8x5xNBD",
      approvedProductFamilies: [],
      regionRestrictions: [],
    },
    catalogData: new Map(),
  };
}

function makeSimpleFn(result: SimpleRuleResult) {
  return (_lines: unknown) => result;
}

describe("adaptSimpleRule", () => {
  it("returns a ValidationRule with the correct id, name, and description", () => {
    const rule = adaptSimpleRule(
      makeSimpleFn({ valid: true, severity: "info", message: "ok" }),
      "dna-optout",
      "DNA Opt-out",
      "Test rule"
    );
    expect(rule.id).toBe("dna-optout");
    expect(rule.name).toBe("DNA Opt-out");
    expect(rule.description).toBe("Test rule");
  });

  it("wraps a passing simple rule into a single-element ValidationResult[]", () => {
    const rule = adaptSimpleRule(
      makeSimpleFn({ valid: true, severity: "info", message: "all good" }),
      "dna-optout",
      "DNA Opt-out",
      "Test rule"
    );
    const results = rule.run(makeMinimalContext());
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("info");
    expect(results[0].message).toBe("all good");
    expect(results[0].ruleId).toBe("dna-optout");
    expect(results[0].ruleName).toBe("DNA Opt-out");
    expect(results[0].affectedLineIds).toEqual([]);
  });

  it("maps valid=false + severity=error correctly", () => {
    const rule = adaptSimpleRule(
      makeSimpleFn({ valid: false, severity: "error", message: "missing license" }),
      "license-deps",
      "License Dependencies",
      "Test rule"
    );
    const results = rule.run(makeMinimalContext());
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toBe("missing license");
  });

  it("maps valid=true + severity=info correctly", () => {
    const rule = adaptSimpleRule(
      makeSimpleFn({ valid: true, severity: "info", message: "no issues" }),
      "ap-only",
      "AP-only Estimate",
      "Test rule"
    );
    const results = rule.run(makeMinimalContext());
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("info");
  });

  it("maps valid=false + severity=warning correctly", () => {
    const rule = adaptSimpleRule(
      makeSimpleFn({ valid: false, severity: "warning", message: "License dependency missing" }),
      "license-deps",
      "License Dependencies",
      "Test rule"
    );
    const results = rule.run(makeMinimalContext());
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("warning");
    expect(results[0].message).toBe("License dependency missing");
  });

  it("passes context.lines to the simple function", () => {
    const captured: unknown[] = [];
    const rule = adaptSimpleRule(
      (lines) => {
        captured.push(lines);
        return { valid: true, severity: "info", message: "ok" };
      },
      "dna-optout",
      "DNA Opt-out",
      "Test rule"
    );
    const ctx = makeMinimalContext([{ sku: "C9300L-24UXG-4X-A" }]);
    rule.run(ctx);
    expect(captured[0]).toBe(ctx.lines);
  });
});

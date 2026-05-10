import { describe, it, expect } from "vitest";
import { checkEox, stubEoxLookup } from "@/lib/validation/rules/eox-check";
import type { EoxLookup } from "@/lib/validation/rules/eox-check";

const nonEoxLookup: EoxLookup = { checkSku: () => ({ isEox: false }) };

function eoxLookupFor(skus: Record<string, { eoxDate?: string; replacement?: string }>): EoxLookup {
  return {
    checkSku(sku) {
      const hit = skus[sku];
      if (hit) return { isEox: true, ...hit };
      return { isEox: false };
    },
  };
}

describe("checkEox", () => {
  it("returns info for empty BoM", () => {
    const result = checkEox([]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
  });

  it("stub lookup: all SKUs pass (isEox false)", () => {
    const lines = [{ sku: "C9300L-24UXG-4X-A" }, { sku: "C9120AXE-E" }];
    const result = checkEox(lines, stubEoxLookup);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).toContain("No end-of-life");
  });

  it("non-EoX SKUs pass with custom lookup", () => {
    const lines = [{ sku: "C9300L-24UXG-4X-A" }];
    const result = checkEox(lines, nonEoxLookup);
    expect(result.valid).toBe(true);
  });

  it("returns warning when one EoX SKU found", () => {
    const lines = [{ sku: "WS-C3750X-48P" }];
    const lookup = eoxLookupFor({ "WS-C3750X-48P": { eoxDate: "2023-10-31" } });
    const result = checkEox(lines, lookup);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe("warning");
    expect(result.message).toContain("WS-C3750X-48P");
    expect(result.message).toContain("2023-10-31");
  });

  it("includes replacement suggestion in warning message", () => {
    const lines = [{ sku: "WS-C3750X-48P" }];
    const lookup = eoxLookupFor({
      "WS-C3750X-48P": { eoxDate: "2023-10-31", replacement: "C9300-48P-E" },
    });
    const result = checkEox(lines, lookup);
    expect(result.message).toContain("C9300-48P-E");
  });

  it("reports all EoX SKUs when multiple found", () => {
    const lines = [{ sku: "WS-C3750X-48P" }, { sku: "WS-C3560X-24P" }, { sku: "C9300L-24UXG-4X-A" }];
    const lookup = eoxLookupFor({
      "WS-C3750X-48P": { eoxDate: "2023-10-31" },
      "WS-C3560X-24P": { eoxDate: "2022-06-30" },
    });
    const result = checkEox(lines, lookup);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("WS-C3750X-48P");
    expect(result.message).toContain("WS-C3560X-24P");
  });

  it("Zod rejects invalid input (non-array)", () => {
    expect(() => checkEox("not-an-array")).toThrow();
  });

  it("Zod rejects line missing sku field", () => {
    expect(() => checkEox([{ notSku: "foo" }])).toThrow();
  });
});

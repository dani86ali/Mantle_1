import { describe, it, expect } from "vitest";
import { checkLicenseDeps } from "@/lib/validation/rules/license-deps";

describe("checkLicenseDeps", () => {
  it("returns info when no C9300/C9300L switches present", () => {
    const lines = [{ sku: "C9120AXE-E" }, { sku: "C9800-L-F-K9" }];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).toContain("not applicable");
  });

  it("returns info for empty BoM", () => {
    const result = checkLicenseDeps([]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
  });

  it("C9300L with NW + DNA licenses passes", () => {
    const lines = [
      { sku: "C9300L-24UXG-4X-A" },
      { sku: "C9300L-DNA-24-A" },
      { sku: "C9300L-24-NW-A" },
    ];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
  });

  it("C9300 with NW + DNA licenses passes", () => {
    const lines = [
      { sku: "C9300-48P-E" },
      { sku: "C9300-DNA-48-E" },
      { sku: "C9300-48-NW-E" },
    ];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(true);
  });

  it("C9300L with NW license + DNA-OPTOUT passes (opt-out is valid)", () => {
    const lines = [
      { sku: "C9300L-24UXG-4X-A" },
      { sku: "C9300L-24-NW-A" },
      { sku: "C9120AX-DNA-OPTOUT" },
    ];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(true);
  });

  it("C9300L missing NW license returns error", () => {
    const lines = [
      { sku: "C9300L-24UXG-4X-A" },
      { sku: "C9300L-DNA-24-A" },
      // no NW license
    ];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.message).toContain("Network license");
  });

  it("C9300L missing DNA license (no optout) returns error", () => {
    const lines = [
      { sku: "C9300L-24UXG-4X-A" },
      { sku: "C9300L-24-NW-A" },
      // no DNA license, no optout
    ];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.message).toContain("DNA license");
  });

  it("C9300L missing both NW and DNA licenses reports both errors", () => {
    const lines = [{ sku: "C9300L-24UXG-4X-A" }];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.message).toContain("Network license");
    expect(result.message).toContain("DNA license");
  });

  it("DNA-OPTOUT SKU does not count as a DNA license", () => {
    // Optout without NW license should still flag NW as missing
    const lines = [
      { sku: "C9300L-24UXG-4X-A" },
      { sku: "C9300L-DNA-OPTOUT" },
      // no NW license
    ];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("Network license");
  });

  it("C9300X switch (not C9300/C9300L) is not flagged", () => {
    const lines = [{ sku: "C9300X-24Y-A" }];
    const result = checkLicenseDeps(lines);
    expect(result.valid).toBe(true);
    expect(result.message).toContain("not applicable");
  });

  it("Zod rejects invalid input", () => {
    expect(() => checkLicenseDeps(null)).toThrow();
    expect(() => checkLicenseDeps([{ noSku: "x" }])).toThrow();
  });
});

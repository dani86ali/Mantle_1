import { describe, it, expect } from "vitest";
import { extractLineItems } from "@/lib/io/tabular-extractor";

// Helper: build a row of fixed width from index→value overrides.
function row(width: number, overrides: Record<number, string | number>): string[] {
  const r = Array<string>(width).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = String(val);
  return r;
}

describe("extractLineItems — header at row 0", () => {
  it("detects columns from a top-row header and extracts items", () => {
    const sheets = {
      Sheet1: [
        row(4, { 0: "Part Number", 1: "Description", 2: "Qty", 3: "Unit List Price" }),
        row(4, { 0: "C9300-NW-A-48", 1: "Switch", 2: "3", 3: "1000" }),
        row(4, { 0: "CON-SNT-C9300", 1: "Support", 2: "3", 3: "200" }),
        row(4, { 0: "AIR-AP-1815", 1: "AP", 2: "5", 3: "500" }),
      ],
    };
    const res = extractLineItems(sheets);
    expect(res.sheetUsed).toBe("Sheet1");
    expect(res.confidence).toBe("high");
    expect(res.detectedColumns).toMatchObject({ sku: 0, description: 1, qty: 2, unitPrice: 3 });
    expect(res.lineItems).toHaveLength(3);
    expect(res.lineItems[0]).toMatchObject({
      partNumber: "C9300-NW-A-48", description: "Switch", qty: 3, unitPrice: 1000,
    });
  });
});

describe("extractLineItems — deep header detection past preamble", () => {
  it("finds a header buried under 15 preamble rows", () => {
    const preamble = Array.from({ length: 15 }, (_, i) => row(3, { 0: `note ${i}` }));
    const sheets = {
      Quote: [
        ...preamble,
        row(3, { 0: "Item Code", 1: "Description", 2: "Quantity" }),
        row(3, { 0: "C9300-NW-A-48", 1: "Switch", 2: "2" }),
        row(3, { 0: "CON-SNT-C9300", 1: "Support", 2: "2" }),
        row(3, { 0: "AIR-AP-1815", 1: "AP", 2: "4" }),
      ],
    };
    const res = extractLineItems(sheets);
    expect(res.detectedColumns.sku).toBe(0);
    expect(res.lineItems).toHaveLength(3);
    expect(res.lineItems[0].partNumber).toBe("C9300-NW-A-48");
  });
});

describe("extractLineItems — Tier 3 catalog grounding", () => {
  it("identifies the SKU column by catalog hits when its header keyword is absent", () => {
    // Header is detectable via Description+Quantity keywords, but the SKU
    // column header ("Ref") is non-standard — Tier 3 grounds it on the catalog.
    const sheets = {
      Data: [
        row(3, { 0: "Ref", 1: "Description", 2: "Quantity" }),
        row(3, { 0: "C9300-NW-A-48", 1: "first switch", 2: "1" }),
        row(3, { 0: "CS-MIC-TABLE-J", 1: "second mic", 2: "2" }),
        row(3, { 0: "PWR-CORD-GBR-F", 1: "third cord", 2: "3" }),
      ],
    };
    const res = extractLineItems(sheets, {
      catalogSkus: ["C9300-NW-A-48", "CS-MIC-TABLE-J", "PWR-CORD-GBR-F", "OTHER-SKU-1"],
    });
    expect(res.detectedColumns.sku).toBe(0);
    expect(res.confidence).toBe("high"); // Tier 3 → high
    expect(res.lineItems).toHaveLength(3);
  });
});

describe("extractLineItems — row skipping", () => {
  it("drops subtotal and 'Initial Term…' note rows interspersed mid-table", () => {
    const sheets = {
      "Price Estimate": [
        row(4, { 0: "Part Number", 1: "Description", 2: "Qty", 3: "Unit List Price" }),
        row(4, { 0: "C9300-NW-A-48", 1: "Switch", 2: "1", 3: "1000" }),
        row(4, { 0: "Initial Term - 36.00 Months   |   Auto Renewal Term - 0 Months" }),
        row(4, { 0: "CON-SNT-C9300", 1: "Support", 2: "1", 3: "200" }),
        // Subtotal row: SKU cell empty (typical real layout) → dropped.
        row(4, { 1: "Subtotal", 3: "1200" }),
        row(4, { 0: "AIR-AP-1815", 1: "AP", 2: "1", 3: "500" }),
      ],
    };
    const res = extractLineItems(sheets);
    expect(res.lineItems).toHaveLength(3);
    expect(res.lineItems.map((l) => l.partNumber)).toEqual([
      "C9300-NW-A-48", "CON-SNT-C9300", "AIR-AP-1815",
    ]);
  });
});

describe("extractLineItems — no SKU column", () => {
  it("returns confidence 'none' with a warning when no SKU column exists", () => {
    const sheets = {
      Notes: [
        row(2, { 0: "Description", 1: "Amount" }),
        row(2, { 0: "some text here", 1: "100" }),
        row(2, { 0: "more free text", 1: "200" }),
        row(2, { 0: "yet more prose", 1: "300" }),
      ],
    };
    const res = extractLineItems(sheets, { catalogSkus: ["C9300-NW-A-48"] });
    expect(res.confidence).toBe("none");
    expect(res.lineItems).toHaveLength(0);
    expect(res.warnings.join(" ")).toMatch(/manual entry/i);
  });
});

describe("extractLineItems — sourceRow with leading blank rows", () => {
  it("reports the un-filtered array index, not a compacted position", () => {
    // 3 leading blank rows present in the array (NOT stripped); header at
    // index 3; first data row at index 4. sourceRow must be the true index.
    const sheets = {
      Sheet1: [
        [], [], [],
        row(3, { 0: "Part Number", 1: "Description", 2: "Qty" }),
        row(3, { 0: "C9300-NW-A-48", 1: "Switch", 2: "1" }),
        row(3, { 0: "CON-SNT-C9300", 1: "Support", 2: "1" }),
        row(3, { 0: "AIR-AP-1815", 1: "AP", 2: "1" }),
      ],
    };
    const res = extractLineItems(sheets);
    expect(res.lineItems[0].metadata?.sourceRow).toBe("4");
    expect(res.lineItems[1].metadata?.sourceRow).toBe("5");
    expect(res.lineItems[0].metadata?.sourceSheet).toBe("Sheet1");
  });
});

describe("extractLineItems — corrected SKU regex", () => {
  it("does NOT pick a dotted line-number column ('1.0', '1.0.1') as the SKU column", () => {
    // Col 0 holds dotted line numbers; col 1 holds real SKUs. The regex must
    // require a letter so col 0 is never chosen and its values never extracted.
    const sheets = {
      Sheet1: [
        row(4, { 0: "Line Number", 1: "Item Name", 2: "Description", 3: "Quantity" }),
        row(4, { 0: "1.0", 1: "C9300-NW-A-48", 2: "Switch", 3: "1" }),
        row(4, { 0: "1.0.1", 1: "CON-SNT-C9300", 2: "Support", 3: "1" }),
        row(4, { 0: "1.1", 1: "AIR-AP-1815", 2: "AP", 3: "1" }),
      ],
    };
    const res = extractLineItems(sheets);
    expect(res.detectedColumns.sku).toBe(1);
    expect(res.lineItems.map((l) => l.partNumber)).toEqual([
      "C9300-NW-A-48", "CON-SNT-C9300", "AIR-AP-1815",
    ]);
  });
});

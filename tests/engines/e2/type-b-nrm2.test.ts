import { describe, it, expect } from "vitest";
import { parseTypeB } from "@/engines/e2/parsers/type-b-nrm2";

// ── Helpers ──────────────────────────────────────────────────────────────────

// Build a base BoQ row (9 cols, A-I). Cols not in overrides are blank.
function baseRow(overrides: Record<number, string>): string[] {
  const r = Array(9).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

// Build an add/omit row (12 cols, A-L).
function aoRow(overrides: Record<number, string>): string[] {
  const r = Array(12).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

// ── Base BoQ fixtures ────────────────────────────────────────────────────────

// Header row at top (row 9 in doc). Repeats mid-sheet — must be skipped.
const BASE_HEADER = baseRow({ 0: "REF.", 1: "DESCRIPTION", 4: "QTY", 5: "UNIT", 6: "RATE (SAR)" });

// Section header: A=2.01, B=section name, C=sub-section name
const SECTION_2_01 = baseRow({ 0: "2.01", 1: "Frame", 2: "Steel" });
// Section header: no C (sub-element blank)
const SECTION_1_00 = baseRow({ 0: "1.00", 1: "SUBSTRUCTURE" });

// Line items within 2.01 Frame > Steel
const ITEM_A = baseRow({ 0: "a", 3: "Supply and fix steel columns", 4: "25", 5: "t" });
const ITEM_B = baseRow({ 0: "b", 3: "Supply and fix steel beams",   4: "40", 5: "t" });

// Item with description split across B/C/D
const ITEM_C_BCD = baseRow({ 0: "c", 1: "Piling", 2: "CFA piles", 3: "600 dia, 12m deep", 4: "10", 5: "nr" });

// Sub-total row — must be skipped
const SUBTOTAL = baseRow({ 1: "Carried to Collection" });

// Line item with no qty — must be skipped
const NO_QTY_ITEM = baseRow({ 0: "d", 3: "Provisional item", 5: "item" });

// ── Add/Omit fixtures ────────────────────────────────────────────────────────

const AO_HEADER = aoRow({ 0: "REF.", 1: "DESCRIPTION", 4: "OLD QTY", 5: "NEW QTY", 6: "UNIT" });
const AO_SECTION = aoRow({ 0: "2.01", 1: "Frame" });

// Pure addition (no old qty)
const AO_ADD = aoRow({ 0: "a", 3: "New steel column", 5: "5", 6: "nr" });
// Pure omission (no new qty)
const AO_OMIT = aoRow({ 0: "b", 3: "Remove steel beam", 4: "-3", 6: "nr" });
// Substitution (both present)
const AO_SUBST = aoRow({ 0: "c", 3: "Replace column", 4: "-2", 5: "4", 6: "nr" });
// Description split B/C/D
const AO_BCD = aoRow({ 0: "d", 1: "Roofing", 2: "Flat", 3: "GRP membrane", 4: "-10", 5: "20", 6: "m2" });
// Item with no qty at all — must be skipped
const AO_BLANK_QTY = aoRow({ 0: "e", 3: "Blank item" });
// Sub-total row — must be skipped
const AO_SUBTOTAL = aoRow({ 1: "Carried to Collection" });

// ── Tests: base variant ──────────────────────────────────────────────────────

describe("parseTypeB base — sheet lookup", () => {
  it('throws when "MAIN BOQ" sheet is missing', () => {
    expect(() => parseTypeB({ Sheet1: [] }, "base")).toThrow(/MAIN BOQ/);
  });

  it("throws on invalid input type", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseTypeB(null as any, "base")).toThrow();
  });

  it("returns empty array for empty sheet", () => {
    expect(parseTypeB({ "MAIN BOQ": [] }, "base")).toEqual([]);
  });
});

describe("parseTypeB base — section and line item parsing", () => {
  const rows = [
    BASE_HEADER,
    SECTION_1_00,
    SECTION_2_01,
    ITEM_A,
    ITEM_B,
    SUBTOTAL,
  ];
  const sheets = { "MAIN BOQ": rows };

  it("returns two line items (sub-total skipped)", () => {
    expect(parseTypeB(sheets, "base")).toHaveLength(2);
  });

  it("maps itemNumber, qty, unit correctly", () => {
    const [a, b] = parseTypeB(sheets, "base");
    expect(a.itemNumber).toBe("a");
    expect(a.qty).toBe(25);
    expect(a.unit).toBe("t");
    expect(b.itemNumber).toBe("b");
    expect(b.qty).toBe(40);
  });

  it("captures description from col D", () => {
    const [a] = parseTypeB(sheets, "base");
    expect(a.description).toBe("Supply and fix steel columns");
  });

  it("builds section from section header with L1 and L2", () => {
    const [a] = parseTypeB(sheets, "base");
    expect(a.section).toBe("2.01 Frame > Steel");
  });
});

describe("parseTypeB base — description concatenation from B+C+D", () => {
  const sheets = {
    "MAIN BOQ": [SECTION_1_00, ITEM_C_BCD],
  };

  it("joins non-empty B, C, D with ' | '", () => {
    const [item] = parseTypeB(sheets, "base");
    expect(item.description).toBe("Piling | CFA piles | 600 dia, 12m deep");
  });
});

describe("parseTypeB base — section with no sub-element (L2 blank)", () => {
  const sheets = {
    "MAIN BOQ": [SECTION_1_00, ITEM_A],
  };

  it("sets section to L1 only (no ' > ' separator)", () => {
    const [item] = parseTypeB(sheets, "base");
    expect(item.section).toBe("1.00 SUBSTRUCTURE");
    expect(item.section).not.toContain(">");
  });
});

describe("parseTypeB base — repeat header rows skipped", () => {
  const sheets = {
    "MAIN BOQ": [
      BASE_HEADER,     // initial header row
      SECTION_2_01,
      ITEM_A,
      BASE_HEADER,     // mid-sheet repeat — must be skipped, not produce item
      ITEM_B,
    ],
  };

  it("ignores repeated header rows", () => {
    const items = parseTypeB(sheets, "base");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.itemNumber)).toEqual(["a", "b"]);
  });
});

describe("parseTypeB base — skipping", () => {
  it("skips sub-total rows containing 'Carried to Collection'", () => {
    const sheets = { "MAIN BOQ": [SECTION_2_01, SUBTOTAL, ITEM_A] };
    expect(parseTypeB(sheets, "base")).toHaveLength(1);
  });

  it("skips line items with no qty", () => {
    const sheets = { "MAIN BOQ": [SECTION_2_01, ITEM_A, NO_QTY_ITEM] };
    expect(parseTypeB(sheets, "base")).toHaveLength(1);
  });

  it("skips section headers (they do not produce line items)", () => {
    const sheets = { "MAIN BOQ": [SECTION_1_00, SECTION_2_01] };
    expect(parseTypeB(sheets, "base")).toHaveLength(0);
  });
});

describe("parseTypeB base — no section header before items", () => {
  it("produces item with undefined section when no section seen yet", () => {
    const sheets = { "MAIN BOQ": [ITEM_A] };
    const [item] = parseTypeB(sheets, "base");
    expect(item.section).toBeUndefined();
  });
});

// ── Tests: addommit variant ──────────────────────────────────────────────────

describe("parseTypeB addommit — sheet lookup", () => {
  it('throws when no "Bill02a" sheet found', () => {
    expect(() => parseTypeB({ "MAIN BOQ": [] }, "addommit")).toThrow(/Bill02a/);
  });

  it("finds sheet by prefix (e.g. 'Bill02a Main Works')", () => {
    const sheets = { "Bill02a Main Works": [AO_SECTION, AO_ADD] };
    expect(() => parseTypeB(sheets, "addommit")).not.toThrow();
  });
});

describe("parseTypeB addommit — pure addition", () => {
  const sheets = { "Bill02a Main Works": [AO_SECTION, AO_ADD] };
  const [item] = parseTypeB(sheets, "addommit");

  it("maps itemNumber, unit, qty=0", () => {
    expect(item.itemNumber).toBe("a");
    expect(item.unit).toBe("nr");
    expect(item.qty).toBe(0);
  });

  it("stores newQty in metadata, oldQty absent", () => {
    expect(item.metadata?.newQty).toBe("5");
    expect(item.metadata?.oldQty).toBeUndefined();
  });
});

describe("parseTypeB addommit — pure omission", () => {
  const sheets = { "Bill02a Main Works": [AO_SECTION, AO_OMIT] };
  const [item] = parseTypeB(sheets, "addommit");

  it("stores oldQty (negative) in metadata, newQty absent", () => {
    expect(item.metadata?.oldQty).toBe("-3");
    expect(item.metadata?.newQty).toBeUndefined();
  });
});

describe("parseTypeB addommit — substitution (both qtys present)", () => {
  const sheets = { "Bill02a Main Works": [AO_SECTION, AO_SUBST] };
  const [item] = parseTypeB(sheets, "addommit");

  it("stores both oldQty and newQty in metadata", () => {
    expect(item.metadata?.oldQty).toBe("-2");
    expect(item.metadata?.newQty).toBe("4");
  });
});

describe("parseTypeB addommit — description and section", () => {
  const sheets = { "Bill02a Main Works": [AO_SECTION, AO_BCD] };
  const [item] = parseTypeB(sheets, "addommit");

  it("concatenates B+C+D for description", () => {
    expect(item.description).toBe("Roofing | Flat | GRP membrane");
  });

  it("sets section from section header", () => {
    expect(item.section).toBe("2.01 Frame");
  });
});

describe("parseTypeB addommit — skipping", () => {
  const sheets = {
    "Bill02a Main Works": [AO_SECTION, AO_BLANK_QTY, AO_SUBTOTAL, AO_HEADER, AO_ADD],
  };

  it("skips rows with no qty in either column", () => {
    const items = parseTypeB(sheets, "addommit");
    expect(items).toHaveLength(1);
    expect(items[0].itemNumber).toBe("a");
  });

  it("skips 'Carried to Collection' rows", () => {
    const withSubtotalOnly = { "Bill02a Main Works": [AO_SECTION, AO_SUBTOTAL] };
    expect(parseTypeB(withSubtotalOnly, "addommit")).toHaveLength(0);
  });

  it("skips header rows (REF. in col A)", () => {
    const withHeaderOnly = { "Bill02a Main Works": [AO_HEADER] };
    expect(parseTypeB(withHeaderOnly, "addommit")).toHaveLength(0);
  });
});

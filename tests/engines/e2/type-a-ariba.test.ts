import { describe, it, expect } from "vitest";
import { parseTypeA } from "@/engines/e2/parsers/type-a-ariba";

// Builds a 42-column row with blanks everywhere except the specified indices.
function row42(overrides: Record<number, string>): string[] {
  const r = Array(42).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

// Builds a 41-column row for the 2022 template.
function row41(overrides: Record<number, string>): string[] {
  const r = Array(41).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

// 4 system rows (rows 1–4 in the doc) + 1 data row  — system rows must be skipped.
function withSystemRows(dataRows: string[][]): string[][] {
  return [
    Array(42).fill("header"),       // row 1
    Array(42).fill("help"),         // row 2
    Array(42).fill("field purpose"),// row 3
    Array(42).fill("7.1"),          // row 4 — example placeholder with valid-looking number
    ...dataRows,
  ];
}

// ── Fixtures ────────────────────────────────────────────────────────────────

// 2024+ data row: item 7.1, Part# embedded in description (Juniper pattern)
const DATA_ROW_2024 = row42({
  0: "7.1",                                           // A  itemNumber
  5: "Part# QFX5120-48YM\nJuniper switch 48-port",    // F  description
  8: "USD",                                           // I  currency
  9: "each",                                          // J  UOM
  11: "2",                                            // L  qty
  13: "15000",                                        // N  unitPrice
  17: "90",                                           // R  leadTime
  21: "Juniper",                                      // V  manufacturer
  23: "QFX5120-48YM",                                 // X  modelPartNum
  25: "US",                                           // Z  countryOfOrigin
});

// 2022 data row (41 cols): same item but column map shifted left after N
const DATA_ROW_2022 = row41({
  0: "6.1",                                           // A  itemNumber
  5: "Catalyst 9300-48P-E",                           // F  description (no OEM pattern)
  8: "SAR",                                           // I  currency
  9: "each",                                          // J  UOM
  11: "5",                                            // L  qty
  13: "8000",                                         // N  unitPrice
  16: "45",                                           // Q  leadTime (2022 shift)
  20: "Cisco",                                        // U  manufacturer (2022 shift)
  22: "C9300-48P-E",                                  // W  modelPartNum (2022 shift)
  24: "SG",                                           // Y  countryOfOrigin (2022 shift)
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("parseTypeA — 2024+ sheet ('7 Commercial Envelope')", () => {
  const sheets = {
    "7 Commercial Envelope": withSystemRows([DATA_ROW_2024]),
  };

  it("returns one line item", () => {
    expect(parseTypeA(sheets)).toHaveLength(1);
  });

  it("maps itemNumber, description, qty, unit, unitPrice, currency", () => {
    const [item] = parseTypeA(sheets);
    expect(item.itemNumber).toBe("7.1");
    expect(item.description).toBe("Part# QFX5120-48YM\nJuniper switch 48-port");
    expect(item.qty).toBe(2);
    expect(item.unit).toBe("each");
    expect(item.unitPrice).toBe(15000);
    expect(item.currency).toBe("USD");
  });

  it("extracts OEM part number from 'Part# SKU' pattern in description", () => {
    const [item] = parseTypeA(sheets);
    expect(item.partNumber).toBe("QFX5120-48YM");
  });

  it("maps manufacturer and stores modelPartNum in metadata", () => {
    const [item] = parseTypeA(sheets);
    expect(item.manufacturer).toBe("Juniper");
    expect(item.metadata?.modelPartNumber).toBe("QFX5120-48YM");
  });

  it("maps leadTime and countryOfOrigin", () => {
    const [item] = parseTypeA(sheets);
    expect(item.leadTime).toBe("90");
    expect(item.metadata?.countryOfOrigin).toBe("US");
  });
});

describe("parseTypeA — 2022 sheet ('6 Commercial Envelope', 41 cols)", () => {
  const sheets = {
    "6 Commercial Envelope": [
      Array(41).fill("header"),
      Array(41).fill("help"),
      Array(41).fill("purpose"),
      Array(41).fill("6.x"),       // placeholder row
      DATA_ROW_2022,
    ],
  };

  it("uses 2022 column map (shifted left by 1 after col N)", () => {
    const [item] = parseTypeA(sheets);
    expect(item.itemNumber).toBe("6.1");
    expect(item.qty).toBe(5);
    expect(item.unitPrice).toBe(8000);
    expect(item.leadTime).toBe("45");       // col Q (idx 16)
    expect(item.manufacturer).toBe("Cisco"); // col U (idx 20)
    expect(item.metadata?.modelPartNumber).toBe("C9300-48P-E"); // col W (idx 22)
    expect(item.metadata?.countryOfOrigin).toBe("SG"); // col Y (idx 24)
  });

  it("returns undefined partNumber when no OEM pattern in description", () => {
    const [item] = parseTypeA(sheets);
    expect(item.partNumber).toBeUndefined();
  });
});

describe("parseTypeA — system row skipping", () => {
  it("skips rows 1–4 even when row 4 contains a valid item-number-shaped value", () => {
    // Row at index 3 (row 4) has '7.1' in col A — must be skipped
    const sheets = {
      "7 Commercial Envelope": [
        Array(42).fill("hdr"),
        Array(42).fill("help"),
        Array(42).fill("purpose"),
        row42({ 0: "7.1", 11: "1" }), // row 4 placeholder — must NOT appear in output
      ],
    };
    expect(parseTypeA(sheets)).toHaveLength(0);
  });

  it("includes data rows starting at index 4 (row 5)", () => {
    const sheets = {
      "7 Commercial Envelope": [
        ...Array(4).fill(Array(42).fill("")),
        row42({ 0: "7.2", 9: "each", 11: "3" }),
      ],
    };
    expect(parseTypeA(sheets)).toHaveLength(1);
  });
});

describe("parseTypeA — item number filtering", () => {
  it("skips rows where col A does not match ^\\d+\\.\\d+$", () => {
    const sheets = {
      "7 Commercial Envelope": [
        ...Array(4).fill(Array(42).fill("")),
        row42({ 0: "SECTION HEADER", 11: "1" }),
        row42({ 0: "7.A", 11: "1" }),            // not numeric pattern
        row42({ 0: "", 11: "1" }),                // blank
        row42({ 0: "7.1.1", 11: "1" }),           // sub-item — too many dots
      ],
    };
    expect(parseTypeA(sheets)).toHaveLength(0);
  });
});

describe("parseTypeA — OEM extraction patterns", () => {
  it("extracts OEM via 'Part Number;' Cisco-style pattern", () => {
    const ciscoDesc = "Category - Cisco Catalyst\nPart Number;\nC9300-48P-E\nDescription;\nSwitch 48-port";
    const sheets = {
      "7 Commercial Envelope": [
        ...Array(4).fill(Array(42).fill("")),
        row42({ 0: "7.1", 5: ciscoDesc, 11: "1" }),
      ],
    };
    const [item] = parseTypeA(sheets);
    expect(item.partNumber).toBe("C9300-48P-E");
  });

  it("prefers 'Part#' over 'Part Number;' when both appear", () => {
    const desc = "Part# QFX100\nPart Number;\nOTHER-SKU";
    const sheets = {
      "7 Commercial Envelope": [
        ...Array(4).fill(Array(42).fill("")),
        row42({ 0: "7.1", 5: desc, 11: "1" }),
      ],
    };
    const [item] = parseTypeA(sheets);
    expect(item.partNumber).toBe("QFX100");
  });
});

describe("parseTypeA — blank price (template not yet filled)", () => {
  it("returns undefined unitPrice when col N is blank", () => {
    const sheets = {
      "7 Commercial Envelope": [
        ...Array(4).fill(Array(42).fill("")),
        row42({ 0: "7.1", 9: "each", 11: "1" }), // N (idx 13) left blank
      ],
    };
    const [item] = parseTypeA(sheets);
    expect(item.unitPrice).toBeUndefined();
  });
});

describe("parseTypeA — error cases", () => {
  it("throws when no 'Commercial Envelope' sheet exists", () => {
    expect(() =>
      parseTypeA({ "Sheet1": [], "Sheet2": [] })
    ).toThrow(/Commercial Envelope/);
  });

  it("throws on invalid input (not Record<string, string[][]>)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseTypeA(null as any)).toThrow();
  });

  it("returns empty array for an empty sheet (no data beyond system rows)", () => {
    const sheets = {
      "7 Commercial Envelope": Array(4).fill(Array(42).fill("")),
    };
    expect(parseTypeA(sheets)).toEqual([]);
  });
});

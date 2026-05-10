import { describe, it, expect } from "vitest";
import { parseTypeC } from "@/engines/e2/parsers/type-c-vendor-quote";

// 7-col row builder: A=0 unused, B=1 S.No, C=2 Desc, D=3 QTY,
// E=4 UnitPrice, F=5 TotalPrice, G=6 ETA
function row(overrides: Record<number, string>): string[] {
  const r = Array(7).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

const HEADER = row({ 1: "S.No", 2: "Description", 3: "QTY", 4: "U. Price (SAR)", 5: "T. Price (SAR)", 6: "Delivery ETA" });
const SECTION = row({ 1: "Section 1 — CyberSecurity Infrastructure" }); // D/E/F blank → section header
const ITEM_101 = row({ 1: "1.01", 2: "FortiGate 60F", 3: "2", 4: "5000", 5: "10000", 6: "6 weeks" });
const ITEM_102 = row({ 1: "1.02", 2: "FortiAuthenticator 200E", 3: "1", 4: "3000", 5: "3000" });
const ITEM_BLANK_PRICE = row({ 1: "2.01", 2: "Cisco Switch", 3: "4" }); // E blank → to fill
const SUBTOTAL = row({ 1: "Sub-Total", 5: "13000" }); // has F → not section header → skipped
const GRAND_TOTAL = row({ 2: "GRAND TOTAL", 5: "26000" }); // B blank, C has text, F non-blank → skipped

describe("parseTypeC — error cases", () => {
  it("returns empty array when no sheet has the expected header", () => {
    expect(parseTypeC({ Summary: [row({ 1: "x", 2: "y" })] })).toEqual([]);
  });

  it("throws on invalid input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseTypeC(null as any)).toThrow();
  });
});

describe("parseTypeC — basic item parsing", () => {
  const sheets = { "Infrastructure Details - BOM": [HEADER, SECTION, ITEM_101, ITEM_102] };

  it("returns two line items", () => {
    expect(parseTypeC(sheets)).toHaveLength(2);
  });

  it("maps itemNumber, description, qty correctly", () => {
    const [a] = parseTypeC(sheets);
    expect(a.itemNumber).toBe("1.01");
    expect(a.description).toBe("FortiGate 60F");
    expect(a.qty).toBe(2);
  });

  it("maps unitPrice and totalPrice", () => {
    const [a] = parseTypeC(sheets);
    expect(a.unitPrice).toBe(5000);
    expect(a.totalPrice).toBe(10000);
  });

  it("hardcodes currency to SAR", () => {
    const [a] = parseTypeC(sheets);
    expect(a.currency).toBe("SAR");
  });

  it("sets unit to empty string (no unit column)", () => {
    const [a] = parseTypeC(sheets);
    expect(a.unit).toBe("");
  });
});

describe("parseTypeC — section detection", () => {
  it("captures section from header row with no price data", () => {
    const sheets = { "BOM": [HEADER, SECTION, ITEM_101] };
    const [item] = parseTypeC(sheets);
    expect(item.section).toBe("Section 1 — CyberSecurity Infrastructure");
  });

  it("items before any section header have undefined section", () => {
    const sheets = { "BOM": [HEADER, ITEM_101] };
    const [item] = parseTypeC(sheets);
    expect(item.section).toBeUndefined();
  });

  it("section updates when a new section header appears", () => {
    const section2 = row({ 1: "Section 2 — Data Center" });
    const item201 = row({ 1: "2.01", 2: "Server", 3: "1", 4: "20000", 5: "20000" });
    const sheets = { "BOM": [HEADER, SECTION, ITEM_101, section2, item201] };
    const items = parseTypeC(sheets);
    expect(items[0].section).toBe("Section 1 — CyberSecurity Infrastructure");
    expect(items[1].section).toBe("Section 2 — Data Center");
  });

  it("does not treat sub-total rows as section headers", () => {
    const sheets = { "BOM": [HEADER, SECTION, SUBTOTAL, ITEM_102] };
    const [item] = parseTypeC(sheets);
    // Sub-total has non-blank F → not a section header; section unchanged from SECTION
    expect(item.section).toBe("Section 1 — CyberSecurity Infrastructure");
  });
});

describe("parseTypeC — blank unit price (template not filled)", () => {
  it("returns undefined unitPrice when E is blank", () => {
    const sheets = { "BOM": [HEADER, ITEM_BLANK_PRICE] };
    const [item] = parseTypeC(sheets);
    expect(item.unitPrice).toBeUndefined();
    expect(item.totalPrice).toBeUndefined();
  });
});

describe("parseTypeC — delivery ETA in metadata", () => {
  it("stores ETA in metadata.deliveryETA when G is non-blank", () => {
    const sheets = { "BOM": [HEADER, ITEM_101] };
    const [item] = parseTypeC(sheets);
    expect(item.metadata?.deliveryETA).toBe("6 weeks");
  });

  it("omits metadata when G is blank", () => {
    const sheets = { "BOM": [HEADER, ITEM_102] };
    const [item] = parseTypeC(sheets);
    expect(item.metadata).toBeUndefined();
  });
});

describe("parseTypeC — repeat header rows skipped", () => {
  it("skips rows where D='QTY' (mid-sheet header repeats)", () => {
    const sheets = { "BOM": [HEADER, ITEM_101, HEADER, ITEM_102] };
    expect(parseTypeC(sheets)).toHaveLength(2);
  });
});

describe("parseTypeC — rows with no qty are skipped", () => {
  it("skips decimal-numbered rows where D is blank", () => {
    const noQty = row({ 1: "3.01", 2: "Some item" });
    const sheets = { "BOM": [HEADER, noQty] };
    expect(parseTypeC(sheets)).toHaveLength(0);
  });
});

describe("parseTypeC — grand total and subtotal rows skipped", () => {
  it("skips rows that are not decimal-numbered and have non-blank F", () => {
    const sheets = { "BOM": [HEADER, GRAND_TOTAL, SUBTOTAL] };
    expect(parseTypeC(sheets)).toHaveLength(0);
  });
});

describe("parseTypeC — multi-sheet parsing", () => {
  it("parses items from all sheets that have the header", () => {
    const cybersec = [HEADER, ITEM_101];
    const datacenter = [HEADER, ITEM_BLANK_PRICE];
    const sheets = {
      "Infrastructure Details - BOM": cybersec,
      "CyberSecurity - BOM": datacenter,
    };
    expect(parseTypeC(sheets)).toHaveLength(2);
  });

  it("skips sheets without the header pattern", () => {
    const sheets = {
      "Infrastructure Details - BOM": [HEADER, ITEM_101],
      "Summary": [row({ 1: "Total", 5: "10000" })],
    };
    expect(parseTypeC(sheets)).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { parseTypeE } from "@/engines/e2/parsers/type-e-telecom";

// 12-col row builder: A=0 unused, B=1 ItemCode, C=2 ItemDesc,
// D=3 UOM, E=4 UnitPrice, F=5 STCQty, G=6 VendorQty,
// H=7 Gross, I=8 Discount, J=9 Net, K=10 NetUnitPrice, L=11 STCDesc
function row(overrides: Record<number, string>): string[] {
  const r = Array(12).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

const HEADER = row({ 1: "Item Code", 2: "Item Description", 3: "Unit of measurement", 4: "Unit Price", 5: "STC Requested Qty", 6: "Qty provided by Vendor", 7: "Total Gross Amount", 8: "Discount Amount", 9: "Payable Price (Net Amount)", 11: "STC ITEM DESCRIPTION FOR REFERENCE" });

// STC-defined: L non-blank, B/C/D/E all blank, F pre-filled by STC
const STC_ITEM = row({ 5: "1", 11: "MMSC system as per STC specs" });

// Vendor item: B+C non-blank, with pricing
const VENDOR_ITEM = row({
  1: "VND-MMSC-001",
  2: "Vendor MMSC Implementation",
  3: "LOT",
  4: "250000",
  5: "1",
  6: "1",
  7: "250000",
  8: "25000",
  9: "225000",
  11: "MMSC system as per STC specs",
});

const BLANK_ROW = row({});

describe("parseTypeE — error cases", () => {
  it("throws when no sheet has the expected header", () => {
    expect(() => parseTypeE({ Sheet1: [row({ 1: "Something" })] })).toThrow(
      /Item Code.*Unit Price|Unit Price.*Item Code/i
    );
  });

  it("throws on invalid input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseTypeE(null as any)).toThrow();
  });
});

describe("parseTypeE — STC-defined item", () => {
  const sheets = { Sheet1: [HEADER, STC_ITEM] };
  const [item] = parseTypeE(sheets);

  it("uses L as description", () => {
    expect(item.description).toBe("MMSC system as per STC specs");
  });

  it("generates synthetic item number STC-1", () => {
    expect(item.itemNumber).toBe("STC-1");
  });

  it("maps qty from col F (STC Requested Qty)", () => {
    expect(item.qty).toBe(1);
  });

  it("sets unitPrice to undefined (vendor to fill)", () => {
    expect(item.unitPrice).toBeUndefined();
  });

  it("hardcodes currency to KWD", () => {
    expect(item.currency).toBe("KWD");
  });

  it("sets unit to empty string", () => {
    expect(item.unit).toBe("");
  });
});

describe("parseTypeE — STC-defined item with blank qty is skipped", () => {
  it("skips STC-defined row when F is blank (malformed)", () => {
    const badStc = row({ 11: "Some STC item" }); // L non-blank, F blank
    const sheets = { Sheet1: [HEADER, badStc] };
    expect(parseTypeE(sheets)).toHaveLength(0);
  });
});

describe("parseTypeE — vendor item", () => {
  const sheets = { Sheet1: [HEADER, VENDOR_ITEM] };
  const [item] = parseTypeE(sheets);

  it("uses col B as itemNumber", () => {
    expect(item.itemNumber).toBe("VND-MMSC-001");
  });

  it("uses col C as description", () => {
    expect(item.description).toBe("Vendor MMSC Implementation");
  });

  it("maps unit from col D", () => {
    expect(item.unit).toBe("LOT");
  });

  it("maps unitPrice from col E", () => {
    expect(item.unitPrice).toBe(250000);
  });

  it("maps totalPrice from col J (net payable)", () => {
    expect(item.totalPrice).toBe(225000);
  });

  it("maps qty from col F (STC Requested Qty)", () => {
    expect(item.qty).toBe(1);
  });

  it("stores vendorQty in metadata", () => {
    expect(item.metadata?.vendorQty).toBe("1");
  });

  it("stores grossAmount in metadata", () => {
    expect(item.metadata?.grossAmount).toBe("250000");
  });

  it("stores discountAmount in metadata", () => {
    expect(item.metadata?.discountAmount).toBe("25000");
  });

  it("stores netAmount in metadata", () => {
    expect(item.metadata?.netAmount).toBe("225000");
  });

  it("stores stcDescription in metadata when L is non-blank", () => {
    expect(item.metadata?.stcDescription).toBe("MMSC system as per STC specs");
  });

  it("hardcodes currency to KWD", () => {
    expect(item.currency).toBe("KWD");
  });
});

describe("parseTypeE — row skipping", () => {
  it("skips fully blank rows", () => {
    const sheets = { Sheet1: [HEADER, BLANK_ROW, STC_ITEM] };
    expect(parseTypeE(sheets)).toHaveLength(1);
  });

  it("skips rows matching neither STC-defined nor vendor-item pattern", () => {
    // Only B filled, C blank → not vendor-item; L blank → not STC-defined
    const partial = row({ 1: "CODE-ONLY", 5: "3" });
    const sheets = { Sheet1: [HEADER, partial] };
    expect(parseTypeE(sheets)).toHaveLength(0);
  });
});

describe("parseTypeE — header in second sheet", () => {
  it("finds and parses the sheet containing the header when first sheet has none", () => {
    const uomSheet = [row({ 1: "Code", 2: "Description" }), row({ 1: "EA", 2: "Each" })];
    const sheets = {
      UOM: uomSheet,
      Sheet1: [HEADER, STC_ITEM],
    };
    expect(parseTypeE(sheets)).toHaveLength(1);
  });
});

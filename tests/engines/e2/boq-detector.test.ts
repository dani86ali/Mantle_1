import { describe, it, expect } from "vitest";
import { detectBoQType } from "@/engines/e2/boq-detector";
import { BoQType } from "@/engines/e2/boq-types";

describe("detectBoQType — TYPE_A_ARIBA (DET-001)", () => {
  it("detects Ariba via 'Intend To Respond Instructions' sheet", () => {
    expect(
      detectBoQType(
        ["Intend To Respond Instructions", "Submit Response Instructions", "DV_sheet_", "7 Commercial Envelope"],
        "Aramco_4203165713.xlsx",
        []
      )
    ).toBe(BoQType.TYPE_A_ARIBA);
  });

  it("detects Ariba via Aramco_XXXXXXXXXX filename (no matching sheet)", () => {
    expect(
      detectBoQType(
        ["Sheet1"],
        "STC/OGF/2024/Aramco_4203164336.xlsx",
        []
      )
    ).toBe(BoQType.TYPE_A_ARIBA);
  });

  it("TYPE_A wins over TYPE_B when both signals present", () => {
    // Ariba check precedes MAIN BOQ check
    expect(
      detectBoQType(
        ["Intend To Respond Instructions", "MAIN BOQ"],
        "file.xlsx",
        []
      )
    ).toBe(BoQType.TYPE_A_ARIBA);
  });
});

describe("detectBoQType — TYPE_B_NRM2_ADDOMMIT (DET-002)", () => {
  it("detects Add/Omit variant via 'Bill02a Main Works' sheet", () => {
    expect(
      detectBoQType(
        ["Bill01a-General Requirement", "Bill02a Main Works", "Summary"],
        "P3 Carpark Add-Omit BOQ_R01.xlsx",
        []
      )
    ).toBe(BoQType.TYPE_B_NRM2_ADDOMMIT);
  });

  it("detects any sheet starting with 'Bill02a'", () => {
    expect(
      detectBoQType(["Bill02a Structural Works"], "boq.xlsx", [])
    ).toBe(BoQType.TYPE_B_NRM2_ADDOMMIT);
  });
});

describe("detectBoQType — TYPE_B_NRM2 (DET-003)", () => {
  it("detects NRM2 base BoQ via 'MAIN BOQ' sheet", () => {
    expect(
      detectBoQType(
        ["General Requirments", "MAIN BOQ", "DAY Work BOQ", "Provisional Sum BOQ"],
        "BOQ.xlsx",
        [["REF.", "DESCRIPTION", "QTY", "UNIT", "RATE (SAR)", "TOTAL (SAR)"]]
      )
    ).toBe(BoQType.TYPE_B_NRM2);
  });
});

describe("detectBoQType — TYPE_E_TELECOM (DET-004)", () => {
  it("detects telecom RFQ via STC ITEM DESCRIPTION header + .xls extension", () => {
    expect(
      detectBoQType(
        ["Sheet1", "Sheet2"],
        "BoQ _MMSC.xls",
        [["Item Code", "Item Description", "Unit Price", "STC ITEM DESCRIPTION FOR REFERENCE"]]
      )
    ).toBe(BoQType.TYPE_E_TELECOM);
  });

  it("does NOT detect TYPE_E if extension is .xlsx", () => {
    expect(
      detectBoQType(
        ["Sheet1"],
        "BoQ.xlsx",
        [["Item Code", "STC ITEM DESCRIPTION FOR REFERENCE"]]
      )
    ).not.toBe(BoQType.TYPE_E_TELECOM);
  });
});

describe("detectBoQType — TYPE_C_VENDOR_QUOTE (DET-005)", () => {
  it("detects vendor quote template via 'U. Price' in headers", () => {
    expect(
      detectBoQType(
        ["Infrastructure Details - BOM", "CyberSecurity - BOM"],
        "NKJV-IT Infrastructure_BOQ.xlsx",
        [["S.No", "Description", "QTY", "U. Price (SAR)", "T. Price (SAR)", "Delivery ETA"]]
      )
    ).toBe(BoQType.TYPE_C_VENDOR_QUOTE);
  });
});

describe("detectBoQType — TYPE_D_BOM_NO_PRICE (DET-006)", () => {
  it("detects no-price BOM via 'Service Duration' + 'Part Number' in headers", () => {
    expect(
      detectBoQType(
        ["Active BoQ", "SOW and office bdown"],
        "Sindalah_Mainland_BOQ v3.1.xlsx",
        [["Line Number", "Part Number", "Description", "Service Duration (Months)", "Qty"]]
      )
    ).toBe(BoQType.TYPE_D_BOM_NO_PRICE);
  });
});

describe("detectBoQType — TYPE_UNKNOWN (DET-007)", () => {
  it("returns TYPE_UNKNOWN when no signals match", () => {
    expect(
      detectBoQType(["Sheet1"], "random_file.xlsx", [["Col A", "Col B"]])
    ).toBe(BoQType.TYPE_UNKNOWN);
  });

  it("returns TYPE_UNKNOWN for empty inputs", () => {
    expect(detectBoQType([], "unnamed.xlsx", [])).toBe(BoQType.TYPE_UNKNOWN);
  });
});

describe("detectBoQType — input validation (DET-008)", () => {
  it("throws when sheetNames is not an array", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      detectBoQType(null as any, "file.xlsx", [])
    ).toThrow();
  });
});

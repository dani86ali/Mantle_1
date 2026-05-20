import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { BoQType } from "@/engines/e2/boq-types";
import { parseBoQ } from "@/engines/e2/boq-parse";
import { readExcelFile } from "@/lib/io/excel-reader";
import { detectBoQType } from "@/engines/e2/boq-detector";
import { getCatalogMock } from "@/lib/adapters/_catalog-mock-data";

// Real-fixture acceptance tests — gated on fixture presence. They run the REAL
// (unmocked) extractor end-to-end via parseBoQ on the two CCW workbooks and
// must reproduce the prototype-validated reference output.
const MARAFIQ =
  "tests/fixtures/boq/Obsolete Network/Obsolete Network/NTT Documents/Quotes/Cisco/Clone__MARAFIQObsolete_Network_Hardware_Replacement.xlsx";
const HONEYWELL =
  "tests/fixtures/boq/NTT Documents/NTT Documents/Quote/Estimate_ZP164681679XP.xlsx";

const catalogSkus = Object.keys(getCatalogMock().items);

function parseFixture(path: string) {
  const excel = readExcelFile(path);
  const first = excel.sheets[excel.sheetNames[0]] ?? [];
  const type = detectBoQType(excel.sheetNames, excel.fileName, first.slice(0, 5));
  expect(type).toBe(BoQType.TYPE_UNKNOWN);
  return parseBoQ(type, excel.sheets, { catalogSkus });
}

describe.runIf(existsSync(MARAFIQ))("parseBoQ — MARAFIQ EstimateDetails", () => {
  it("extracts 19 lines from SKU col B with real Cisco SKUs", () => {
    const lines = parseFixture(MARAFIQ);
    expect(lines).toHaveLength(19);
    expect(lines[0].partNumber).toBe("CS-KIT-EQX-C-K9");
    expect(lines.slice(0, 6).map((l) => l.partNumber)).toEqual([
      "CS-KIT-EQX-C-K9", "CON-SNT-CSKITEK9", "CS-MIC-TABLE-J",
      "CON-SNT-CS5HEJMI", "PWR-CORD-GBR-F", "CAB-HDMI-MUL4K-9M",
    ]);
    // catalog hit confirms grounding data is real
    expect(catalogSkus).toContain("CS-MIC-TABLE-J");
  });
});

describe.runIf(existsSync(HONEYWELL))("parseBoQ — HoneyWell Price Estimate", () => {
  it("extracts 52 lines from SKU col A via deep header, no 'Initial Term' rows", () => {
    const lines = parseFixture(HONEYWELL);
    expect(lines).toHaveLength(52);
    expect(lines.slice(0, 6).map((l) => l.partNumber)).toEqual([
      "C9300X-48HX-A", "CON-L1NBX-C9300XY4", "C9300-DNX-A-48-3Y",
      "CON-L1SWX-93XA48MY", "C9300-NW-A-48", "SC9300UK9-1712",
    ]);
    expect(lines.some((l) => /Initial Term/i.test(l.partNumber ?? ""))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  parseFortinetPriceList,
  lookupFortinetSku,
  searchFortinetCatalog,
  FortinetProduct,
} from "@/engines/e2/fortinet-catalog";

// Mock sheet structured like the Q2 2026 ME&A "DataSet" tab.
// Header: Comments, Identifier, Product Family Group, Product, Product Type,
//         Item, SKU, Description #1, (blank), Price
const MOCK_SHEET: string[][] = [
  // Decoy sheet-like preamble in another sheet handled elsewhere; this is the
  // data sheet, header is row 0.
  [
    "Comments",
    "Identifier",
    "Product Family Group",
    "Product",
    "Product Type",
    "Item",
    "SKU",
    "Description #1",
    "",
    "Price",
  ],
  // FortiGate firewall — bare hardware
  ["", "FortiGate", "FG-200 to FG-900", "FortiGate", "HW", "FortiGate-601F", "FG-601F", "FortiGate-601F NGFW Appliance, 18x GE RJ45 ports", "", "8000"],
  // Bundle — has -BDL- in SKU, must be guard_bundle (not firewall)
  ["", "Bundle", "FG-200 to FG-900", "FortiGate", "HW", "Bundle", "FG-601F-BDL-950-36", "FortiGate-601F Hardware plus 3 Year UTP Bundle", "", "45000"],
  // FortiCare service
  ["", "FortiCare", "FortiGate", "FortiGate", "Service", "Care", "FC-10-F601F-247-02-12", "FortiGate-601F 1 Year 24x7 FortiCare", "", "1200"],
  // Switch
  ["", "FortiSwitch", "FortiSwitch", "FortiSwitch", "HW", "FortiSwitch-148F", "FS-148F", "FortiSwitch-148F 48-port managed switch", "", "3500"],
  // AP
  ["", "FortiAP", "FortiAP", "FortiAP", "HW", "FortiAP-221E", "FAP-221E", "FortiAP-221E indoor wireless access point", "", "600"],
  // Manager
  ["", "FortiManager", "FortiManager", "FortiManager", "HW", "FortiManager-200G", "FMG-200G", "FortiManager-200G centralized management appliance", "", "5000"],
  // Analyzer
  ["", "FortiAnalyzer", "FortiAnalyzer", "FortiAnalyzer", "HW", "FortiAnalyzer-200G", "FAZ-200G", "FortiAnalyzer-200G log/SIEM appliance", "", "4500"],
  // Other (transceiver)
  ["", "Accessories", "Misc Accessories", "Accessories", "HW", "Transceiver", "FN-TRAN-SFP+SR", "10GE SFP+ SR transceiver", "", "125"],
  // EOL flagged via comment
  ["End of Life", "FortiGate", "FG-200 to FG-900", "FortiGate", "HW", "FortiGate-500E", "FG-500E", "FortiGate-500E legacy E-series NGFW", "", "7200"],
  // Blank price row — must be skipped
  ["", "FortiGate", "FG-200 to FG-900", "FortiGate", "HW", "FortiGate-XYZ", "FG-XYZ", "FortiGate placeholder", "", ""],
  // Blank SKU row — must be skipped
  ["", "", "", "", "", "", "", "", "", "100"],
  // Price with comma formatting
  ["", "FortiGate", "FG-1000 to FG-4000", "FortiGate", "HW", "FortiGate-3001F", "FG-3001F", "FortiGate-3001F DC firewall", "", "96,607"],
];

const sheets = { DataSet: MOCK_SHEET };

describe("parseFortinetPriceList", () => {
  it("parses each row to a typed FortinetProduct", () => {
    const catalog = parseFortinetPriceList(sheets);
    // 10 data rows expected (FG-601F, FG-601F-BDL, FC-10, FS, FAP, FMG, FAZ, FN, FG-500E, FG-3001F).
    expect(catalog).toHaveLength(10);
  });

  it("categorizes a bare FortiGate SKU as firewall", () => {
    const catalog = parseFortinetPriceList(sheets);
    const p = lookupFortinetSku("FG-601F", catalog);
    expect(p?.category).toBe("firewall");
    expect(p?.family).toBe("FortiGate");
  });

  it("categorizes -BDL- SKU as guard_bundle, not firewall", () => {
    const catalog = parseFortinetPriceList(sheets);
    const p = lookupFortinetSku("FG-601F-BDL-950-36", catalog);
    expect(p?.category).toBe("guard_bundle");
  });

  it("categorizes FC-10 service SKU as care", () => {
    const catalog = parseFortinetPriceList(sheets);
    const p = lookupFortinetSku("FC-10-F601F-247-02-12", catalog);
    expect(p?.category).toBe("care");
  });

  it("categorizes by prefix: FS=switch, FAP=ap, FMG=manager, FAZ=analyzer", () => {
    const catalog = parseFortinetPriceList(sheets);
    expect(lookupFortinetSku("FS-148F", catalog)?.category).toBe("switch");
    expect(lookupFortinetSku("FAP-221E", catalog)?.category).toBe("ap");
    expect(lookupFortinetSku("FMG-200G", catalog)?.category).toBe("manager");
    expect(lookupFortinetSku("FAZ-200G", catalog)?.category).toBe("analyzer");
  });

  it("falls back to 'other' for unrecognized prefixes", () => {
    const catalog = parseFortinetPriceList(sheets);
    const p = lookupFortinetSku("FN-TRAN-SFP+SR", catalog);
    expect(p?.category).toBe("other");
  });

  it("extracts list price as number, handling comma-formatted values", () => {
    const catalog = parseFortinetPriceList(sheets);
    expect(lookupFortinetSku("FG-601F", catalog)?.listPriceUsd).toBe(8000);
    expect(lookupFortinetSku("FG-3001F", catalog)?.listPriceUsd).toBe(96607);
  });

  it("flags EOL from comments column", () => {
    const catalog = parseFortinetPriceList(sheets);
    const p = lookupFortinetSku("FG-500E", catalog);
    expect(p?.eol).toBe(true);
  });

  it("does not flag EOL on normal products", () => {
    const catalog = parseFortinetPriceList(sheets);
    expect(lookupFortinetSku("FG-601F", catalog)?.eol).toBe(false);
  });

  it("skips rows with blank SKU or blank price", () => {
    const catalog = parseFortinetPriceList(sheets);
    expect(catalog.find((p) => p.sku === "FG-XYZ")).toBeUndefined();
    expect(catalog.find((p) => p.sku === "")).toBeUndefined();
  });

  it("throws when no sheet has SKU + Price headers", () => {
    expect(() =>
      parseFortinetPriceList({ Sheet1: [["foo", "bar"], ["a", "b"]] })
    ).toThrow(/SKU\/Part Number/i);
  });

  it("auto-detects header row deeper than row 0", () => {
    const padded: string[][] = [
      ["", "", "", "", "", "", "", "", "", ""],
      ["Q2 2025 - USD - title banner", "", "", "", "", "", "", "", "", ""],
      MOCK_SHEET[0]!,
      MOCK_SHEET[1]!,
    ];
    const catalog = parseFortinetPriceList({ "Price List": padded });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.sku).toBe("FG-601F");
  });

  it("supports 'Part Number' / 'List Price' header aliases", () => {
    const alt: string[][] = [
      ["Part Number", "Description", "List Price"],
      ["FG-100F", "FortiGate-100F branch NGFW", "2500"],
    ];
    const catalog = parseFortinetPriceList({ Catalog: alt });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.sku).toBe("FG-100F");
    expect(catalog[0]!.listPriceUsd).toBe(2500);
    expect(catalog[0]!.description).toBe("FortiGate-100F branch NGFW");
  });
});

describe("lookupFortinetSku", () => {
  const catalog: FortinetProduct[] = parseFortinetPriceList(sheets);

  it("finds exact SKU match", () => {
    const p = lookupFortinetSku("FG-601F", catalog);
    expect(p?.sku).toBe("FG-601F");
  });

  it("is case-insensitive", () => {
    expect(lookupFortinetSku("fg-601f", catalog)?.sku).toBe("FG-601F");
    expect(lookupFortinetSku("Fg-601F", catalog)?.sku).toBe("FG-601F");
  });

  it("returns undefined for missing SKU", () => {
    expect(lookupFortinetSku("FG-DOES-NOT-EXIST", catalog)).toBeUndefined();
  });

  it("returns undefined for empty query", () => {
    expect(lookupFortinetSku("", catalog)).toBeUndefined();
  });
});

describe("searchFortinetCatalog", () => {
  const catalog: FortinetProduct[] = parseFortinetPriceList(sheets);

  it("returns partial SKU matches", () => {
    const results = searchFortinetCatalog("601F", catalog);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((r) => r.sku.includes("601F"))).toBe(true);
  });

  it("matches description text", () => {
    const results = searchFortinetCatalog("access point", catalog);
    expect(results.some((r) => r.sku === "FAP-221E")).toBe(true);
  });

  it("returns empty for no match", () => {
    expect(searchFortinetCatalog("nonsense-xyzzy", catalog)).toEqual([]);
  });

  it("returns empty for empty query", () => {
    expect(searchFortinetCatalog("   ", catalog)).toEqual([]);
  });

  it("caps results at 10", () => {
    const big: FortinetProduct[] = Array.from({ length: 25 }, (_, i) => ({
      sku: `FG-TEST-${i}`,
      description: `test firewall ${i}`,
      listPriceUsd: 1000 + i,
      category: "firewall",
      family: "FortiGate",
      eol: false,
    }));
    expect(searchFortinetCatalog("TEST", big)).toHaveLength(10);
  });
});

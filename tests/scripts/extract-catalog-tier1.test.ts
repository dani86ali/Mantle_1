import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import xlsx from "xlsx";
import {
  normalizeListPrice,
  parseTA,
  parseCCW,
  dedupe,
  routeAndParse,
  selectIngestionTargets,
  type Candidate,
} from "../../scripts/extract-catalog-tier1";

describe("normalizeListPrice", () => {
  it("returns 0 for null", () => {
    expect(normalizeListPrice(null)).toBe(0);
  });

  it("returns 0 for exactly 0", () => {
    expect(normalizeListPrice(0)).toBe(0);
  });

  it("clamps negatives to 0", () => {
    expect(normalizeListPrice(-5)).toBe(0);
  });

  it("preserves tiny positive prices (no minimum)", () => {
    expect(normalizeListPrice(0.01)).toBe(0.01);
  });

  it("preserves prices that the old MIN_PRICE=10 filter would have dropped", () => {
    expect(normalizeListPrice(9.99)).toBe(9.99);
  });

  it("preserves normal positive prices", () => {
    expect(normalizeListPrice(15000.5)).toBe(15000.5);
  });

  it("returns 0 for NaN", () => {
    expect(normalizeListPrice(NaN)).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(normalizeListPrice(Infinity)).toBe(0);
  });
});

describe("parseTA — $0 row regression", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  function writeFixture(rows: Array<{ d: string; g: string; h: string; l: number | null }>): string {
    const wb = xlsx.utils.book_new();
    const ws: xlsx.WorkSheet = {};
    let maxR = 1;
    rows.forEach((r, i) => {
      const row = 6 + i; // parser starts at r=5 (row 6)
      ws[`D${row}`] = { t: "s", v: r.d };
      ws[`G${row}`] = { t: "s", v: r.g };
      ws[`H${row}`] = { t: "s", v: r.h };
      if (r.l !== null) ws[`L${row}`] = { t: "n", v: r.l };
      maxR = row;
    });
    ws["!ref"] = `A1:L${maxR}`;
    xlsx.utils.book_append_sheet(wb, ws, "BoQ");
    const path = join(tmpdir(), `ta-test-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    xlsx.writeFile(wb, path);
    tmpFiles.push(path);
    return path;
  }

  it("retains a bundle-child SKU with L=0 (would be dropped before A1)", () => {
    const fp = writeFixture([
      { d: "Cisco", g: "C9500-DNA-48Y4C-A", h: "Catalyst 9500 DNA Advantage license", l: 0 },
    ]);
    const { entries, warning } = parseTA(fp, "test.xlsx", "OP-TEST-001", "2026-05-18");
    expect(warning).toBeUndefined();
    expect(entries).toHaveLength(1);
    expect(entries[0].sku).toBe("C9500-DNA-48Y4C-A");
    expect(entries[0].listPrice).toBe(0);
  });

  it("retains rows with blank/missing list price as listPrice=0", () => {
    const fp = writeFixture([
      { d: "Cisco", g: "C9K-T1-FANTRAY", h: "Fan tray blank", l: null },
    ]);
    const { entries } = parseTA(fp, "test.xlsx", "OP-TEST-002", "2026-05-18");
    expect(entries).toHaveLength(1);
    expect(entries[0].listPrice).toBe(0);
  });

  it("preserves non-zero priced rows untouched", () => {
    const fp = writeFixture([
      { d: "Cisco", g: "C9500-48Y4C-A", h: "Catalyst 9500 switch", l: 27500 },
    ]);
    const { entries } = parseTA(fp, "test.xlsx", "OP-TEST-003", "2026-05-18");
    expect(entries).toHaveLength(1);
    expect(entries[0].listPrice).toBe(27500);
  });
});

describe("dedupe — canonical price prefers most-recent non-zero", () => {
  function mkCand(o: Partial<Candidate> & { sku: string; listPrice: number; opportunityId: string; observedAt: string }): Candidate {
    return {
      sku: o.sku,
      description: o.description ?? "desc",
      vendor: o.vendor ?? "Cisco",
      listPrice: o.listPrice,
      currency: o.currency ?? "USD",
      opportunityId: o.opportunityId,
      observedAt: o.observedAt,
      source: o.source ?? "TA test",
      parser: o.parser ?? "TA",
    };
  }

  it("does NOT let a newer $0 bundle-child observation overwrite an older standalone price", () => {
    const cands: Candidate[] = [
      mkCand({ sku: "C9K-PWR-650WAC-R", listPrice: 1000, opportunityId: "OP-OLD", observedAt: "2024-01-15" }),
      mkCand({ sku: "C9K-PWR-650WAC-R", listPrice: 0, opportunityId: "OP-NEW", observedAt: "2025-12-01" }),
    ];
    const { entries } = dedupe(cands);
    expect(entries["C9K-PWR-650WAC-R"].listPrice).toBe(1000);
    expect(entries["C9K-PWR-650WAC-R"].priceObservations).toHaveLength(2);
  });

  it("still picks the newest observation when both are non-zero", () => {
    const cands: Candidate[] = [
      mkCand({ sku: "FOO", listPrice: 1000, opportunityId: "OP-A", observedAt: "2024-01-15", description: "old desc" }),
      mkCand({ sku: "FOO", listPrice: 1200, opportunityId: "OP-B", observedAt: "2025-12-01", description: "new desc" }),
    ];
    const { entries } = dedupe(cands);
    expect(entries["FOO"].listPrice).toBe(1200);
    expect(entries["FOO"].description).toBe("new desc");
  });

  it("falls back to most-recent observation when every observation is $0", () => {
    const cands: Candidate[] = [
      mkCand({ sku: "BAR", listPrice: 0, opportunityId: "OP-A", observedAt: "2024-01-15" }),
      mkCand({ sku: "BAR", listPrice: 0, opportunityId: "OP-B", observedAt: "2025-12-01", description: "newer" }),
    ];
    const { entries } = dedupe(cands);
    expect(entries["BAR"].listPrice).toBe(0);
    expect(entries["BAR"].description).toBe("newer");
  });
});

// A2: file-family widening + sheet-based router + bundle-child retention.

describe("selectIngestionTargets — accepts all families", () => {
  type Row = Parameters<typeof selectIngestionTargets>[0][number];
  function mk(family: string, path = `${family}/x.xlsx`): Row {
    return { path, customer: "Aramco", opId: "OP-X", sizeKB: 100, family };
  }

  it("keeps tender_analyzer, vendor_bom_xlsx, stc_bom_template, customer_boq_xlsx, and unknown rows", () => {
    const rows: Row[] = [
      mk("tender_analyzer"),
      mk("vendor_bom_xlsx"),
      mk("stc_bom_template"),
      mk("customer_boq_xlsx"),
      mk("unknown"),
    ];
    const kept = selectIngestionTargets(rows);
    expect(kept).toHaveLength(5);
    expect(kept.map((r) => r.family).sort()).toEqual([
      "customer_boq_xlsx",
      "stc_bom_template",
      "tender_analyzer",
      "unknown",
      "vendor_bom_xlsx",
    ]);
  });

  it("keeps unknown-family rows whose filename does NOT match the legacy Estimate_ pattern", () => {
    // Pre-A2 these would have been dropped by the Estimate_ regex.
    const rows: Row[] = [
      mk("unknown", "Quotes/OP2024148262__Aramco__RTR_Cisco_Catalyst_Switches_.xlsx"),
      mk("unknown", "Quotes/Aramco_UCaaS__STC_BOM_V2.xlsx"),
    ];
    const kept = selectIngestionTargets(rows);
    expect(kept).toHaveLength(2);
  });

  it("retains .xls binary rows so parsers can fail-gracefully on them (xlsx lib limitation)", () => {
    const rows: Row[] = [mk("tender_analyzer", "legacy.xls")];
    expect(selectIngestionTargets(rows)).toHaveLength(1);
  });

  it("drops rows with empty family (defensive against malformed INVENTORY)", () => {
    const rows: Row[] = [mk(""), mk("tender_analyzer")];
    expect(selectIngestionTargets(rows)).toHaveLength(1);
  });
});

describe("routeAndParse — sheet-based router", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  function writeCCWFixture(): string {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ["Line Number", "Item Name", "Smart Account Mandatory", "Description", "Group Name", "Service Duration", "Lead Time", "Included Item", "Qty", "Term", "ListPrice"],
      ["1.0", "C9300-48P-A", "No", "Catalyst 9300 48-port", "Default", "N/A", "28", "No", 1, "One Time", 5000],
    ]);
    // Sheet name matches the EstimateDetails_ regex so the router exercises that path.
    xlsx.utils.book_append_sheet(wb, ws, "EstimateDetails_AB123456789CD");
    const path = join(tmpdir(), `ccw-router-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    xlsx.writeFile(wb, path);
    tmpFiles.push(path);
    return path;
  }

  function writeTAFixture(): string {
    const wb = xlsx.utils.book_new();
    const ws: xlsx.WorkSheet = {};
    // Row 1 header probe must contain "Item # as per RFP" to be found by findTASheet.
    ws["A1"] = { t: "s", v: "Item # as per RFP" };
    // Data row at row 6 (parser starts r=5 / row 6).
    ws["D6"] = { t: "s", v: "Cisco" };
    ws["G6"] = { t: "s", v: "C9500-48Y4C-A" };
    ws["H6"] = { t: "s", v: "Catalyst 9500" };
    ws["L6"] = { t: "n", v: 27500 };
    ws["!ref"] = "A1:L6";
    // Use a non-preferred sheet name so the fallback header probe is the path that hits.
    xlsx.utils.book_append_sheet(wb, ws, "RFP Sheet");
    const path = join(tmpdir(), `ta-router-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    xlsx.writeFile(wb, path);
    tmpFiles.push(path);
    return path;
  }

  it("routes a CCW workbook through parseCCW", () => {
    const fp = writeCCWFixture();
    const result = routeAndParse(fp, "fixture.xlsx", "OP-CCW", "2026-05-18");
    expect(result.warning).toBeUndefined();
    expect(result.parserUsed).toBe("CCW");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sku).toBe("C9300-48P-A");
    expect(result.entries[0].parser).toBe("CCW");
  });

  it("falls back to parseTA when CCW reports no recognizable sheet", () => {
    const fp = writeTAFixture();
    const result = routeAndParse(fp, "fixture.xlsx", "OP-TA", "2026-05-18");
    expect(result.warning).toBeUndefined();
    expect(result.parserUsed).toBe("TA");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sku).toBe("C9500-48Y4C-A");
    expect(result.entries[0].parser).toBe("TA");
  });

  it("surfaces a combined warning when both parsers find nothing recognizable", () => {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([["Random", "Headers", "Here"], ["a", "b", "c"]]);
    xlsx.utils.book_append_sheet(wb, ws, "NotACCWOrTASheet");
    const fp = join(tmpdir(), `unknown-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    xlsx.writeFile(wb, fp);
    tmpFiles.push(fp);
    const result = routeAndParse(fp, "fixture.xlsx", "OP-X", "2026-05-18");
    expect(result.parserUsed).toBe("none");
    expect(result.warning).toMatch(/no recognizable CCW sheet/);
    expect(result.warning).toMatch(/no recognizable BoQ sheet/);
  });

  it("does not attempt TA when CCW cannot open the workbook (would also fail to open)", () => {
    const fp = join(tmpdir(), `does-not-exist-${Date.now()}.xlsx`);
    const result = routeAndParse(fp, "fixture.xlsx", "OP-X", "2026-05-18");
    expect(result.parserUsed).toBe("none");
    expect(result.warning).toBe("could not open workbook");
  });
});

describe("parseCCW — bundle-child retention (A2 regression guard)", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  it("retains H='Yes' (Included Item) rows that pre-A2 would have been dropped", () => {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ["Line Number", "Item Name", "Smart Account Mandatory", "Description", "Group Name", "Service Duration", "Lead Time", "Included Item", "Qty", "Term", "ListPrice"],
      ["1.0", "CTI-PARENT-BUN-K9", "-", "Parent",            "Default", "N/A", "N/A", "No",  1, "One Time", 0],
      ["1.1", "PWR-CHILD-K9",      "-", "Power Supply Child", "Default", "N/A", "N/A", "Yes", 1, "One Time", 0],
    ]);
    xlsx.utils.book_append_sheet(wb, ws, "EstimateDetails_AB123456789CD");
    const fp = join(tmpdir(), `ccw-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    xlsx.writeFile(wb, fp);
    tmpFiles.push(fp);

    const { entries, warning } = parseCCW(fp, "fixture.xlsx", "OP-BUNDLE", "2026-05-18");
    expect(warning).toBeUndefined();
    expect(entries).toHaveLength(2);
    const skus = entries.map((e) => e.sku).sort();
    expect(skus).toEqual(["CTI-PARENT-BUN-K9", "PWR-CHILD-K9"]);
    const child = entries.find((e) => e.sku === "PWR-CHILD-K9")!;
    expect(child.listPrice).toBe(0);
    expect(child.parser).toBe("CCW");
  });
});

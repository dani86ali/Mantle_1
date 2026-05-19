import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import xlsx from "xlsx";
import {
  normalizeListPrice,
  parseTA,
  dedupe,
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

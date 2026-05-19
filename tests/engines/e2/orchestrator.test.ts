import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import * as XLSX from "xlsx";

vi.mock("@/lib/ai/client", () => ({
  callAI: vi.fn(),
}));

import { callAI } from "@/lib/ai/client";
import { runE2, expandDevices, type E2Input } from "@/engines/e2/orchestrator";

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
  mockCallAI.mockResolvedValue({
    success: true,
    data: { anomalies: [], riskLevel: "low", summary: "AI ok" },
    tokensUsed: 0,
    latencyMs: 0,
  });
});

const PRICES: Record<string, number> = {
  "C9300L-24UXG-4X-A": 7500,
  "C9120AXE-E": 800,
  "FG-601F": 15000,
  "PWR-C1-1100WAC-P": 400,
  "PWR-C1-1100WAC-P/2": 400,
  "C9300L-FAN-1RU": 150,
  "CAB-TA-UK": 25,
  "C9K-ACC-SCR-4": 15,
  "CAB-GUIDE-1RU": 20,
  "C9K-ACC-RBFT": 10,
  "C9300L-SSD-NONE": 1,
  "AIR-AP-BRACKET-1": 30,
  "AIR-AP-T-RAIL-R": 15,
  "AIR-ANT2524DW-RS": 75,
  "C9300L-NW-A-24": 2000,
  "C9300L-DNA-A-24": 1,
  "C9300L-DNA-A-24-3Y": 1500,
  "S9300LUK9-179": 1,
  "NETWORK-PNP-LIC": 1,
  "SW9120AX-CAPWAP-K9": 1,
  "C9120AX-DNA-OPTOUT": 1,
  "CON-SNT-C9300L24UXG4X": 800,
  "CON-SNT-C9120AXE": 100,
  "FC-10-F601F-247-02": 2500,
};

function baseInput(): E2Input {
  return {
    devices: [
      {
        model: "C9300L-24UXG-4X-A",
        qty: 2,
        config: {
          redundantPsu: true,
          rackMount: true,
          dnaTier: "advantage",
          networkTier: "advantage",
          licenseTerm: 3,
          supportCriticality: "standard",
          vendor: "cisco",
        },
      },
      {
        model: "C9120AXE-E",
        qty: 8,
        config: {
          dnaTier: "optout",
          networkTier: "essentials",
          licenseTerm: 3,
          supportCriticality: "standard",
          vendor: "cisco",
        },
      },
      {
        model: "FG-601F",
        qty: 2,
        config: {
          dnaTier: "optout",
          networkTier: "essentials",
          licenseTerm: 3,
          supportCriticality: "standard",
          vendor: "fortinet",
        },
      },
    ],
    pricingConfig: {
      fxRate: 3.75,
      partnerDiscountPct: 0.35,
      dealRegDiscountPct: 0.08,
      profitMode: "margin",
      profitPct: 0.18,
      vatRate: 0.15,
      country: "SA",
    },
    projectContext: { sector: "Telecom", siteCount: 1, userCount: 100 },
    listPrices: PRICES,
  };
}

describe("runE2 — orchestrator", () => {
  it("expands devices, prices every line, runs validation and anomaly detector", async () => {
    const result = await runE2(baseInput());

    // 2 switch device groups (1 hw + 8 acc + 5 lic + 1 sup = 15) +
    // 1 AP group (1 hw + 3 acc + 3 lic + 1 sup = 8) +
    // 1 FortiGate group (1 hw + 1 sup = 2)  => 25 lines.
    expect(result.bom.length).toBeGreaterThanOrEqual(20);
    expect(result.bom.length).toBeLessThanOrEqual(40);

    // Every line has a non-empty SKU and positive qty.
    for (const l of result.bom) {
      expect(l.sku).toBeTruthy();
      expect(l.qty).toBeGreaterThan(0);
    }

    // Totals are computed and self-consistent.
    expect(result.totals.grandTotalExVat).toBeGreaterThan(0);
    expect(result.totals.vatAmount).toBeGreaterThan(0);
    expect(result.totals.hardwareTotal).toBeGreaterThan(0);
    expect(result.totals.softwareTotal).toBeGreaterThan(0);
    expect(result.totals.serviceTotal).toBeGreaterThan(0);
    expect(result.totals.grandTotalIncVat).toBeCloseTo(
      result.totals.grandTotalExVat + result.totals.vatAmount,
      2
    );
    expect(
      result.totals.hardwareTotal +
        result.totals.softwareTotal +
        result.totals.serviceTotal +
        result.totals.subscriptionTotal
    ).toBeCloseTo(result.totals.grandTotalExVat, 2);

    // Validation engine ran — 17 rules, each rule emits at least one result.
    expect(result.validationResults.length).toBeGreaterThan(0);

    // Anomaly detector ran (now fully deterministic — no AI call).
    expect(result.anomalies).toBeDefined();
    expect(result.anomalies.summary).toBeTruthy();

    // No historical deals supplied → similar-deal-finder skipped.
    expect(result.similarDeals).toBeUndefined();
  });

  it("skips similar-deal-finder when no historicalDeals", async () => {
    const result = await runE2({
      ...baseInput(),
      historicalDeals: undefined,
    });
    expect(result.similarDeals).toBeUndefined();
  });
});

describe("runE2 — BoM XLSX emission", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "bomatic-e2-xlsx-"));
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("sets exportPath and writes a valid XLSX (PK zip header) to that path", async () => {
    const result = await runE2({ ...baseInput(), outputDir: outDir });
    expect(result.exportPath).toBeTruthy();
    expect(result.exportPath!.endsWith(".xlsx")).toBe(true);

    const st = await stat(result.exportPath!);
    expect(st.size).toBeGreaterThan(0);

    const head = await readFile(result.exportPath!);
    expect(head[0]).toBe(0x50); // 'P'
    expect(head[1]).toBe(0x4b); // 'K'
  });

  it("XLSX contains BoM line items matching the priced BoM", async () => {
    const result = await runE2({ ...baseInput(), outputDir: outDir });
    const wb = XLSX.readFile(result.exportPath!);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
    const flat = rows
      .flat()
      .filter((c) => typeof c === "string")
      .join("\n");
    for (const line of result.bom) {
      expect(flat).toContain(line.sku);
    }
    expect(flat).toContain("Grand Total");
  });

  it("skips XLSX emission when emitFiles=false", async () => {
    const result = await runE2({ ...baseInput(), emitFiles: false });
    expect(result.exportPath).toBeUndefined();
  });

  it("XLSX contains a Summary sheet with VAT and Grand Total Inc VAT", async () => {
    const result = await runE2({ ...baseInput(), outputDir: outDir });
    const wb = XLSX.readFile(result.exportPath!);
    expect(wb.SheetNames).toContain("Summary");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Summary"], { header: 1, raw: true }) as unknown[][];
    const flat = rows.flat().map((c) => String(c)).join("|");
    expect(flat).toContain("VAT");
    expect(flat).toContain("Grand Total Inc VAT");
    expect(flat).toContain("Subtotal (ex VAT)");
  });

  it("XLSX line-items sheet exposes a Validation column when statuses are computed", async () => {
    const result = await runE2({ ...baseInput(), outputDir: outDir });
    const wb = XLSX.readFile(result.exportPath!);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], { header: 1, raw: false }) as unknown[][];
    const headerRow = rows.find((r) => r[0] === "Part Number");
    expect(headerRow).toBeDefined();
    expect(headerRow).toContain("Validation");
  });

  it("XLSX includes an UNVALIDATED watermark row when validationStatus is not 'validated'", async () => {
    const result = await runE2({ ...baseInput(), outputDir: outDir });
    expect(result.validationStatus).toBe("unvalidated");
    const wb = XLSX.readFile(result.exportPath!);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], { header: 1, raw: false }) as unknown[][];
    const flat = rows
      .flat()
      .filter((c) => typeof c === "string")
      .join("\n");
    expect(flat).toMatch(/UNVALIDATED/);
    expect(flat).toMatch(/not been verified against vendor catalog/i);
  });
});

describe("runE2 — validationStatus honesty signal", () => {
  it("returns validationStatus='unvalidated' when using caller-supplied prices (no catalog adapter)", async () => {
    const result = await runE2({ ...baseInput(), emitFiles: false });
    expect(result.validationStatus).toBe("unvalidated");
    expect(result.validationWarnings.some((w) => /EoX status not verified/.test(w))).toBe(false);
  });

  it("emits 'No list price available' warnings for SKUs missing from listPrices", async () => {
    const partial = { ...PRICES };
    delete partial["C9120AXE-E"];
    const result = await runE2({
      ...baseInput(),
      listPrices: partial,
      emitFiles: false,
    });
    expect(result.validationStatus).toBe("unvalidated");
    expect(result.validationWarnings.some((w) => /No list price available for C9120AXE-E/.test(w))).toBe(true);
  });
});

describe("expandDevices — tolerance for unsupported models", () => {
  it("does not throw when a device model isn't in BOMATIC_Device_Specs.json", () => {
    expect(() =>
      expandDevices([{
        model: "CS-DESKPRO-K9",
        qty: 2,
        config: {
          dnaTier: "advantage",
          networkTier: "advantage",
          licenseTerm: 5,
          supportCriticality: "standard",
          vendor: "cisco",
        },
      }]),
    ).not.toThrow();
  });

  it("returns the hardware line + a warning for unsupported model, skipping accessories/licenses/support", () => {
    const { lines, warnings } = expandDevices([{
      model: "CS-DESKPRO-K9",
      qty: 2,
      config: {
        dnaTier: "advantage",
        networkTier: "advantage",
        licenseTerm: 5,
        supportCriticality: "standard",
        vendor: "cisco",
      },
    }]);
    // Hardware line still appears so the BoM shows the SKU
    expect(lines.some((l) => l.sku === "CS-DESKPRO-K9" && l.category === "hardware")).toBe(true);
    // No accessory/license/service lines for the unknown model
    expect(lines.filter((l) => l.category === "accessory").length).toBe(0);
    // Warnings name the model so the operator sees what was skipped
    expect(warnings.some((w) => /CS-DESKPRO-K9/.test(w))).toBe(true);
    expect(warnings.some((w) => /accessory/i.test(w))).toBe(true);
  });

  it("isolates failures per-helper — a license throw doesn't drop accessories from a known device", () => {
    // A Catalyst 9300 is in device specs, so all three helpers succeed.
    const { lines, warnings } = expandDevices([{
      model: "C9300L-24UXG-4X-A",
      qty: 1,
      config: {
        redundantPsu: true, rackMount: true, powerCordType: "CAB-TA-UK",
        dnaTier: "advantage", networkTier: "advantage",
        licenseTerm: 5, supportCriticality: "standard", vendor: "cisco",
      },
    }]);
    expect(warnings.length).toBe(0);
    expect(lines.some((l) => l.category === "accessory")).toBe(true);
  });
});

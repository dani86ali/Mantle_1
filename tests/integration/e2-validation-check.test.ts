/**
 * Integration: E2 BoM → all 17 validation rules.
 *
 * Scenario 1 — correct BoM → zero rule errors.
 * Scenario 2 — secondary PSU removed → psu-redundancy fires.
 * Scenario 3 — C9120AXE-E antennas removed → antenna-count fires.
 */

import { describe, it, expect } from "vitest";
import { selectAccessories } from "@/engines/e2/accessory-selector";
import { calculateLicenses } from "@/engines/e2/licensing-calculator";
import { selectSupport } from "@/engines/e2/support-selector";
import { runValidation, summarizeResults } from "@/lib/validation/engine";
import type { BomLine, LineCategory } from "@/types/bom";
import type {
  ValidationContext,
  CatalogItemForValidation,
  TenantValidationStandards,
} from "@/types/validation";
import type { LicenseLine } from "@/engines/e2/licensing-calculator";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SW = "C9300L-24UXG-4X-A";
const AP = "C9120AXE-E";
const FW = "FG-601F";

const TENANT: TenantValidationStandards = {
  requireRedundantPsu: false, // psu-redundancy (SKU-level) is the authority; basic psu rule skips
  preferredLicenseTier: "advantage",
  preferredDnaTier: "advantage",
  defaultSupportLevel: "8x5xNBD",
  approvedProductFamilies: [],
  regionRestrictions: [],
};

// ─── Factory helpers ──────────────────────────────────────────────────────────

let _seq = 0;

function mkLine(
  sku: string, description: string, quantity: number, category: LineCategory,
): BomLine {
  const n = ++_seq;
  return {
    id: `L${n}`, lineNumber: n, sku, description, quantity,
    unitListPrice: 0, unitNetPrice: 0, discountPercent: 0, extendedNetPrice: 0,
    category, smartAccountMandatory: false, validationFlags: [],
    decision: "pending", catalogVerified: true,
  };
}

function licCat(c: LicenseLine["category"]): LineCategory {
  if (c === "dna_subscription") return "subscription";
  if (c === "network_license" || c === "addon") return "license";
  return "software";
}

function buildCatalog(lines: BomLine[]): Map<string, CatalogItemForValidation> {
  const m = new Map<string, CatalogItemForValidation>();
  for (const l of lines) {
    if (m.has(l.sku)) continue;
    const isApHw = l.category === "hardware" && l.sku.startsWith("C9") && l.sku.includes("AX");
    m.set(l.sku, {
      sku: l.sku, exists: true, eoxStatus: { isEox: false },
      regionAvailability: ["EMEAR"], category: l.category,
      productFamily: isApHw ? "Catalyst 9120AX Wireless" : undefined,
    });
  }
  return m;
}

function makeCtx(lines: BomLine[]): ValidationContext {
  return { lines, requirements: {}, region: "EMEAR", country: "SA",
    tenantStandards: TENANT, catalogData: buildCatalog(lines) };
}

// ─── BoM builder ──────────────────────────────────────────────────────────────

function buildCorrectBom(): BomLine[] {
  const lines: BomLine[] = [];

  // C9300L-24UXG-4X-A × 2 — redundant PSU + stacking (ring, N=2) + licenses + support
  lines.push(mkLine(SW, "Cisco Catalyst 9300L 24-port mGig switch", 2, "hardware"));
  selectAccessories(SW, 2, { redundantPsu: true }).forEach((a) =>
    lines.push(mkLine(a.sku, a.description, a.totalQty, "accessory")));
  lines.push(mkLine("C9300L-STACK-KIT", "Cisco StackWise stacking kit", 2, "accessory"));
  lines.push(mkLine("C9300L-STACK",     "Cisco StackWise-480 module",   4, "accessory"));
  lines.push(mkLine("STACK-T1-50CM",    "StackWise 50cm stacking cable", 2, "accessory"));
  calculateLicenses(SW, 2, {
    dnaTier: "advantage", networkTier: "advantage", term: 3,
    includeThousandEyes: true, includeDnaSpaces: true,
  }).forEach((l) => lines.push(mkLine(l.sku, l.description, l.qty, licCat(l.category))));
  selectSupport(SW, 2, { criticality: "standard", term: 36, vendor: "cisco" }).forEach((s) =>
    lines.push(mkLine(s.sku, s.description, s.qty, "service")));

  // C9120AXE-E × 8 — external antennas + DNA opt-out + support
  lines.push(mkLine(AP, "Cisco Catalyst 9120AX Wi-Fi 6 AP (external antenna)", 8, "hardware"));
  selectAccessories(AP, 8, {}).forEach((a) =>
    lines.push(mkLine(a.sku, a.description, a.totalQty, "accessory")));
  calculateLicenses(AP, 8, { dnaTier: "optout", networkTier: "essentials", term: 3 }).forEach(
    (l) => lines.push(mkLine(l.sku, l.description, l.qty, licCat(l.category))));
  selectSupport(AP, 8, { criticality: "standard", term: 36, vendor: "cisco" }).forEach((s) =>
    lines.push(mkLine(s.sku, s.description, s.qty, "service")));

  // FG-601F × 2 — FortiCare only (no Cisco license or accessories)
  lines.push(mkLine(FW, "Fortinet FortiGate 601F NGFW", 2, "hardware"));
  selectSupport(FW, 2, { criticality: "standard", term: 36, vendor: "fortinet" }).forEach((s) =>
    lines.push(mkLine(s.sku, s.description, s.qty, "service")));

  return lines;
}

// ─── Scenario 1: correct BoM ──────────────────────────────────────────────────

describe("Scenario 1 — correct BoM passes all 17 rules with zero errors", () => {
  it("overall: 0 rule errors", () => {
    const bom = buildCorrectBom();
    const results = runValidation(makeCtx(bom));
    const summary = summarizeResults(results);
    const failing = results
      .filter((r) => !r.passed && r.severity === "error")
      .map((r) => `[${r.ruleId}] ${r.message}`)
      .join("\n");
    expect(summary.errors, `Unexpected errors:\n${failing}`).toBe(0);
  });

  it("psu-redundancy: primary + secondary SKUs accepted", () => {
    const results = runValidation(makeCtx(buildCorrectBom()));
    expect(results.find((r) => r.ruleId === "psu-redundancy")?.passed).toBe(true);
  });

  it("stacking: kit + adapters + cables present for 2-switch stack", () => {
    const results = runValidation(makeCtx(buildCorrectBom()));
    expect(results.find((r) => r.ruleId === "stacking")?.passed).toBe(true);
  });

  it("antenna-count: correct antenna qty for 8× C9120AXE-E", () => {
    const results = runValidation(makeCtx(buildCorrectBom()));
    expect(results.find((r) => r.ruleId === "antenna-count")?.passed).toBe(true);
  });

  it("license: Cisco switches carry NW+DNA licenses (no errors)", () => {
    const results = runValidation(makeCtx(buildCorrectBom()));
    expect(results.filter((r) => r.ruleId === "license" && r.severity === "error")).toHaveLength(0);
  });

  it("support: SmartNet CON-SNT contracts present (no errors)", () => {
    const results = runValidation(makeCtx(buildCorrectBom()));
    expect(results.filter((r) => r.ruleId === "support" && r.severity === "error")).toHaveLength(0);
  });
});

// ─── Scenario 2: missing secondary PSU ───────────────────────────────────────

describe("Scenario 2 — secondary PSU removed → psu-redundancy error", () => {
  it("psu-redundancy fires when 4× primary replaces primary+secondary pair", () => {
    const bom = buildCorrectBom()
      .filter((l) => l.sku !== "PWR-C1-1100WAC-P/2")
      .map((l) => l.sku === "PWR-C1-1100WAC-P" ? { ...l, quantity: l.quantity * 2 } : l);

    // Verify the mutation is as expected before running validation
    expect(bom.filter((l) => l.sku === "PWR-C1-1100WAC-P/2")).toHaveLength(0);
    expect(bom.find((l) => l.sku === "PWR-C1-1100WAC-P")?.quantity).toBe(4);

    const results = runValidation(makeCtx(bom));
    const psuErrors = results.filter((r) => r.ruleId === "psu-redundancy" && !r.passed);
    expect(psuErrors.length).toBeGreaterThan(0);
    expect(psuErrors[0].severity).toBe("error");
    expect(psuErrors[0].message).toContain("PWR-C1-1100WAC-P/2");
  });

  it("no other rules produce new errors when only PSU config is broken", () => {
    const bom = buildCorrectBom()
      .filter((l) => l.sku !== "PWR-C1-1100WAC-P/2")
      .map((l) => l.sku === "PWR-C1-1100WAC-P" ? { ...l, quantity: l.quantity * 2 } : l);

    const results = runValidation(makeCtx(bom));
    const collateral = results.filter(
      (r) => !r.passed && r.severity === "error" && r.ruleId !== "psu-redundancy"
    );
    expect(collateral).toHaveLength(0);
  });
});

// ─── Scenario 3: missing antennas ────────────────────────────────────────────

describe("Scenario 3 — C9120AXE-E antennas removed → antenna-count error", () => {
  it("antenna-count fires when all antenna lines are absent", () => {
    const correct = buildCorrectBom();
    const antennaLine = correct.find((l) => l.description === "External antenna");
    expect(antennaLine, "Expected an External antenna line in the correct BoM").toBeDefined();
    const antennaSku = antennaLine!.sku;

    const bom = correct.filter((l) => l.sku !== antennaSku);
    const results = runValidation(makeCtx(bom));
    const antennaErrors = results.filter((r) => r.ruleId === "antenna-count" && !r.passed);
    expect(antennaErrors.length).toBeGreaterThan(0);
    expect(antennaErrors[0].severity).toBe("error");
    expect(antennaErrors[0].message).toContain(AP);
  });

  it("no other rules produce new errors when only antennas are missing", () => {
    const correct = buildCorrectBom();
    const antennaSku = correct.find((l) => l.description === "External antenna")?.sku ?? "";
    const bom = correct.filter((l) => l.sku !== antennaSku);

    const results = runValidation(makeCtx(bom));
    const collateral = results.filter(
      (r) => !r.passed && r.severity === "error" && r.ruleId !== "antenna-count"
    );
    expect(collateral).toHaveLength(0);
  });
});

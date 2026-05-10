import { describe, it, expect } from "vitest";
import { selectAccessories } from "@/engines/e2/accessory-selector";

// ── C9300L-24UXG-4X — Shahid ground-truth scenario (qty=2, redundant PSU) ──

describe("selectAccessories — C9300L-24UXG-4X redundant PSU (Shahid scenario)", () => {
  it("primary PSU: PWR-C1-1100WAC-P, qtyPerUnit=1, totalQty=2", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    const l = lines.find((x) => x.sku === "PWR-C1-1100WAC-P");
    expect(l).toBeDefined();
    expect(l!.qtyPerUnit).toBe(1);
    expect(l!.totalQty).toBe(2);
  });

  it("redundant PSU: PWR-C1-1100WAC-P/2, qtyPerUnit=1, totalQty=2", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    const l = lines.find((x) => x.sku === "PWR-C1-1100WAC-P/2");
    expect(l).toBeDefined();
    expect(l!.qtyPerUnit).toBe(1);
    expect(l!.totalQty).toBe(2);
  });

  it("fans: C9300L-FAN-1RU × 3 per unit (6 total)", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    const l = lines.find((x) => x.sku === "C9300L-FAN-1RU");
    expect(l).toBeDefined();
    expect(l!.qtyPerUnit).toBe(3);
    expect(l!.totalQty).toBe(6);
  });

  it("UK power cords: 2 per unit (1 per PSU) × 2 units = 4 total", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    const l = lines.find((x) => x.sku === "CAB-TA-UK");
    expect(l).toBeDefined();
    expect(l!.qtyPerUnit).toBe(2);
    expect(l!.totalQty).toBe(4);
  });

  it("rack screws: C9K-ACC-SCR-4 × 2", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    expect(lines.find((x) => x.sku === "C9K-ACC-SCR-4")?.totalQty).toBe(2);
  });

  it("cable guide: CAB-GUIDE-1RU × 2", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    expect(lines.find((x) => x.sku === "CAB-GUIDE-1RU")?.totalQty).toBe(2);
  });

  it("rubber feet: C9K-ACC-RBFT × 2", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    expect(lines.find((x) => x.sku === "C9K-ACC-RBFT")?.totalQty).toBe(2);
  });

  it("SSD-NONE: C9300L-SSD-NONE × 2", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    expect(lines.find((x) => x.sku === "C9300L-SSD-NONE")?.totalQty).toBe(2);
  });

  it("all lines have category=accessory", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 2, { redundantPsu: true });
    expect(lines.every((l) => l.category === "accessory")).toBe(true);
  });
});

// ── model suffix normalization ──────────────────────────────────────────────

describe("selectAccessories — model suffix normalization", () => {
  it("C9300L-24UXG-4X-A matches spec C9300L-24UXG-4X", () => {
    const lines = selectAccessories("C9300L-24UXG-4X-A", 1, {});
    expect(lines.find((l) => l.sku === "PWR-C1-1100WAC-P")).toBeDefined();
  });

  it("C9120AXE-E matches spec C9120AXE", () => {
    const lines = selectAccessories("C9120AXE-E", 1, {});
    expect(lines.find((l) => l.sku === "AIR-ANT2524DW-RS")).toBeDefined();
  });
});

// ── single PSU (no redundancy) ──────────────────────────────────────────────

describe("selectAccessories — single PSU", () => {
  it("cord qtyPerUnit=1 when redundantPsu is false", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 1, { redundantPsu: false });
    expect(lines.find((l) => l.sku === "CAB-TA-UK")?.qtyPerUnit).toBe(1);
  });

  it("no secondary PSU line when redundantPsu is false", () => {
    const lines = selectAccessories("C9300L-24UXG-4X", 1, {});
    expect(lines.find((l) => l.sku === "PWR-C1-1100WAC-P/2")).toBeUndefined();
  });
});

// ── C9120AXE — external antenna AP (Shahid scenario: qty=8) ────────────────

describe("selectAccessories — C9120AXE external antenna AP", () => {
  it("mounting bracket: AIR-AP-BRACKET-1 × 8", () => {
    const lines = selectAccessories("C9120AXE", 8, {});
    expect(lines.find((l) => l.sku === "AIR-AP-BRACKET-1")?.totalQty).toBe(8);
  });

  it("ceiling clip: AIR-AP-T-RAIL-R × 8", () => {
    const lines = selectAccessories("C9120AXE", 8, {});
    expect(lines.find((l) => l.sku === "AIR-AP-T-RAIL-R")?.totalQty).toBe(8);
  });

  it("4 antennas per AP: AIR-ANT2524DW-RS qtyPerUnit=4, totalQty=32", () => {
    const lines = selectAccessories("C9120AXE", 8, {});
    const ant = lines.find((l) => l.sku === "AIR-ANT2524DW-RS");
    expect(ant).toBeDefined();
    expect(ant!.qtyPerUnit).toBe(4);
    expect(ant!.totalQty).toBe(32);
  });

  it("no PSU lines for APs", () => {
    const lines = selectAccessories("C9120AXE", 8, {});
    expect(lines.find((l) => l.sku.startsWith("PWR-"))).toBeUndefined();
  });
});

// ── C9120AXI — internal antenna AP ─────────────────────────────────────────

describe("selectAccessories — C9120AXI internal antenna AP", () => {
  it("mounting bracket: AIR-AP-BRACKET-1 × 4", () => {
    const lines = selectAccessories("C9120AXI", 4, {});
    expect(lines.find((l) => l.sku === "AIR-AP-BRACKET-1")?.totalQty).toBe(4);
  });

  it("ceiling clip: AIR-AP-T-RAIL-R × 4", () => {
    const lines = selectAccessories("C9120AXI", 4, {});
    expect(lines.find((l) => l.sku === "AIR-AP-T-RAIL-R")?.totalQty).toBe(4);
  });

  it("no antenna SKU for internal antenna model", () => {
    const lines = selectAccessories("C9120AXI", 4, {});
    expect(lines.find((l) => l.sku === "AIR-ANT2524DW-RS")).toBeUndefined();
  });

  it("exactly 2 lines: bracket + clip only", () => {
    const lines = selectAccessories("C9120AXI", 4, {});
    expect(lines).toHaveLength(2);
  });
});

// ── custom power cord ───────────────────────────────────────────────────────

describe("selectAccessories — custom power cord", () => {
  it("uses provided powerCordType instead of default CAB-TA-UK", () => {
    const lines = selectAccessories("C9300L-24P-4X", 1, { powerCordType: "CAB-TA-EU" });
    expect(lines.find((l) => l.sku === "CAB-TA-EU")).toBeDefined();
    expect(lines.find((l) => l.sku === "CAB-TA-UK")).toBeUndefined();
  });
});

// ── validation ──────────────────────────────────────────────────────────────

describe("selectAccessories — validation", () => {
  it("throws on unknown model", () => {
    expect(() => selectAccessories("UNKNOWN-XYZ", 1, {})).toThrow();
  });

  it("throws on qty=0", () => {
    expect(() => selectAccessories("C9300L-24UXG-4X", 0, {})).toThrow();
  });

  it("throws on negative qty", () => {
    expect(() => selectAccessories("C9300L-24UXG-4X", -1, {})).toThrow();
  });

  it("throws on fractional qty", () => {
    expect(() => selectAccessories("C9300L-24UXG-4X", 1.5, {})).toThrow();
  });

  it("throws on empty model string", () => {
    expect(() => selectAccessories("", 1, {})).toThrow();
  });
});

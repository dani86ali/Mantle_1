import { describe, it, expect } from "vitest";
import { calculateLicenses } from "@/engines/e2/licensing-calculator";

// ── Shahid ground truth section 3: C9300L-24UXG-4X-A, qty=2 ────────────────
// DNA Advantage 3Y + ThousandEyes + DNA Spaces

const GT_SWITCH_SKUS = [
  "C9300L-NW-A-24",
  "C9300L-DNA-A-24",
  "C9300L-DNA-A-24-3Y",
  "TE-EMBEDDED-T",
  "TE-EMBEDDED-T-3Y",
  "TE-C9K-SW",
  "D-DNAS-EXT-S-T",
  "D-DNAS-EXT-S-3Y",
  "S9300LUK9-179",
  "NETWORK-PNP-LIC",
];

describe("calculateLicenses — C9300L-24UXG-4X-A (ground truth §3)", () => {
  const lines = calculateLicenses("C9300L-24UXG-4X-A", 2, {
    dnaTier: "advantage",
    networkTier: "advantage",
    term: 3,
    includeThousandEyes: true,
    includeDnaSpaces: true,
  });

  it("produces exactly 10 line items", () => {
    expect(lines).toHaveLength(10);
  });

  it("SKU set matches ground truth exactly", () => {
    expect(lines.map((l) => l.sku).sort()).toEqual([...GT_SWITCH_SKUS].sort());
  });

  it("all quantities are 2 (one per switch)", () => {
    expect(lines.every((l) => l.qty === 2)).toBe(true);
  });

  it("network license category", () => {
    expect(lines.find((l) => l.sku === "C9300L-NW-A-24")?.category).toBe("network_license");
  });

  it("DNA parent + child are dna_subscription", () => {
    expect(lines.find((l) => l.sku === "C9300L-DNA-A-24")?.category).toBe("dna_subscription");
    expect(lines.find((l) => l.sku === "C9300L-DNA-A-24-3Y")?.category).toBe("dna_subscription");
  });

  it("ThousandEyes lines are addon", () => {
    expect(lines.find((l) => l.sku === "TE-EMBEDDED-T")?.category).toBe("addon");
    expect(lines.find((l) => l.sku === "TE-EMBEDDED-T-3Y")?.category).toBe("addon");
    expect(lines.find((l) => l.sku === "TE-C9K-SW")?.category).toBe("addon");
  });

  it("DNA Spaces lines are addon", () => {
    expect(lines.find((l) => l.sku === "D-DNAS-EXT-S-T")?.category).toBe("addon");
    expect(lines.find((l) => l.sku === "D-DNAS-EXT-S-3Y")?.category).toBe("addon");
  });
});

// ── Shahid ground truth section 4: C9120AXE-E, qty=8, DNA optout ────────────

describe("calculateLicenses — C9120AXE-E optout (ground truth §4)", () => {
  const lines = calculateLicenses("C9120AXE-E", 8, {
    dnaTier: "optout",
    networkTier: "essentials",
    term: 3,
  });

  it("produces exactly 3 line items", () => {
    expect(lines).toHaveLength(3);
  });

  it("SW9120AX-CAPWAP-K9 qty=8", () => {
    expect(lines.find((l) => l.sku === "SW9120AX-CAPWAP-K9")?.qty).toBe(8);
  });

  it("C9120AX-DNA-OPTOUT qty=8", () => {
    expect(lines.find((l) => l.sku === "C9120AX-DNA-OPTOUT")?.qty).toBe(8);
  });

  it("NETWORK-PNP-LIC qty=8", () => {
    expect(lines.find((l) => l.sku === "NETWORK-PNP-LIC")?.qty).toBe(8);
  });

  it("no network license for AP", () => {
    expect(lines.find((l) => l.sku.includes("-NW-"))).toBeUndefined();
  });

  it("no switch software image for AP", () => {
    expect(lines.find((l) => l.sku === "S9300LUK9-179")).toBeUndefined();
  });

  it("no DNA parent/child for AP optout", () => {
    expect(lines.find((l) => /DNA-[AEP]-/.test(l.sku))).toBeUndefined();
  });
});

// ── Variant scenarios ────────────────────────────────────────────────────────

describe("calculateLicenses — variants", () => {
  it("C9300 (non-L) 48-port gets C9300- prefix", () => {
    const lines = calculateLicenses("C9300-48P", 1, {
      dnaTier: "advantage",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines.find((l) => l.sku === "C9300-NW-A-48")).toBeDefined();
    expect(lines.find((l) => l.sku === "C9300-DNA-A-48")).toBeDefined();
    expect(lines.find((l) => l.sku === "C9300-DNA-A-48-3Y")).toBeDefined();
  });

  it("essentials tier generates -E SKUs", () => {
    const lines = calculateLicenses("C9300L-24UXG-4X", 1, {
      dnaTier: "essentials",
      networkTier: "essentials",
      term: 5,
    });
    expect(lines.find((l) => l.sku === "C9300L-NW-E-24")).toBeDefined();
    expect(lines.find((l) => l.sku === "C9300L-DNA-E-24")).toBeDefined();
    expect(lines.find((l) => l.sku === "C9300L-DNA-E-24-5Y")).toBeDefined();
  });

  it("premier tier generates -P SKUs with 7Y term", () => {
    const lines = calculateLicenses("C9300L-48T", 1, {
      dnaTier: "premier",
      networkTier: "advantage",
      term: 7,
    });
    expect(lines.find((l) => l.sku === "C9300L-DNA-P-48")).toBeDefined();
    expect(lines.find((l) => l.sku === "C9300L-DNA-P-48-7Y")).toBeDefined();
  });

  it("no ThousandEyes lines when not requested", () => {
    const lines = calculateLicenses("C9300L-24UXG-4X", 1, {
      dnaTier: "advantage",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines.find((l) => l.sku.startsWith("TE-"))).toBeUndefined();
  });

  it("no DNA Spaces lines when not requested", () => {
    const lines = calculateLicenses("C9300L-24UXG-4X", 1, {
      dnaTier: "advantage",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines.find((l) => l.sku.startsWith("D-DNAS"))).toBeUndefined();
  });

  it("switch optout retains network license, no DNA parent/child", () => {
    const lines = calculateLicenses("C9300L-24UXG-4X", 1, {
      dnaTier: "optout",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines.find((l) => l.sku === "C9300L-NW-A-24")).toBeDefined();
    expect(lines.find((l) => /DNA-[AEP]-/.test(l.sku))).toBeUndefined();
  });

  it("AP without optout: only software + PnP (2 lines)", () => {
    const lines = calculateLicenses("C9120AXI", 4, {
      dnaTier: "advantage",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.sku === "C9120AX-DNA-OPTOUT")).toBeUndefined();
  });
});

// ── FG-601F — FortiGate FortiGuard bundles ─────────────────────────────────

describe("calculateLicenses — FG-601F FortiGate", () => {
  it("advantage (UTP) → FC-10-F601F-950-02 + firmware", () => {
    const lines = calculateLicenses("FG-601F", 1, {
      dnaTier: "advantage",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.sku === "FG-601F-FW")?.category).toBe("software");
    const utp = lines.find((l) => l.sku === "FC-10-F601F-950-02");
    expect(utp).toBeDefined();
    expect(utp!.category).toBe("dna_subscription");
    expect(utp!.qty).toBe(1);
  });

  it("essentials → ATP bundle (-928-)", () => {
    const lines = calculateLicenses("FG-601F", 1, {
      dnaTier: "essentials",
      networkTier: "essentials",
      term: 3,
    });
    expect(lines.find((l) => l.sku === "FC-10-F601F-928-02")).toBeDefined();
  });

  it("premier → Enterprise Protection bundle (-811-)", () => {
    const lines = calculateLicenses("FG-601F", 2, {
      dnaTier: "premier",
      networkTier: "advantage",
      term: 5,
    });
    const ep = lines.find((l) => l.sku === "FC-10-F601F-811-02");
    expect(ep).toBeDefined();
    expect(ep!.qty).toBe(2);
  });

  it("optout → firmware only, no FortiGuard bundle", () => {
    const lines = calculateLicenses("FG-601F", 1, {
      dnaTier: "optout",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines).toHaveLength(1);
    expect(lines.find((l) => l.sku === "FG-601F-FW")).toBeDefined();
    expect(lines.find((l) => l.sku.startsWith("FC-10-"))).toBeUndefined();
  });

  it("no Cisco-only lines on FortiGate", () => {
    const lines = calculateLicenses("FG-601F", 1, {
      dnaTier: "advantage",
      networkTier: "advantage",
      term: 3,
    });
    expect(lines.find((l) => l.sku === "NETWORK-PNP-LIC")).toBeUndefined();
    expect(lines.find((l) => l.sku === "S9300LUK9-179")).toBeUndefined();
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("calculateLicenses — validation", () => {
  const base = { dnaTier: "advantage" as const, networkTier: "advantage" as const, term: 3 as const };

  it("throws on empty model string", () => {
    expect(() => calculateLicenses("", 1, base)).toThrow();
  });

  it("throws on qty=0", () => {
    expect(() => calculateLicenses("C9300L-24UXG-4X", 0, base)).toThrow();
  });

  it("throws on fractional qty", () => {
    expect(() => calculateLicenses("C9300L-24UXG-4X", 1.5, base)).toThrow();
  });

  it("throws on invalid term value", () => {
    expect(() =>
      calculateLicenses("C9300L-24UXG-4X", 1, { ...base, term: 4 as unknown as 3 })
    ).toThrow();
  });

  it("throws on unsupported switch family", () => {
    expect(() => calculateLicenses("C9200-24T", 1, base)).toThrow();
  });
});

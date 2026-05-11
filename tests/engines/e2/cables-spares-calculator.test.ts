import { describe, it, expect } from "vitest";
import {
  calculateCables,
  calculateSpares,
} from "@/engines/e2/cables-spares-calculator";

// ── calculateCables — switches ──────────────────────────────────────────────

describe("calculateCables — switches", () => {
  it("10 access switches → 20 uplink patches + 1 console", () => {
    const lines = calculateCables([
      { model: "C9300L-24P-4X", qty: 10, role: "access" },
    ]);
    const patch = lines.find((l) => l.sku === "CAB-ETH-S-RJ45=");
    expect(patch).toBeDefined();
    expect(patch!.qty).toBe(20);
    expect(patch!.type).toBe("patch");

    const console_ = lines.find((l) => l.sku === "CAB-CON-RJ45");
    expect(console_).toBeDefined();
    expect(console_!.qty).toBe(1);
    expect(console_!.type).toBe("console");
  });

  it("unique console cable count = unique switch models, not device count", () => {
    const lines = calculateCables([
      { model: "C9300L-24P-4X", qty: 4, role: "access" },
      { model: "C9300L-48P-4X", qty: 2, role: "access" },
      { model: "C9300-24T",     qty: 1, role: "distribution" },
    ]);
    expect(lines.find((l) => l.sku === "CAB-CON-RJ45")!.qty).toBe(3);
    // uplinks: (4+2+1) × 2 = 14
    expect(lines.find((l) => l.sku === "CAB-ETH-S-RJ45=")!.qty).toBe(14);
  });

  it("no switch lines emitted when devices list has no switches", () => {
    const lines = calculateCables([
      { model: "C9120AXE", qty: 3, role: "ap" },
    ]);
    expect(lines.find((l) => l.sku === "CAB-ETH-S-RJ45=")).toBeUndefined();
    expect(lines.find((l) => l.sku === "CAB-CON-RJ45")).toBeUndefined();
  });
});

// ── calculateCables — access points ─────────────────────────────────────────

describe("calculateCables — access points", () => {
  it("8 APs → 8 Cat6A patch cables", () => {
    const lines = calculateCables([
      { model: "C9120AXE", qty: 8, role: "ap" },
    ]);
    const c6a = lines.find((l) => l.sku === "CAB-C6A-3M");
    expect(c6a).toBeDefined();
    expect(c6a!.qty).toBe(8);
    expect(c6a!.type).toBe("patch");
  });

  it("AP cables independent of switch uplink cables", () => {
    const lines = calculateCables([
      { model: "C9300L-24P-4X", qty: 2, role: "access" },
      { model: "C9120AXE",      qty: 5, role: "ap" },
    ]);
    expect(lines.find((l) => l.sku === "CAB-ETH-S-RJ45=")!.qty).toBe(4);
    expect(lines.find((l) => l.sku === "CAB-C6A-3M")!.qty).toBe(5);
  });
});

// ── calculateCables — rack-to-rack trunks ───────────────────────────────────

describe("calculateCables — rack-to-rack trunks", () => {
  it("rackCount=2 → 1 trunk cable (1 pair)", () => {
    const lines = calculateCables(
      [{ model: "C9300L-24P-4X", qty: 1, role: "access" }],
      2
    );
    const trunk = lines.find((l) => l.sku === "CAB-ETH-TRUNK-10M");
    expect(trunk).toBeDefined();
    expect(trunk!.qty).toBe(1);
    expect(trunk!.type).toBe("trunk");
  });

  it("rackCount=4 → 6 trunk cables (4*3/2 pairs)", () => {
    const lines = calculateCables(
      [{ model: "C9300L-24P-4X", qty: 1, role: "access" }],
      4
    );
    expect(lines.find((l) => l.sku === "CAB-ETH-TRUNK-10M")!.qty).toBe(6);
  });

  it("rackCount=1 → no trunk cables", () => {
    const lines = calculateCables(
      [{ model: "C9300L-24P-4X", qty: 1, role: "access" }],
      1
    );
    expect(lines.find((l) => l.sku === "CAB-ETH-TRUNK-10M")).toBeUndefined();
  });

  it("undefined rackCount → no trunk cables", () => {
    const lines = calculateCables([
      { model: "C9300L-24P-4X", qty: 1, role: "access" },
    ]);
    expect(lines.find((l) => l.sku === "CAB-ETH-TRUNK-10M")).toBeUndefined();
  });
});

// ── calculateCables — output shape ──────────────────────────────────────────

describe("calculateCables — output shape", () => {
  it("all lines have category=cable", () => {
    const lines = calculateCables(
      [
        { model: "C9300L-24P-4X", qty: 2, role: "access" },
        { model: "C9120AXE",      qty: 3, role: "ap" },
      ],
      3
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.category === "cable")).toBe(true);
  });
});

// ── calculateCables — validation ────────────────────────────────────────────

describe("calculateCables — validation", () => {
  it("throws on qty=0", () => {
    expect(() =>
      calculateCables([{ model: "C9300L-24P-4X", qty: 0, role: "access" }])
    ).toThrow();
  });

  it("throws on negative rackCount", () => {
    expect(() =>
      calculateCables([{ model: "C9300L-24P-4X", qty: 1, role: "access" }], -1)
    ).toThrow();
  });

  it("throws on unknown role", () => {
    expect(() =>
      // @ts-expect-error — runtime validation test
      calculateCables([{ model: "X", qty: 1, role: "spine" }])
    ).toThrow();
  });
});

// ── calculateSpares — basic ─────────────────────────────────────────────────

describe("calculateSpares — basic", () => {
  it("20 switches at 5% → 1 spare (ceil(20*0.05)=1)", () => {
    const spares = calculateSpares(
      [{ sku: "C9300L-24P-4X", qty: 20, category: "hardware" }],
      0.05
    );
    expect(spares).toHaveLength(1);
    expect(spares[0].sku).toBe("C9300L-24P-4X");
    expect(spares[0].qty).toBe(1);
    expect(spares[0].category).toBe("spare");
  });

  it("default spareRate=0.05 when omitted", () => {
    const spares = calculateSpares([
      { sku: "C9300L-24P-4X", qty: 20, category: "hardware" },
    ]);
    expect(spares[0].qty).toBe(1);
  });

  it("100 accessories at 5% → 5 spares", () => {
    const spares = calculateSpares(
      [{ sku: "CAB-TA-UK", qty: 100, category: "accessory" }],
      0.05
    );
    expect(spares[0].qty).toBe(5);
  });

  it("ceil rounds up: 21 × 0.05 = 1.05 → 2 spares", () => {
    const spares = calculateSpares(
      [{ sku: "C9300L-24P-4X", qty: 21, category: "hardware" }],
      0.05
    );
    expect(spares[0].qty).toBe(2);
  });
});

// ── calculateSpares — skip rules ────────────────────────────────────────────

describe("calculateSpares — skip rules", () => {
  it("qty < 10 → no spare line", () => {
    const spares = calculateSpares(
      [{ sku: "C9300L-24P-4X", qty: 9, category: "hardware" }],
      0.05
    );
    expect(spares).toHaveLength(0);
  });

  it("qty = 10 → spare emitted (boundary inclusive)", () => {
    const spares = calculateSpares(
      [{ sku: "C9300L-24P-4X", qty: 10, category: "hardware" }],
      0.05
    );
    expect(spares).toHaveLength(1);
    expect(spares[0].qty).toBe(1);
  });

  it("software lines skipped even at high qty", () => {
    const spares = calculateSpares(
      [{ sku: "S9300LUK9-179", qty: 100, category: "software" }],
      0.05
    );
    expect(spares).toHaveLength(0);
  });

  it("license/support/addon lines all skipped", () => {
    const spares = calculateSpares(
      [
        { sku: "C9300L-DNA-A-24",     qty: 50, category: "dna_subscription" },
        { sku: "C9300L-NW-A-24",      qty: 50, category: "network_license" },
        { sku: "CON-SNT-C93024GA",    qty: 50, category: "support" },
        { sku: "TE-EMBEDDED-T",       qty: 50, category: "addon" },
      ],
      0.05
    );
    expect(spares).toHaveLength(0);
  });

  it("mixed BoM: only hardware/accessory ≥10 emit spares", () => {
    const spares = calculateSpares(
      [
        { sku: "C9300L-24P-4X", qty: 20, category: "hardware" },
        { sku: "S9300LUK9-179", qty: 20, category: "software" },
        { sku: "CAB-TA-UK",     qty: 20, category: "accessory" },
        { sku: "TE-EMBEDDED-T", qty: 20, category: "addon" },
      ],
      0.05
    );
    expect(spares.map((s) => s.sku).sort()).toEqual(
      ["C9300L-24P-4X", "CAB-TA-UK"].sort()
    );
  });
});

// ── calculateSpares — validation ────────────────────────────────────────────

describe("calculateSpares — validation", () => {
  it("throws on spareRate > 1", () => {
    expect(() =>
      calculateSpares(
        [{ sku: "X", qty: 10, category: "hardware" }],
        1.5
      )
    ).toThrow();
  });

  it("throws on negative spareRate", () => {
    expect(() =>
      calculateSpares(
        [{ sku: "X", qty: 10, category: "hardware" }],
        -0.01
      )
    ).toThrow();
  });

  it("throws on empty sku", () => {
    expect(() =>
      calculateSpares([{ sku: "", qty: 10, category: "hardware" }], 0.05)
    ).toThrow();
  });
});

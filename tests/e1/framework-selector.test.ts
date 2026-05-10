import { describe, it, expect } from "vitest";
import { selectFrameworks } from "@/engines/e1/framework-selector";

// Helper: get framework IDs from result
const ids = (sector: string, country: string, stds: string[] = []) =>
  selectFrameworks(sector, country, stds).map((f) => f.id);

// --- Task-specified test cases ---

describe("selectFrameworks — oil_and_gas + KSA (Aramco) gets SACS-002", () => {
  it("includes SACS_002", () => {
    const result = selectFrameworks("oil_and_gas", "KSA", []);
    expect(result.some((f) => f.id === "SACS_002")).toBe(true);
  });

  it("includes NCA_ECC and ISO_27001 alongside SACS_002", () => {
    const frameIds = ids("oil_and_gas", "KSA");
    expect(frameIds).toContain("NCA_ECC");
    expect(frameIds).toContain("ISO_27001");
    expect(frameIds).toContain("SACS_002");
  });

  it("NCA_ECC and SACS_002 are primary; ISO_27001 is secondary", () => {
    const result = selectFrameworks("oil_and_gas", "KSA", []);
    const byId = Object.fromEntries(result.map((f) => [f.id, f]));
    expect(byId.NCA_ECC.priority).toBe("primary");
    expect(byId.SACS_002.priority).toBe("primary");
    expect(byId.ISO_27001.priority).toBe("secondary");
  });

  it("all entries have source=sector_mapping", () => {
    const result = selectFrameworks("oil_and_gas", "KSA", []);
    expect(result.every((f) => f.source === "sector_mapping")).toBe(true);
  });
});

describe("selectFrameworks — banking + KSA gets SAMA CSF", () => {
  it("includes SAMA_CSF", () => {
    const result = selectFrameworks("banking", "KSA", []);
    expect(result.some((f) => f.id === "SAMA_CSF")).toBe(true);
  });

  it("SAMA_CSF is primary", () => {
    const result = selectFrameworks("banking", "KSA", []);
    const sama = result.find((f) => f.id === "SAMA_CSF");
    expect(sama?.priority).toBe("primary");
  });

  it("includes NCA_ECC and ISO_27001 as secondary", () => {
    const result = selectFrameworks("banking", "KSA", []);
    const byId = Object.fromEntries(result.map((f) => [f.id, f]));
    expect(byId.NCA_ECC.priority).toBe("secondary");
    expect(byId.ISO_27001.priority).toBe("secondary");
  });
});

describe("selectFrameworks — unknown sector + KSA defaults to NCA ECC + ISO 27001", () => {
  it("unknown sector falls back to NCA_ECC + ISO_27001", () => {
    const frameIds = ids("unknown_sector", "KSA");
    expect(frameIds).toContain("NCA_ECC");
    expect(frameIds).toContain("ISO_27001");
  });

  it("general sector + KSA returns NCA_ECC + ISO_27001", () => {
    const frameIds = ids("general", "KSA");
    expect(frameIds).toContain("NCA_ECC");
    expect(frameIds).toContain("ISO_27001");
  });

  it("default has exactly 2 entries with no extra frameworks", () => {
    const result = selectFrameworks("unknown_sector", "KSA", []);
    expect(result).toHaveLength(2);
  });

  it("NCA_ECC is primary in default", () => {
    const result = selectFrameworks("unknown_sector", "KSA", []);
    const nca = result.find((f) => f.id === "NCA_ECC");
    expect(nca?.priority).toBe("primary");
  });
});

describe("selectFrameworks — explicitly referenced standard always included", () => {
  it("NIST_CSF is added even for government+KSA (not in sector mapping)", () => {
    const result = selectFrameworks("government", "KSA", ["NIST_CSF"]);
    expect(result.some((f) => f.id === "NIST_CSF")).toBe(true);
  });

  it("explicitly referenced standard has source=explicitly_referenced", () => {
    const result = selectFrameworks("government", "KSA", ["NIST_CSF"]);
    const nist = result.find((f) => f.id === "NIST_CSF");
    expect(nist?.source).toBe("explicitly_referenced");
  });

  it("NIST_CSF added for any sector", () => {
    const sectors = ["oil_and_gas", "banking", "healthcare", "general"];
    for (const sector of sectors) {
      const result = selectFrameworks(sector, "KSA", ["NIST_CSF"]);
      expect(result.some((f) => f.id === "NIST_CSF")).toBe(true);
    }
  });

  it("explicitly referenced standard already in mapping is not duplicated", () => {
    // NCA_ECC is in government+KSA mapping; passing it explicitly must not duplicate it
    const result = selectFrameworks("government", "KSA", ["NCA_ECC"]);
    const ncaEntries = result.filter((f) => f.id === "NCA_ECC");
    expect(ncaEntries).toHaveLength(1);
  });

  it("multiple explicit standards all appear in result", () => {
    const result = selectFrameworks("general", "KSA", ["NIST_CSF", "SACS_002"]);
    const frameIds = result.map((f) => f.id);
    expect(frameIds).toContain("NIST_CSF");
    expect(frameIds).toContain("SACS_002");
  });
});

describe("selectFrameworks — country-level defaults", () => {
  it("any sector + UAE returns ISO_27001 (primary) + NESA (secondary)", () => {
    const result = selectFrameworks("government", "UAE", []);
    const byId = Object.fromEntries(result.map((f) => [f.id, f]));
    expect(byId.ISO_27001?.priority).toBe("primary");
    expect(byId.NESA?.priority).toBe("secondary");
  });

  it("any sector + International returns ISO_27001 (primary) + NIST_CSF (secondary)", () => {
    const result = selectFrameworks("banking", "International", []);
    const byId = Object.fromEntries(result.map((f) => [f.id, f]));
    expect(byId.ISO_27001?.priority).toBe("primary");
    expect(byId.NIST_CSF?.priority).toBe("secondary");
  });
});

describe("selectFrameworks — Zod schema validation", () => {
  it("every result entry has all required fields", () => {
    const result = selectFrameworks("oil_and_gas", "KSA", ["NIST_CSF"]);
    for (const f of result) {
      expect(typeof f.id).toBe("string");
      expect(typeof f.name).toBe("string");
      expect(["sector_mapping", "explicitly_referenced"]).toContain(f.source);
      expect(["primary", "secondary"]).toContain(f.priority);
    }
  });
});

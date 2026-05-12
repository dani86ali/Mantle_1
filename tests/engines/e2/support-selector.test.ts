import { describe, it, expect } from "vitest";
import { selectSupport } from "@/engines/e2/support-selector";

describe("selectSupport", () => {
  describe("Cisco switches", () => {
    it("C9300L-24UXG-4X standard 36mo → CON-SNT-C93024GA", () => {
      const result = selectSupport("C9300L-24UXG-4X", 2, {
        criticality: "standard",
        term: 36,
        vendor: "cisco",
      });

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe("CON-SNT-C93024GA");
      expect(result[0].tier).toBe("SmartNet 8x5xNBD");
      expect(result[0].qty).toBe(2);
      expect(result[0].termMonths).toBe(36);
    });

    it("C9300L-24UXG-4X mission_critical → CON-SSSNT SKU", () => {
      const result = selectSupport("C9300L-24UXG-4X", 1, {
        criticality: "mission_critical",
        term: 60,
        vendor: "cisco",
      });

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe("CON-SSSNT-C93024GA");
      expect(result[0].tier).toBe("SmartNet 24x7x4");
    });

    it("fallback model encoding strips dashes", () => {
      const result = selectSupport("C9300-24P", 1, {
        criticality: "standard",
        term: 36,
        vendor: "cisco",
      });

      expect(result[0].sku).toBe("CON-SNT-C930024P");
    });
  });

  describe("Cisco APs", () => {
    it("C9120AXE criticality none → empty array (no SmartNet on APs)", () => {
      const result = selectSupport("C9120AXE", 10, {
        criticality: "none",
        term: 36,
        vendor: "cisco",
      });

      expect(result).toHaveLength(0);
    });

    it("C9120AXI standard → CON-SNT SKU (same tier logic as switches)", () => {
      const result = selectSupport("C9120AXI", 4, {
        criticality: "standard",
        term: 36,
        vendor: "cisco",
      });

      expect(result).toHaveLength(1);
      expect(result[0].sku).toMatch(/^CON-SNT-/);
      expect(result[0].tier).toBe("SmartNet 8x5xNBD");
    });
  });

  describe("Fortinet", () => {
    it("FortiGate-201F mission_critical → FortiCare Elite SKU", () => {
      const result = selectSupport("FortiGate-201F", 1, {
        criticality: "mission_critical",
        term: 36,
        vendor: "fortinet",
      });

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe("FC-10-F201F-284-02");
      expect(result[0].tier).toBe("FortiCare Elite");
    });

    it("FortiGate-201F standard → FortiCare Premium 24x7 SKU", () => {
      const result = selectSupport("FortiGate-201F", 2, {
        criticality: "standard",
        term: 12,
        vendor: "fortinet",
      });

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe("FC-10-F201F-247-02");
      expect(result[0].tier).toBe("FortiCare Premium 24x7");
    });

    it("FG-601F standard → FC-10-F601F-247-02 (model encoding works)", () => {
      const result = selectSupport("FG-601F", 1, {
        criticality: "standard",
        term: 36,
        vendor: "fortinet",
      });

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe("FC-10-F601F-247-02");
      expect(result[0].tier).toBe("FortiCare Premium 24x7");
    });

    it("Fortinet criticality none → empty array", () => {
      const result = selectSupport("FortiGate-200F", 3, {
        criticality: "none",
        term: 36,
        vendor: "fortinet",
      });

      expect(result).toHaveLength(0);
    });
  });

  describe("term passthrough", () => {
    it("term 12 is reflected in output termMonths", () => {
      const result = selectSupport("C9300L-24UXG-4X", 1, {
        criticality: "standard",
        term: 12,
        vendor: "cisco",
      });
      expect(result[0].termMonths).toBe(12);
    });

    it("term 60 is reflected in output termMonths", () => {
      const result = selectSupport("FortiGate-201F", 1, {
        criticality: "standard",
        term: 60,
        vendor: "fortinet",
      });
      expect(result[0].termMonths).toBe(60);
    });
  });

  describe("qty passthrough", () => {
    it("qty is reflected on each output line", () => {
      const result = selectSupport("C9300L-24UXG-4X", 5, {
        criticality: "standard",
        term: 36,
        vendor: "cisco",
      });
      expect(result[0].qty).toBe(5);
    });
  });
});

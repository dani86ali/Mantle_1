import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock dependencies before importing adapter
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
    pipeline: vi.fn(() => ({
      setex: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    del: vi.fn().mockResolvedValue(1),
  },
  tenantKey: (...parts: string[]) => parts.join(":"),
}));

vi.mock("@/lib/db/queries", () => ({
  appendAuditLog: vi.fn().mockResolvedValue({}),
}));

// Set mock mode
process.env.CISCO_API_MODE = "mock";

import { getItems, getMappedServices } from "@/lib/adapters/catalog";

const testOptions = {
  tenantId: "test-tenant-001",
  priceListId: "Global Price List Emerging (USD)",
  credentials: {
    clientId: "test-client",
    clientSecret: "test-secret",
    username: "test-user",
    password: "test-pass",
  },
};

describe("Catalog Adapter (mock mode)", () => {
  describe("getItems", () => {
    it("returns catalog data for known SKUs", async () => {
      const result = await getItems(
        ["C9300L-24UXG-4X-A", "C9120AXE-E"],
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.items[0].sku).toBe("C9300L-24UXG-4X-A");
      expect(result.data?.items[0].listPrice).toBe(13960.0);
      expect(result.data?.items[1].sku).toBe("C9120AXE-E");
      expect(result.data?.items[1].listPrice).toBe(2354.48);
    });

    it("returns errors for unknown SKUs", async () => {
      const result = await getItems(
        ["INVALID-SKU-999"],
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(0);
      expect(result.data?.errors).toHaveLength(1);
      expect(result.data?.errors![0].errorCode).toBe("SKU_NOT_FOUND");
    });

    it("returns mixed results for valid and invalid SKUs", async () => {
      const result = await getItems(
        ["C9300L-24UXG-4X-A", "INVALID-SKU-999", "C9120AXE-E"],
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.errors).toHaveLength(1);
    });

    it("rejects batch > 1000 SKUs", async () => {
      const bigBatch = Array.from({ length: 1001 }, (_, i) => `SKU-${i}`);
      const result = await getItems(bigBatch, testOptions);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("BATCH_TOO_LARGE");
    });

    it("returns EoX information for EoX SKUs", async () => {
      const result = await getItems(
        ["EOX-SWITCH-EXAMPLE"],
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.items[0].eoxInfo.isEox).toBe(true);
      expect(result.data?.items[0].eoxInfo.migrationProductId).toBe(
        "C9300-48P-A"
      );
    });

    it("returns region availability data", async () => {
      const result = await getItems(
        ["REGION-BLOCKED-SKU"],
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.items[0].regionAvailability).toEqual(["AMER"]);
    });

    it("returns hardware specs for switches", async () => {
      const result = await getItems(
        ["C9300L-24UXG-4X-A"],
        testOptions
      );

      expect(result.success).toBe(true);
      const specs = result.data?.items[0].specs;
      expect(specs?.portCount).toBe(24);
      expect(specs?.poeBudgetWatts).toBe(880);
      expect(specs?.sfpSlots).toBe(4);
      expect(specs?.stackable).toBe(true);
      expect(specs?.fanModulesRequired).toBe(3);
    });

    it("simulates rate limit error", async () => {
      process.env.CISCO_MOCK_ERROR = "rate_limit";
      const result = await getItems(["C9300L-24UXG-4X-A"], testOptions);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RATE_LIMITED");
      delete process.env.CISCO_MOCK_ERROR;
    });
  });

  describe("getMappedServices", () => {
    it("returns mapped services for C9300L", async () => {
      const result = await getMappedServices(
        "C9300L-24UXG-4X-A",
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.services.length).toBeGreaterThan(0);
      expect(result.data?.licenses.length).toBeGreaterThan(0);
      expect(result.data?.accessories.length).toBeGreaterThan(0);

      // Verify specific accessories from ground truth
      const stackKit = result.data?.accessories.find(
        (a) => a.sku === "C9300L-STACK-KIT"
      );
      expect(stackKit).toBeDefined();
      expect(stackKit?.listPrice).toBe(1592.03);
    });

    it("returns mapped services for wireless AP", async () => {
      const result = await getMappedServices("C9120AXE-E", testOptions);

      expect(result.success).toBe(true);
      // External antenna AP should have antennas in accessories
      const antennas = result.data?.accessories.find(
        (a) => a.sku === "AIR-ANT2524DW-RS"
      );
      expect(antennas).toBeDefined();
      expect(antennas?.quantity).toBe(4); // 4 antennas per AP
    });

    it("returns error for unknown hardware SKU", async () => {
      const result = await getMappedServices(
        "NONEXISTENT-HW",
        testOptions
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SKU_NOT_FOUND");
    });
  });
});

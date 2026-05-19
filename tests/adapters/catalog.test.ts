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
    // Fixture SKUs picked from post-A3 catalog by high bidFrequency (stability under
    // future re-ingestion). GLC-LH-SMD: bf=58. STACK-T1-50CM: bf=45.
    it("returns catalog data for known SKUs", async () => {
      const result = await getItems(
        ["GLC-LH-SMD", "STACK-T1-50CM"],
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.items[0].sku).toBe("GLC-LH-SMD");
      expect(result.data?.items[0].listPrice).toBe(995);
      expect(result.data?.items[1].sku).toBe("STACK-T1-50CM");
      expect(result.data?.items[1].listPrice).toBe(117.98);
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
        ["GLC-LH-SMD", "INVALID-SKU-999", "STACK-T1-50CM"],
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

    // The pre-Tier-1 mock hand-curated a synthetic EOX-SWITCH-EXAMPLE SKU with
    // migrationProductId. The post-A3 extractor sources from real bid TA workbooks
    // + CCW Estimates which carry sku/description/listPrice/vendor/regionAvailability
    // but not EoX bulletins — every ingested SKU has eoxInfo: { isEox: false }.
    // Real EoX lookup will be a separate Cisco API integration (backlog B9).
    it("returns eoxInfo.isEox=false for ingested SKUs (EoX data is a future Cisco API integration, not bid-observable)", async () => {
      const result = await getItems(["GLC-LH-SMD"], testOptions);

      expect(result.success).toBe(true);
      expect(result.data?.items[0].eoxInfo.isEox).toBe(false);
    });

    it("returns region availability data", async () => {
      const result = await getItems(["GLC-LH-SMD"], testOptions);

      expect(result.success).toBe(true);
      expect(result.data?.items[0].regionAvailability).toEqual([
        "EMEAR",
        "APJC",
        "AMER",
        "MEA",
      ]);
    });

    // Hardware specs (portCount, poeBudgetWatts, etc.) live in
    // src/engines/e5/device-specs.ts — see tests/engines/e5/sizing-calculator.test.ts
    // for that coverage. The catalog adapter does not return specs.

    it("simulates rate limit error", async () => {
      process.env.CISCO_MOCK_ERROR = "rate_limit";
      const result = await getItems(["GLC-LH-SMD"], testOptions);
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

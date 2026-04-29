import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
  tenantKey: (...parts: string[]) => parts.join(":"),
}));

vi.mock("@/lib/db/queries", () => ({
  appendAuditLog: vi.fn().mockResolvedValue({}),
}));

process.env.CISCO_API_MODE = "mock";

import { searchCustomer, validateCustomer } from "@/lib/adapters/customer";

const testOptions = {
  tenantId: "test-tenant-001",
  credentials: {
    clientId: "test-client",
    clientSecret: "test-secret",
    username: "test-user",
    password: "test-pass",
  },
};

describe("Customer Registry Adapter (mock mode)", () => {
  describe("searchCustomer", () => {
    it("finds NTT Data by name", async () => {
      const result = await searchCustomer(
        { companyName: "NTT Data" },
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.totalResults).toBeGreaterThan(0);
      expect(result.data?.customers[0].companyName).toContain("NTT");
    });

    it("finds Dimension Data by name", async () => {
      const result = await searchCustomer(
        { companyName: "Dimension Data", country: "SA" },
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.customers[0].country).toBe("SA");
    });

    it("returns empty results for unknown customer", async () => {
      const result = await searchCustomer(
        { companyName: "Completely Unknown Corp XYZ" },
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.totalResults).toBe(0);
      expect(result.data?.customers).toHaveLength(0);
    });

    it("finds CDW by name", async () => {
      const result = await searchCustomer(
        { companyName: "CDW" },
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.customers[0].companyName).toContain("CDW");
    });

    it("finds Gulf Business Machines", async () => {
      const result = await searchCustomer(
        { companyName: "Gulf Business" },
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.customers[0].country).toBe("BH");
    });
  });

  describe("validateCustomer", () => {
    it("validates a known customer ID", async () => {
      const result = await validateCustomer(
        "CUST-001-NTT",
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(true);
    });

    it("rejects an unknown customer ID", async () => {
      const result = await validateCustomer(
        "UNKNOWN-999",
        testOptions
      );

      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(false);
    });
  });
});

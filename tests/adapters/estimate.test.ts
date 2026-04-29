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

import {
  createEstimate,
  updateEstimate,
  acquireEstimate,
} from "@/lib/adapters/estimate";

const testOptions = {
  tenantId: "test-tenant-001",
  credentials: {
    clientId: "test-client",
    clientSecret: "test-secret",
    username: "test-user",
    password: "test-pass",
  },
};

describe("Estimate Adapter (mock mode)", () => {
  it("creates an estimate and returns estimate ID + CCW URL", async () => {
    const result = await createEstimate(
      {
        estimateName: "Test Estimate",
        priceListId: "Global Price List Emerging (USD)",
        lineItems: [
          { sku: "C9300L-24UXG-4X-A", quantity: 2 },
          { sku: "C9300L-DNA-A-24-3Y", quantity: 2 },
        ],
      },
      testOptions
    );

    expect(result.success).toBe(true);
    expect(result.data?.estimateId).toBeTruthy();
    expect(result.data?.ccwUrl).toContain("cisco.com");
    expect(result.data?.status).toBe("DRAFT");
  });

  it("updates an existing estimate", async () => {
    const result = await updateEstimate(
      "OG164161387AE",
      {
        estimateName: "Updated Estimate",
        priceListId: "Global Price List Emerging (USD)",
        lineItems: [{ sku: "C9300L-24UXG-4X-A", quantity: 4 }],
      },
      testOptions
    );

    expect(result.success).toBe(true);
    expect(result.data?.estimateId).toBe("OG164161387AE");
  });

  it("acquires an estimate with line items", async () => {
    const result = await acquireEstimate("OG164161387AE", testOptions);

    expect(result.success).toBe(true);
    expect(result.data?.estimateId).toBe("OG164161387AE");
    expect(result.data?.lineItems?.length).toBeGreaterThan(0);
  });

  it("handles auth failure error injection", async () => {
    process.env.CISCO_MOCK_ERROR = "auth_failure";

    const result = await createEstimate(
      {
        estimateName: "Fail Test",
        priceListId: "Global Price List Emerging (USD)",
        lineItems: [{ sku: "C9300L-24UXG-4X-A", quantity: 1 }],
      },
      testOptions
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("AUTH_FAILURE");

    delete process.env.CISCO_MOCK_ERROR;
  });

  it("handles rate limit error injection", async () => {
    process.env.CISCO_MOCK_ERROR = "rate_limit";

    const result = await createEstimate(
      {
        estimateName: "Rate Limit Test",
        priceListId: "Global Price List Emerging (USD)",
        lineItems: [{ sku: "C9300L-24UXG-4X-A", quantity: 1 }],
      },
      testOptions
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RATE_LIMITED");

    delete process.env.CISCO_MOCK_ERROR;
  });
});

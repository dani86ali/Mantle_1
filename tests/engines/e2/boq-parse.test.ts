import { describe, it, expect, vi, beforeEach } from "vitest";
import { BoQType } from "@/engines/e2/boq-types";
import { parseBoQ } from "@/engines/e2/boq-parse";

// Mock the typed parsers and the generic extractor so we can assert routing
// without reconstructing each parser's fixture. Sentinels prove dispatch.
vi.mock("@/engines/e2/parsers/type-a-ariba", () => ({
  parseTypeA: vi.fn(() => [{ itemNumber: "A" }]),
}));
vi.mock("@/engines/e2/parsers/type-b-nrm2", () => ({
  parseTypeB: vi.fn((_s: unknown, variant: string) => [{ itemNumber: `B-${variant}` }]),
}));
vi.mock("@/engines/e2/parsers/type-c-vendor-quote", () => ({
  parseTypeC: vi.fn(() => [{ itemNumber: "C" }]),
}));
vi.mock("@/engines/e2/parsers/type-d-bom", () => ({
  parseTypeD: vi.fn(() => [{ itemNumber: "D" }]),
}));
vi.mock("@/engines/e2/parsers/type-e-telecom", () => ({
  parseTypeE: vi.fn(() => [{ itemNumber: "E" }]),
}));
vi.mock("@/lib/io/tabular-extractor", () => ({
  extractLineItems: vi.fn(() => ({
    lineItems: [{ itemNumber: "GENERIC" }],
    confidence: "high", sheetUsed: "x", detectedColumns: {}, warnings: [],
  })),
}));

describe("parseBoQ — routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes typed layouts A–E to their dedicated parsers", () => {
    expect(parseBoQ(BoQType.TYPE_A_ARIBA, {})[0].itemNumber).toBe("A");
    expect(parseBoQ(BoQType.TYPE_B_NRM2, {})[0].itemNumber).toBe("B-base");
    expect(parseBoQ(BoQType.TYPE_B_NRM2_ADDOMMIT, {})[0].itemNumber).toBe("B-addommit");
    expect(parseBoQ(BoQType.TYPE_C_VENDOR_QUOTE, {})[0].itemNumber).toBe("C");
    expect(parseBoQ(BoQType.TYPE_D_BOM_NO_PRICE, {})[0].itemNumber).toBe("D");
    expect(parseBoQ(BoQType.TYPE_E_TELECOM, {})[0].itemNumber).toBe("E");
  });

  it("routes TYPE_UNKNOWN to the generic extractor, threading catalogSkus", async () => {
    const { extractLineItems } = await import("@/lib/io/tabular-extractor");
    const out = parseBoQ(BoQType.TYPE_UNKNOWN, { S: [] }, { catalogSkus: ["C9300-NW-A-48"] });
    expect(out[0].itemNumber).toBe("GENERIC");
    expect(extractLineItems).toHaveBeenCalledWith(
      { S: [] }, { catalogSkus: ["C9300-NW-A-48"] },
    );
  });
});

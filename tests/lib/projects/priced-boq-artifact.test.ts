import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Only the DB repository is mocked: the priced-BoQ helper runs for real so its
// pricing math, line statuses, and errors are exercised end-to-end (it is pure).
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));

import * as service from "@/lib/projects/priced-boq-artifact";
import {
  createPricedBoqArtifact,
  buildPricedBoqArtifactPayload,
  type CreatePricedBoqArtifactInput,
} from "@/lib/projects/priced-boq-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import { type ExplicitSarUnitPrice } from "@/lib/projects/priced-boq";
import type {
  CanonicalBoqLine,
  ProjectArtifact,
  ProjectPricingConfig,
  SkuResolutionDecision,
} from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const NORMALIZED_ID = "art-nb-7";
const NORMALIZED_VERSION = 5;
const SKU_ID = "art-skur-3";
const FILE_ID = "file-1";

function sar(unitListPriceSar: number): ExplicitSarUnitPrice {
  return { currency: "SAR", unitListPriceSar };
}

function config(overrides: Partial<ProjectPricingConfig> = {}): ProjectPricingConfig {
  return {
    currency: "SAR",
    mode: "markup",
    ratePercent: 20,
    vatRatePercent: 15,
    roundingDecimals: 2,
    ...overrides,
  };
}

function line(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    sku: "SKU-1",
    description: "Item one",
    quantity: 2,
    originalCells: { A: "1", B: "Item one" },
    ...overrides,
  };
}

function decision(overrides: Partial<SkuResolutionDecision> = {}): SkuResolutionDecision {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "SKU-1",
    status: "accepted",
    suggestions: [],
    acceptedSku: "SKU-1",
    ...overrides,
  };
}

function normalizedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  return {
    id: NORMALIZED_ID,
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: NORMALIZED_VERSION,
    payload: {
      sourceFileId: FILE_ID,
      lineCount: 1,
      lines: [line()],
    },
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function skuArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T08:30:00.000Z");
  return {
    id: SKU_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "generated",
    version: 2,
    payload: {
      sourceNormalizedBoqArtifactId: NORMALIZED_ID,
      sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
      sourceFileIds: [FILE_ID],
      lineCount: 1,
      decisions: [decision()],
      summary: {},
    },
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [NORMALIZED_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createdArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T09:00:00.000Z");
  return {
    id: "art-pb-1",
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [NORMALIZED_ID, SKU_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function input(
  overrides: Partial<CreatePricedBoqArtifactInput> = {}
): CreatePricedBoqArtifactInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    normalizedBoqArtifactId: NORMALIZED_ID,
    skuResolutionArtifactId: SKU_ID,
    pricingConfig: config(),
    unitListPriceSarBySku: { "SKU-1": sar(100) },
    ...overrides,
  };
}

/** Resolve normalized then SKU artifact for the two sequential lookups. */
function mockArtifacts(normalized: ProjectArtifact | null, sku: ProjectArtifact | null): void {
  getArtifactMock.mockReset();
  getArtifactMock.mockImplementation(async (_t, _p, id) => {
    if (id === NORMALIZED_ID) return normalized;
    if (id === SKU_ID) return sku;
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue(createdArtifact());
});

describe("createPricedBoqArtifact - guards", () => {
  it("throws the exact missing-normalized message and does not create", async () => {
    mockArtifacts(null, skuArtifact());
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "Normalized BoQ artifact not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-normalized-type message and does not create", async () => {
    mockArtifacts(normalizedArtifact({ type: "priced_boq" }), skuArtifact());
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "Artifact is not a normalized_boq artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact invalid-normalized-payload message when lines is not an array", async () => {
    mockArtifacts(
      normalizedArtifact({ payload: { lines: "nope" } }),
      skuArtifact()
    );
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "Normalized BoQ artifact payload is invalid."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact missing-SKU message and does not create", async () => {
    mockArtifacts(normalizedArtifact(), null);
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "SKU resolution artifact not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-SKU-type message and does not create", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact({ type: "normalized_boq" }));
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "Artifact is not a sku_resolution artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws invalid-SKU-payload when decisions, source id, or source version are wrong", async () => {
    const bad: Record<string, unknown>[] = [
      { sourceNormalizedBoqArtifactId: NORMALIZED_ID, sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION }, // no decisions
      { decisions: [], sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION }, // no id
      { decisions: [], sourceNormalizedBoqArtifactId: NORMALIZED_ID }, // no version
    ];
    for (const payload of bad) {
      mockArtifacts(normalizedArtifact(), skuArtifact({ payload }));
      await expect(createPricedBoqArtifact(input())).rejects.toThrow(
        "SKU resolution artifact payload is invalid."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the mismatch message when the SKU artifact points to a different normalized id", async () => {
    mockArtifacts(
      normalizedArtifact(),
      skuArtifact({
        payload: {
          sourceNormalizedBoqArtifactId: "art-nb-OTHER",
          sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
          decisions: [decision()],
        },
      })
    );
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "SKU resolution artifact does not match the normalized BoQ artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the mismatch message when the SKU artifact points to a different normalized version", async () => {
    mockArtifacts(
      normalizedArtifact(),
      skuArtifact({
        payload: {
          sourceNormalizedBoqArtifactId: NORMALIZED_ID,
          sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION + 1,
          decisions: [decision()],
        },
      })
    );
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "SKU resolution artifact does not match the normalized BoQ artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createPricedBoqArtifact - pricing-helper errors bubble", () => {
  it("bubbles the non-SAR price error unchanged before any artifact is created", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
    await expect(
      createPricedBoqArtifact(
        input({
          unitListPriceSarBySku: {
            "SKU-1": { currency: "USD" as unknown as "SAR", unitListPriceSar: 100 },
          },
        })
      )
    ).rejects.toThrow("Accepted SKU price must be in SAR.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bubbles the invalid-price error unchanged before any artifact is created", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
    await expect(
      createPricedBoqArtifact(input({ unitListPriceSarBySku: { "SKU-1": sar(-5) } }))
    ).rejects.toThrow("unitListPriceSar must be a finite nonnegative number.");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createPricedBoqArtifact - composition", () => {
  beforeEach(() => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
  });

  it("creates exactly one artifact with the expected stage/type/status/source", async () => {
    await createPricedBoqArtifact(input());
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      status: "needs_review",
    });
    expect(arg.sourceArtifactIds).toEqual([NORMALIZED_ID, SKU_ID]);
  });

  it("returns the created artifact, both source artifacts, payload, and draft", async () => {
    const normalized = normalizedArtifact();
    const sku = skuArtifact();
    const created = createdArtifact({ id: "art-pb-9", version: 4 });
    mockArtifacts(normalized, sku);
    createMock.mockResolvedValue(created);
    const result = await createPricedBoqArtifact(input());
    expect(result.artifact).toBe(created);
    expect(result.normalizedBoqArtifact).toBe(normalized);
    expect(result.skuResolutionArtifact).toBe(sku);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
    expect(result.draft.lines).toHaveLength(1);
    expect(result.draft.lines[0].status).toBe("priced");
  });
});

describe("createPricedBoqArtifact - payload shape", () => {
  beforeEach(() => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
  });

  it("records provenance ids and versions from the loaded artifacts", async () => {
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(NORMALIZED_VERSION);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceSkuResolutionArtifactVersion).toBe(2);
  });

  it("copies the pricing config, lineCount, lines, and summary", async () => {
    const cfg = config({ ratePercent: 30 });
    const { payload } = await createPricedBoqArtifact(input({ pricingConfig: cfg }));
    expect(payload.pricingConfig).toEqual(cfg);
    expect(payload.pricingConfig).not.toBe(cfg);
    expect(payload.lineCount).toBe(1);
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].status).toBe("priced");
    expect(payload.summary.pricedLineCount).toBe(1);
    expect(payload.summary.totals.lineCount).toBe(1);
  });

  it("unions sourceFileIds from both artifacts, unique and first-seen", async () => {
    mockArtifacts(
      normalizedArtifact({ sourceFileIds: ["file-a", "file-b"] }),
      skuArtifact({ sourceFileIds: ["file-b", "file-c"] })
    );
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.sourceFileIds).toEqual(["file-a", "file-b", "file-c"]);
  });

  it("draws sourceFileIds from the artifacts, not their payloads", async () => {
    mockArtifacts(
      normalizedArtifact({ sourceFileIds: ["file-art-n"] }),
      skuArtifact({ sourceFileIds: ["file-art-s"] })
    );
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.sourceFileIds).toEqual(["file-art-n", "file-art-s"]);
    expect(createMock.mock.calls[0][0].sourceFileIds).toEqual(["file-art-n", "file-art-s"]);
  });

  it("stores only the SAR prices used by priced lines, copied fresh", async () => {
    const usedPrice = sar(100);
    const unitListPriceSarBySku: Record<string, ExplicitSarUnitPrice> = {
      "SKU-1": usedPrice,
      UNUSED: sar(999),
    };
    const { payload } = await createPricedBoqArtifact(input({ unitListPriceSarBySku }));
    expect(Object.keys(payload.unitListPriceSarBySku)).toEqual(["SKU-1"]);
    expect(payload.unitListPriceSarBySku["SKU-1"]).toEqual(usedPrice);
    expect(payload.unitListPriceSarBySku["SKU-1"]).not.toBe(usedPrice);
  });

  it("does not leak prices for missing_price rows whose SKU is absent from the map", async () => {
    mockArtifacts(
      normalizedArtifact({
        payload: {
          lines: [line({ sourceRowNumber: 1, sku: "A" }), line({ sourceRowNumber: 2, sku: "B" })],
        },
      }),
      skuArtifact({
        payload: {
          sourceNormalizedBoqArtifactId: NORMALIZED_ID,
          sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
          decisions: [
            decision({ sourceRowNumber: 1, acceptedSku: "PRICED" }),
            decision({ sourceRowNumber: 2, acceptedSku: "NO-PRICE" }),
          ],
        },
      })
    );
    const { payload } = await createPricedBoqArtifact(
      input({ unitListPriceSarBySku: { PRICED: sar(50) } })
    );
    expect(Object.keys(payload.unitListPriceSarBySku)).toEqual(["PRICED"]);
  });
});

describe("createPricedBoqArtifact - freshness & purity", () => {
  it("preserves draft line order and emits fresh line objects", async () => {
    mockArtifacts(
      normalizedArtifact({
        payload: {
          lines: [
            line({ sourceRowNumber: 1, sku: "A" }),
            line({ sourceRowNumber: 2, sku: "B" }),
            line({ sourceRowNumber: 3, sku: "C" }),
          ],
        },
      }),
      skuArtifact({
        payload: {
          sourceNormalizedBoqArtifactId: NORMALIZED_ID,
          sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
          decisions: [decision({ sourceRowNumber: 1, acceptedSku: "A" })],
        },
      })
    );
    const result = await createPricedBoqArtifact(
      input({ unitListPriceSarBySku: { A: sar(100) } })
    );
    expect(result.payload.lines.map((l) => l.sourceRowNumber)).toEqual([1, 2, 3]);
    for (let i = 0; i < result.payload.lines.length; i += 1) {
      expect(result.payload.lines[i]).not.toBe(result.draft.lines[i]);
      expect(result.payload.lines[i]).toEqual(result.draft.lines[i]);
    }
  });

  it("does not alias originalCells, amounts, or summary totals from the draft", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
    const result = await createPricedBoqArtifact(input());
    const priced = result.payload.lines[0];
    expect(priced.originalCells).not.toBe(result.draft.lines[0].originalCells);
    expect(priced.originalCells).toEqual(result.draft.lines[0].originalCells);
    expect(priced.amounts).not.toBe(result.draft.lines[0].amounts);
    expect(priced.amounts).toEqual(result.draft.lines[0].amounts);
    expect(result.payload.summary.totals).not.toBe(result.draft.summary.totals);
    expect(result.payload.summary.totals).toEqual(result.draft.summary.totals);
  });

  it("passes fresh source arrays that cannot corrupt the source artifacts", async () => {
    const normalized = normalizedArtifact();
    const sku = skuArtifact();
    mockArtifacts(normalized, sku);
    await createPricedBoqArtifact(input());
    const arg = createMock.mock.calls[0][0];
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    expect(normalized.sourceFileIds).toEqual([FILE_ID]);
    expect(sku.sourceFileIds).toEqual([FILE_ID]);
  });

  it("does not mutate the input or either source artifact", async () => {
    const normalized = normalizedArtifact();
    const sku = skuArtifact();
    mockArtifacts(normalized, sku);
    const normalizedSnapshot = structuredClone(normalized);
    const skuSnapshot = structuredClone(sku);
    const inp = input();
    const inputSnapshot = structuredClone(inp);
    await createPricedBoqArtifact(inp);
    expect(normalized).toEqual(normalizedSnapshot);
    expect(sku).toEqual(skuSnapshot);
    expect(inp).toEqual(inputSnapshot);
  });
});

describe("buildPricedBoqArtifactPayload", () => {
  it("is pure over a hand-built draft and copies nested objects", () => {
    const normalized = normalizedArtifact({ sourceFileIds: ["f1"] });
    const sku = skuArtifact({ sourceFileIds: ["f2"] });
    const cfg = config();
    const draft = {
      lines: [
        {
          sourceFormat: "format_1_line_item" as const,
          sourceFileId: FILE_ID,
          sourceRowNumber: 1,
          originalLineNumber: "1",
          originalSku: "SKU-1",
          description: "Item one",
          quantity: 2,
          originalCells: { A: "1" },
          status: "priced" as const,
          acceptedSku: "SKU-1",
          decisionStatus: "accepted" as const,
          amounts: {
            currency: "SAR" as const,
            quantity: 2,
            unitListPriceSar: 100,
            extendedListPriceSar: 200,
            unitSellPriceSar: 120,
            extendedSellPriceSar: 240,
            pricingMode: "markup" as const,
            ratePercent: 20,
            vatRatePercent: 15,
            vatAmountSar: 36,
            totalIncVatSar: 276,
          },
        },
      ],
      summary: {
        inputLineCount: 1,
        pricedLineCount: 1,
        unpricedLineCount: 0,
        missingDecisionCount: 0,
        notAcceptedCount: 0,
        missingPriceCount: 0,
        totals: {
          currency: "SAR" as const,
          lineCount: 1,
          subtotalListPriceSar: 200,
          subtotalSellPriceSar: 240,
          vatAmountSar: 36,
          totalIncVatSar: 276,
        },
      },
    };
    const payload = buildPricedBoqArtifactPayload({
      normalizedBoqArtifact: normalized,
      skuResolutionArtifact: sku,
      pricingConfig: cfg,
      unitListPriceSarBySku: { "SKU-1": sar(100) },
      draft,
    });
    expect(payload.sourceFileIds).toEqual(["f1", "f2"]);
    expect(payload.lineCount).toBe(1);
    expect(payload.lines[0]).not.toBe(draft.lines[0]);
    expect(payload.lines[0].originalCells).not.toBe(draft.lines[0].originalCells);
    expect(payload.lines[0].amounts).not.toBe(draft.lines[0].amounts);
    expect(payload.summary.totals).not.toBe(draft.summary.totals);
    expect(payload.unitListPriceSarBySku["SKU-1"]).toEqual(sar(100));
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/priced-boq-artifact.ts"),
    "utf8"
  );

  it("does not import DB schema/index, catalog, approvals, staleness, engines, AI, the Cisco adapter, or API/UI", () => {
    // Inspect import statements only - the docstring legitimately names these
    // domains to declare what the module deliberately omits. The artifact-store
    // repository is the one allowed DB import.
    const importLines = source
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
    for (const forbidden of [
      "@/lib/db/index",
      "@/lib/db/schema",
      "drizzle",
      "catalog",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "@/lib/agent",
      "@/lib/adapters",
      "anthropic",
      "openai",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      ["buildPricedBoqArtifactPayload", "createPricedBoqArtifact"].sort()
    );
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Only the DB repository is mocked: the engineer-review helper runs for real so its
// structure validation, ordering, and errors are exercised end-to-end (it is pure).
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));

import * as service from "@/lib/projects/config-expansion-artifact";
import {
  createConfigurationExpansionArtifact,
  buildConfigurationExpansionArtifactPayload,
  type CreateConfigurationExpansionArtifactInput,
} from "@/lib/projects/config-expansion-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import {
  applyConfigurationExpansionReview,
  type ConfigurationExpansionReviewDecision,
} from "@/lib/projects/config-expansion-review";
import type {
  ConfigExpansionEvidenceCitation,
  ConfigurationExpansionDraftLine,
} from "@/lib/projects/config-expansion-types";
import type { ProjectArtifact } from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const NORMALIZED_ID = "art-nb-7";
const NORMALIZED_VERSION = 5;
const SKU_ID = "art-skur-3";
const FILE_ID = "file-1";
const RULE_PACK_ID = "honeywell-scope-rules";
const RULE_PACK_VERSION = "1.0.0";

// --- Inline draft-line fixtures --------------------------------------------

function citation(): ConfigExpansionEvidenceCitation {
  return {
    sourceType: "ccw_export",
    sourcePath: "C:/Pre-Sales/fixture.xlsx",
    sheetName: "Sheet1",
    lineNumber: 1,
    evidenceNote: "fixture evidence",
  };
}

function customer(
  overrides: Partial<ConfigurationExpansionDraftLine> = {}
): ConfigurationExpansionDraftLine {
  return {
    lineId: "line-1",
    origin: "customer",
    sku: "PARENT-A",
    description: "Parent A",
    quantity: 3,
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "PARENT-A",
    originalCells: { "#": "1", "Part Number": "PARENT-A" },
    ...overrides,
  };
}

function expansion(
  overrides: Partial<ConfigurationExpansionDraftLine> = {}
): ConfigurationExpansionDraftLine {
  return {
    lineId: "line-1-x1",
    origin: "expansion",
    sku: "CHILD-1",
    description: "Child one",
    quantity: 3,
    parentLineId: "line-1",
    parentLineNumber: "1",
    relationshipType: "service_or_support",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-a",
    evidence: [citation()],
    approvalRequired: true,
    approved: false,
    ...overrides,
  };
}

function accept(lineId: string): ConfigurationExpansionReviewDecision {
  return { lineId, action: "accept" };
}

function reject(lineId: string): ConfigurationExpansionReviewDecision {
  return { lineId, action: "reject" };
}

// --- Artifact fixtures ------------------------------------------------------

function normalizedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  return {
    id: NORMALIZED_ID,
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: NORMALIZED_VERSION,
    payload: { sourceFileId: FILE_ID, lineCount: 1, lines: [] },
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
    // Configuration expansion consumes only an approved sku_resolution artifact
    // (Project approval gate, section 16); happy-path fixtures use approved.
    status: "approved",
    version: 2,
    payload: {
      sourceNormalizedBoqArtifactId: NORMALIZED_ID,
      sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
      sourceFileIds: [FILE_ID],
      lineCount: 1,
      decisions: [],
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
    id: "art-ce-1",
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
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
  overrides: Partial<CreateConfigurationExpansionArtifactInput> = {}
): CreateConfigurationExpansionArtifactInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    normalizedBoqArtifactId: NORMALIZED_ID,
    skuResolutionArtifactId: SKU_ID,
    rulePackId: RULE_PACK_ID,
    rulePackVersion: RULE_PACK_VERSION,
    rulePackStatus: "approved",
    lines: [customer(), expansion()],
    decisions: [accept("line-1-x1")],
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

// --- Source-artifact guards -------------------------------------------------

describe("createConfigurationExpansionArtifact - guards", () => {
  it("throws the exact missing-normalized message and does not create", async () => {
    mockArtifacts(null, skuArtifact());
    await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
      "Normalized BoQ artifact not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-normalized-type message and does not create", async () => {
    mockArtifacts(normalizedArtifact({ type: "priced_boq" }), skuArtifact());
    await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
      "Artifact is not a normalized_boq artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact missing-SKU message and does not create", async () => {
    mockArtifacts(normalizedArtifact(), null);
    await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
      "SKU resolution artifact not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-SKU-type message and does not create", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact({ type: "normalized_boq" }));
    await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
      "Artifact is not a sku_resolution artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws invalid-SKU-payload when the provenance id or version is wrong", async () => {
    const bad: Record<string, unknown>[] = [
      { sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION }, // no id
      { sourceNormalizedBoqArtifactId: NORMALIZED_ID }, // no version
      { sourceNormalizedBoqArtifactId: 7, sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION }, // id not a string
      { sourceNormalizedBoqArtifactId: NORMALIZED_ID, sourceNormalizedBoqArtifactVersion: "5" }, // version not a number
    ];
    for (const payload of bad) {
      mockArtifacts(normalizedArtifact(), skuArtifact({ payload }));
      await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
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
        },
      })
    );
    await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
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
        },
      })
    );
    await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
      "SKU resolution artifact does not match the normalized BoQ artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects every non-approved sku_resolution artifact status and does not create", async () => {
    // Project-approval gate (section 16): configuration expansion is blocked unless the
    // source sku_resolution artifact version is approved. The input carries an APPROVED
    // rule pack and the fixture provenance matches, so it is the artifact status - not
    // rule authority or provenance - that fails, before any artifact is created.
    const nonApproved = [
      "generated",
      "needs_review",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ] as const;
    for (const status of nonApproved) {
      mockArtifacts(normalizedArtifact(), skuArtifact({ status }));
      await expect(createConfigurationExpansionArtifact(input())).rejects.toThrow(
        "SKU resolution artifact must be approved before configuration expansion."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a candidate rule pack and creates no artifact", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
    await expect(
      createConfigurationExpansionArtifact(input({ rulePackStatus: "candidate" }))
    ).rejects.toThrow("Configuration expansion artifact requires an approved rule pack.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a rejected rule pack and creates no artifact", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
    await expect(
      createConfigurationExpansionArtifact(input({ rulePackStatus: "rejected" }))
    ).rejects.toThrow("Configuration expansion artifact requires an approved rule pack.");
    expect(createMock).not.toHaveBeenCalled();
  });
});

// --- Review-helper errors bubble -------------------------------------------

describe("createConfigurationExpansionArtifact - review-helper errors bubble", () => {
  beforeEach(() => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
  });

  it("bubbles the missing-decision error unchanged before any artifact is created", async () => {
    // The expansion line has no decision: the review helper must reject it.
    await expect(
      createConfigurationExpansionArtifact(input({ decisions: [] }))
    ).rejects.toThrow("Configuration expansion review requires a decision for every expansion line.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bubbles an accepted-line traceability error unchanged before any artifact is created", async () => {
    await expect(
      createConfigurationExpansionArtifact(
        input({
          lines: [customer(), expansion({ sourceRuleId: undefined })],
          decisions: [accept("line-1-x1")],
        })
      )
    ).rejects.toThrow("Accepted configuration expansion line must carry a sourceRuleId.");
    expect(createMock).not.toHaveBeenCalled();
  });
});

// --- Composition ------------------------------------------------------------

describe("createConfigurationExpansionArtifact - composition", () => {
  beforeEach(() => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
  });

  it("creates exactly one artifact at the expected stage/type/status with normalized-then-sku source", async () => {
    await createConfigurationExpansionArtifact(input());
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      status: "needs_review",
    });
    expect(arg.sourceArtifactIds).toEqual([NORMALIZED_ID, SKU_ID]);
  });

  it("returns the created artifact, both source artifacts, payload, and review result", async () => {
    const normalized = normalizedArtifact();
    const sku = skuArtifact();
    const created = createdArtifact({ id: "art-ce-9", version: 4 });
    mockArtifacts(normalized, sku);
    createMock.mockResolvedValue(created);
    const result = await createConfigurationExpansionArtifact(input());
    expect(result.artifact).toBe(created);
    expect(result.normalizedBoqArtifact).toBe(normalized);
    expect(result.skuResolutionArtifact).toBe(sku);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
    expect(result.reviewResult.summary.acceptedExpansionLineCount).toBe(1);
  });
});

// --- Payload shape ----------------------------------------------------------

describe("createConfigurationExpansionArtifact - payload shape", () => {
  beforeEach(() => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
  });

  it("records provenance ids and versions from the loaded artifacts", async () => {
    const { payload } = await createConfigurationExpansionArtifact(input());
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(NORMALIZED_VERSION);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceSkuResolutionArtifactVersion).toBe(2);
  });

  it("echoes the rule-pack id, version, and approved status", async () => {
    const { payload } = await createConfigurationExpansionArtifact(
      input({ rulePackVersion: "2.0.0" })
    );
    expect(payload.rulePackId).toBe(RULE_PACK_ID);
    expect(payload.rulePackVersion).toBe("2.0.0");
    expect(payload.rulePackStatus).toBe("approved");
  });

  it("persists accepted lines in customer-then-children order with lineCount = acceptedLines.length", async () => {
    // Scrambled input: customers first, children interleaved out of group order.
    const { payload } = await createConfigurationExpansionArtifact(
      input({
        lines: [
          customer({ lineId: "line-1", sku: "P1" }),
          customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
          expansion({ lineId: "line-2-x1", sku: "C2", parentLineId: "line-2", sourceRuleId: "rule-b" }),
          expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1", sourceRuleId: "rule-a" }),
        ],
        decisions: [accept("line-2-x1"), accept("line-1-x1")],
      })
    );
    expect(payload.acceptedLines.map((l) => l.sku)).toEqual(["P1", "C1", "P2", "C2"]);
    expect(payload.lineCount).toBe(4);
    // Accepted expansion lines are persisted approved.
    const child = payload.acceptedLines.find((l) => l.sku === "C1");
    expect(child?.approved).toBe(true);
    expect(child?.approvalRequired).toBe(false);
  });

  it("persists rejected lines in original rejected order, excluded from accepted", async () => {
    const { payload } = await createConfigurationExpansionArtifact(
      input({
        lines: [
          customer({ lineId: "line-1", sku: "P1" }),
          expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1", sourceRuleId: "rule-a" }),
          expansion({ lineId: "line-1-x2", sku: "C2R", parentLineId: "line-1", sourceRuleId: "rule-a" }),
          expansion({ lineId: "line-1-x3", sku: "C1R", parentLineId: "line-1", sourceRuleId: "rule-a" }),
        ],
        decisions: [accept("line-1-x1"), reject("line-1-x2"), reject("line-1-x3")],
      })
    );
    expect(payload.acceptedLines.map((l) => l.sku)).toEqual(["P1", "C1"]);
    expect(payload.rejectedLines.map((l) => l.sku)).toEqual(["C2R", "C1R"]);
    expect(payload.lineCount).toBe(2);
    expect(payload.summary).toEqual({
      customerLineCount: 1,
      acceptedExpansionLineCount: 1,
      rejectedExpansionLineCount: 2,
      totalAcceptedLineCount: 2,
      reviewedExpansionLineCount: 3,
    });
  });

  it("unions sourceFileIds from both artifacts, unique and first-seen, from the artifacts not their payloads", async () => {
    mockArtifacts(
      normalizedArtifact({ sourceFileIds: ["file-a", "file-b"] }),
      skuArtifact({ sourceFileIds: ["file-b", "file-c"] })
    );
    const { payload } = await createConfigurationExpansionArtifact(input());
    expect(payload.sourceFileIds).toEqual(["file-a", "file-b", "file-c"]);
    expect(createMock.mock.calls[0][0].sourceFileIds).toEqual(["file-a", "file-b", "file-c"]);
  });

  it("echoes reviewedBy/reviewedAt only when provided", async () => {
    const without = await createConfigurationExpansionArtifact(input());
    expect(without.payload).not.toHaveProperty("reviewedBy");
    expect(without.payload).not.toHaveProperty("reviewedAt");

    const withMeta = await createConfigurationExpansionArtifact(
      input({ reviewedBy: "eng@example.com", reviewedAt: "2026-06-02T00:00:00.000Z" })
    );
    expect(withMeta.payload.reviewedBy).toBe("eng@example.com");
    expect(withMeta.payload.reviewedAt).toBe("2026-06-02T00:00:00.000Z");
  });

  it("contains no pricing/catalog fields on any payload key", async () => {
    const { payload } = await createConfigurationExpansionArtifact(input());
    const keys: string[] = [];
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectKeys(item);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.push(key);
          // originalCells holds verbatim customer data, not service-authored structure.
          if (key === "originalCells") continue;
          collectKeys(nested);
        }
      }
    };
    collectKeys(payload);
    const forbidden = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "sell", "amount", "catalog"];
    for (const key of keys) {
      const lower = key.toLowerCase();
      for (const token of forbidden) {
        expect(lower.includes(token), `payload key "${key}" matches forbidden "${token}"`).toBe(false);
      }
    }
  });
});

// --- Freshness & purity -----------------------------------------------------

describe("createConfigurationExpansionArtifact - freshness & purity", () => {
  it("emits accepted lines that do not alias the review-result lines, originalCells, or evidence", async () => {
    mockArtifacts(normalizedArtifact(), skuArtifact());
    const result = await createConfigurationExpansionArtifact(input());
    const accepted = result.payload.acceptedLines;
    for (let i = 0; i < accepted.length; i += 1) {
      expect(accepted[i]).not.toBe(result.reviewResult.acceptedLines[i]);
      expect(accepted[i]).toEqual(result.reviewResult.acceptedLines[i]);
    }
    const child = accepted.find((l) => l.origin === "expansion");
    const reviewChild = result.reviewResult.acceptedLines.find((l) => l.origin === "expansion");
    expect(child?.evidence).not.toBe(reviewChild?.evidence);
    expect(child?.evidence?.[0]).not.toBe(reviewChild?.evidence?.[0]);
    const parent = accepted.find((l) => l.origin === "customer");
    const reviewParent = result.reviewResult.acceptedLines.find((l) => l.origin === "customer");
    expect(parent?.originalCells).not.toBe(reviewParent?.originalCells);
  });

  it("passes fresh source arrays that cannot corrupt the source artifacts", async () => {
    const normalized = normalizedArtifact();
    const sku = skuArtifact();
    mockArtifacts(normalized, sku);
    await createConfigurationExpansionArtifact(input());
    const arg = createMock.mock.calls[0][0];
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    expect(normalized.sourceFileIds).toEqual([FILE_ID]);
    expect(sku.sourceFileIds).toEqual([FILE_ID]);
  });

  it("does not mutate the input lines/decisions or either source artifact", async () => {
    const normalized = normalizedArtifact();
    const sku = skuArtifact();
    mockArtifacts(normalized, sku);
    const normalizedSnapshot = structuredClone(normalized);
    const skuSnapshot = structuredClone(sku);
    const inp = input();
    const inputSnapshot = structuredClone(inp);
    await createConfigurationExpansionArtifact(inp);
    expect(normalized).toEqual(normalizedSnapshot);
    expect(sku).toEqual(skuSnapshot);
    expect(inp).toEqual(inputSnapshot);
  });
});

// --- buildConfigurationExpansionArtifactPayload -----------------------------

describe("buildConfigurationExpansionArtifactPayload", () => {
  it("is pure over a real review result and copies nested objects", () => {
    const reviewResult = applyConfigurationExpansionReview({
      lines: [customer(), expansion()],
      decisions: [accept("line-1-x1")],
      reviewedBy: "eng@example.com",
      reviewedAt: "2026-06-02T00:00:00.000Z",
    });
    const payload = buildConfigurationExpansionArtifactPayload({
      normalizedBoqArtifact: normalizedArtifact({ sourceFileIds: ["f1"] }),
      skuResolutionArtifact: skuArtifact({ sourceFileIds: ["f2"] }),
      rulePackId: RULE_PACK_ID,
      rulePackVersion: RULE_PACK_VERSION,
      rulePackStatus: "approved",
      reviewResult,
    });
    expect(payload.sourceFileIds).toEqual(["f1", "f2"]);
    expect(payload.lineCount).toBe(reviewResult.acceptedLines.length);
    expect(payload.acceptedLines[0]).not.toBe(reviewResult.acceptedLines[0]);
    expect(payload.acceptedLines[0]).toEqual(reviewResult.acceptedLines[0]);
    expect(payload.reviewedBy).toBe("eng@example.com");
    expect(payload.reviewedAt).toBe("2026-06-02T00:00:00.000Z");
  });

  it("omits reviewedBy/reviewedAt when the review result has none", () => {
    const reviewResult = applyConfigurationExpansionReview({
      lines: [customer()],
      decisions: [],
    });
    const payload = buildConfigurationExpansionArtifactPayload({
      normalizedBoqArtifact: normalizedArtifact(),
      skuResolutionArtifact: skuArtifact(),
      rulePackId: RULE_PACK_ID,
      rulePackVersion: RULE_PACK_VERSION,
      rulePackStatus: "approved",
      reviewResult,
    });
    expect(payload).not.toHaveProperty("reviewedBy");
    expect(payload).not.toHaveProperty("reviewedAt");
  });

  it("rejects a non-approved rule pack so direct callers cannot bypass the gate", () => {
    const reviewResult = applyConfigurationExpansionReview({
      lines: [customer(), expansion()],
      decisions: [accept("line-1-x1")],
    });
    for (const rulePackStatus of ["candidate", "rejected"] as const) {
      expect(() =>
        buildConfigurationExpansionArtifactPayload({
          normalizedBoqArtifact: normalizedArtifact(),
          skuResolutionArtifact: skuArtifact(),
          rulePackId: RULE_PACK_ID,
          rulePackVersion: RULE_PACK_VERSION,
          rulePackStatus,
          reviewResult,
        })
      ).toThrow("Configuration expansion artifact requires an approved rule pack.");
    }
  });
});

// --- Module isolation & surface ---------------------------------------------

describe("module isolation & surface", () => {
  const MODULE_PATH = join(process.cwd(), "src/lib/projects/config-expansion-artifact.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/config-expansion-artifact.test.ts");
  const source = readFileSync(MODULE_PATH, "utf8");

  it("imports no DB schema/index, catalog, pricing, export, approvals, staleness, engines, AI, adapter, or API/UI", () => {
    // Inspect import specifiers only - the docstring legitimately names these
    // domains to declare what the module deliberately omits. The artifact-store
    // repository is the one allowed DB import.
    const importSources: string[] = [];
    const importRegex = /\bfrom\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      importSources.push(match[1]);
    }
    const forbidden = [
      "@/lib/db/index",
      "@/lib/db/schema",
      "drizzle",
      "schema",
      "catalog",
      "approval",
      "staleness",
      "pricing",
      "priced-boq",
      "mantle",
      "export",
      "engine",
      "coordinator",
      "@/lib/agent",
      "adapter",
      "anthropic",
      "openai",
      "generative-ai",
      "@/app",
      "@/components",
      "/api",
    ];
    for (const importSource of importSources) {
      const lower = importSource.toLowerCase();
      for (const token of forbidden) {
        expect(
          lower.includes(token),
          `module imports "${importSource}" matching forbidden "${token}"`
        ).toBe(false);
      }
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      ["buildConfigurationExpansionArtifactPayload", "createConfigurationExpansionArtifact"].sort()
    );
  });

  it("keeps the module source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  CanonicalBoqLine,
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  SkuResolutionDecision,
} from "@/types/project";

// Mock only the DB boundaries: the project store (verify the Project) and the
// artifact store (read the sku_resolution + normalized_boq sources, write the
// draft). The pure config-expansion builder and the approved Honeywell rule pack
// stay REAL so the draft's rule-pack metadata, per-line approval gate, and
// no-substitution behavior are proven against the real deterministic pieces, not a
// mock - mirroring how the approval test keeps the pure reviewability helper real.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-config-expansion-draft";
import {
  createProjectQuickBomConfigurationExpansionDraft,
  type CreateProjectQuickBomConfigurationExpansionDraftInput,
} from "@/lib/projects/project-quick-bom-config-expansion-draft";
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
  HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import {
  HONEYWELL_CONFIG_AUTHORITY_APPROVAL_RECORD_ID,
} from "@/lib/projects/honeywell-demo-config-authority";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const createArtifactMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const SKU_ID = "art-skur-1";
const NORM_ID = "art-nb-1";
// An approved Honeywell switch SKU present in the real composed rule pack: it has a
// parent rule with child lines, so the real builder produces expansion lines.
const PARENT_SKU = "C9300X-48HX-A";
const NORM_VERSION = 3;
const SKU_VERSION = 2;

// Artifact-level sourceFileIds deliberately overlap so the union proves dedup +
// first-seen order (normalized first, then sku).
const LINE_FILE = "file-norm";
const NORM_FILES = ["file-norm", "file-shared"];
const SKU_FILES = ["file-shared", "file-sku"];
const UNION_FILES = ["file-norm", "file-shared", "file-sku"];

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const SKU_CREATED = new Date("2026-05-21T08:00:00.000Z");
const SKU_UPDATED = new Date("2026-05-21T08:30:00.000Z");
const NORM_CREATED = new Date("2026-05-20T08:00:00.000Z");
const NORM_UPDATED = new Date("2026-05-20T08:30:00.000Z");
const CREATED_CREATED = new Date("2026-05-21T09:00:00.000Z");
const CREATED_UPDATED = new Date("2026-05-21T09:30:00.000Z");

const PRICING_TOKENS = [
  "pricing",
  "price",
  "catalog",
  "cost",
  "discount",
  "margin",
  "markup",
  "vat",
  "currency",
  "msrp",
  "sell",
  "amount",
];

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCanonicalLine(): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: LINE_FILE,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    sku: PARENT_SKU,
    description: "Catalyst 9300X 48-port switch",
    quantity: 2,
    originalCells: { "#": "1", "Part Number": PARENT_SKU, Qty: "2" },
  };
}

function makeDecision(): SkuResolutionDecision {
  return {
    sourceFileId: LINE_FILE,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: PARENT_SKU,
    status: "accepted",
    suggestions: [],
    acceptedSku: PARENT_SKU,
  };
}

function makeSkuPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceNormalizedBoqArtifactId: NORM_ID,
    sourceNormalizedBoqArtifactVersion: NORM_VERSION,
    sourceFileIds: SKU_FILES,
    lineCount: 1,
    decisions: [makeDecision()],
    summary: { totalLines: 1, acceptedCount: 1 },
    ...overrides,
  };
}

function makeSkuArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: SKU_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "approved",
    version: SKU_VERSION,
    payload: makeSkuPayload(),
    sourceFileIds: SKU_FILES,
    sourceArtifactIds: [NORM_ID],
    createdAt: SKU_CREATED,
    updatedAt: SKU_UPDATED,
    ...overrides,
  };
}

function makeNormalizedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: NORM_ID,
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: NORM_VERSION,
    payload: { sourceFileId: LINE_FILE, lineCount: 1, lines: [makeCanonicalLine()] },
    sourceFileIds: NORM_FILES,
    sourceArtifactIds: [],
    createdAt: NORM_CREATED,
    updatedAt: NORM_UPDATED,
    ...overrides,
  };
}

function makeCreatedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: "art-cfg-1",
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: UNION_FILES,
    sourceArtifactIds: [NORM_ID, SKU_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

/** Wire the artifact read store: SKU_ID -> sku artifact, NORM_ID -> normalized. */
function stubArtifacts(
  sku: ProjectArtifact | null,
  normalized: ProjectArtifact | null
): void {
  getArtifactMock.mockImplementation(async (_t, _p, id) => {
    if (id === SKU_ID) return sku;
    if (id === NORM_ID) return normalized;
    return null;
  });
}

/** Recursively collect every object key in a value (for the no-pricing-key scan). */
function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
      key,
      ...collectKeys(entry),
    ]);
  }
  return [];
}

function input(): CreateProjectQuickBomConfigurationExpansionDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    skuResolutionArtifactId: SKU_ID,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  stubArtifacts(makeSkuArtifact(), makeNormalizedArtifact());
  createArtifactMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createProjectQuickBomConfigurationExpansionDraft - project gates", () => {
  it("returns not_found and does not load artifacts or write when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and writes nothing for a non-quick_bom project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Acme",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", customerName: undefined })
    );

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });

  it("loads the project before loading the source artifact", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      getArtifactMock.mock.invocationCallOrder[0]
    );
  });
});

describe("createProjectQuickBomConfigurationExpansionDraft - sku_resolution gates", () => {
  it("returns sku_resolution_not_found and writes nothing when the source artifact is missing", async () => {
    stubArtifacts(null, makeNormalizedArtifact());

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result).toEqual({ status: "sku_resolution_not_found" });
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, SKU_ID);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_sku_resolution with a payload-free summary for a wrong-type artifact", async () => {
    stubArtifacts(makeSkuArtifact({ type: "priced_boq" }), makeNormalizedArtifact());

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result.status).toBe("artifact_not_sku_resolution");
    if (result.status !== "artifact_not_sku_resolution") throw new Error("unreachable");
    expect(result.artifact.id).toBe(SKU_ID);
    expect(result.artifact.type).toBe("priced_boq");
    expect("payload" in result.artifact).toBe(false);
    // Returns before the normalized lookup or any write.
    expect(getArtifactMock).toHaveBeenCalledTimes(1);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns sku_resolution_not_approved with a payload-free summary for any non-approved status", async () => {
    const NOT_APPROVED: ProjectArtifactStatus[] = [
      "needs_review",
      "generated",
      "stale",
      "rejected",
      "failed",
      "missing",
      "not_applicable",
    ];
    for (const status of NOT_APPROVED) {
      createArtifactMock.mockClear();
      stubArtifacts(makeSkuArtifact({ status }), makeNormalizedArtifact());

      const result = await createProjectQuickBomConfigurationExpansionDraft(input());

      expect(result.status).toBe("sku_resolution_not_approved");
      if (result.status !== "sku_resolution_not_approved") throw new Error("unreachable");
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(createArtifactMock).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_sku_resolution_payload and writes nothing for a malformed sku payload", async () => {
    const BAD_PAYLOADS: Record<string, unknown>[] = [
      makeSkuPayload({ sourceNormalizedBoqArtifactId: 123 }),
      makeSkuPayload({ sourceNormalizedBoqArtifactVersion: "3" }),
      makeSkuPayload({ sourceFileIds: "file-1" }),
      makeSkuPayload({ sourceFileIds: ["file-1", 123] }),
      makeSkuPayload({ decisions: "nope" }),
      makeSkuPayload({ summary: [] }),
      { sourceNormalizedBoqArtifactId: NORM_ID },
    ];
    for (const payload of BAD_PAYLOADS) {
      createArtifactMock.mockClear();
      stubArtifacts(makeSkuArtifact({ payload }), makeNormalizedArtifact());

      const result = await createProjectQuickBomConfigurationExpansionDraft(input());

      expect(result).toEqual({ status: "invalid_sku_resolution_payload" });
      // Returns before the normalized lookup or any write.
      expect(getArtifactMock).toHaveBeenCalledTimes(1);
      expect(createArtifactMock).not.toHaveBeenCalled();
      getArtifactMock.mockClear();
    }
  });
});

describe("createProjectQuickBomConfigurationExpansionDraft - normalized_boq gates", () => {
  it("returns normalized_boq_not_found and writes nothing when the referenced artifact is missing", async () => {
    stubArtifacts(makeSkuArtifact(), null);

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result).toEqual({ status: "normalized_boq_not_found" });
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, NORM_ID);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_normalized_boq with a payload-free summary for a wrong-type artifact", async () => {
    stubArtifacts(makeSkuArtifact(), makeNormalizedArtifact({ type: "priced_boq" }));

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result.status).toBe("artifact_not_normalized_boq");
    if (result.status !== "artifact_not_normalized_boq") throw new Error("unreachable");
    expect(result.artifact.id).toBe(NORM_ID);
    expect(result.artifact.type).toBe("priced_boq");
    expect("payload" in result.artifact).toBe(false);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns normalized_boq_version_mismatch with a payload-free summary when the version differs", async () => {
    stubArtifacts(makeSkuArtifact(), makeNormalizedArtifact({ version: 99 }));

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result.status).toBe("normalized_boq_version_mismatch");
    if (result.status !== "normalized_boq_version_mismatch") throw new Error("unreachable");
    expect(result.artifact.id).toBe(NORM_ID);
    expect(result.artifact.version).toBe(99);
    expect("payload" in result.artifact).toBe(false);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns normalized_boq_not_ready (no artifact) and writes nothing for an unready status", async () => {
    const NOT_READY: ProjectArtifactStatus[] = [
      "stale",
      "failed",
      "missing",
      "rejected",
      "needs_review",
      "not_applicable",
    ];
    for (const status of NOT_READY) {
      createArtifactMock.mockClear();
      stubArtifacts(makeSkuArtifact(), makeNormalizedArtifact({ status }));

      const result = await createProjectQuickBomConfigurationExpansionDraft(input());

      expect(result).toEqual({ status: "normalized_boq_not_ready" });
      expect(createArtifactMock).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_normalized_boq_payload and writes nothing when lines is not an array", async () => {
    stubArtifacts(
      makeSkuArtifact(),
      makeNormalizedArtifact({ payload: { sourceFileId: LINE_FILE } })
    );

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result).toEqual({ status: "invalid_normalized_boq_payload" });
    expect(createArtifactMock).not.toHaveBeenCalled();
  });
});

describe("createProjectQuickBomConfigurationExpansionDraft - happy path", () => {
  it("creates exactly one needs_review configuration_expansion draft with the canonical coordinates", async () => {
    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result.status).toBe("ok");
    expect(createArtifactMock).toHaveBeenCalledTimes(1);
    const arg = createArtifactMock.mock.calls[0][0];
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.stageId).toBe("configuration_expansion_review");
    expect(arg.type).toBe("configuration_expansion");
    expect(arg.status).toBe("needs_review");
    // Source artifacts in [normalized, sku] order; file ids unioned first-seen.
    expect(arg.sourceArtifactIds).toEqual([NORM_ID, SKU_ID]);
    expect(arg.sourceFileIds).toEqual(UNION_FILES);
  });

  it("persists a draft payload with the draft marker and approved Honeywell rule-pack metadata", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("configuration_expansion_draft");
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORM_ID);
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(NORM_VERSION);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceSkuResolutionArtifactVersion).toBe(SKU_VERSION);
    expect(payload.sourceFileIds).toEqual(UNION_FILES);
    expect(payload.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
    expect(payload.rulePackVersion).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
    expect(payload.rulePackStatus).toBe("approved");
    expect(payload.rulePackSourceScope).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE);
  });

  it("preserves the customer line (no substitution) and gates every expansion line for review", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    const lines = payload.lines as Array<Record<string, unknown>>;
    expect(payload.lineCount).toBe(lines.length);

    const customerLines = lines.filter((l) => l.origin === "customer");
    const expansionLines = lines.filter((l) => l.origin === "expansion");
    // The customer SKU is preserved verbatim - never replaced/substituted.
    expect(customerLines).toHaveLength(1);
    expect(customerLines[0].sku).toBe(PARENT_SKU);
    expect(customerLines[0].originalSku).toBe(PARENT_SKU);

    // The real approved pack contributes child lines, all held for engineer review.
    expect(expansionLines.length).toBeGreaterThan(0);
    for (const line of expansionLines) {
      expect(line.approvalRequired).toBe(true);
      expect(line.approved).toBe(false);
    }
  });

  it("emits no pricing/catalog keys anywhere in the persisted draft payload", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload;
    for (const key of collectKeys(payload)) {
      for (const token of PRICING_TOKENS) {
        expect(
          key.toLowerCase().includes(token),
          `payload key "${key}" contains pricing token "${token}"`
        ).toBe(false);
      }
    }
  });

  it("returns a serializable created-artifact summary with ISO dates and no payload", async () => {
    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: "art-cfg-1",
      projectId: PROJECT,
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      status: "needs_review",
      version: 1,
      sourceFileIds: UNION_FILES,
      sourceArtifactIds: [NORM_ID, SKU_ID],
      createdAt: CREATED_CREATED.toISOString(),
      updatedAt: CREATED_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary that does not leak the full lines or payload", async () => {
    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    const persisted = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    const persistedLines = persisted.lines as Array<Record<string, unknown>>;
    const aChildSku = persistedLines.find((l) => l.origin === "expansion")?.sku as string;

    expect(result.payloadSummary).toEqual({
      payloadKind: "configuration_expansion_draft",
      sourceNormalizedBoqArtifactId: NORM_ID,
      sourceNormalizedBoqArtifactVersion: NORM_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      sourceFileIds: UNION_FILES,
      rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
      rulePackVersion: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
      rulePackStatus: "approved",
      rulePackSourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
      lineCount: persistedLines.length,
      summary: persisted.summary,
      configurationAuthority: (persisted.configurationAuthority as unknown),
    });
    expect("lines" in result.payloadSummary).toBe(false);
    // Neither the customer SKU nor an expansion child SKU leaks into the response.
    const json = JSON.stringify(result);
    expect(json).not.toContain(PARENT_SKU);
    expect(json).not.toContain(aChildSku);
  });
});

describe("createProjectQuickBomConfigurationExpansionDraft - immutability", () => {
  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createProjectQuickBomConfigurationExpansionDraft(inp);

    expect(inp).toEqual(snapshot);
  });

  it("does not mutate the source sku_resolution or normalized_boq artifacts", async () => {
    const sku = makeSkuArtifact();
    const norm = makeNormalizedArtifact();
    const skuSnapshot = structuredClone(sku);
    const normSnapshot = structuredClone(norm);
    stubArtifacts(sku, norm);

    await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(sku).toEqual(skuSnapshot);
    expect(norm).toEqual(normSnapshot);
  });

  it("returns copied arrays so a caller mutating the response cannot corrupt the write input", async () => {
    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    const persisted = createArtifactMock.mock.calls[0][0];
    expect(result.artifact.sourceFileIds).not.toBe(persisted.sourceFileIds);
    expect(result.payloadSummary.sourceFileIds).not.toBe(
      (persisted.payload as Record<string, unknown>).sourceFileIds
    );

    result.artifact.sourceFileIds.push("injected");
    result.payloadSummary.sourceFileIds.push("injected");
    result.payloadSummary.summary.totalLineCount = 999;

    expect(persisted.sourceFileIds).toEqual(UNION_FILES);
    expect((persisted.payload as Record<string, unknown>).sourceFileIds).toEqual(UNION_FILES);
  });
});

describe("createProjectQuickBomConfigurationExpansionDraft - configuration authority trace", () => {
  it("persists a configurationAuthority trace inside the draft payload", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.configurationAuthority).toBeDefined();
    const auth = payload.configurationAuthority as Record<string, unknown>;
    expect(auth.scope).toBe("honeywell_mvp_demo_only");
    expect(auth.approvalRecordId).toBe(HONEYWELL_CONFIG_AUTHORITY_APPROVAL_RECORD_ID);
    expect(auth.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
    expect(auth.rulePackVersion).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
    expect(auth.rulePackStatus).toBe("approved");
    expect(auth.rulePackSourceScope).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE);
    expect(auth.runtimeAi).toBe(false);
    expect(auth.replacementAuthority).toBe(false);
    expect(auth.skuSubstitutionAuthority).toBe(false);
    expect(auth.unknownRelationshipsDeferred).toBe(true);
    expect(auth.attachesOpticsUnderSwitches).toBe(false);
  });

  it("returns the same configurationAuthority trace in payloadSummary", async () => {
    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(result.payloadSummary.configurationAuthority).toBeDefined();
    expect(result.payloadSummary.configurationAuthority).toEqual(
      payload.configurationAuthority
    );
  });

  it("increments expandByApprovedRulePackCount for a known expandable parent such as C9300X-48HX-A", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    const auth = payload.configurationAuthority as Record<string, unknown>;
    const ds = auth.dispositionSummary as Record<string, number>;
    expect(ds.expandByApprovedRulePackCount).toBeGreaterThanOrEqual(1);
  });

  it("increments preserveStandaloneCustomerLineCount and produces no optic-under-switch attachment for SFP-10G-LR-S=", async () => {
    const opticDecision: SkuResolutionDecision = {
      sourceFileId: LINE_FILE,
      sourceRowNumber: 2,
      originalLineNumber: "2",
      originalSku: "SFP-10G-LR-S=",
      status: "accepted",
      suggestions: [],
      acceptedSku: "SFP-10G-LR-S=",
    };
    const opticLine: CanonicalBoqLine = {
      sourceFormat: "format_2_number_part_qty",
      sourceFileId: LINE_FILE,
      sourceRowNumber: 2,
      originalLineNumber: "2",
      sku: "SFP-10G-LR-S=",
      description: "SFP 10G LR",
      quantity: 4,
      originalCells: { "#": "2", "Part Number": "SFP-10G-LR-S=", Qty: "4" },
    };
    stubArtifacts(
      makeSkuArtifact({
        payload: makeSkuPayload({
          decisions: [makeDecision(), opticDecision],
        }),
      }),
      makeNormalizedArtifact({
        payload: {
          sourceFileId: LINE_FILE,
          lineCount: 2,
          lines: [makeCanonicalLine(), opticLine],
        },
      })
    );

    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    const auth = payload.configurationAuthority as Record<string, unknown>;
    const ds = auth.dispositionSummary as Record<string, number>;
    expect(ds.preserveStandaloneCustomerLineCount).toBeGreaterThanOrEqual(1);

    // Optic must not appear as a child under any expansion line
    const lines = payload.lines as Array<Record<string, unknown>>;
    const opticExpansionLines = lines.filter(
      (l) => l.origin === "expansion" && l.sku === "SFP-10G-LR-S="
    );
    expect(opticExpansionLines).toHaveLength(0);
  });

  it("increments deferUnknownRelationshipCount for an unknown accepted SKU without throwing or substituting", async () => {
    const unknownSku = "UNKNOWN-SKU-XYZ-9999";
    const unknownDecision: SkuResolutionDecision = {
      sourceFileId: LINE_FILE,
      sourceRowNumber: 3,
      originalLineNumber: "3",
      originalSku: unknownSku,
      status: "accepted",
      suggestions: [],
      acceptedSku: unknownSku,
    };
    const unknownLine: CanonicalBoqLine = {
      sourceFormat: "format_2_number_part_qty",
      sourceFileId: LINE_FILE,
      sourceRowNumber: 3,
      originalLineNumber: "3",
      sku: unknownSku,
      description: "Unknown SKU",
      quantity: 1,
      originalCells: { "#": "3", "Part Number": unknownSku, Qty: "1" },
    };
    stubArtifacts(
      makeSkuArtifact({
        payload: makeSkuPayload({
          decisions: [makeDecision(), unknownDecision],
        }),
      }),
      makeNormalizedArtifact({
        payload: {
          sourceFileId: LINE_FILE,
          lineCount: 2,
          lines: [makeCanonicalLine(), unknownLine],
        },
      })
    );

    const result = await createProjectQuickBomConfigurationExpansionDraft(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const payload = createArtifactMock.mock.calls[0][0].payload as Record<string, unknown>;
    const auth = payload.configurationAuthority as Record<string, unknown>;
    const ds = auth.dispositionSummary as Record<string, number>;
    expect(ds.deferUnknownRelationshipCount).toBeGreaterThanOrEqual(1);

    // Unknown SKU preserved verbatim - not substituted
    const lines = payload.lines as Array<Record<string, unknown>>;
    const unknownCustomerLine = lines.find(
      (l) => l.origin === "customer" && l.sku === unknownSku
    );
    expect(unknownCustomerLine).toBeDefined();
  });

  it("persisted draft payload has no pricing/catalog-looking keys anywhere including in configurationAuthority", async () => {
    await createProjectQuickBomConfigurationExpansionDraft(input());

    const payload = createArtifactMock.mock.calls[0][0].payload;
    for (const key of collectKeys(payload)) {
      for (const token of PRICING_TOKENS) {
        expect(
          key.toLowerCase().includes(token),
          `configurationAuthority key "${key}" contains pricing token "${token}"`
        ).toBe(false);
      }
    }
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-config-expansion-draft.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-config-expansion-draft.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the stores, the pure builder, the approved Honeywell pack, the config authority module, and the project/draft types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    // Prompt 90 writes the artifact directly, so this IS a legitimate import here.
    expect(source).toContain("createProjectArtifactVersion");
    expect(source).toContain('from "@/lib/projects/config-expansion"');
    expect(source).toContain('from "@/lib/projects/config-expansion-types"');
    expect(source).toContain('from "@/lib/projects/honeywell-config-expansion-rule-pack"');
    expect(source).toContain('from "@/lib/projects/honeywell-demo-config-authority"');
    expect(source).toContain("getHoneywellDemoConfigAuthorityProfile");
    expect(source).toContain("getHoneywellDemoConfigAuthorityForSku");
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import the reviewed-expansion service, the review helper, the runner, approvals, pricing, export, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/sku-resolution',
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/export',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "createProjectQuickBomConfigurationExpansionDraft",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

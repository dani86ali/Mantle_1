import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
} from "@/types/project";

// Mock the three composed boundaries: the project store (verify the Project), the
// artifact read store (load the source normalized_boq), and the existing
// deterministic SKU resolution artifact service (draft + artifact creation). No
// real DB and no real catalog lookup are touched.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
}));
vi.mock("@/lib/projects/sku-resolution-artifact", () => ({
  createSkuResolutionArtifact: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-sku-resolution";
import {
  createProjectQuickBomSkuResolutionDraft,
  type CreateProjectQuickBomSkuResolutionDraftInput,
} from "@/lib/projects/project-quick-bom-sku-resolution";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createSkuResolutionArtifact } from "@/lib/projects/sku-resolution-artifact";
import type {
  CreateSkuResolutionArtifactResult,
  SkuResolutionArtifactPayload,
} from "@/lib/projects/sku-resolution-artifact";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const createArtifactMock = vi.mocked(createSkuResolutionArtifact);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const FILE_ID = "file-1";
const SOURCE_ID = "art-nb-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const SRC_CREATED = new Date("2026-05-21T08:00:00.000Z");
const SRC_UPDATED = new Date("2026-05-21T08:30:00.000Z");
const CREATED_CREATED = new Date("2026-05-21T09:00:00.000Z");
const CREATED_UPDATED = new Date("2026-05-21T09:30:00.000Z");
// Decision-level fields planted in the lower-level payload; the lean payload
// summary drops decisions entirely, so these must never surface in the summary.
const SECRET_ACCEPTED_SKU = "LEAKED-ACCEPTED-SKU";
const SECRET_DECIDED_BY = "leaked-user-id";

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

function makeSourceArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: SOURCE_ID,
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    // The full payload (with lines) lives on the artifact; summaries exclude it.
    payload: { sourceFileId: FILE_ID, lineCount: 2, lines: [] },
    version: 3,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [],
    createdAt: SRC_CREATED,
    updatedAt: SRC_UPDATED,
    ...overrides,
  };
}

function makeCreatedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: "art-skur-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [SOURCE_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

function makeSummary(): SkuResolutionArtifactPayload["summary"] {
  return {
    totalLines: 2,
    needsReviewCount: 1,
    unresolvedCount: 1,
    acceptedCount: 0,
    rejectedCount: 0,
    exactSuggestionCount: 1,
    normalizedSuggestionCount: 0,
    ambiguousCount: 0,
    zeroPriceSuggestionCount: 0,
    catalogSource: "local_stc_historical_mock",
  };
}

function makePayload(
  overrides: Partial<SkuResolutionArtifactPayload> = {}
): SkuResolutionArtifactPayload {
  return {
    sourceNormalizedBoqArtifactId: SOURCE_ID,
    sourceNormalizedBoqArtifactVersion: 3,
    sourceFileIds: [FILE_ID],
    lineCount: 2,
    // A decision deliberately carrying acceptance/decider fields, to prove the
    // summary strips decisions wholesale.
    decisions: [
      {
        sourceFileId: FILE_ID,
        sourceRowNumber: 2,
        originalLineNumber: "1",
        originalSku: "SKU-A",
        status: "accepted",
        suggestions: [
          { suggestedSku: "SKU-A", source: "exact", rationale: "x" },
        ],
        acceptedSku: SECRET_ACCEPTED_SKU,
        decidedBy: SECRET_DECIDED_BY,
        decidedAt: new Date("2026-05-21T10:00:00.000Z"),
      },
    ],
    summary: makeSummary(),
    ...overrides,
  };
}

function makeServiceResult(): CreateSkuResolutionArtifactResult {
  return {
    artifact: makeCreatedArtifact(),
    sourceArtifact: makeSourceArtifact(),
    payload: makePayload(),
  };
}

function input(): CreateProjectQuickBomSkuResolutionDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    normalizedBoqArtifactId: SOURCE_ID,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  getArtifactMock.mockResolvedValue(makeSourceArtifact());
  createArtifactMock.mockResolvedValue(makeServiceResult());
});

describe("createProjectQuickBomSkuResolutionDraft - project verification", () => {
  it("returns not_found and does not load the artifact or create when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not load the artifact or create for a non-quick_bom project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await createProjectQuickBomSkuResolutionDraft(input());

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

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });

  it("loads the project before loading the source artifact", async () => {
    await createProjectQuickBomSkuResolutionDraft(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      getArtifactMock.mock.invocationCallOrder[0]
    );
  });
});

describe("createProjectQuickBomSkuResolutionDraft - source artifact verification", () => {
  it("returns normalized_boq_not_found and does not create when the source artifact is missing", async () => {
    getArtifactMock.mockResolvedValue(null);

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result).toEqual({ status: "normalized_boq_not_found" });
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, SOURCE_ID);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_normalized_boq with a payload-free summary and does not create for a wrong-type artifact", async () => {
    getArtifactMock.mockResolvedValue(
      makeSourceArtifact({ type: "priced_boq" })
    );

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("artifact_not_normalized_boq");
    if (result.status !== "artifact_not_normalized_boq") {
      throw new Error("unreachable");
    }
    expect(result.artifact?.id).toBe(SOURCE_ID);
    expect(result.artifact?.type).toBe("priced_boq");
    expect(result.artifact && "payload" in result.artifact).toBe(false);
    expect(createArtifactMock).not.toHaveBeenCalled();
  });
});

describe("createProjectQuickBomSkuResolutionDraft - source artifact readiness", () => {
  const NOT_READY: ProjectArtifactStatus[] = [
    "stale",
    "failed",
    "missing",
    "rejected",
    "not_applicable",
  ];

  it.each(NOT_READY)(
    "returns normalized_boq_not_ready for a %s source artifact and does not create",
    async (status) => {
      getArtifactMock.mockResolvedValue(makeSourceArtifact({ status }));

      const result = await createProjectQuickBomSkuResolutionDraft(input());

      expect(result.status).toBe("normalized_boq_not_ready");
      if (result.status !== "normalized_boq_not_ready") {
        throw new Error("unreachable");
      }
      expect(result.artifact.id).toBe(SOURCE_ID);
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(createArtifactMock).not.toHaveBeenCalled();
    }
  );

  it.each(["generated", "approved"] as ProjectArtifactStatus[])(
    "creates the draft for a %s source artifact with the exact tenant/project/artifact ids",
    async (status) => {
      getArtifactMock.mockResolvedValue(makeSourceArtifact({ status }));

      const result = await createProjectQuickBomSkuResolutionDraft(input());

      expect(result.status).toBe("ok");
      expect(createArtifactMock).toHaveBeenCalledTimes(1);
      expect(createArtifactMock).toHaveBeenCalledWith({
        tenantId: TENANT,
        projectId: PROJECT,
        normalizedBoqArtifactId: SOURCE_ID,
      });
    }
  );
});

describe("createProjectQuickBomSkuResolutionDraft - known lower-level error translation", () => {
  it("maps the missing-artifact message to normalized_boq_not_found", async () => {
    createArtifactMock.mockRejectedValue(
      new Error("Normalized BoQ artifact not found.")
    );

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result).toEqual({ status: "normalized_boq_not_found" });
  });

  it("maps the wrong-type message to artifact_not_normalized_boq without an artifact", async () => {
    createArtifactMock.mockRejectedValue(
      new Error("Artifact is not a normalized_boq artifact.")
    );

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result).toEqual({ status: "artifact_not_normalized_boq" });
  });

  it("maps the invalid-payload message to invalid_normalized_boq_payload", async () => {
    createArtifactMock.mockRejectedValue(
      new Error("Normalized BoQ artifact payload is invalid.")
    );

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result).toEqual({ status: "invalid_normalized_boq_payload" });
  });
});

describe("createProjectQuickBomSkuResolutionDraft - unexpected errors", () => {
  it("re-throws an unexpected lower-level error unchanged", async () => {
    const boom = new Error("boom-internal-stack-detail");
    createArtifactMock.mockRejectedValue(boom);

    await expect(
      createProjectQuickBomSkuResolutionDraft(input())
    ).rejects.toBe(boom);
  });

  it("re-throws a non-Error rejection", async () => {
    createArtifactMock.mockRejectedValue("plain string failure");

    await expect(
      createProjectQuickBomSkuResolutionDraft(input())
    ).rejects.toBe("plain string failure");
  });
});

describe("createProjectQuickBomSkuResolutionDraft - ok summaries", () => {
  it("returns a serializable created-artifact summary with ISO dates and no payload", async () => {
    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: "art-skur-1",
      projectId: PROJECT,
      stageId: "sku_resolution",
      type: "sku_resolution",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [SOURCE_ID],
      createdAt: CREATED_CREATED.toISOString(),
      updatedAt: CREATED_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
    expect(typeof result.artifact.createdAt).toBe("string");
    expect(typeof result.artifact.updatedAt).toBe("string");
  });

  it("returns a lean payloadSummary with no decisions, full payload, or pricing/decision fields", async () => {
    const result = await createProjectQuickBomSkuResolutionDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      sourceNormalizedBoqArtifactId: SOURCE_ID,
      sourceNormalizedBoqArtifactVersion: 3,
      sourceFileIds: [FILE_ID],
      lineCount: 2,
      summary: makeSummary(),
    });
    expect("decisions" in result.payloadSummary).toBe(false);
    expect("acceptedSku" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary).not.toHaveProperty("currency");
    expect(result.payloadSummary).not.toHaveProperty("ratePercent");
    expect(result.payloadSummary).not.toHaveProperty("vatRatePercent");
    expect(result.payloadSummary).not.toHaveProperty("pricing");
    expect(result.payloadSummary).not.toHaveProperty("filePath");
    expect(result.payloadSummary).not.toHaveProperty("storagePath");

    const json = JSON.stringify(result.payloadSummary);
    expect(json).not.toContain(SECRET_ACCEPTED_SKU);
    expect(json).not.toContain(SECRET_DECIDED_BY);
  });
});

describe("createProjectQuickBomSkuResolutionDraft - immutability and copies", () => {
  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createProjectQuickBomSkuResolutionDraft(inp);

    expect(inp).toEqual(snapshot);
  });

  it("copies created-artifact and payload arrays/summary so the response cannot corrupt the service result", async () => {
    const serviceResult = makeServiceResult();
    createArtifactMock.mockResolvedValue(serviceResult);

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    // Distinct references from the lower-level result.
    expect(result.artifact.sourceFileIds).not.toBe(
      serviceResult.artifact.sourceFileIds
    );
    expect(result.artifact.sourceArtifactIds).not.toBe(
      serviceResult.artifact.sourceArtifactIds
    );
    expect(result.payloadSummary.sourceFileIds).not.toBe(
      serviceResult.payload.sourceFileIds
    );
    expect(result.payloadSummary.summary).not.toBe(serviceResult.payload.summary);

    // Mutating the returned summary must not reach back into the service result.
    result.artifact.sourceFileIds.push("injected");
    result.artifact.sourceArtifactIds.push("injected");
    result.payloadSummary.sourceFileIds.push("injected");
    result.payloadSummary.summary.totalLines = 999;

    expect(serviceResult.artifact.sourceFileIds).toEqual([FILE_ID]);
    expect(serviceResult.artifact.sourceArtifactIds).toEqual([SOURCE_ID]);
    expect(serviceResult.payload.sourceFileIds).toEqual([FILE_ID]);
    expect(serviceResult.payload.summary.totalLines).toBe(2);
  });

  it("does not mutate the source artifact loaded for a not-ready response", async () => {
    const source = makeSourceArtifact({ status: "stale" });
    const snapshot = structuredClone(source);
    getArtifactMock.mockResolvedValue(source);

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    if (result.status !== "normalized_boq_not_ready") {
      throw new Error("unreachable");
    }
    result.artifact.sourceFileIds.push("injected");
    expect(source).toEqual(snapshot);
  });
});

describe("createProjectQuickBomSkuResolutionDraft - default catalog path", () => {
  it("calls createSkuResolutionArtifact with only tenantId/projectId/normalizedBoqArtifactId", async () => {
    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("ok");
    expect(createArtifactMock).toHaveBeenCalledTimes(1);
    expect(createArtifactMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      normalizedBoqArtifactId: SOURCE_ID,
    });
  });

  it("never passes an explicit catalogIndex, so the lower layer uses the default catalog", async () => {
    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("ok");
    expect(createArtifactMock).toHaveBeenCalledTimes(1);
    const callArg = createArtifactMock.mock.calls[0][0];
    expect("catalogIndex" in callArg).toBe(false);
  });

  it("result is needs_review and returns lean summaries only", async () => {
    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.status).toBe("needs_review");
    expect("payload" in result.artifact).toBe(false);
    expect("decisions" in result.payloadSummary).toBe(false);
    expect("catalogIndex" in result.payloadSummary).toBe(false);
    expect("acceptedSku" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary).not.toHaveProperty("filePath");
    expect(result.payloadSummary).not.toHaveProperty("storagePath");
    expect(result.payloadSummary).not.toHaveProperty("pricing");
    const json = JSON.stringify(result);
    expect(json).not.toContain(SECRET_ACCEPTED_SKU);
    expect(json).not.toContain(SECRET_DECIDED_BY);
  });

  it("is gated by project existence check", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("not_found");
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("is gated by project mode check", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp" }));

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("wrong_mode");
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("is gated by source artifact type check", async () => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact({ type: "priced_boq" }));

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("artifact_not_normalized_boq");
    expect(createArtifactMock).not.toHaveBeenCalled();
  });

  it("is gated by source artifact readiness check", async () => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact({ status: "stale" }));

    const result = await createProjectQuickBomSkuResolutionDraft(input());

    expect(result.status).toBe("normalized_boq_not_ready");
    expect(createArtifactMock).not.toHaveBeenCalled();
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-sku-resolution.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-sku-resolution.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the project store, the artifact read store, the lower-level SKU resolution artifact service, and the project types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/lib/projects/sku-resolution-artifact"');
    expect(source).toContain('from "@/types/project"');
  });

  it("no longer imports or references the Honeywell demo catalog overlay", () => {
    expect(source).not.toContain('from "@/lib/projects/honeywell-demo-catalog-lookup"');
    expect(source).not.toContain("getHoneywellDemoCatalogLookupIndex");
    expect(source).not.toContain("catalogProfile");
  });

  it("does not import the artifact-write helper, approval/evidence stores, the pure SKU/catalog helpers, the normalizer, pricing, config expansion, mantle/export, runner, AI, catalog, coordinator, engine, or adapter modules", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/sku-resolution"',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/config-expanded',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
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
      "createProjectQuickBomSkuResolutionDraft",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

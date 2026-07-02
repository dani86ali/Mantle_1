import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectArtifactStatus } from "@/types/project";

// Mock the store boundaries plus the shared source-chain evaluator so this slice's
// SELECTION logic (project gates, newest-approved pick, blocker distinctions, result
// hygiene) is tested in isolation. isArtifactReviewable (a pure helper) stays REAL.
const { mockGetProjectById, mockListByType, mockEvaluateChain } = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockListByType: vi.fn(),
  mockEvaluateChain: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifactsByType: mockListByType,
}));
vi.mock("@/lib/projects/project-rfp-hld-document-source-chain", () => ({
  evaluateRfpHldDocumentSourceChain: mockEvaluateChain,
}));

import {
  selectRfpHldFinalAuthority,
  type SelectRfpHldFinalAuthorityResult,
} from "@/lib/projects/project-rfp-hld-document-final-authority";

const TENANT = "77777777-7777-7777-7777-777777777777";
const PROJECT = "proj-fa-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const DOCMODEL_ID = "hdocm-1";
const CREATED_AT = "2026-06-30T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);

const DRAWIO_SENTINEL = "SECRET-DRAWIO-XML-BODY";

function validPayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_document",
    sourceMode: "manual_drawio_upload",
    createdAt: CREATED_AT,
    createdBy: "u-se-9",
    title: "Final HLD Topology",
    uploadedFileName: "acme-hld.drawio",
    drawioXml: `<mxfile>${DRAWIO_SENTINEL}</mxfile>`,
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceHldDocumentModelArtifactId: DOCMODEL_ID,
    sourceBundleVersion: 1,
    sourceModelVersion: 2,
    sourceDiagramVersion: 5,
    sourceDocumentModelVersion: 3,
    finalAuthority: {
      authorityKind: "se_manual_drawio_upload",
      effectiveWhenArtifactStatus: "approved",
    },
    supersedesArtifactIds: [DIAGRAM_ID, DOCMODEL_ID],
  };
}

function genPayload(): Record<string, unknown> {
  return {
    ...validPayload(),
    sourceMode: "generated_drawio_output",
    uploadedFileName: "hld-generated.drawio",
    finalAuthority: {
      authorityKind: "se_approved_generated_hld",
      effectiveWhenArtifactStatus: "approved",
    },
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function docArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "hdoc-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document",
    status: "approved",
    version: 1,
    payload: validPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function genDocArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return docArtifact({
    id: "hdoc-gen-1",
    payload: genPayload() as unknown as Record<string, unknown>,
    ...overrides,
  });
}

function select(): Promise<SelectRfpHldFinalAuthorityResult> {
  return selectRfpHldFinalAuthority({ tenantId: TENANT, projectId: PROJECT });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockListByType.mockReset().mockResolvedValue([docArtifact()]);
  mockEvaluateChain
    .mockReset()
    .mockResolvedValue({ kind: "valid", payload: validPayload() });
});

describe("selectRfpHldFinalAuthority - project gates", () => {
  it("returns not_found without listing artifacts", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(await select()).toEqual({ status: "not_found" });
    expect(mockListByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode without listing artifacts", async () => {
    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const result = await select();
    expect(result.status).toBe("wrong_mode");
    expect(mockListByType).not.toHaveBeenCalled();
  });
});

describe("selectRfpHldFinalAuthority - not finalized", () => {
  it("returns no_final_hld_document when no hld_document exists", async () => {
    mockListByType.mockResolvedValueOnce([]);
    const result = await select();
    expect(result.status).toBe("not_finalized");
    if (result.status !== "not_finalized") throw new Error("unreachable");
    expect(result.blockerCode).toBe("no_final_hld_document");
    expect(result.latestArtifact).toBeUndefined();
    expect(mockEvaluateChain).not.toHaveBeenCalled();
  });

  it("distinguishes a pending reviewable manual upload from no final document", async () => {
    mockListByType.mockResolvedValueOnce([
      docArtifact({ id: "hdoc-old", status: "needs_review", version: 1 }),
      docArtifact({ id: "hdoc-new", status: "needs_review", version: 2 }),
    ]);
    const result = await select();
    expect(result.status).toBe("not_finalized");
    if (result.status !== "not_finalized") throw new Error("unreachable");
    expect(result.blockerCode).toBe("manual_upload_pending_review");
    expect(result.latestArtifact?.id).toBe("hdoc-new");
    expect(mockEvaluateChain).not.toHaveBeenCalled();
  });

  it("only reads the hld_document lane - no fallback to model/diagram", async () => {
    mockListByType.mockResolvedValueOnce([]);
    await select();
    expect(mockListByType).toHaveBeenCalledTimes(1);
    expect(mockListByType).toHaveBeenCalledWith(TENANT, PROJECT, "hld_document");
  });

  it("ignores hld_document rows off the HLD stage", async () => {
    mockListByType.mockResolvedValueOnce([
      docArtifact({ stageId: "compliance_matrix_review" }),
    ]);
    const result = await select();
    expect(result.status).toBe("not_finalized");
    if (result.status !== "not_finalized") throw new Error("unreachable");
    expect(result.blockerCode).toBe("no_final_hld_document");
  });
});

describe("selectRfpHldFinalAuthority - stale final authority", () => {
  it("returns invalid_hld_document_payload for an approved invalid payload", async () => {
    mockEvaluateChain.mockResolvedValueOnce({ kind: "invalid_payload" });
    const result = await select();
    expect(result.status).toBe("stale_final_authority");
    if (result.status !== "stale_final_authority") throw new Error("unreachable");
    expect(result.blockerCode).toBe("invalid_hld_document_payload");
    expect(result.artifact.id).toBe("hdoc-1");
  });

  it("returns the stable staleCode for a broken approved source chain", async () => {
    mockEvaluateChain.mockResolvedValueOnce({
      kind: "stale",
      staleCode: "source_diagram_unavailable",
    });
    const result = await select();
    expect(result.status).toBe("stale_final_authority");
    if (result.status !== "stale_final_authority") throw new Error("unreachable");
    expect(result.blockerCode).toBe("source_diagram_unavailable");
  });

  it("does not throw for ordinary invalid/stale state", async () => {
    mockEvaluateChain.mockResolvedValueOnce({ kind: "invalid_payload" });
    await expect(select()).resolves.toBeDefined();
  });
});

describe("selectRfpHldFinalAuthority - ok selection + hygiene", () => {
  it("selects the highest-version approved upload and re-validates it", async () => {
    const older = docArtifact({ id: "hdoc-v1", version: 1 });
    const newer = docArtifact({ id: "hdoc-v3", version: 3 });
    mockListByType.mockResolvedValueOnce([older, newer]);
    const result = await select();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.authority.artifact.id).toBe("hdoc-v3");
    expect(result.authority.finalAuthorityStatus).toBe("approved_manual_drawio_upload");
    expect(mockEvaluateChain).toHaveBeenCalledWith(TENANT, PROJECT, newer);
  });

  it("keeps the full payload only in the service ok result, never in summaries", async () => {
    const result = await select();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // Full payload (drawio XML included) is retained for later export/close services.
    expect(result.payload.drawioXml).toContain(DRAWIO_SENTINEL);
    // Public summaries never carry the drawio XML body.
    const summaryJson = JSON.stringify(result.authority);
    expect(summaryJson).not.toContain(DRAWIO_SENTINEL);
    expect(summaryJson).not.toContain("drawioXml\"");
    expect(result.authority.payloadSummary.drawioXmlLength).toBeGreaterThan(0);
  });

  it("ok result leaks no tenant id in its public summaries", async () => {
    const result = await select();
    if (result.status !== "ok") throw new Error("unreachable");
    expect(JSON.stringify(result.authority)).not.toContain(TENANT);
    expect(JSON.stringify(result.project)).not.toContain(TENANT);
  });
});

describe("selectRfpHldFinalAuthority - generated vs manual precedence", () => {
  it("selects an approved generated document when no approved manual upload exists", async () => {
    mockListByType.mockResolvedValueOnce([genDocArtifact({ version: 2 })]);
    mockEvaluateChain.mockResolvedValueOnce({ kind: "valid", payload: genPayload() });
    const result = await select();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.authority.artifact.id).toBe("hdoc-gen-1");
    expect(result.authority.payloadSummary.sourceMode).toBe("generated_drawio_output");
    expect(result.authority.finalAuthorityStatus).toBe("approved_generated_hld_document");
  });

  it("lets an approved manual upload supersede a newer approved generated document", async () => {
    const generated = genDocArtifact({ id: "hdoc-gen-9", version: 9 });
    const manual = docArtifact({ id: "hdoc-manual-1", version: 1 });
    mockListByType.mockResolvedValueOnce([generated, manual]);
    const result = await select();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // The (older) manual upload wins over the newer generated document.
    expect(result.authority.artifact.id).toBe("hdoc-manual-1");
    expect(result.authority.finalAuthorityStatus).toBe("approved_manual_drawio_upload");
    expect(mockEvaluateChain).toHaveBeenCalledTimes(1);
    expect(mockEvaluateChain).toHaveBeenCalledWith(TENANT, PROJECT, manual);
  });

  it("does not fall back to a generated document when the manual upload is stale", async () => {
    const generated = genDocArtifact({ id: "hdoc-gen-9", version: 9 });
    const manual = docArtifact({ id: "hdoc-manual-1", version: 1 });
    mockListByType.mockResolvedValueOnce([generated, manual]);
    mockEvaluateChain.mockResolvedValueOnce({ kind: "invalid_payload" });
    const result = await select();
    expect(result.status).toBe("stale_final_authority");
    if (result.status !== "stale_final_authority") throw new Error("unreachable");
    expect(result.artifact.id).toBe("hdoc-manual-1");
    // No second evaluation: the selector never falls back off the manual lane.
    expect(mockEvaluateChain).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a pending generated document from a pending manual upload", async () => {
    mockListByType.mockResolvedValueOnce([
      genDocArtifact({ id: "hdoc-gen-pending", status: "needs_review", version: 1 }),
    ]);
    const result = await select();
    expect(result.status).toBe("not_finalized");
    if (result.status !== "not_finalized") throw new Error("unreachable");
    expect(result.blockerCode).toBe("generated_hld_document_pending_review");
    expect(result.latestArtifact?.id).toBe("hdoc-gen-pending");
    expect(mockEvaluateChain).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-document-final-authority.ts"
  );
  const SOURCE_CHAIN_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-document-source-chain.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-document-final-authority.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");
  const sourceChain = readFileSync(SOURCE_CHAIN_PATH, "utf8");

  it("imports exactly the stores, approvals helper, the HLD contracts, and types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-document-source-chain",
      "@/lib/projects/project-rfp-hld-document",
      "@/types/project",
    ]);
  });

  it("does not import the approval service or approval store from the read-only selector", () => {
    expect(source).not.toContain("project-rfp-hld-document-approval");
    expect(source).not.toContain("project-approval-store");
    expect(source).not.toContain("createProjectApproval");
  });

  it("performs no create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(mutationTokens).toEqual([]);
  });

  it("imports no AI/provider/catalog/pricing/config/raw-file/route module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "next/server"',
      "@anthropic-ai",
      "openai",
      "pdf-parse",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the neutral source-chain evaluator free of approval, route, and mutation imports", () => {
    const froms = Array.from(sourceChain.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-document",
      "@/lib/projects/project-rfp-hld-document-model",
      "@/lib/projects/project-rfp-hld-source-bundle",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-diagram",
      "@/lib/projects/project-rfp-hld-diagram-output",
      "@/types/project",
    ]);
    for (const forbidden of [
      "project-approval-store",
      "createProjectApproval",
      "next/server",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      "pdf-parse",
    ]) {
      expect(sourceChain, forbidden).not.toContain(forbidden);
    }
  });

  it("asserts no pricing/SKU/catalog/config authority tokens", () => {
    for (const token of ["unitPrice", "totalPrice", "acceptedSku", "catalogDecision", "configurationDecision"]) {
      expect(source, token).not.toContain(token);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(sourceChain)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

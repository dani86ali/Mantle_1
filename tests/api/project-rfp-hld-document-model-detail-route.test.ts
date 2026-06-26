import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only inspection detail service so the route's auth gate,
// tenant/param authority, body-ignoring, and result mapping are tested independent
// of the DB and the project/artifact stores.
const { mockRequireAuth, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-model-inspection", () => ({
  loadRfpHldDocumentModelDetail: mockLoadDetail,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document-model/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document-model/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-docmodel-1";
const ARTIFACT_ID = "art-docmodel-2";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const RFP_PROJECT = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document_model",
  status: "needs_review",
  version: 1,
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const DOCUMENT_MODEL = {
  payloadKind: "rfp_hld_document_model",
  createdAt: "2026-06-20T12:00:00.000Z",
  createdBy: SESSION.userId,
  sourceArtifactIds: ["bundle-1", "model-1", "diagram-1"],
  sourceHldSourceBundleArtifactId: "bundle-1",
  sourceHldDesignModelArtifactId: "model-1",
  sourceHldDiagramArtifactId: "diagram-1",
  sourceModelVersion: 1,
  sourceDiagramVersion: 1,
  title: "HLD Document Model",
  documentPurpose: "Internal structured HLD document spine for engineer review.",
  coveredDomains: ["campus_switching"],
  excludedDomains: ["service_only"],
  assumptions: [{ id: "assumption-1", text: "Single site.", sourceRefIds: ["bundle-1"] }],
  designSummary: [
    {
      id: "design-section-1",
      title: "Core",
      items: [{ id: "design-section-1-decision-1", text: "Use VSS.", sourceRefIds: ["model-1"] }],
      sourceRefIds: ["model-1"],
    },
  ],
  topologySummary: [
    {
      id: "topology-overview",
      title: "Topology Overview",
      items: [{ id: "topology-overview-nodes", text: "3 node(s).", sourceRefIds: ["diagram-1"] }],
      sourceRefIds: ["diagram-1"],
    },
  ],
  siteOrScopeSummary: [],
  implementationNotes: [],
  dependencies: [],
  risksAndCaveats: [],
  complianceTraceSummary: [
    {
      id: "compliance-trace-compliance",
      label: "Compliance references mapped in the design model",
      referencedCount: 2,
      sourceRefIds: ["model-1"],
    },
  ],
  boqTraceSummary: [
    {
      id: "boq-trace-configuration",
      label: "Configuration references mapped in the design model",
      referencedCount: 1,
      sourceRefIds: ["model-1"],
    },
  ],
  diagramReferences: [
    {
      id: "diagram-reference-1",
      diagramArtifactId: "diagram-1",
      diagramTitle: "HLD Topology Diagram",
      diagramType: "topology",
      sourceRefIds: ["diagram-1"],
    },
  ],
  validationFindings: [
    {
      id: "document-model-draft",
      severity: "info",
      code: "document_model_draft",
      message: "Deterministic HLD document model draft for engineer review.",
      sourceRefIds: [],
    },
  ],
};

const DETAIL_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifact: ARTIFACT_SUMMARY,
  documentModel: DOCUMENT_MODEL,
};

function req(body: unknown = { decoy: true }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(null)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadDetail.mockReset().mockResolvedValue(DETAIL_OK);
});

describe("GET .../rfp/artifacts/[artifactId]/hld-document-model - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET .../hld-document-model (detail) - authority", () => {
  it("passes only the session tenant and the route project/artifact ids; a decoy body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      payload: { hack: true },
    });

    const res = await GET(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadDetail).toHaveBeenCalledTimes(1);
    const arg = mockLoadDetail.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("GET .../hld-document-model (detail) - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "project_not_found",
      error: "Project not found.",
    });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    });
  });

  it("maps artifact_not_found to 404 hld_document_model_artifact_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "hld_document_model_artifact_not_found",
      error: "HLD document model artifact not found.",
    });
  });

  it("maps artifact_not_hld_document_model to 409 with the lean artifact summary", async () => {
    const artifact = {
      ...ARTIFACT_SUMMARY,
      type: "hld_source_bundle",
      stageId: "hld_design_delta_review",
    };
    mockLoadDetail.mockResolvedValue({
      status: "artifact_not_hld_document_model",
      artifact,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "artifact_not_hld_document_model",
      error: "Artifact is not an hld_document_model artifact.",
      artifact,
    });
  });

  it("maps invalid_payload to 409 hld_document_model_invalid_payload with the lean artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "invalid_payload",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "hld_document_model_invalid_payload",
      error: "HLD document model payload is invalid.",
      artifact: ARTIFACT_SUMMARY,
    });
  });

  it("maps ok to 200 with { project, artifact, documentModel }, no status discriminator, and no tenantId leakage", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifact: ARTIFACT_SUMMARY,
      documentModel: DOCUMENT_MODEL,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDetail.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_hld_document_model_inspection_failed",
      error: "Unable to inspect HLD document model.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET .../hld-document-model (detail) - route surface", () => {
  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document-model/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-document-model-detail-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  // Executable code only: comments and the ES module `export` keyword removed.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\bexport\b/g, "");

  it("imports only Next.js server primitives, requireAuth, and the read-only inspection service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-model-inspection",
    ]);
  });

  it("never reads the request body or multipart form data", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("imports no store, draft, provider/AI, raw parser, pricing, sku, catalog, config, component, or approval module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/project-rfp-hld-document-model-draft"',
      'from "@/lib/projects/project-rfp-hld-document-model-approval"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      "approval-store",
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/(',
      "@anthropic-ai",
      "@google/generative-ai",
      "pdf-parse",
      "mammoth",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("carries no final-output / approval behavior in executable code", () => {
    for (const forbidden of [
      "createProjectApproval",
      "approval-store",
      "/review",
      "download",
      "upload",
      "render",
      "final",
      "<html",
      "<svg",
      "<mxfile",
      "<?xml",
      "mermaid",
      "Mermaid",
      "draw.io",
      "technical proposal",
      "proposal",
      "export package",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("uses no output-stage terms in comments or string literals (the export keyword aside)", () => {
    const noExport = source.replace(/\bexport\b/g, "");
    const lower = noExport.toLowerCase();
    for (const term of [
      "final",
      "render",
      "rendered",
      "download",
      "upload",
      "proposal",
      "technical proposal",
      "customer deliverable",
      "<html",
      "<svg",
      "<mxfile",
      "mermaid",
      "draw.io",
      "export package",
      ".pdf",
      ".docx",
    ]) {
      expect(lower).not.toContain(term.toLowerCase());
    }
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

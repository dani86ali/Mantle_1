import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only inspection service so the routes' auth gates,
// tenant/param authority, query parsing, body-ignoring, and result mapping
// are tested independent of the DB and evidence layers.
const { mockRequireAuth, mockLoadList, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-evidence-inspection", () => ({
  loadRfpProjectEvidenceList: mockLoadList,
  loadRfpProjectEvidenceDetail: mockLoadDetail,
}));

import { GET as listGET } from "@/app/api/projects/[id]/rfp/evidence/route";
import * as listRouteModule from "@/app/api/projects/[id]/rfp/evidence/route";
import { GET as detailGET } from "@/app/api/projects/[id]/rfp/evidence/[evidenceId]/route";
import * as detailRouteModule from "@/app/api/projects/[id]/rfp/evidence/[evidenceId]/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-input-package-3";
const EVIDENCE_ID = "evidence-table-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const LIST_PARAMS = { params: { id: PROJECT } };
const DETAIL_PARAMS = { params: { id: PROJECT, evidenceId: EVIDENCE_ID } };

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

const LIST_EVIDENCE = [
  {
    id: "evidence-text-1",
    projectId: PROJECT,
    sourceFileId: "file-rfp-1",
    kind: "rfp_document_text_chunk",
    extractedAt: "2026-06-03T08:15:00.000Z",
    retainUntil: "2027-06-03T08:15:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_text_chunk",
      inputPackageArtifactId: ARTIFACT,
      sourceFileName: "file-rfp-1.pdf",
      sourceFileRole: "rfp",
      chunkIndex: 1,
      chunkCount: 2,
      charCount: 32,
      documentMetrics: {
        textCharCount: 64,
        nonWhitespaceTextCharCount: 58,
        tableCount: 1,
        tableRowCount: 2,
      },
    },
  },
  {
    id: EVIDENCE_ID,
    projectId: PROJECT,
    sourceFileId: "file-boq-1",
    kind: "rfp_document_table",
    extractedAt: "2026-06-03T08:15:00.000Z",
    retainUntil: "2027-06-03T08:15:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_table",
      inputPackageArtifactId: ARTIFACT,
      sourceFileName: "file-boq-1.xlsx",
      sourceFileRole: "boq",
      tableId: "file-boq-1:table:1",
      sheetName: "BoQ Sheet",
      rowCount: 2,
      columnCount: 2,
    },
  },
];

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  filters: {},
  evidence: LIST_EVIDENCE,
  evidenceCount: 2,
  textChunkCount: 1,
  tableEvidenceCount: 1,
};

const TABLE_DETAIL = {
  id: EVIDENCE_ID,
  projectId: PROJECT,
  sourceFileId: "file-boq-1",
  kind: "rfp_document_table",
  extractedAt: "2026-06-03T08:15:00.000Z",
  retainUntil: "2027-06-03T08:15:00.000Z",
  content: {
    evidenceKind: "rfp_document_table",
    inputPackageArtifactId: ARTIFACT,
    sourceFileId: "file-boq-1",
    sourceFileName: "file-boq-1.xlsx",
    sourceFileRole: "boq",
    tableId: "file-boq-1:table:1",
    sheetName: "BoQ Sheet",
    rowCount: 2,
    columnCount: 2,
    rows: [
      ["SKU-1", "1"],
      ["SKU-2", "2"],
    ],
  },
};

const TEXT_DETAIL = {
  id: "evidence-text-1",
  projectId: PROJECT,
  sourceFileId: "file-rfp-1",
  kind: "rfp_document_text_chunk",
  extractedAt: "2026-06-03T08:15:00.000Z",
  retainUntil: "2027-06-03T08:15:00.000Z",
  content: {
    evidenceKind: "rfp_document_text_chunk",
    inputPackageArtifactId: ARTIFACT,
    sourceFileId: "file-rfp-1",
    sourceFileName: "file-rfp-1.pdf",
    sourceFileRole: "rfp",
    chunkIndex: 1,
    chunkCount: 2,
    text: "Provide 48-port access switches.",
    charCount: 32,
    documentMetrics: {
      textCharCount: 64,
      nonWhitespaceTextCharCount: 58,
      tableCount: 1,
      tableRowCount: 2,
    },
  },
};

const DETAIL_OK = { status: "ok", project: RFP_PROJECT, evidence: TABLE_DETAIL };

function req(
  query: Record<string, string> = {},
  body: unknown = { decoy: true }
): NextRequest {
  return {
    headers: { get: () => null },
    nextUrl: { searchParams: new URLSearchParams(query) },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(null)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockLoadDetail.mockReset().mockResolvedValue(DETAIL_OK);
});

describe("GET .../rfp/evidence - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await listGET(request, LIST_PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/evidence - authority and query parsing", () => {
  it("passes only the session tenant and route project when no query is given; the body is never read", async () => {
    const request = req(
      {},
      {
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        sourceFileId: "attacker-file",
        kind: "rfp_document_table",
      }
    );

    const res = await listGET(request, LIST_PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadList).toHaveBeenCalledTimes(1);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
  });

  it("passes nonblank query filters through verbatim", async () => {
    const res = await listGET(
      req({
        sourceFileId: "file-boq-1",
        kind: "rfp_document_table",
        inputPackageArtifactId: ARTIFACT,
      }),
      LIST_PARAMS
    );

    expect(res.status).toBe(200);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "inputPackageArtifactId",
      "kind",
      "projectId",
      "sourceFileId",
      "tenantId",
    ]);
    expect(arg.sourceFileId).toBe("file-boq-1");
    expect(arg.kind).toBe("rfp_document_table");
    expect(arg.inputPackageArtifactId).toBe(ARTIFACT);
  });

  it("ignores blank query values by not passing them", async () => {
    const res = await listGET(
      req({ sourceFileId: "   ", kind: "", inputPackageArtifactId: "" }),
      LIST_PARAMS
    );

    expect(res.status).toBe(200);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
  });

  it("rejects an unknown kind with 400 invalid_rfp_evidence_query without calling the service", async () => {
    const res = await listGET(req({ kind: "boq_line_item" }), LIST_PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      code: "invalid_rfp_evidence_query",
      error: "kind must be rfp_document_text_chunk or rfp_document_table.",
    });
    expect(mockLoadList).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/evidence - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });

    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
    expect(body.error).toBe("Project not found.");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadList.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with the lean payload, no status discriminator, and no raw content", async () => {
    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      filters: {},
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      evidence: LIST_EVIDENCE,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain('"text"');
    expect(json).not.toContain('"rows"');
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_inspection_failed");
    expect(body.error).toBe("Unable to inspect RFP evidence.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET .../rfp/evidence/[evidenceId] - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await detailGET(request, DETAIL_PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/evidence/[evidenceId] - authority", () => {
  it("passes only the session tenant and route project/evidence ids; the body is never read", async () => {
    const request = req(
      {},
      {
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        evidenceItemId: "attacker-evidence",
      }
    );

    const res = await detailGET(request, DETAIL_PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadDetail).toHaveBeenCalledTimes(1);
    const arg = mockLoadDetail.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "evidenceItemId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.evidenceItemId).toBe(EVIDENCE_ID);
  });
});

describe("GET .../rfp/evidence/[evidenceId] - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
    expect(body.error).toBe("Project not found.");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps evidence_not_found to 404 rfp_evidence_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "evidence_not_found" });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_evidence_not_found",
      error: "RFP evidence item not found.",
    });
  });

  it("maps a table detail to 200 with { project, evidence }; rows allowed, tenantId/storagePath never", async () => {
    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: RFP_PROJECT, evidence: TABLE_DETAIL });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).toContain('"rows"');
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
  });

  it("maps a text detail to 200; the persisted text body is allowed, tenantId/storagePath never", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "ok",
      project: RFP_PROJECT,
      evidence: TEXT_DETAIL,
    });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: RFP_PROJECT, evidence: TEXT_DETAIL });
    const json = JSON.stringify(body);
    expect(json).toContain('"text"');
    expect(json).toContain("Provide 48-port access switches.");
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain("storagePath");
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDetail.mockRejectedValue(new Error(secret));

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_inspection_failed");
    expect(body.error).toBe("Unable to inspect RFP evidence.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("route surface", () => {
  it("the list route exports GET only", () => {
    expect(typeof listRouteModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(
        (listRouteModule as Record<string, unknown>)[method]
      ).toBeUndefined();
    }
  });

  it("the detail route exports GET only", () => {
    expect(typeof detailRouteModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(
        (detailRouteModule as Record<string, unknown>)[method]
      ).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const LIST_SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/evidence/route.ts"
  );
  const DETAIL_SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/evidence/[evidenceId]/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-evidence-inspection-route.test.ts"
  );
  const sources: Array<[string, string]> = [
    ["list", readFileSync(LIST_SRC_PATH, "utf8")],
    ["detail", readFileSync(DETAIL_SRC_PATH, "utf8")],
  ];

  it.each(sources)(
    "the %s route imports only Next.js server primitives, requireAuth, and the inspection service",
    (_label, source) => {
      const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
      expect(froms).toEqual([
        "next/server",
        "@/lib/middleware/auth",
        "@/lib/projects/project-rfp-evidence-inspection",
      ]);
    }
  );

  it.each(sources)("the %s route never reads the request body", (_label, source) => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it.each(sources)(
    "the %s route does not import DB, stores, extraction, persistence, parsers/loaders, pricing, config expansion, export, runner, AI, catalog, intake, engine, coordinator, or adapter modules",
    (_label, source) => {
      for (const forbidden of [
        'from "@/lib/db',
        "createProjectEvidenceItem",
        "createProjectArtifactVersion",
        "createProjectApproval",
        'from "@/lib/projects/project-rfp-evidence-persistence"',
        'from "@/lib/projects/project-rfp-evidence-run"',
        'from "@/lib/projects/project-rfp-extraction-run"',
        'from "@/lib/projects/rfp-document-extraction"',
        'from "@/lib/projects/project-rfp-input-package',
        'from "@/lib/projects/approvals"',
        'from "@/lib/projects/evidence"',
        'from "@/lib/projects/boq-file-loader"',
        'from "@/lib/projects/boq-formats"',
        'from "@/lib/projects/boq-normalization"',
        'from "@/lib/projects/pricing"',
        'from "@/lib/projects/priced-boq',
        'from "@/lib/projects/config-expansion',
        'from "@/lib/projects/mantle',
        'from "@/lib/projects/quick-bom-runner"',
        'from "@/lib/export',
        'from "@/lib/intake',
        'from "@/lib/adapters',
        'from "@/lib/agent',
        'from "@/lib/ai',
        'from "@/lib/llm',
        'from "@/lib/catalog',
        'from "@/coordinator',
        'from "@/engines',
        "@anthropic-ai",
        "@google/generative-ai",
        "tesseract",
        "pdf-parse",
        "mammoth",
        "papaparse",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  );

  it("keeps both route sources and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    for (const [, source] of sources) {
      expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    }
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

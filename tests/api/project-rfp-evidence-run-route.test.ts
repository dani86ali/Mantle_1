import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the evidence-run service so the route's auth gate,
// tenant/param authority, body-ignoring, and result mapping are tested
// independent of the DB, extraction, and persistence layers.
const { mockRequireAuth, mockRunEvidence } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockRunEvidence: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-evidence-run", () => ({
  runRfpExtractionEvidencePersistence: mockRunEvidence,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-input-package-3";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "input_package",
  status: "approved",
  version: 3,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [],
  createdAt: "2026-06-08T12:00:00.000Z",
  updatedAt: "2026-06-08T12:00:00.000Z",
};

const QUALITY = {
  status: "passed",
  totalFiles: 2,
  passedFiles: 2,
  failedFiles: 0,
  totalTextChars: 32,
  totalNonWhitespaceTextChars: 29,
  totalTables: 1,
  totalTableRows: 2,
  warnings: [],
};

const EVIDENCE = [
  {
    id: "evidence-1",
    projectId: PROJECT,
    sourceFileId: "file-rfp-1",
    kind: "rfp_document_text_chunk",
    extractedAt: "2026-06-09T08:15:00.000Z",
    retainUntil: "2027-06-09T08:15:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_text_chunk",
      chunkIndex: 1,
      chunkCount: 1,
      charCount: 32,
    },
  },
  {
    id: "evidence-2",
    projectId: PROJECT,
    sourceFileId: "file-boq-1",
    kind: "rfp_document_table",
    extractedAt: "2026-06-09T08:15:00.000Z",
    retainUntil: "2027-06-09T08:15:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_table",
      tableId: "file-boq-1:table:1",
      rowCount: 2,
      columnCount: 2,
    },
  },
];

const OK_RESULT = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  quality: QUALITY,
  evidence: EVIDENCE,
  evidenceCount: 2,
  textChunkCount: 1,
  tableEvidenceCount: 1,
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
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
  mockRunEvidence.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST .../rfp/artifacts/[artifactId]/evidence - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockRunEvidence).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("POST .../evidence - authority", () => {
  it("passes only the session tenant and route params; the body is never read and its decoy fields never reach the service", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      inputPackageArtifactId: "attacker-package",
      status: "ok",
      evidence: [{ id: "attacker-evidence" }],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockRunEvidence).toHaveBeenCalledTimes(1);
    const arg = mockRunEvidence.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "inputPackageArtifactId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.inputPackageArtifactId).toBe(ARTIFACT_ID);
  });
});

describe("POST .../evidence - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string, string]> = [
    [{ status: "not_found" }, 404, "project_not_found", "Project not found."],
    [
      { status: "input_package_not_found" },
      404,
      "input_package_artifact_not_found",
      "Input package artifact not found.",
    ],
  ];

  it.each(SIMPLE)(
    "maps %o to the right HTTP status, code, and error",
    async (result, httpStatus, code, error) => {
      mockRunEvidence.mockResolvedValue(result);

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
    }
  );

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockRunEvidence.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  const ARTIFACT_CASES: Array<[string, string, string]> = [
    [
      "artifact_not_input_package",
      "artifact_not_input_package",
      "Artifact is not an approved input_package artifact.",
    ],
    [
      "input_package_not_approved",
      "input_package_not_approved",
      "Input package artifact is not approved.",
    ],
    [
      "input_package_has_no_source_files",
      "input_package_has_no_source_files",
      "Input package has no source files.",
    ],
  ];

  it.each(ARTIFACT_CASES)(
    "maps %s to 409 %s with the artifact summary",
    async (status, code, error) => {
      mockRunEvidence.mockResolvedValue({
        status,
        artifact: ARTIFACT_SUMMARY,
      });

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    }
  );

  it("maps source_file_not_found to 409 input_package_source_file_not_found with the missing file id", async () => {
    mockRunEvidence.mockResolvedValue({
      status: "source_file_not_found",
      missingFileId: "file-missing-1",
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("input_package_source_file_not_found");
    expect(body.error).toBe("Input package references a missing source file.");
    expect(body.missingFileId).toBe("file-missing-1");
  });

  it("maps quality_gate_failed to 422 rfp_extraction_quality_gate_failed with artifact, files, and quality", async () => {
    const files = [
      {
        fileId: "file-rfp-1",
        fileName: "file-rfp-1.pdf",
        fileRole: "rfp",
        quality: "failed",
        reason: "no_extractable_text_or_tables",
        metrics: {
          textCharCount: 0,
          nonWhitespaceTextCharCount: 0,
          tableCount: 0,
          tableRowCount: 0,
        },
        warnings: [],
      },
    ];
    const quality = {
      ...QUALITY,
      status: "failed",
      passedFiles: 0,
      failedFiles: 1,
    };
    mockRunEvidence.mockResolvedValue({
      status: "quality_gate_failed",
      artifact: ARTIFACT_SUMMARY,
      files,
      quality,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_quality_gate_failed");
    expect(body.error).toBe("RFP extraction quality gate failed.");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    expect(body.files).toEqual(files);
    expect(body.quality).toEqual(quality);
  });

  it("maps evidence_already_exists to 409 rfp_evidence_already_exists with counts and lean summaries", async () => {
    mockRunEvidence.mockResolvedValue({
      status: "evidence_already_exists",
      evidence: EVIDENCE,
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_evidence_already_exists",
      error: "RFP extraction evidence already exists for this input package.",
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      evidence: EVIDENCE,
    });
    expect("status" in body).toBe(false);
  });

  it("maps ok to 201 with the lean payload, no status discriminator, and no raw content", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      quality: QUALITY,
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      evidence: EVIDENCE,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain('"text"');
    expect(json).not.toContain('"rows"');
  });
});

describe("POST .../evidence - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockRunEvidence.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_persistence_failed");
    expect(body.error).toBe("Unable to persist RFP extraction evidence.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../evidence - route surface", () => {
  it("exports POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-evidence-run-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the evidence-run service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-evidence-run",
    ]);
  });

  it("never reads the request body", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("does not import DB, stores, extraction, persistence, parsers/loaders, pricing, config expansion, export, runner, AI, catalog, intake, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectEvidenceItem",
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-rfp-evidence-persistence"',
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
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

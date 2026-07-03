import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockLoadCandidateDownload } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadCandidateDownload: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-candidate-download", () => ({
  loadProjectRfpHldDocumentCandidateDownload: mockLoadCandidateDownload,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/download/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/download/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-hld-1";
const ARTIFACT = "art-generated-hld-doc-1";
const SESSION = {
  userId: "u-se",
  tenantId: "55555555-5555-5555-5555-555555555555",
  email: "se@bomatic.ai",
  name: "SE",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

const MIME = "application/vnd.jgraph.mxfile";
const DRAWIO_XML = "<mxfile><diagram>generated-candidate</diagram></mxfile>";
const BYTES = new TextEncoder().encode(DRAWIO_XML);
const FILENAME = "BOMATIC-HLD-candidate-v3.drawio";
const ARTIFACT_SUMMARY = {
  id: ARTIFACT,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document",
  status: "needs_review",
  version: 3,
  sourceFileIds: [],
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdo-1", "hdocm-1"],
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-06-30T12:05:00.000Z",
};
const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  mode: "rfp",
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T01:00:00.000Z",
};
const OK_RESULT = {
  status: "ok",
  bytes: BYTES,
  mimeType: MIME,
  filename: FILENAME,
  contentLength: BYTES.byteLength,
  project: PROJECT_SUMMARY,
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: { sourceMode: "generated_drawio_output" },
};

function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        filename: "attacker.drawio",
        status: "approved",
        drawioXml: "<mxfile><diagram>attacker</diagram></mxfile>",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
    text: vi.fn(() => Promise.resolve("artifactId=attacker-artifact")),
    arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadCandidateDownload.mockReset().mockResolvedValue(OK_RESULT);
});

describe("GET artifact hld-document/download - auth", () => {
  it("returns the requireAuth response and skips the service and body reads when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadCandidateDownload).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET artifact hld-document/download - tenant/param authority", () => {
  it("passes session.tenantId plus route project/artifact ids only", async () => {
    const request = req();

    await GET(request, PARAMS);

    expect(mockLoadCandidateDownload).toHaveBeenCalledTimes(1);
    expect(mockLoadCandidateDownload).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    const arg = mockLoadCandidateDownload.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.artifactId).not.toBe("attacker-artifact");
    expect("filename" in arg).toBe(false);
    expect("status" in arg).toBe(false);

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET artifact hld-document/download - ok stream", () => {
  it("streams generated candidate bytes with safe attachment headers", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(MIME);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${FILENAME}"`
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Length")).toBe(String(BYTES.byteLength));

    const buf = Buffer.from(await res.arrayBuffer());
    expect(new Uint8Array(buf)).toEqual(BYTES);
    expect(buf.toString("utf8")).toBe(DRAWIO_XML);
  });
});

describe("GET artifact hld-document/download - blocked mapping", () => {
  it("maps not_found and artifact_not_found to 404 JSON", async () => {
    mockLoadCandidateDownload.mockResolvedValueOnce({ status: "not_found" });
    const project = await GET(req(), PARAMS);
    expect(project.status).toBe(404);
    expect((await project.json()).code).toBe("project_not_found");

    mockLoadCandidateDownload.mockResolvedValueOnce({
      status: "artifact_not_found",
    });
    const artifact = await GET(req(), PARAMS);
    expect(artifact.status).toBe(404);
    expect((await artifact.json()).code).toBe(
      "hld_document_artifact_not_found"
    );
  });

  it("maps fail-closed candidate statuses to stable 409 JSON", async () => {
    const cases = [
      [
        { status: "wrong_mode", project: { ...PROJECT_SUMMARY, mode: "quick_bom" } },
        "wrong_project_mode",
      ],
      [
        {
          status: "artifact_not_hld_document",
          project: PROJECT_SUMMARY,
          artifact: ARTIFACT_SUMMARY,
        },
        "artifact_not_hld_document",
      ],
      [
        {
          status: "artifact_not_reviewable",
          project: PROJECT_SUMMARY,
          artifact: { ...ARTIFACT_SUMMARY, status: "approved" },
        },
        "hld_document_artifact_not_reviewable",
      ],
      [
        {
          status: "not_generated_candidate",
          project: PROJECT_SUMMARY,
          artifact: ARTIFACT_SUMMARY,
        },
        "hld_document_not_generated_candidate",
      ],
      [
        {
          status: "invalid_payload",
          project: PROJECT_SUMMARY,
          artifact: ARTIFACT_SUMMARY,
        },
        "hld_document_payload_invalid",
      ],
      [
        {
          status: "stale_source_chain",
          project: PROJECT_SUMMARY,
          artifact: ARTIFACT_SUMMARY,
          staleCode: "source_chain_mismatch",
        },
        "hld_document_source_chain_stale",
      ],
    ] as const;

    for (const [serviceResult, code] of cases) {
      mockLoadCandidateDownload.mockResolvedValueOnce(serviceResult);
      const res = await GET(req(), PARAMS);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe(code);
      if (serviceResult.status === "stale_source_chain") {
        expect(body.staleCode).toBe("source_chain_mismatch");
      }
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("drawioXml");
      expect(raw).not.toContain("generated-candidate");
      expect(raw).not.toContain("mxfile");
      expect(raw).not.toContain('"payload":');
      expect(raw).not.toContain("payloadSummary");
    }
  });
});

describe("GET artifact hld-document/download - service failure", () => {
  it("maps unexpected errors to a controlled 500 without exposing internals", async () => {
    const secret = "candidate-download-stack-secret";
    mockLoadCandidateDownload.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_document_candidate_download_failed");
    expect(body.error).toBe(
      "Unable to download the generated HLD document candidate."
    );
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET artifact hld-document/download - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/download/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-document-candidate-download-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only next/server, requireAuth, and the candidate download service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-candidate-download",
    ]);
  });

  it("touches no store/mutation/final-authority/provider/raw-doc/pricing/SKU/catalog/config module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "getProjectById",
      "getProjectArtifactById",
      "createProjectArtifact",
      "createProjectApproval",
      "selectRfpHldFinalAuthority",
      "project-rfp-hld-document-download",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      '@/lib/projects/pricing"',
      "@/lib/projects/config-expansion",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not read the request body or query", () => {
    for (const forbidden of [
      "request.json",
      "request.formData",
      "request.text",
      "request.arrayBuffer",
      ".json()",
      ".formData()",
      ".text()",
      ".arrayBuffer()",
      "request.url",
      "nextUrl",
      "searchParams",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

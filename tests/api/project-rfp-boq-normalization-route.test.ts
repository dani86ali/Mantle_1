import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the RFP normalization wrapper service so the route's auth-gate,
// tenant/param authority, body-ignoring, and result-mapping are tested
// independent of the DB/FS/normalizer.
const { mockRequireAuth, mockNormalize } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockNormalize: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-boq-normalization", () => ({
  normalizeProjectRfpBoqFile: mockNormalize,
}));

import { POST } from "@/app/api/projects/[id]/rfp/files/[fileId]/boq/normalize/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/files/[fileId]/boq/normalize/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const FILE_ID = "file-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const ARTIFACT_SUMMARY = {
  id: "art-1",
  projectId: PROJECT,
  stageId: "boq_format_validation",
  type: "normalized_boq",
  status: "generated",
  version: 1,
  sourceFileIds: [FILE_ID],
  sourceArtifactIds: [],
  createdAt: "2026-05-21T08:00:00.000Z",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const PAYLOAD_SUMMARY = {
  sourceFileId: FILE_ID,
  sourceFileName: "boq.xlsx",
  sourceSheetName: "MAIN BOQ",
  lineCount: 2,
  sourceFormats: ["format_1_line_item"],
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Quick BoM Job",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const PARAMS = { params: { id: PROJECT, fileId: FILE_ID } };

// The route ignores the body; the mock exposes json/formData spies seeded with
// decoy tenant/project/file fields so a test can prove neither is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        fileId: "attacker-file",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockNormalize
    .mockReset()
    .mockResolvedValue({
      status: "ok",
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
});

describe("POST .../rfp/files/[fileId]/boq/normalize - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req(), PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockNormalize).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/files/[fileId]/boq/normalize - tenant/param authority", () => {
  it("uses session.tenantId plus route params only and never reads the request body", async () => {
    const request = req();

    await POST(request, PARAMS);

    expect(mockNormalize).toHaveBeenCalledTimes(1);
    expect(mockNormalize).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    const arg = mockNormalize.mock.calls[0][0];
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.fileId).not.toBe("attacker-file");

    // The body is ignored entirely.
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/files/[fileId]/boq/normalize - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockNormalize.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockNormalize.mockResolvedValue({
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

  it("maps file_not_found to 404 project_boq_file_not_found", async () => {
    mockNormalize.mockResolvedValue({ status: "file_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_boq_file_not_found");
  });

  it("maps file_not_boq to 409 project_file_not_boq", async () => {
    mockNormalize.mockResolvedValue({ status: "file_not_boq" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("project_file_not_boq");
  });

  it("maps invalid_format to 400 invalid_boq_format and echoes the format message", async () => {
    const message =
      "Your BoQ/BoM format does not match the 2 formats accepted by Bomatic. Check FAQ formatting for more details.";
    mockNormalize.mockResolvedValue({ status: "invalid_format", message });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_boq_format");
    expect(body.error).toBe(message);
  });

  it("maps ok to 201 with { artifact, payloadSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../rfp/files/[fileId]/boq/normalize - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockNormalize.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_boq_normalization_failed");
    expect(body.error).toBe("Unable to normalize RFP BoQ file.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../rfp/files/[fileId]/boq/normalize - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/files/[fileId]/boq/normalize/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-boq-normalization-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the RFP normalization wrapper service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-boq-normalization",
    ]);
  });

  it("does not import DB, stores, raw BoQ loader/parser, artifact/approval/evidence stores, pricing, config expansion, mantle/export, runner, SKU/catalog, AI/LLM, adapter, agent, coordinator, or engine modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/boq-formats"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/evidence',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/rfp-runner"',
      'from "@/lib/export',
      'from "@/lib/sku',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectFile } from "@/types/project";

// Mock the three stores the service composes. The readiness helper
// (project-rfp-boq-readiness) is intentionally NOT mocked: it is pure and runs
// for real over the reloaded files/artifacts so the workspace refresh is exercised.
const {
  mockGetProjectById,
  mockListFiles,
  mockListArtifacts,
  mockCreateArtifact,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockListFiles: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockCreateArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListFiles,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifacts: mockListArtifacts,
  createProjectArtifactVersion: mockCreateArtifact,
}));

import * as serviceModule from "@/lib/projects/project-rfp-no-boq-exception";
import {
  createRfpNoBoqServiceOnlyException,
  RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND,
} from "@/lib/projects/project-rfp-no-boq-exception";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const REQUESTER = "u-engineer";
const REASON = "Service-only engagement; no BoQ in this tender.";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const REQUESTED_AT = new Date("2026-06-23T09:00:00.000Z");
const ART_CREATED = new Date("2026-06-23T09:00:01.000Z");
const ART_UPDATED = new Date("2026-06-23T09:00:02.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Aramco RFP Bid",
    customerName: "Aramco",
    mode: "rfp",
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

function makeFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: "file-1",
    projectId: PROJECT,
    fileRole: "rfp",
    fileName: "tender.pdf",
    storagePath: "/storage/secret/tender.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1234,
    uploadedAt: TS1,
    retainUntil: TS2,
    ...overrides,
  };
}

function makeExceptionArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: "art-exc-1",
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    version: 1,
    payload: {
      payloadKind: RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND,
      reason: REASON,
      requestedBy: REQUESTER,
      requestedAt: REQUESTED_AT.toISOString(),
      acceptedLines: [],
      rejectedLines: [],
      lineCount: 0,
      summary: { acceptedLineCount: 0, rejectedLineCount: 0, lineCount: 0 },
    },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockListFiles.mockReset().mockResolvedValue([]);
  mockListArtifacts.mockReset().mockResolvedValue([]);
  mockCreateArtifact.mockReset().mockResolvedValue(makeExceptionArtifact());
});

function validInput() {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    reason: REASON,
    requestedBy: REQUESTER,
    requestedAt: REQUESTED_AT,
  };
}

describe("createRfpNoBoqServiceOnlyException - validation before stores", () => {
  it.each([
    ["", "blank reason"],
    ["   ", "whitespace reason"],
  ])("throws for %s and touches no store", async (reason) => {
    await expect(
      createRfpNoBoqServiceOnlyException({ ...validInput(), reason })
    ).rejects.toThrow("reason is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ["", "blank requestedBy"],
    ["   ", "whitespace requestedBy"],
  ])("throws for %s and touches no store", async (requestedBy) => {
    await expect(
      createRfpNoBoqServiceOnlyException({ ...validInput(), requestedBy })
    ).rejects.toThrow("requestedBy is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpNoBoqServiceOnlyException - project gates", () => {
  it("returns not_found and creates nothing when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and creates nothing for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "quick_bom",
        name: "Honeywell Quick BoM",
        customerName: "Honeywell",
      })
    );

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "quick_bom", customerName: undefined })
    );

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("createRfpNoBoqServiceOnlyException - BoQ file gate", () => {
  it("returns boq_files_present and creates nothing when a boq file exists", async () => {
    mockListFiles.mockResolvedValue([
      makeFile({ fileRole: "rfp" }),
      makeFile({ id: "file-2", fileRole: "boq", fileName: "boq.xlsx" }),
    ]);

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    expect(result).toEqual({ status: "boq_files_present" });
    expect(mockListArtifacts).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpNoBoqServiceOnlyException - duplicate exception gate", () => {
  it.each(["generated", "needs_review", "approved"] as const)(
    "returns exception_already_exists for a standing %s exception",
    async (status) => {
      const standing = makeExceptionArtifact({ status, id: "art-exc-prior" });
      mockListArtifacts.mockResolvedValue([standing]);

      const result = await createRfpNoBoqServiceOnlyException(validInput());

      expect(result.status).toBe("exception_already_exists");
      if (result.status !== "exception_already_exists") {
        throw new Error("unreachable");
      }
      expect(result.artifact.id).toBe("art-exc-prior");
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  );

  it("picks the highest-version exception when several exist", async () => {
    mockListArtifacts.mockResolvedValue([
      makeExceptionArtifact({ id: "v1", version: 1, status: "rejected" }),
      makeExceptionArtifact({ id: "v2", version: 2, status: "needs_review" }),
    ]);

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    if (result.status !== "exception_already_exists") {
      throw new Error("unreachable");
    }
    expect(result.artifact.id).toBe("v2");
  });

  it.each(["rejected", "stale"] as const)(
    "supersedes a %s exception by creating a fresh artifact",
    async (status) => {
      mockListArtifacts
        .mockResolvedValueOnce([makeExceptionArtifact({ status, version: 1 })])
        .mockResolvedValueOnce([makeExceptionArtifact({ version: 2 })]);

      const result = await createRfpNoBoqServiceOnlyException(validInput());

      expect(result.status).toBe("ok");
      expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    }
  );

  it("ignores artifacts of other types/stages/kinds when scanning for a standing exception", async () => {
    mockListArtifacts.mockResolvedValue([
      makeExceptionArtifact({
        id: "draft",
        payload: { payloadKind: "configuration_expansion_draft" },
      }),
      makeExceptionArtifact({ id: "wrong-stage", stageId: "boq_format_validation" }),
      makeExceptionArtifact({ id: "wrong-type", type: "priced_boq" }),
    ]);

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
  });
});

describe("createRfpNoBoqServiceOnlyException - ok creation", () => {
  it("writes one needs_review configuration_expansion exception with empty source arrays and zero counts", async () => {
    await createRfpNoBoqServiceOnlyException(validInput());

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("configuration_expansion_review");
    expect(arg.type).toBe("configuration_expansion");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([]);
    expect(arg.payload.payloadKind).toBe(
      RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND
    );
    expect(arg.payload.reason).toBe(REASON);
    expect(arg.payload.requestedBy).toBe(REQUESTER);
    expect(arg.payload.requestedAt).toBe(REQUESTED_AT.toISOString());
    expect(arg.payload.acceptedLines).toEqual([]);
    expect(arg.payload.rejectedLines).toEqual([]);
    expect(arg.payload.lineCount).toBe(0);
    expect(arg.payload.summary).toEqual({
      acceptedLineCount: 0,
      rejectedLineCount: 0,
      lineCount: 0,
    });
  });

  it("returns a serializable artifact summary with ISO dates and no payload", async () => {
    const result = await createRfpNoBoqServiceOnlyException(validInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: "art-exc-1",
      projectId: PROJECT,
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      status: "needs_review",
      version: 1,
      sourceFileIds: [],
      sourceArtifactIds: [],
      createdAt: ART_CREATED.toISOString(),
      updatedAt: ART_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a payload summary with provenance and a zero acceptedLineCount, no lines", async () => {
    const result = await createRfpNoBoqServiceOnlyException(validInput());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND,
      reason: REASON,
      requestedBy: REQUESTER,
      requestedAt: REQUESTED_AT.toISOString(),
      acceptedLineCount: 0,
    });
    expect("acceptedLines" in result.payloadSummary).toBe(false);
    expect("rejectedLines" in result.payloadSummary).toBe(false);
  });

  it("does not leak the file storagePath into any part of the result", async () => {
    mockListFiles.mockResolvedValue([makeFile()]);

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    expect(JSON.stringify(result)).not.toContain("/storage/secret/");
  });

  it("defaults requestedAt to a generated ISO timestamp when omitted", async () => {
    await createRfpNoBoqServiceOnlyException({
      tenantId: TENANT,
      projectId: PROJECT,
      reason: REASON,
      requestedBy: REQUESTER,
    });

    const arg = mockCreateArtifact.mock.calls[0][0];
    expect(typeof arg.payload.requestedAt).toBe("string");
    expect(() => new Date(arg.payload.requestedAt as string).toISOString()).not.toThrow();
  });

  it("reloads files and artifacts after creation and returns the refreshed readiness workspace", async () => {
    mockListArtifacts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeExceptionArtifact()]);

    const result = await createRfpNoBoqServiceOnlyException(validInput());

    if (result.status !== "ok") throw new Error("unreachable");
    // Existing-check + reload => two artifact reads; two file reads.
    expect(mockListArtifacts).toHaveBeenCalledTimes(2);
    expect(mockListFiles).toHaveBeenCalledTimes(2);
    expect(result.workspace.projectId).toBe(PROJECT);
    expect(result.workspace.hasBoqFiles).toBe(false);
    // The freshly written exception is visible to the pure readiness helper.
    expect(result.workspace.configurationGate.status).toBe(
      "no_boq_exception_pending_review"
    );
    expect(result.workspace.configurationGate.noBoqExceptionArtifactId).toBe(
      "art-exc-1"
    );
  });

  it("does not approve the created artifact", async () => {
    const result = await createRfpNoBoqServiceOnlyException(validInput());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.status).toBe("needs_review");
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-no-boq-exception.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-no-boq-exception.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the project/file/artifact stores, the readiness helper, and canonical types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-file-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/lib/projects/project-rfp-boq-readiness"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import approval/pricing/config-expansion/mantle/lookup/runner/AI/engine/coordinator/adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-approval-store"',
      "createProjectApproval",
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/config-expanded',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the payload-kind constant and the creation function as runtime exports", () => {
    expect(Object.keys(serviceModule).sort()).toEqual([
      "RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND",
      "createRfpNoBoqServiceOnlyException",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

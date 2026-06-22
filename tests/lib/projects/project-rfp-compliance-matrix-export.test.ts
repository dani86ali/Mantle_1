import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const { mockGetProjectById, mockGetArtifactById } = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));

import { exportRfpComplianceMatrixCsv } from "@/lib/projects/project-rfp-compliance-matrix-export";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-compliance-matrix-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
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

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "RFP-COMP-001",
    requirementId: "RFP-REQ-001",
    requirementText: "Requirement text",
    category: "technical",
    priority: "must",
    complianceStatus: "compliant",
    response: "We comply.",
    evidenceReferences: [],
    rowReviewStatus: "reviewed",
    ...overrides,
  };
}

function makePayload(rows: Record<string, unknown>[]): Record<string, unknown> {
  return {
    payloadKind: "rfp_compliance_matrix",
    sourceRequirementsBaselineArtifactId: "art-requirements-baseline-1",
    sourceEvidencePackageArtifactId: "art-evidence-1",
    createdBy: "u-drafter",
    createdAt: "2026-06-01T00:00:00.000Z",
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: ["art-requirements-baseline-1"],
    rows,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "compliance_matrix_review",
    type: "compliance_matrix",
    status: "approved",
    version: 3,
    payload: makePayload([makeRow()]),
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: ["art-requirements-baseline-1"],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

async function run() {
  return exportRfpComplianceMatrixCsv({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
});

describe("exportRfpComplianceMatrixCsv gates", () => {
  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(await run()).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean project summary (no tenant) for non-rfp", async () => {
    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const result = await run();
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "STC RFP Bid",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns compliance_matrix_not_found when the artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValueOnce(null);
    expect(await run()).toEqual({ status: "compliance_matrix_not_found" });
  });

  it("returns artifact_not_compliance_matrix for the wrong type or stage", async () => {
    for (const type of [
      "requirements_baseline",
      "evidence_package",
      "priced_boq",
    ] as ProjectArtifactType[]) {
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ type }));
      expect(await run()).toEqual({ status: "artifact_not_compliance_matrix" });
    }
    for (const stageId of [
      "requirements_baseline_review",
      "intake_package_review",
    ] as ProjectStageId[]) {
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ stageId }));
      expect(await run()).toEqual({ status: "artifact_not_compliance_matrix" });
    }
  });

  it("returns compliance_matrix_not_approved unless the artifact is approved", async () => {
    for (const status of [
      "generated",
      "needs_review",
      "rejected",
      "stale",
    ] as ProjectArtifactStatus[]) {
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ status }));
      expect(await run()).toEqual({ status: "compliance_matrix_not_approved" });
    }
  });

  it("returns invalid_payload for a non-matrix or malformed payload", async () => {
    for (const payload of [
      null,
      "nope",
      { payloadKind: "rfp_compliance_matrix" },
      { payloadKind: "something_else", rows: [] },
      makePayload([makeRow(), "not-a-row" as unknown as Record<string, unknown>]),
    ]) {
      mockGetArtifactById.mockResolvedValueOnce(
        makeArtifact({ payload: payload as Record<string, unknown> })
      );
      expect(await run()).toEqual({ status: "invalid_payload" });
    }
  });

  it("returns no_exportable_rows when every row is removed", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({ id: "RFP-COMP-001", rowReviewStatus: "removed", removedReason: "dup" }),
        ]),
      })
    );
    expect(await run()).toEqual({ status: "no_exportable_rows" });
  });
});

describe("exportRfpComplianceMatrixCsv csv output", () => {
  it("emits the exact header and CRLF-separated rows for active rows only", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({ id: "RFP-COMP-001", sectionReference: "3.1", complianceStatus: "compliant" }),
          makeRow({ id: "RFP-COMP-002", sectionReference: "3.2", complianceStatus: "partially_compliant" }),
          makeRow({ id: "RFP-COMP-003", rowReviewStatus: "removed", removedReason: "dup" }),
        ]),
      })
    );
    const result = await run();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const lines = result.csv.split("\r\n");
    expect(lines[0]).toBe("Section Reference,Description,Comply/Not Comply,Notes");
    expect(lines).toHaveLength(3); // header + 2 active rows
    expect(lines[1]).toBe("3.1,Requirement text,Comply,We comply.");
    expect(lines[2]).toBe("3.2,Requirement text,Not Comply,We comply.");
    expect(result.rowCount).toBe(2);
    expect(result.csv).not.toContain("RFP-COMP-003");
  });

  it("maps only compliant to Comply; every other active status to Not Comply", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({ id: "A", complianceStatus: "compliant" }),
          makeRow({ id: "B", complianceStatus: "partially_compliant" }),
          makeRow({ id: "C", complianceStatus: "non_compliant" }),
          makeRow({
            id: "D",
            complianceStatus: "not_applicable",
            notApplicableReason: "out of scope",
          }),
          makeRow({ id: "E", complianceStatus: "needs_review" }),
        ]),
      })
    );
    const result = await run();
    if (result.status !== "ok") throw new Error("unreachable");
    const verdicts = result.csv.split("\r\n").slice(1).map((line) => line.split(",")[2]);
    expect(verdicts).toEqual(["Comply", "Not Comply", "Not Comply", "Not Comply", "Not Comply"]);
  });

  it("composes Notes from response, notes, and a not-applicable reason", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({
            id: "A",
            complianceStatus: "not_applicable",
            notApplicableReason: "out of scope",
            response: "See section 4.",
            notes: "extra note",
          }),
        ]),
      })
    );
    const result = await run();
    if (result.status !== "ok") throw new Error("unreachable");
    const notes = result.csv.split("\r\n")[1].split(",").slice(3).join(",");
    expect(notes).toBe("See section 4. | extra note | Not applicable: out of scope");
  });

  it("uses empty strings for missing section reference and requirement text; no requirementId fallback", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({
            id: "A",
            requirementId: "RFP-REQ-777",
            requirementText: undefined,
            sectionReference: undefined,
            response: "",
            notes: undefined,
          }),
        ]),
      })
    );
    const result = await run();
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.csv.split("\r\n")[1]).toBe(",,Comply,");
    expect(result.csv).not.toContain("RFP-REQ-777");
  });

  it("applies RFC-style escaping for commas, quotes, and CR/LF", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({
            id: "A",
            sectionReference: "3.1, 3.2",
            requirementText: 'Need "HA" support',
            response: "line1\r\nline2",
          }),
        ]),
      })
    );
    const result = await run();
    if (result.status !== "ok") throw new Error("unreachable");
    const dataLine = result.csv.slice(result.csv.indexOf("\r\n") + 2);
    expect(dataLine).toBe('"3.1, 3.2","Need ""HA"" support",Comply,"line1\r\nline2"');
  });

  it("excludes all internal metadata from the csv", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({
        payload: makePayload([
          makeRow({
            id: "RFP-COMP-001",
            requirementId: "RFP-REQ-001",
            sectionReference: "3.1",
            requirementText: "Requirement text",
            response: "We comply.",
            rationale: "INTERNAL-RATIONALE",
            ownerLane: "commercial",
            responseLane: "technical",
            hldImpact: "required",
            tpImpact: "potential",
            boqConfigImpact: "required",
            requiresOwnerReview: true,
            removedReason: "INTERNAL-REMOVED",
            notApplicableReason: "INTERNAL-NA",
            evidenceReferences: [{ evidenceId: "EV-SECRET", sourceFileId: "file-rfp-1" }],
            configurationReferences: [
              { configurationExpansionArtifactId: "CFG-SECRET", lineId: "L1", sku: "C9300-SECRET" },
            ],
            reviewHistory: [{ action: "edited", at: "2026-06-01T00:00:00.000Z", by: "HISTORY-SECRET" }],
          }),
        ]),
      })
    );
    const result = await run();
    if (result.status !== "ok") throw new Error("unreachable");
    for (const secret of [
      "RFP-COMP-001",
      "RFP-REQ-001",
      "INTERNAL-RATIONALE",
      "commercial",
      "technical",
      "EV-SECRET",
      "CFG-SECRET",
      "C9300-SECRET",
      "HISTORY-SECRET",
      "INTERNAL-REMOVED",
    ]) {
      expect(result.csv).not.toContain(secret);
    }
  });

  it("returns bytes, content length, mime, filename, and row count", async () => {
    mockGetProjectById.mockResolvedValueOnce(makeProject({ name: "STC: RFP / Bid #7" }));
    mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ version: 5 }));
    const result = await run();
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
    expect(result.bytes.toString("utf8")).toBe(result.csv);
    expect(result.contentLength).toBe(Buffer.byteLength(result.csv, "utf8"));
    expect(result.filename).toBe("BOMATIC-RFP-Compliance-Matrix-STC__RFP___Bid__7-v5.csv");
    expect(result.rowCount).toBe(1);
  });
});

describe("exportRfpComplianceMatrixCsv store scoping and purity", () => {
  it("scopes both store reads to the input tenant/project/artifact", async () => {
    await run();
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
  });

  it("never mutates the source artifact payload", async () => {
    const payload = makePayload([makeRow({ id: "A" })]);
    const snapshot = JSON.stringify(payload);
    mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ payload }));
    await run();
    expect(JSON.stringify(payload)).toBe(snapshot);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-export.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-export.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the two stores, the matrix contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-compliance-matrix",
      "@/types/project",
    ]);
  });

  it("creates/mutates/decides nothing and imports no generation, AI, pricing, or config modules", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-compliance-matrix-drafting"',
      'from "@/lib/projects/project-rfp-compliance-matrix-generation"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/config-expansion',
      "@anthropic-ai",
      "@google/generative-ai",
      "readFile",
      "node:fs",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

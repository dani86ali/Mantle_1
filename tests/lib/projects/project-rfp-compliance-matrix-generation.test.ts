import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDraftRows, mockCreateDraft } = vi.hoisted(() => ({
  mockDraftRows: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-compliance-matrix-drafting", () => ({
  draftRfpComplianceMatrixRows: mockDraftRows,
}));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-draft", () => ({
  createRfpComplianceMatrixDraft: mockCreateDraft,
}));

import {
  generateRfpComplianceMatrixDraft,
} from "@/lib/projects/project-rfp-compliance-matrix-generation";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const BASELINE = "art-requirements-baseline-1";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const CONFIG = "art-config-expansion-1";
const REQUESTED_BY = "engineer@stc.example";
const EXECUTOR = vi.fn();

const ROWS = [
  {
    id: "RFP-COMP-001",
    requirementId: "RFP-REQ-001",
    requirementText: "Provide access switching.",
    category: "technical",
    priority: "mandatory",
    complianceStatus: "needs_review",
    response: "Under review.",
    evidenceReferences: [],
  },
];

const DRAFTING_OK = {
  status: "ok",
  project: { id: PROJECT },
  requirementsBaselineArtifactId: BASELINE,
  evidencePackageArtifactId: EVIDENCE_PACKAGE,
  configurationExpansionArtifactId: CONFIG,
  rows: ROWS,
  rowCount: 1,
  requirementCount: 1,
  evidenceCount: 2,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
};

const ARTIFACT = {
  id: "art-compliance-matrix-1",
  projectId: PROJECT,
  stageId: "compliance_matrix_review",
  type: "compliance_matrix",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_compliance_matrix",
  sourceRequirementsBaselineArtifactId: BASELINE,
  sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
  sourceConfigurationExpansionArtifactId: CONFIG,
  createdBy: REQUESTED_BY,
  createdAt: "2026-06-10T12:00:00.000Z",
  rowCount: 1,
  rowIds: ["RFP-COMP-001"],
  requirementIds: ["RFP-REQ-001"],
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
  statusCounts: {
    compliant: 0,
    partially_compliant: 0,
    non_compliant: 0,
    not_applicable: 0,
    needs_review: 1,
  },
};

beforeEach(() => {
  EXECUTOR.mockClear();
  mockDraftRows.mockReset().mockResolvedValue(structuredClone(DRAFTING_OK));
  mockCreateDraft.mockReset().mockResolvedValue({
    status: "ok",
    artifact: structuredClone(ARTIFACT),
    payloadSummary: structuredClone(PAYLOAD_SUMMARY),
  });
});

function run(overrides: Record<string, unknown> = {}) {
  return generateRfpComplianceMatrixDraft({
    tenantId: TENANT,
    projectId: PROJECT,
    requirementsBaselineArtifactId: BASELINE,
    evidencePackageArtifactId: EVIDENCE_PACKAGE,
    configurationExpansionArtifactId: CONFIG,
    requestedBy: `  ${REQUESTED_BY}  `,
    executor: EXECUTOR,
    ...overrides,
  } as never);
}

describe("generateRfpComplianceMatrixDraft", () => {
  it("wraps a drafting block and never calls creation", async () => {
    const drafting = {
      status: "requirements_baseline_not_approved",
      artifact: { id: BASELINE },
    };
    mockDraftRows.mockResolvedValue(drafting);

    expect(await run()).toEqual({
      status: "blocked",
      phase: "compliance_drafting",
      drafting,
    });
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("passes exact authority fields to drafting, then sanitized rows to creation", async () => {
    await run();

    expect(mockDraftRows).toHaveBeenCalledTimes(1);
    expect(mockDraftRows.mock.calls[0][0]).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      requirementsBaselineArtifactId: BASELINE,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      configurationExpansionArtifactId: CONFIG,
      requestedBy: `  ${REQUESTED_BY}  `,
      executor: EXECUTOR,
    });

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft.mock.calls[0][0]).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      createdBy: REQUESTED_BY,
      sourceRequirementsBaselineArtifactId: BASELINE,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
      sourceConfigurationExpansionArtifactId: CONFIG,
      rows: ROWS,
    });
  });

  it("wraps a creation block after successful drafting", async () => {
    const creation = {
      status: "invalid_compliance_matrix_rows",
      errors: ["rows[0].response is required."],
    };
    mockCreateDraft.mockResolvedValue(creation);

    expect(await run()).toEqual({
      status: "blocked",
      phase: "compliance_matrix_creation",
      creation,
    });
  });

  it("returns copied ok summaries without row bodies", async () => {
    const result = await run();

    expect(result).toEqual({
      status: "ok",
      requirementsBaselineArtifactId: BASELINE,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      configurationExpansionArtifactId: CONFIG,
      rowCount: 1,
      requirementCount: 1,
      evidenceCount: 2,
      sourceFileIds: ["file-rfp-1", "file-boq-1"],
      sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
      artifact: ARTIFACT,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect(JSON.stringify(result)).not.toContain("rows");

    if (result.status !== "ok") throw new Error("unreachable");
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.artifact.sourceFileIds.push("hacked-artifact-file");
    result.payloadSummary.rowIds.push("hacked-row");
    result.payloadSummary.statusCounts.needs_review = 99;

    expect(DRAFTING_OK.sourceFileIds).toEqual(["file-rfp-1", "file-boq-1"]);
    expect(ARTIFACT.sourceFileIds).toEqual(["file-rfp-1", "file-boq-1"]);
    expect(PAYLOAD_SUMMARY.rowIds).toEqual(["RFP-COMP-001"]);
    expect(PAYLOAD_SUMMARY.statusCounts.needs_review).toBe(1);
  });

  it("requires configurationExpansionArtifactId before any drafting or creation", async () => {
    for (const bad of [undefined, "", "   ", 123, null, {}]) {
      await expect(run({ configurationExpansionArtifactId: bad })).rejects.toThrow(
        "configurationExpansionArtifactId is required."
      );
    }
    expect(mockDraftRows).not.toHaveBeenCalled();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("trims configurationExpansionArtifactId before forwarding it to drafting", async () => {
    await run({ configurationExpansionArtifactId: `  ${CONFIG}  ` });

    expect(mockDraftRows.mock.calls[0][0].configurationExpansionArtifactId).toBe(
      CONFIG
    );
  });

  it("bubbles service errors", async () => {
    mockDraftRows.mockRejectedValueOnce(new Error("draft failed"));
    await expect(run()).rejects.toThrow("draft failed");

    mockDraftRows.mockResolvedValue(structuredClone(DRAFTING_OK));
    mockCreateDraft.mockRejectedValueOnce(new Error("create failed"));
    await expect(run()).rejects.toThrow("create failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-generation.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-generation.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the drafting contract, draft-create service, and compliance contract types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-compliance-matrix-drafting",
      "@/lib/projects/project-rfp-compliance-matrix-draft",
      "@/lib/projects/project-rfp-compliance-matrix",
    ]);
  });

  it("has no direct DB, route, approval, provider, pricing, SKU, catalog, config decision, export, or raw-file dependency", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/app',
      'from "@/components',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "@anthropic-ai",
      "openai",
      "@google/generative-ai",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/catalog',
      'from "@/lib/catalog',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/export',
      "fetch(",
      "process.env",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "xlsx",
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

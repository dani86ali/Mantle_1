import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import ProjectRfpEvidencePage from "@/app/projects/[id]/rfp/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-rfp-1" }),
}));

const PROJECT_ID = "proj-rfp-1";
const LIST_URL = `/api/projects/${PROJECT_ID}/rfp/evidence`;
const BASELINE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/requirements-baseline`;
const BASELINE_ARTIFACT_ID = "art-rb-1";
const BASELINE_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${BASELINE_ARTIFACT_ID}/requirements-baseline`;
const REVIEW_URL = `${BASELINE_DETAIL_URL}/review`;
const GENERATE_URL = `${BASELINE_LIST_URL}/generate`;
const COMPLIANCE_MATRIX_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/compliance-matrix`;
const COMPLIANCE_MATRIX_ARTIFACT_ID = "art-cm-1";
const COMPLIANCE_MATRIX_DETAIL_URL =
  `/api/projects/${PROJECT_ID}/rfp/artifacts/${COMPLIANCE_MATRIX_ARTIFACT_ID}/compliance-matrix`;
const COMPLIANCE_MATRIX_GENERATE_URL =
  `/api/projects/${PROJECT_ID}/rfp/compliance-matrix/generate`;
const EXTRACTION_DELTA_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/extraction-delta`;
const EXTRACTION_DELTA_ARTIFACT_ID = "art-ed-1";
const EXTRACTION_DELTA_DETAIL_URL = `${EXTRACTION_DELTA_LIST_URL}/${EXTRACTION_DELTA_ARTIFACT_ID}`;
const EVIDENCE_PACKAGE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/evidence-package`;
const EVIDENCE_PACKAGE_ARTIFACT_ID = "art-ep-1";
const EVIDENCE_PACKAGE_APPROVED_ID = "art-ep-approved-1";
const EVIDENCE_PACKAGE_DETAIL_URL = `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_ARTIFACT_ID}`;
const RFP_BOQ_WORKSPACE_URL = `/api/projects/${PROJECT_ID}/rfp/boq`;
const INPUT_PACKAGE_URL = `/api/projects/${PROJECT_ID}/rfp/input-package`;
const INPUT_PACKAGE_ARTIFACT_ID = "art-ip-1";
const CONFIG_EXPANSION_ARTIFACT_ID = "art-config-1";

const TEXT_BODY_CANARY = "TEXT-BODY-CANARY";
const TABLE_CELL_CANARY = "TABLE-CELL-CANARY";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function projectContext(): Record<string, unknown> {
  return {
    id: PROJECT_ID,
    name: "STC Riyadh DC RFP",
    customerName: "STC",
    mode: "rfp",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  };
}

function textListItem(): Record<string, unknown> {
  return {
    id: "ev-text-1",
    projectId: PROJECT_ID,
    sourceFileId: "file-rfp-1",
    kind: "rfp_document_text_chunk",
    extractedAt: "2026-06-03T08:00:00.000Z",
    retainUntil: "2026-12-03T08:00:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_text_chunk",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      sourceFileName: "rfp-main.pdf",
      sourceFileRole: "rfp",
      chunkIndex: 0,
      chunkCount: 4,
      charCount: 1810,
      documentMetrics: {
        textCharCount: 7200,
        nonWhitespaceTextCharCount: 6804,
        tableCount: 2,
        tableRowCount: 18,
      },
    },
  };
}

function tableListItem(): Record<string, unknown> {
  return {
    id: "ev-table-1",
    projectId: PROJECT_ID,
    sourceFileId: "file-rfp-2",
    kind: "rfp_document_table",
    extractedAt: "2026-06-03T08:05:00.000Z",
    retainUntil: "2026-12-03T08:05:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_table",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      sourceFileName: "rfp-scope.xlsx",
      sourceFileRole: "scope_of_work",
      tableId: "tbl-1",
      sheetName: "Scope",
      rowCount: 12,
      columnCount: 5,
    },
  };
}

function listResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    filters: {},
    evidenceCount: 2,
    textChunkCount: 1,
    tableEvidenceCount: 1,
    evidence: [textListItem(), tableListItem()],
  };
}

function textDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    evidence: {
      id: "ev-text-1",
      projectId: PROJECT_ID,
      sourceFileId: "file-rfp-1",
      kind: "rfp_document_text_chunk",
      extractedAt: "2026-06-03T08:00:00.000Z",
      retainUntil: "2026-12-03T08:00:00.000Z",
      content: {
        evidenceKind: "rfp_document_text_chunk",
        inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
        sourceFileId: "file-rfp-1",
        sourceFileName: "rfp-main.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 0,
        chunkCount: 4,
        text: `${TEXT_BODY_CANARY} The supplier shall provide a network design.`,
        charCount: 1810,
      },
    },
  };
}

function tableDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    evidence: {
      id: "ev-table-1",
      projectId: PROJECT_ID,
      sourceFileId: "file-rfp-2",
      kind: "rfp_document_table",
      extractedAt: "2026-06-03T08:05:00.000Z",
      retainUntil: "2026-12-03T08:05:00.000Z",
      content: {
        evidenceKind: "rfp_document_table",
        inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
        sourceFileId: "file-rfp-2",
        sourceFileName: "rfp-scope.xlsx",
        sourceFileRole: "scope_of_work",
        tableId: "tbl-1",
        sheetName: "Scope",
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["Item", "Qty"],
          [TABLE_CELL_CANARY, "4"],
        ],
      },
    },
  };
}

function artifact(
  id: string,
  type: string,
  status: string,
  version: number,
  sourceArtifactIds: string[] = [INPUT_PACKAGE_ARTIFACT_ID]
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    stageId:
      type === "requirements_baseline"
        ? "requirements_baseline_review"
        : type === "compliance_matrix"
          ? "compliance_matrix_review"
          : type === "configuration_expansion"
            ? "configuration_expansion_review"
            : "intake_package_review",
    type,
    status,
    version,
    sourceFileIds: ["file-rfp-1", "file-rfp-2"],
    sourceArtifactIds,
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: "2026-06-04T09:05:00.000Z",
  };
}

function baselineListItem(status = "needs_review"): Record<string, unknown> {
  return {
    ...artifact(BASELINE_ARTIFACT_ID, "requirements_baseline", status, 1, [
      EVIDENCE_PACKAGE_APPROVED_ID,
    ]),
    payloadSummary: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 3,
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
    },
  };
}

function baselineListResponse(status = "needs_review"): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 1, artifacts: [baselineListItem(status)] };
}

function baselineDetailResponse(status = "needs_review"): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: artifact(BASELINE_ARTIFACT_ID, "requirements_baseline", status, 1, [
      EVIDENCE_PACKAGE_APPROVED_ID,
    ]),
    baseline: {
      payloadKind: "rfp_requirements_baseline",
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      createdBy: "user-1",
      createdAt: "2026-06-04T09:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 2,
      requirements: [
        {
          id: "RFP-REQ-001",
          title: "Network design",
          category: "technical",
          priority: "high",
          text: "Supplier shall provide a complete network design.",
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              evidenceKind: "rfp_document_text_chunk",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
              chunkIndex: 0,
              chunkCount: 4,
              charCount: 1810,
            },
          ],
        },
      ],
    },
  };
}

function complianceMatrixListItem(status = "needs_review"): Record<string, unknown> {
  return {
    ...artifact(COMPLIANCE_MATRIX_ARTIFACT_ID, "compliance_matrix", status, 1, [
      BASELINE_ARTIFACT_ID,
      EVIDENCE_PACKAGE_APPROVED_ID,
      CONFIG_EXPANSION_ARTIFACT_ID,
    ]),
    payloadSummary: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      rowCount: 2,
      requirementCount: 2,
      evidenceCount: 3,
      statusCounts: {
        needs_review: 1,
        compliant: 1,
        partially_compliant: 0,
        non_compliant: 0,
        not_applicable: 0,
      },
      requirementIds: ["RFP-REQ-001"],
      sourceFileIds: ["file-rfp-1"],
      sourceArtifactIds: [BASELINE_ARTIFACT_ID, EVIDENCE_PACKAGE_APPROVED_ID],
    },
  };
}

function complianceMatrixListResponse(status = "needs_review"): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [complianceMatrixListItem(status)],
  };
}

function complianceMatrixDetailResponse(status = "needs_review"): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: artifact(COMPLIANCE_MATRIX_ARTIFACT_ID, "compliance_matrix", status, 1),
    matrix: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      rows: [
        {
          id: "CM-001",
          requirementId: "RFP-REQ-001",
          requirementText: "Supplier shall provide a complete network design.",
          category: "technical",
          priority: "high",
          complianceStatus: "needs_review",
          response: "Compliant based on submitted design approach.",
          rationale: "Matches approved evidence.",
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
              evidenceKind: "rfp_document_text_chunk",
              chunkIndex: 0,
              chunkCount: 4,
              charCount: 1810,
            },
          ],
        },
      ],
    },
  };
}

function deltaListItem(status = "needs_review"): Record<string, unknown> {
  return {
    ...artifact(EXTRACTION_DELTA_ARTIFACT_ID, "extraction_delta", status, 1),
    payloadSummary: {
      payloadKind: "rfp_extraction_delta",
      proposalSource: "ai",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      candidateCount: 2,
      pendingCount: 1,
      acceptedCount: 0,
      rejectedCount: 1,
      waivedCount: 0,
      evidenceReferenceCount: 2,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: [INPUT_PACKAGE_ARTIFACT_ID],
    },
  };
}

function deltaListResponse(status = "needs_review"): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 1, artifacts: [deltaListItem(status)] };
}

function deltaDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: artifact(EXTRACTION_DELTA_ARTIFACT_ID, "extraction_delta", "needs_review", 1),
    delta: {
      payloadKind: "rfp_extraction_delta",
      proposalSource: "ai",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      candidateCount: 2,
      pendingCount: 1,
      acceptedCount: 0,
      rejectedCount: 1,
      waivedCount: 0,
      candidates: [
        {
          id: "cand-1",
          kind: "missing_evidence",
          sourceFileId: "file-rfp-1",
          title: "Missing service SLA",
          description: "AI proposes adding an SLA evidence item.",
          severity: "medium",
          confidence: 0.75,
          rationale: "RFP mentions SLA in section 4.",
          reviewStatus: "pending_review",
          evidenceReferences: [],
          proposedEvidence: {
            evidenceKind: "rfp_document_text_chunk",
            sourceFileName: "rfp-main.pdf",
            sourceFileRole: "rfp",
            text: "Service SLA must be provided.",
            chunkIndex: 1,
            chunkCount: 4,
            charCount: 42,
          },
          reviewHistory: [],
        },
        {
          id: "cand-2",
          kind: "presentation_repair",
          sourceFileId: "file-rfp-2",
          title: "Waived table repair",
          description: "Engineer rejected a previous table repair.",
          severity: "low",
          reviewStatus: "rejected",
          evidenceReferences: [],
          reviewHistory: [
            {
              action: "reject",
              decidedBy: "user-1",
              decidedAt: "2026-06-05T10:00:00.000Z",
              previousReviewStatus: "pending_review",
              nextReviewStatus: "rejected",
              note: "Already covered.",
            },
          ],
        },
      ],
    },
  };
}

function evidencePackageListItem(
  id = EVIDENCE_PACKAGE_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    ...artifact(id, "evidence_package", status, version, [INPUT_PACKAGE_ARTIFACT_ID]),
    payloadSummary: {
      payloadKind: "rfp_evidence_package",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: [INPUT_PACKAGE_ARTIFACT_ID],
    },
  };
}

function evidencePackageListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 2,
    artifacts: [
      evidencePackageListItem(EVIDENCE_PACKAGE_ARTIFACT_ID, "needs_review", 2),
      evidencePackageListItem(EVIDENCE_PACKAGE_APPROVED_ID, "approved", 1),
    ],
  };
}

function evidencePackageApprovedOnlyResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [evidencePackageListItem(EVIDENCE_PACKAGE_APPROVED_ID, "approved", 1)],
  };
}

function evidencePackageDetailResponse(
  id = EVIDENCE_PACKAGE_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: artifact(id, "evidence_package", status, id === EVIDENCE_PACKAGE_ARTIFACT_ID ? 2 : 1),
    package: {
      payloadKind: "rfp_evidence_package",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      evidence: [
        {
          evidenceId: "ev-text-1",
          evidenceKind: "rfp_document_text_chunk",
          sourceFileId: "file-rfp-1",
          inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
          sourceFileName: "rfp-main.pdf",
          sourceFileRole: "rfp",
          chunkIndex: 0,
          chunkCount: 4,
          text: "The supplier shall provide a network design.",
          charCount: 1810,
        },
        {
          evidenceId: "ev-table-1",
          evidenceKind: "rfp_document_table",
          sourceFileId: "file-rfp-2",
          inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
          sourceFileName: "rfp-scope.xlsx",
          sourceFileRole: "scope_of_work",
          tableId: "tbl-1",
          sheetName: "Scope",
          rowCount: 2,
          columnCount: 2,
          rows: [
            ["Item", "Qty"],
            [TABLE_CELL_CANARY, "4"],
          ],
        },
      ],
    },
  };
}

function rfpBoqWorkspaceResponse(): Record<string, unknown> {
  return {
    workspace: {
      project: projectContext(),
      stages: [],
      boqFiles: [],
      artifacts: [
        artifact(INPUT_PACKAGE_ARTIFACT_ID, "input_package", "approved", 1, []),
        artifact(CONFIG_EXPANSION_ARTIFACT_ID, "configuration_expansion", "approved", 1, []),
      ],
      spineArtifacts: {
        normalized_boq: null,
        sku_resolution: null,
        configuration_expansion: artifact(
          CONFIG_EXPANSION_ARTIFACT_ID,
          "configuration_expansion",
          "approved",
          1,
          []
        ),
        priced_boq: null,
        export_package: null,
      },
      approvals: [],
      readiness: {
        projectId: PROJECT_ID,
        status: "blocked",
        boqFileCount: 0,
        boqFiles: [],
        canNormalizeBoq: false,
        canCreateSkuResolution: false,
        canCreateConfigurationExpansion: false,
        canCreatePricedBoq: false,
        canCreateExportPackage: false,
        isCustomerDeliverableReady: false,
        messages: ["Upload a BoQ file before pricing."],
        quickBomReadiness: {
          projectId: PROJECT_ID,
          nextStepId: "normalized_boq",
          isCustomerDeliverableReady: false,
          steps: [],
        },
      },
    },
  };
}

function stubFetch(
  handler?: (url: string, init?: RequestInit) => Response | Promise<Response>
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (handler) return handler(url, init);
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === `${LIST_URL}/ev-text-1`) return jsonResponse(textDetailResponse());
      if (url === `${LIST_URL}/ev-table-1`) return jsonResponse(tableDetailResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === COMPLIANCE_MATRIX_DETAIL_URL) return jsonResponse(complianceMatrixDetailResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EXTRACTION_DELTA_DETAIL_URL) return jsonResponse(deltaDetailResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === EVIDENCE_PACKAGE_DETAIL_URL) return jsonResponse(evidencePackageDetailResponse());
      if (url === `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_APPROVED_ID}`) {
        return jsonResponse(evidencePackageDetailResponse(EVIDENCE_PACKAGE_APPROVED_ID, "approved"));
      }
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      if (url === REVIEW_URL) {
        return jsonResponse({ artifactStatus: "approved", artifact: baselineListItem() });
      }
      if (url === GENERATE_URL) return jsonResponse({ artifact: baselineListItem() }, 201);
      if (url === COMPLIANCE_MATRIX_GENERATE_URL) {
        return jsonResponse({ artifact: complianceMatrixListItem(), draftSummary: {} }, 201);
      }
      return jsonResponse({ code: "unexpected_test_url", url }, 500);
    })
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProjectRfpEvidencePage - Stage 4.5 guided workflow", () => {
  it("renders the guided operator workflow with a compiled evidence review and a collapsed source audit", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    expect(await screen.findByText("RFP operator workflow")).toBeInTheDocument();
    expect(screen.getByTestId("project-name")).toHaveTextContent("STC Riyadh DC RFP");
    expect(screen.getByTestId("next-action")).toHaveTextContent("Review evidence package");
    expect(screen.getByTestId("workflow-step-1")).toHaveTextContent("Intake");
    expect(screen.getByTestId("workflow-step-2")).toHaveTextContent("Evidence Review");
    expect(screen.getByTestId("workflow-step-3")).toHaveTextContent("Requirements Baseline");
    expect(screen.getByTestId("workflow-step-4")).toHaveTextContent("Compliance Matrix");

    // Step 2 points at compiled evidence packages, not raw evidence rows.
    expect(screen.getByTestId("compiled-evidence-review")).toBeInTheDocument();
    const audit = await screen.findByTestId("source-evidence-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("persisted authority");
    expect(screen.queryAllByTestId("evidence-row")).toHaveLength(0);
  });

  it("opens the compiled evidence package drawer with grouped findings and raw ids only in the audit", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const prepare = await screen.findByTestId("prepare-evidence-review");
    expect(prepare).toHaveTextContent("Review evidence package");
    await act(async () => {
      fireEvent.click(prepare);
    });

    const drawer = await screen.findByTestId("review-drawer");
    expect(drawer).toHaveTextContent("Compiled evidence package");

    // Primary body is grouped compiled findings, not sequential raw cards.
    const compiled = await screen.findByTestId("ep-compiled-review");
    expect(within(compiled).getAllByTestId("ep-finding").length).toBeGreaterThanOrEqual(2);
    expect(compiled).toHaveTextContent("network design");
    expect(compiled).toHaveTextContent(TABLE_CELL_CANARY);
    expect(compiled).toHaveTextContent("Passage 1 of 4");

    // Raw ids and the word chunk never appear in the primary compiled review.
    expect(compiled).not.toHaveTextContent("ev-text-1");
    expect(compiled).not.toHaveTextContent("tbl-1");
    expect(compiled.textContent ?? "").not.toMatch(/chunk/i);

    // Raw machine data lives only in the collapsed audit/debug disclosure.
    const rawAudit = screen.getByTestId("ep-raw-audit");
    expect(rawAudit.tagName).toBe("DETAILS");
    expect(rawAudit.hasAttribute("open")).toBe(false);
    expect(rawAudit).toHaveTextContent("ev-text-1");
    expect(rawAudit).toHaveTextContent("tbl-1");
  });

  it("auto-generates requirements from the latest approved evidence package without a primary selection", async () => {
    const calls = stubFetch((url) => {
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse(evidencePackageApprovedOnlyResponse());
      }
      if (url === BASELINE_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === GENERATE_URL) return jsonResponse({ artifact: baselineListItem() }, 201);
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByText("Generate requirements baseline");
    expect(screen.queryByTestId("ep-select-art-ep-approved-1")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });

    await waitFor(() => {
      const post = calls.find((call) => call.url === GENERATE_URL && call.init?.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        evidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      });
    });
  });

  it("auto-generates compliance from latest approved requirements, evidence, and optional configuration artifacts", async () => {
    const calls = stubFetch((url) => {
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageApprovedOnlyResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === COMPLIANCE_MATRIX_GENERATE_URL) {
        return jsonResponse({ artifact: complianceMatrixListItem(), draftSummary: {} }, 201);
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByText("Generate compliance matrix");
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-compliance"));
    });

    await waitFor(() => {
      const post = calls.find(
        (call) => call.url === COMPLIANCE_MATRIX_GENERATE_URL && call.init?.method === "POST"
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        requirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
        evidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
        configurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      });
    });
  });

  it("requires an explicit new-version reason before creating another input package draft", async () => {
    let createdInputPackageDraft = false;
    const calls = stubFetch((url, init) => {
      if (url === INPUT_PACKAGE_URL && init?.method === "POST") {
        createdInputPackageDraft = true;
        return jsonResponse(
          {
            artifact: artifact("art-ip-2", "input_package", "needs_review", 2, []),
            payloadSummary: {
              payloadKind: "rfp_input_package",
              fileCount: 2,
              roleCounts: {
                rfp: 1,
                boq: 1,
                scope_of_work: 0,
                compliance: 0,
                addendum: 0,
                other: 0,
              },
              warnings: [],
            },
          },
          201
        );
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) {
        const body = rfpBoqWorkspaceResponse();
        if (createdInputPackageDraft) {
          const workspace = body.workspace as {
            artifacts: Record<string, unknown>[];
          };
          workspace.artifacts = [
            artifact(INPUT_PACKAGE_ARTIFACT_ID, "input_package", "approved", 1, []),
            artifact("art-ip-2", "input_package", "needs_review", 2, []),
            artifact(CONFIG_EXPANSION_ARTIFACT_ID, "configuration_expansion", "approved", 1, []),
          ];
        }
        return jsonResponse(body);
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("open-input-package-new-version");
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-input-package-new-version"));
    });

    expect(screen.getByTestId("input-package-new-version-panel")).toHaveTextContent(
      "Old decisions remain in Review History"
    );
    expect(screen.getByTestId("create-input-package")).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-package-new-version-reason"), {
      target: { value: "Uploaded customer addendum 2." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("create-input-package"));
    });

    await waitFor(() => {
      const post = calls.find(
        (call) => call.url === INPUT_PACKAGE_URL && call.init?.method === "POST"
      );
      expect(post).toBeDefined();
      expect(post?.init?.body).toBeUndefined();
      expect(screen.getByTestId("input-package-review-note")).toHaveValue(
        "Uploaded customer addendum 2."
      );
    });
  });

  it("prepares evidence by persisting deterministic evidence, tolerating unavailable AI refinement, and creating one package", async () => {
    const calls = stubFetch((url) => {
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === EXTRACTION_DELTA_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/evidence`)) {
        return jsonResponse({ evidenceCount: 2 }, 201);
      }
      if (url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/extraction-delta/generate`)) {
        return jsonResponse({ code: "rfp_extraction_delta_candidate_drafting_unavailable" }, 503);
      }
      if (url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/evidence-package`)) {
        return jsonResponse({ artifact: evidencePackageListItem() }, 201);
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByText("Prepare Evidence Review");
    await act(async () => {
      fireEvent.click(screen.getByTestId("prepare-evidence-review"));
    });

    expect(await screen.findByTestId("prepare-evidence-message")).toHaveTextContent(
      "deterministic evidence only"
    );
    expect(calls.some((call) => call.url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/evidence`))).toBe(true);
    expect(calls.some((call) => call.url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/extraction-delta/generate`))).toBe(true);
    expect(calls.some((call) => call.url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/evidence-package`))).toBe(true);
  });

  it("opens requirements review in the drawer and posts only the human decision plus note", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });

    expect(await screen.findByTestId("review-drawer")).toHaveTextContent("Requirements baseline");
    fireEvent.change(screen.getByTestId("baseline-review-note"), {
      target: { value: "Approved for compliance drafting." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-approve"));
    });

    await waitFor(() => {
      const post = calls.find((call) => call.url === REVIEW_URL && call.init?.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        decision: "approved",
        note: "Approved for compliance drafting.",
      });
      expect(String(post?.init?.body)).not.toContain("artifactId");
      expect(String(post?.init?.body)).not.toContain("decidedBy");
    });
  });

  it("keeps rejected or edited extraction decisions in collapsed review history", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    await screen.findByText("Extraction refinement");
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Review" })[1]);
    });

    expect(await screen.findByTestId("delta-pending-list")).toHaveTextContent("Missing service SLA");
    const history = await screen.findByTestId("delta-decided");
    expect(history.tagName).toBe("DETAILS");
    expect(history).toHaveTextContent("Review history (1)");
    expect(history.hasAttribute("open")).toBe(false);
  });
});

describe("ProjectRfpEvidencePage static guards", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-rfp-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("keeps the page and test ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });

  it("does not import DB, stores, provider SDKs, pricing engines, catalog authority, or server services into the client page", () => {
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    const forbidden = [
      "@/lib/db/",
      "@anthropic-ai/sdk",
      "openai",
      "catalog",
      "pricing-engine",
      "project-rfp-evidence-run",
      "project-rfp-input-package",
      "project-rfp-compliance-matrix-generation",
      "project-rfp-requirements-baseline-generation",
      "project-rfp-hld",
      "technical_proposal",
    ];
    for (const token of forbidden) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("uses existing RFP API routes and keeps generation anchored to approved artifact ids, not raw evidence ids", () => {
    expect(source).toContain("/rfp/files");
    expect(source).toContain("/rfp/input-package");
    expect(source).toContain("/rfp/evidence-package");
    expect(source).toContain("/rfp/requirements-baseline/generate");
    expect(source).toContain("/rfp/compliance-matrix/generate");
    expect(source).toContain("evidencePackageArtifactId");
    expect(source).toContain("requirementsBaselineArtifactId");
    expect(source).not.toContain("evidenceIds");
    expect(source).not.toContain("rawPdf");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import ProjectRfpEvidencePage from "@/app/projects/[id]/rfp/page";
import {
  compileCompiledEvidenceReview,
  type CompiledEvidenceDeterministicInput,
} from "@/lib/projects/project-rfp-compiled-evidence-review";

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
const NO_BOQ_EXCEPTION_ARTIFACT_ID = "art-noboq-1";

const TEXT_BODY_CANARY = "TEXT-BODY-CANARY";
const TABLE_CELL_CANARY = "TABLE-CELL-CANARY";
// A sentinel only present if the page renders the RETURNED compiledReview and
// not a fresh recompile of package.evidence (which carries no refinement).
const COMPILED_SUMMARY_CANARY = "COMPILED-SUMMARY-CANARY";

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

// A compliance matrix detail whose single pending row carries Stage 5 engineer
// review metadata: a section reference (also surfaced as a primary line) plus
// lanes, downstream impacts, owner-review flag, row review status, and review
// history that must stay inside the collapsed cm-detail-audit only.
function complianceMatrixStage5DetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: artifact(COMPLIANCE_MATRIX_ARTIFACT_ID, "compliance_matrix", "needs_review", 1),
    matrix: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      reviewedBy: "user-9",
      reviewedAt: "2026-06-11T09:00:00.000Z",
      rows: [
        {
          id: "CM-010",
          requirementId: "RFP-REQ-010",
          requirementText: "Supplier shall meet the security control baseline.",
          category: "technical",
          priority: "high",
          complianceStatus: "needs_review",
          response: "Compliant with the stated control set.",
          rationale: "Backed by the approved design evidence.",
          notes: "Pending sign-off.",
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
          sectionReference: "SEC-REF-3.2.1",
          responseLane: "commercial",
          ownerLane: "legal",
          hldImpact: "required",
          tpImpact: "potential",
          boqConfigImpact: "owner_review_required",
          requiresOwnerReview: true,
          rowReviewStatus: "pending",
          reviewHistory: [
            {
              action: "owner_review_requested",
              at: "2026-06-11T08:30:00.000Z",
              by: "owner-7",
              note: "OWNER-HISTORY-NOTE-CANARY",
            },
          ],
        },
      ],
    },
  };
}

// A compliance matrix detail whose single row was removed by the engineer. Its
// non-needs_review status lands it in the collapsed review-history section, where
// it stays inspectable; its removed/not-applicable reasons and review history
// live only in the collapsed cm-detail-audit.
function complianceMatrixRemovedRowDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: artifact(COMPLIANCE_MATRIX_ARTIFACT_ID, "compliance_matrix", "needs_review", 1),
    matrix: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      rows: [
        {
          id: "CM-020",
          requirementId: "RFP-REQ-020",
          requirementText: "Supplier shall provide an on-site spare parts depot.",
          category: "commercial",
          priority: "low",
          complianceStatus: "not_applicable",
          response: "Removed from scope by the engineer.",
          sectionReference: "SEC-REF-9.9",
          rowReviewStatus: "removed",
          notApplicableReason: "NA-REASON-CANARY out of contract scope",
          removedReason: "REMOVED-REASON-CANARY duplicate row",
          reviewHistory: [
            {
              action: "marked_not_applicable",
              at: "2026-06-12T09:00:00.000Z",
              by: "user-3",
              note: "Out of scope.",
            },
            {
              action: "removed",
              at: "2026-06-12T09:05:00.000Z",
              by: "user-3",
              note: "REMOVED-HISTORY-NOTE-CANARY",
            },
          ],
          evidenceReferences: [],
        },
      ],
    },
  };
}

// A compact mixed compliance matrix: five active rows covering every compliance
// status (one each) across distinct categories, sections, and cited-source
// shapes, plus one removed commercial row. Used to exercise the operator-panel
// progress counts, status filters, search, and group-by surfaces in one fixture.
function complianceMatrixMixedDetailResponse(): Record<string, unknown> {
  const textRef = (evidenceId: string) => ({
    evidenceId,
    sourceFileId: "file-rfp-1",
    inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
    evidenceKind: "rfp_document_text_chunk",
    chunkIndex: 0,
    chunkCount: 4,
    charCount: 1810,
  });
  return {
    project: projectContext(),
    artifact: artifact(COMPLIANCE_MATRIX_ARTIFACT_ID, "compliance_matrix", "needs_review", 1),
    matrix: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      rows: [
        {
          id: "CM-101",
          requirementId: "RFP-REQ-101",
          requirementText: "Supplier shall provide redundant core switching.",
          category: "technical",
          priority: "high",
          complianceStatus: "needs_review",
          response: "Pending engineer review.",
          sectionReference: "SEC-1.1",
          evidenceReferences: [textRef("ev-text-1")],
        },
        {
          id: "CM-102",
          requirementId: "RFP-REQ-102",
          requirementText: "Supplier shall comply with data residency rules.",
          category: "legal/regulatory",
          priority: "high",
          complianceStatus: "compliant",
          response: "Fully compliant.",
          sectionReference: "SEC-2.1",
          evidenceReferences: [],
        },
        {
          id: "CM-103",
          requirementId: "RFP-REQ-103",
          requirementText: "Supplier shall provide fire suppression in the hall.",
          category: "safety",
          priority: "medium",
          complianceStatus: "partially_compliant",
          response: "Partial coverage today.",
          sectionReference: "SEC-3.1",
          evidenceReferences: [textRef("ev-text-2")],
        },
        {
          id: "CM-104",
          requirementId: "RFP-REQ-104",
          requirementText: "Supplier shall offer a fixed five-year price.",
          category: "commercial",
          priority: "medium",
          complianceStatus: "non_compliant",
          response: "Cannot fix beyond three years.",
          sectionReference: "SEC-4.1",
          evidenceReferences: [],
        },
        {
          id: "CM-105",
          requirementId: "RFP-REQ-105",
          requirementText: "Supplier shall meet the local content quota.",
          category: "local-content",
          priority: "low",
          complianceStatus: "not_applicable",
          response: "Outside the contracted scope.",
          sectionReference: "SEC-5.1",
          evidenceReferences: [textRef("ev-text-3")],
        },
        {
          id: "CM-106",
          requirementId: "RFP-REQ-106",
          requirementText: "Supplier shall provide an on-site spare depot.",
          category: "commercial",
          priority: "low",
          complianceStatus: "not_applicable",
          response: "Removed from scope by the engineer.",
          sectionReference: "SEC-6.1",
          rowReviewStatus: "removed",
          removedReason: "Duplicate requirement.",
          evidenceReferences: [],
        },
      ],
    },
  };
}

// A high-row-count compliance matrix (120 rows) for smoke-testing that the
// compact Stage 5 operator surface stays usable at scale: one compact table (not
// a 120 row-card wall), working status filters / search / group-by, human source
// labels, and raw ids confined to the selected detail/audit. Active rows cycle
// through a spread of categories and every compliance status; every third row
// cites a human source; rows 40/80/120 are removed with a removed reason.
function complianceMatrixHighRowCountDetailResponse(): Record<string, unknown> {
  const categories = [
    "technical",
    "legal/regulatory",
    "safety",
    "commercial",
    "local-content",
    "training",
    "schedule",
  ];
  const statuses = [
    "needs_review",
    "compliant",
    "partially_compliant",
    "non_compliant",
    "not_applicable",
  ];
  const textRef = (evidenceId: string) => ({
    evidenceId,
    sourceFileId: "file-rfp-1",
    inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
    evidenceKind: "rfp_document_text_chunk",
    chunkIndex: 0,
    chunkCount: 4,
    charCount: 1810,
  });
  const removedIndexes = new Set([40, 80, 120]);
  const rows = Array.from({ length: 120 }, (_, i) => {
    const n = i + 1;
    const padded = String(n).padStart(3, "0");
    const cited = n % 3 === 0;
    const base: Record<string, unknown> = {
      id: `CM-${padded}`,
      requirementId: `RFP-REQ-${padded}`,
      requirementText: `Supplier shall satisfy operator requirement marker ${n}.`,
      category: categories[i % categories.length],
      priority: n % 3 === 0 ? "high" : n % 3 === 1 ? "medium" : "low",
      sectionReference: `SEC-${n}`,
      evidenceReferences: cited ? [textRef("ev-text-1")] : [],
    };
    if (removedIndexes.has(n)) {
      return {
        ...base,
        complianceStatus: "not_applicable",
        response: "Removed from scope by the engineer.",
        rowReviewStatus: "removed",
        removedReason: `Removed duplicate row ${n}.`,
        evidenceReferences: [],
      };
    }
    return {
      ...base,
      complianceStatus: statuses[i % statuses.length],
      response: `Operator response for requirement ${n}.`,
    };
  });
  return {
    project: projectContext(),
    artifact: artifact(COMPLIANCE_MATRIX_ARTIFACT_ID, "compliance_matrix", "needs_review", 1),
    matrix: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
      rows,
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

function evidencePackageDetailEvidence(): CompiledEvidenceDeterministicInput[] {
  return [
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
  ];
}

function evidencePackageDetailResponse(
  id = EVIDENCE_PACKAGE_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  const evidence = evidencePackageDetailEvidence();
  // The inspection read model returns compiledReview; here it carries a caller
  // refinement (clean summary + low-confidence flag) the raw evidence lacks, so
  // a test can prove the page renders the RETURNED review, not a recompile.
  const compiledReview = compileCompiledEvidenceReview({
    deterministicEvidence: evidence,
    refinement: {
      evidenceRefinements: [
        {
          evidenceId: "ev-text-1",
          cleanSummary: COMPILED_SUMMARY_CANARY,
          lowConfidence: true,
        },
      ],
    },
  });
  return {
    project: projectContext(),
    artifact: artifact(id, "evidence_package", status, id === EVIDENCE_PACKAGE_ARTIFACT_ID ? 2 : 1),
    package: {
      payloadKind: "rfp_evidence_package",
      inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      evidence,
      compiledReview,
    },
  };
}

function rfpBoqWorkspaceResponse(): Record<string, unknown> {
  return {
    workspace: {
      project: projectContext(),
      stages: [],
      boqFiles: [],
      uploadedFiles: [],
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
        configurationGate: {
          required: true,
          satisfied: true,
          waived: false,
          status: "configuration_expansion_approved",
          message: "Configuration expansion approved.",
          approvedConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT_ID,
        },
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

// A BoQ workspace whose readiness carries an explicit configuration gate (the
// no-BoQ/configuration-expansion gate under test) and no configuration spine
// artifact, so the gate alone drives compliance readiness.
function workspaceWithConfigurationGate(
  gate: Record<string, unknown>,
  options: { nextStepId?: string | null } = {}
): Record<string, unknown> {
  return {
    workspace: {
      project: projectContext(),
      stages: [],
      boqFiles: [],
      uploadedFiles: [],
      artifacts: [artifact(INPUT_PACKAGE_ARTIFACT_ID, "input_package", "approved", 1, [])],
      spineArtifacts: {
        normalized_boq: null,
        sku_resolution: null,
        configuration_expansion: null,
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
        messages: [],
        configurationGate: gate,
        quickBomReadiness: {
          projectId: PROJECT_ID,
          nextStepId: options.nextStepId ?? null,
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

// Shared fetch handler for the Stage 5 compliance-drawer tests: the mount
// endpoints plus a generate that yields the existing matrix id, with the supplied
// detail returned for the compliance-matrix detail URL. The approved evidence
// package detail carries no package payload, so evidence reference labels degrade
// harmlessly (the Stage 5 assertions do not depend on them).
function stage5ComplianceFetch(
  detail: Record<string, unknown>
): (url: string) => Response {
  return (url: string) => {
    if (url === LIST_URL) return jsonResponse(listResponse());
    if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
    if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
    if (url === COMPLIANCE_MATRIX_DETAIL_URL) return jsonResponse(detail);
    if (url === COMPLIANCE_MATRIX_GENERATE_URL) {
      return jsonResponse({ artifact: complianceMatrixListItem(), draftSummary: {} }, 201);
    }
    if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
    if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
    if (url === `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_APPROVED_ID}`) {
      return jsonResponse({ project: projectContext() }, 200);
    }
    if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
    return jsonResponse({}, 200);
  };
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
    // The table finding keeps its human source citation labels in the primary.
    expect(compiled).toHaveTextContent("Table 1");
    expect(compiled).toHaveTextContent("Sheet: Scope");
    // The generic extraction-position passage citation ("Passage 1 of 4") reads
    // as a raw chunk position, so it is dropped from the primary compiled review.
    expect(compiled).not.toHaveTextContent("Passage 1 of 4");
    expect(compiled).not.toHaveTextContent("Text passage 1 of 4");

    // The drawer renders the RETURNED compiled review (clean summary + flag),
    // proving it does not recompile from package.evidence (which has neither).
    expect(within(compiled).getByTestId("ep-finding-summary")).toHaveTextContent(
      COMPILED_SUMMARY_CANARY
    );
    expect(
      within(compiled).getByTestId("ep-finding-flag-low-confidence")
    ).toBeInTheDocument();

    // Raw ids and the word chunk never appear in the primary compiled review.
    expect(compiled).not.toHaveTextContent("ev-text-1");
    expect(compiled).not.toHaveTextContent("tbl-1");
    expect(compiled.textContent ?? "").not.toMatch(/chunk/i);

    // Raw machine data - ids and chunk positions - lives only in the collapsed
    // audit/debug disclosure, never the primary compiled review.
    const rawAudit = screen.getByTestId("ep-raw-audit");
    expect(rawAudit.tagName).toBe("DETAILS");
    expect(rawAudit.hasAttribute("open")).toBe(false);
    expect(rawAudit).toHaveTextContent("ev-text-1");
    expect(rawAudit).toHaveTextContent("tbl-1");
    expect(rawAudit.textContent ?? "").toMatch(/chunk/i);
  });

  it("describes step 2 with source-record language, not raw chunks", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const step2 = await screen.findByTestId("workflow-step-2");
    expect(step2).not.toHaveTextContent("Raw chunks");
    expect(step2).toHaveTextContent("audit trail");
  });

  it("groups the compiled evidence review into labeled sections and keeps raw ids out of the grouped primary", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const prepare = await screen.findByTestId("prepare-evidence-review");
    await act(async () => {
      fireEvent.click(prepare);
    });

    const compiled = await screen.findByTestId("ep-compiled-review");
    const sections = within(compiled).getAllByTestId("ep-review-section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(within(compiled).getAllByTestId("ep-review-section-label")).toHaveLength(
      sections.length
    );
    // Sections are labeled with human document names, not machine ids.
    expect(compiled).toHaveTextContent("rfp-main.pdf");

    // The grouped primary still excludes raw ids and the word chunk.
    expect(compiled).not.toHaveTextContent("ev-text-1");
    expect(compiled).not.toHaveTextContent("tbl-1");
    expect(compiled.textContent ?? "").not.toMatch(/chunk/i);
  });

  it("shows compiled requirement evidence labels from the approved package and keeps raw ids in the collapsed audit", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("baseline-card-review");
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-card-review"));
    });
    await screen.findByTestId("review-drawer");

    await screen.findByTestId("baseline-detail-reference");
    // Opening the requirements drawer loads the latest approved evidence
    // package's compiled review for reference labels (without switching to the
    // evidence-package drawer), so the primary reference now reads as the
    // compiled finding - document, human role, and the compiled clean summary -
    // proving it came from the returned compiledReview, not a raw locator.
    await waitFor(() => {
      expect(screen.getByTestId("baseline-detail-reference")).toHaveTextContent(
        COMPILED_SUMMARY_CANARY
      );
    });
    const reference = screen.getByTestId("baseline-detail-reference");
    expect(reference).toHaveTextContent("rfp-main.pdf");
    expect(reference).toHaveTextContent("Main RFP");
    // Neither generic extraction-position passage locator may return as a
    // primary requirement reference; only the human source labels survive.
    expect(reference).not.toHaveTextContent("Text passage 1 of 4");
    expect(reference).not.toHaveTextContent("Passage 1 of 4");

    const card = screen.getByTestId("baseline-detail-requirement");
    const primary = card.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="baseline-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toMatch(/chunk/i);
    expect(primaryText).not.toContain("Text passage 1 of 4");
    expect(primaryText).not.toContain("Passage 1 of 4");
    expect(primaryText).not.toContain("ev-text-1");
    expect(primaryText).not.toContain("file-rfp-1");
    expect(primaryText).not.toContain(INPUT_PACKAGE_ARTIFACT_ID);

    const audit = within(card).getByTestId("baseline-detail-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(audit.textContent ?? "").toMatch(/chunk/i);
  });

  it("renders compiled compliance evidence labels from the approved package and confines raw ids to the row audit", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");

    await screen.findByTestId("cm-detail-row");
    // Opening the compliance drawer loads the latest approved evidence package's
    // compiled review for reference labels (without switching to the
    // evidence-package drawer), so the primary reference reads as the compiled
    // finding's clean summary - proving it came from the returned compiledReview.
    await waitFor(() => {
      expect(
        screen.getByTestId("cm-detail-evidence-reference")
      ).toHaveTextContent(COMPILED_SUMMARY_CANARY);
    });
    const row = screen.getByTestId("cm-detail-row");
    const primary = row.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="cm-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).toContain(
      "Supplier shall provide a complete network design."
    );
    // The primary evidence reference is the compiled finding label: document,
    // human role, and the compiled clean summary.
    expect(primaryText).toContain("rfp-main.pdf");
    expect(primaryText).toContain("Main RFP");
    expect(primaryText).toContain(COMPILED_SUMMARY_CANARY);
    // Neither generic extraction-position passage locator may return as a
    // primary compliance reference; only the human source labels survive.
    expect(primaryText).not.toContain("Text passage 1 of 4");
    expect(primaryText).not.toContain("Passage 1 of 4");
    expect(primaryText).not.toContain("CM-001");
    expect(primaryText).not.toContain("RFP-REQ-001");
    expect(primaryText).not.toContain("ev-text-1");
    expect(primaryText).not.toContain("file-rfp-1");
    expect(primaryText).not.toContain(INPUT_PACKAGE_ARTIFACT_ID);
    expect(primaryText).not.toMatch(/chunk/i);

    const audit = within(row).getByTestId("cm-detail-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("CM-001");
    expect(audit).toHaveTextContent("RFP-REQ-001");
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(audit.textContent ?? "").toMatch(/chunk/i);
  });

  it("keeps human source citation labels (table/sheet) on a downstream requirement reference", async () => {
    // A requirement whose evidence is a table: its compiled finding carries
    // rich human citation labels (Table N, Sheet: ...). Those must survive in
    // the primary reference even though generic passage locators are dropped.
    const tableBaselineDetail = {
      project: projectContext(),
      artifact: artifact(BASELINE_ARTIFACT_ID, "requirements_baseline", "needs_review", 1, [
        EVIDENCE_PACKAGE_APPROVED_ID,
      ]),
      baseline: {
        payloadKind: "rfp_requirements_baseline",
        sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
        createdBy: "user-1",
        createdAt: "2026-06-04T09:00:00.000Z",
        requirementCount: 1,
        evidenceCount: 1,
        requirements: [
          {
            id: "RFP-REQ-009",
            title: "Scope table",
            category: "technical",
            priority: "high",
            text: "Supplier shall deliver the scope-of-work line items.",
            evidenceReferences: [
              {
                evidenceId: "ev-table-1",
                evidenceKind: "rfp_document_table",
                sourceFileId: "file-rfp-2",
                inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT_ID,
                tableId: "tbl-1",
                sheetName: "Scope",
                rowCount: 12,
                columnCount: 5,
              },
            ],
          },
        ],
      },
    };
    stubFetch((url) => {
      if (url === BASELINE_DETAIL_URL) return jsonResponse(tableBaselineDetail);
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_APPROVED_ID}`) {
        return jsonResponse(evidencePackageDetailResponse(EVIDENCE_PACKAGE_APPROVED_ID, "approved"));
      }
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("baseline-card-review");
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-card-review"));
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("baseline-detail-reference");

    // The compiled table finding's rich human citation labels survive.
    await waitFor(() => {
      expect(screen.getByTestId("baseline-detail-reference")).toHaveTextContent("Table 1");
    });
    const reference = screen.getByTestId("baseline-detail-reference");
    expect(reference).toHaveTextContent("Sheet: Scope");
    expect(reference).toHaveTextContent("rfp-scope.xlsx");
    // The generic extraction-position passage locator stays out of the primary.
    expect(reference).not.toHaveTextContent("Passage 1 of 4");
  });

  it("degrades a requirement reference to a human evidence label, never a raw text passage, before a compiled label loads", async () => {
    // No approved evidence package compiled review is available (the approved
    // package detail returns no package), so the primary requirement reference
    // cannot use a compiled finding label. It must still degrade to a human
    // "Evidence reference" descriptor - never the raw extraction-position "Text
    // passage N of M" - while the collapsed audit keeps the raw ids and chunk
    // locator.
    stubFetch((url) => {
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      // No package payload -> no compiled review loads -> references stay on the
      // document-locator fallback.
      if (url === `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_APPROVED_ID}`) {
        return jsonResponse({ project: projectContext() }, 200);
      }
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("baseline-card-review");
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-card-review"));
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("baseline-detail-reference");

    // The degraded primary reference is the human document-prefixed evidence
    // descriptor, never a raw extraction-position passage.
    await waitFor(() => {
      expect(screen.getByTestId("baseline-detail-reference")).toHaveTextContent(
        "rfp-main.pdf (Main RFP) - Evidence reference"
      );
    });
    const reference = screen.getByTestId("baseline-detail-reference");
    expect(reference).not.toHaveTextContent("Text passage 1 of 4");
    expect(reference).not.toHaveTextContent("Passage 1 of 4");
    // The compiled clean summary never loaded, so it cannot appear here.
    expect(reference).not.toHaveTextContent(COMPILED_SUMMARY_CANARY);

    const card = screen.getByTestId("baseline-detail-requirement");
    const primary = card.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="baseline-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toMatch(/chunk/i);
    expect(primaryText).not.toContain("Text passage 1 of 4");
    expect(primaryText).not.toContain("Passage 1 of 4");
    expect(primaryText).not.toContain("ev-text-1");
    expect(primaryText).not.toContain("file-rfp-1");

    // Even on the fallback, raw ids and the chunk locator stay in the audit.
    const audit = within(card).getByTestId("baseline-detail-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(audit.textContent ?? "").toMatch(/chunk/i);
  });

  it("degrades a compliance reference to a human evidence label, never a raw text passage, before a compiled label loads", async () => {
    // Same degraded case on the compliance render path: no compiled review is
    // available, so the primary compliance reference must read as a human
    // "Evidence reference" descriptor, never "Text passage N of M", while the
    // row audit keeps the raw ids and chunk locator.
    stubFetch((url) => {
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === COMPLIANCE_MATRIX_DETAIL_URL) return jsonResponse(complianceMatrixDetailResponse());
      if (url === COMPLIANCE_MATRIX_GENERATE_URL) {
        return jsonResponse({ artifact: complianceMatrixListItem(), draftSummary: {} }, 201);
      }
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_APPROVED_ID}`) {
        return jsonResponse({ project: projectContext() }, 200);
      }
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("cm-detail-evidence-reference");

    await waitFor(() => {
      expect(
        screen.getByTestId("cm-detail-evidence-reference")
      ).toHaveTextContent("rfp-main.pdf (Main RFP) - Evidence reference");
    });
    const row = screen.getByTestId("cm-detail-row");
    const primary = row.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="cm-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain("Text passage 1 of 4");
    expect(primaryText).not.toContain("Passage 1 of 4");
    expect(primaryText).not.toContain(COMPILED_SUMMARY_CANARY);
    expect(primaryText).not.toContain("ev-text-1");
    expect(primaryText).not.toContain("file-rfp-1");
    expect(primaryText).not.toMatch(/chunk/i);

    const audit = within(row).getByTestId("cm-detail-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(audit.textContent ?? "").toMatch(/chunk/i);
  });

  it("renders the Stage 5 section reference in the primary compliance row and confines lanes, impacts, status, and history to the collapsed audit", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixStage5DetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("cm-detail-row");

    // The section reference leads the primary row display.
    expect(screen.getByTestId("cm-detail-section-reference")).toHaveTextContent(
      "SEC-REF-3.2.1"
    );

    const row = screen.getByTestId("cm-detail-row");
    const primary = row.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="cm-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).toContain("SEC-REF-3.2.1");
    // Lanes, impacts, owner-review flag, row status, and history never appear in
    // the primary row - they belong to the collapsed audit only.
    expect(primaryText).not.toContain("Response lane");
    expect(primaryText).not.toContain("Owner lane");
    expect(primaryText).not.toContain("HLD impact");
    expect(primaryText).not.toContain("TP impact");
    expect(primaryText).not.toContain("BoQ/config impact");
    expect(primaryText).not.toContain("Requires owner review");
    expect(primaryText).not.toContain("Row review status");
    expect(primaryText).not.toContain("OWNER-HISTORY-NOTE-CANARY");
    expect(primaryText).not.toContain("owner_review_requested");

    const audit = within(row).getByTestId("cm-detail-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("Section reference: SEC-REF-3.2.1");
    expect(audit).toHaveTextContent("Response lane: commercial");
    expect(audit).toHaveTextContent("Owner lane: legal");
    expect(audit).toHaveTextContent("HLD impact: required");
    expect(audit).toHaveTextContent("TP impact: potential");
    expect(audit).toHaveTextContent("BoQ/config impact: owner_review_required");
    expect(audit).toHaveTextContent("Requires owner review: yes");
    expect(audit).toHaveTextContent("Row review status: pending");
    const historyEntry = within(audit).getByTestId(
      "cm-detail-review-history-entry"
    );
    expect(historyEntry).toHaveTextContent("owner_review_requested");
    expect(historyEntry).toHaveTextContent("owner-7");
    expect(historyEntry).toHaveTextContent("OWNER-HISTORY-NOTE-CANARY");
  });

  it("keeps raw row, requirement, evidence, file, package, and chunk identifiers out of the primary compliance row and inside the audit", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixStage5DetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("cm-detail-row");

    const row = screen.getByTestId("cm-detail-row");
    const primary = row.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="cm-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain("CM-010");
    expect(primaryText).not.toContain("RFP-REQ-010");
    expect(primaryText).not.toContain("ev-text-1");
    expect(primaryText).not.toContain("file-rfp-1");
    expect(primaryText).not.toContain(INPUT_PACKAGE_ARTIFACT_ID);
    expect(primaryText).not.toMatch(/chunk/i);

    const audit = within(row).getByTestId("cm-detail-audit");
    expect(audit).toHaveTextContent("CM-010");
    expect(audit).toHaveTextContent("RFP-REQ-010");
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(audit.textContent ?? "").toMatch(/chunk/i);
  });

  it("keeps a removed compliance row inspectable in the drawer history with its removed reason and review history in the collapsed audit", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixRemovedRowDetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");

    // The removed (not-applicable) row is not pending; it stays inspectable in
    // the collapsed review-history section of the drawer.
    const decided = await screen.findByTestId("cm-decided-rows");
    const row = within(decided).getByTestId("cm-detail-row");

    const audit = within(row).getByTestId("cm-detail-audit");
    expect(audit).toHaveTextContent("Row review status: removed");
    expect(audit).toHaveTextContent(
      "Removed reason: REMOVED-REASON-CANARY duplicate row"
    );
    expect(audit).toHaveTextContent(
      "Not applicable reason: NA-REASON-CANARY out of contract scope"
    );
    const historyEntries = within(audit).getAllByTestId(
      "cm-detail-review-history-entry"
    );
    expect(historyEntries).toHaveLength(2);
    expect(historyEntries[0]).toHaveTextContent("marked_not_applicable");
    expect(historyEntries[1]).toHaveTextContent("removed");
    expect(historyEntries[1]).toHaveTextContent("REMOVED-HISTORY-NOTE-CANARY");

    // The removed reason and history stay out of the primary row display, which
    // still leads with the readable section reference.
    const primary = row.cloneNode(true) as HTMLElement;
    primary
      .querySelectorAll('[data-testid="cm-detail-audit"]')
      .forEach((node) => node.remove());
    const primaryText = primary.textContent ?? "";
    expect(primaryText).toContain("SEC-REF-9.9");
    expect(primaryText).not.toContain("Removed reason");
    expect(primaryText).not.toContain("REMOVED-REASON-CANARY");
    expect(primaryText).not.toContain("REMOVED-HISTORY-NOTE-CANARY");
  });

  it("renders the compact operator matrix surface with counts, controls, compact rows, and selected-row detail", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixStage5DetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("cm-operator-panel");

    expect(screen.getByTestId("cm-progress-counts")).toBeInTheDocument();
    expect(screen.getByTestId("cm-status-filter")).toBeInTheDocument();
    expect(screen.getByTestId("cm-search")).toBeInTheDocument();
    expect(screen.getByTestId("cm-group-by")).toBeInTheDocument();
    expect(screen.getByTestId("cm-operator-table")).toBeInTheDocument();
    expect(screen.getByTestId("cm-selected-row-panel")).toBeInTheDocument();

    const rows = screen.getAllByTestId("cm-operator-row");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The compact row primary text never leaks raw ids.
    const rowText = rows.map((row) => row.textContent ?? "").join(" ");
    expect(rowText).not.toContain("CM-010");
    expect(rowText).not.toContain("RFP-REQ-010");
    expect(rowText).not.toContain("ev-text-1");
    expect(rowText).not.toContain("file-rfp-1");
    expect(rowText).not.toContain(INPUT_PACKAGE_ARTIFACT_ID);

    // The selected-row detail keeps those ids inside its collapsed audit.
    const detailRow = within(
      screen.getByTestId("cm-selected-row-panel")
    ).getByTestId("cm-detail-row");
    const audit = within(detailRow).getByTestId("cm-detail-audit");
    expect(audit).toHaveTextContent("CM-010");
    expect(audit).toHaveTextContent("RFP-REQ-010");
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
  });

  it("surfaces a removed row in the compact table only under the removed filter and keeps its audit history in the selected detail", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixRemovedRowDetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-operator-panel");

    // The default active filter hides the removed row from the compact table.
    expect(screen.queryAllByTestId("cm-operator-row")).toHaveLength(0);

    fireEvent.change(screen.getByTestId("cm-status-filter"), {
      target: { value: "removed" },
    });

    const rows = screen.getAllByTestId("cm-operator-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("SEC-REF-9.9");

    fireEvent.click(rows[0]);

    const detailRow = within(
      screen.getByTestId("cm-selected-row-panel")
    ).getByTestId("cm-detail-row");
    const audit = within(detailRow).getByTestId("cm-detail-audit");
    expect(audit).toHaveTextContent("Row review status: removed");
    expect(audit).toHaveTextContent(
      "Removed reason: REMOVED-REASON-CANARY duplicate row"
    );
    expect(audit).toHaveTextContent("REMOVED-HISTORY-NOTE-CANARY");
  });

  async function mountMixedOperatorPanel(): Promise<void> {
    stubFetch(stage5ComplianceFetch(complianceMatrixMixedDetailResponse()));
    render(<ProjectRfpEvidencePage />);
    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-operator-panel");
  }

  it("summarizes the mixed matrix progress counts across every compliance status and removed rows", async () => {
    await mountMixedOperatorPanel();

    const counts = screen.getByTestId("cm-progress-counts");
    expect(counts).toHaveTextContent("Total 6");
    expect(counts).toHaveTextContent("Active 5");
    expect(counts).toHaveTextContent("Needs review 1");
    expect(counts).toHaveTextContent("Compliant 1");
    expect(counts).toHaveTextContent("Partial 1");
    expect(counts).toHaveTextContent("Non-compliant 1");
    expect(counts).toHaveTextContent("Not applicable 1");
    expect(counts).toHaveTextContent("Removed 1");
  });

  it("narrows the compact operator rows to each status filter for the mixed matrix", async () => {
    await mountMixedOperatorPanel();

    const filter = screen.getByTestId("cm-status-filter");
    const rowCountFor = (value: string): number => {
      fireEvent.change(filter, { target: { value } });
      return screen.queryAllByTestId("cm-operator-row").length;
    };

    expect(rowCountFor("needs_review")).toBe(1);
    expect(rowCountFor("compliant")).toBe(1);
    expect(rowCountFor("partially_compliant")).toBe(1);
    expect(rowCountFor("non_compliant")).toBe(1);
    expect(rowCountFor("na")).toBe(1);
    expect(rowCountFor("removed")).toBe(1);
  });

  it("narrows the mixed matrix rows by requirement text and by category or source text", async () => {
    await mountMixedOperatorPanel();

    const search = screen.getByTestId("cm-search");
    const rowsAfter = (value: string): HTMLElement[] => {
      fireEvent.change(search, { target: { value } });
      return screen.queryAllByTestId("cm-operator-row");
    };

    // Requirement text narrows to its single row.
    let rows = rowsAfter("redundant core switching");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("redundant core switching");

    // Category text narrows to the matching active row.
    rows = rowsAfter("local-content");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("local content quota");

    // Source text narrows to the active rows with no cited source.
    rows = rowsAfter("No cited source");
    expect(rows).toHaveLength(2);
  });

  it("changes the visible operator group headings when grouping the mixed matrix by category, section, and source", async () => {
    await mountMixedOperatorPanel();

    const groupBy = screen.getByTestId("cm-group-by");
    const headingText = (): string =>
      screen
        .getAllByTestId("cm-operator-group")
        .map((group) => group.textContent ?? "")
        .join(" ");

    // Default category grouping.
    let headings = headingText();
    expect(headings).toContain("technical");
    expect(headings).toContain("legal/regulatory");
    expect(headings).toContain("local-content");

    fireEvent.change(groupBy, { target: { value: "section" } });
    headings = headingText();
    expect(headings).toContain("SEC-1.1");
    expect(headings).toContain("SEC-5.1");
    expect(headings).not.toContain("technical");

    fireEvent.change(groupBy, { target: { value: "source" } });
    headings = headingText();
    expect(headings).toContain("Evidence reference");
    expect(headings).toContain("No cited source");
    expect(headings).not.toContain("SEC-1.1");
  });

  it("keeps a 120-row compliance matrix usable through the compact operator surface", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixHighRowCountDetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("cm-operator-panel");

    // The full compact operator surface renders for a large matrix.
    expect(screen.getByTestId("cm-next-action")).toBeInTheDocument();
    expect(screen.getByTestId("cm-progress-counts")).toBeInTheDocument();
    expect(screen.getByTestId("cm-status-filter")).toBeInTheDocument();
    expect(screen.getByTestId("cm-search")).toBeInTheDocument();
    expect(screen.getByTestId("cm-group-by")).toBeInTheDocument();
    expect(screen.getByTestId("cm-selected-row-panel")).toBeInTheDocument();

    // One compact table - not a wall of 120 row cards/lists.
    expect(screen.getAllByTestId("cm-operator-table")).toHaveLength(1);

    // Progress counts cover the whole matrix and call out the removed rows.
    const counts = screen.getByTestId("cm-progress-counts");
    expect(counts).toHaveTextContent("Total 120");
    expect(counts).toHaveTextContent("Removed 3");

    // The default active view shows many rows but never the removed ones.
    const activeRows = screen.getAllByTestId("cm-operator-row");
    expect(activeRows.length).toBeGreaterThan(50);
    expect(activeRows).toHaveLength(117);
    const activeText = activeRows.map((row) => row.textContent ?? "").join(" ");
    expect(activeText).not.toContain("Removed duplicate row");
    // Compact rows never leak raw CM ids or raw evidence ids as primary text.
    expect(activeText).not.toContain("CM-117");
    expect(activeText).not.toContain("RFP-REQ-117");
    expect(activeText).not.toContain("ev-text-1");
    expect(activeText).not.toContain("file-rfp-1");
    expect(activeText).not.toContain(INPUT_PACKAGE_ARTIFACT_ID);

    // Grouping by source surfaces human source group text, not machine ids.
    fireEvent.change(screen.getByTestId("cm-group-by"), {
      target: { value: "source" },
    });
    const groupText = screen
      .getAllByTestId("cm-operator-group")
      .map((group) => group.textContent ?? "")
      .join(" ");
    expect(groupText).toContain("Evidence reference");
    expect(groupText).toContain("No cited source");
    expect(groupText).not.toContain("ev-text-1");

    // A removed row stays hidden under the default active filter and appears
    // only after selecting the Removed filter.
    const search = screen.getByTestId("cm-search");
    fireEvent.change(search, { target: { value: "marker 40" } });
    expect(screen.queryAllByTestId("cm-operator-row")).toHaveLength(0);
    fireEvent.change(screen.getByTestId("cm-status-filter"), {
      target: { value: "removed" },
    });
    const removedRows = screen.getAllByTestId("cm-operator-row");
    expect(removedRows).toHaveLength(1);
    expect(removedRows[0]).toHaveTextContent("SEC-40");

    // Searching a unique high-index requirement narrows to one active operator
    // row; selecting it shows the row detail with raw ids only in the audit.
    fireEvent.change(screen.getByTestId("cm-status-filter"), {
      target: { value: "active" },
    });
    fireEvent.change(search, { target: { value: "marker 117" } });
    const matched = screen.getAllByTestId("cm-operator-row");
    expect(matched).toHaveLength(1);
    expect(matched[0]).toHaveTextContent("marker 117");

    fireEvent.click(matched[0]);
    const detailRow = within(
      screen.getByTestId("cm-selected-row-panel")
    ).getByTestId("cm-detail-row");
    expect(detailRow).toHaveTextContent("marker 117");
    const audit = within(detailRow).getByTestId("cm-detail-audit");
    expect(audit).toHaveTextContent("CM-117");
    expect(audit).toHaveTextContent("RFP-REQ-117");
  });

  it("posts a row edit carrying response, complianceStatus, and notes to the rows/review route and reloads list and detail for the returned new matrix version", async () => {
    const V2_ID = "art-cm-2";
    const V2_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${V2_ID}/compliance-matrix`;
    const ROWS_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/rows/review`;
    const ARTIFACT_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/review`;
    const v2Detail = complianceMatrixStage5DetailResponse();
    v2Detail.artifact = artifact(V2_ID, "compliance_matrix", "needs_review", 2, [
      BASELINE_ARTIFACT_ID,
      EVIDENCE_PACKAGE_APPROVED_ID,
      CONFIG_EXPANSION_ARTIFACT_ID,
    ]);

    const calls = stubFetch((url, init) => {
      if (url === ROWS_REVIEW_URL && init?.method === "POST") {
        return jsonResponse(
          {
            artifact: artifact(V2_ID, "compliance_matrix", "needs_review", 2),
            payloadSummary: {},
          },
          200
        );
      }
      if (url === V2_DETAIL_URL) return jsonResponse(v2Detail);
      return stage5ComplianceFetch(complianceMatrixStage5DetailResponse())(url);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("review-drawer");
    await screen.findByTestId("cm-detail-row");

    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-response-edit-enable-CM-010"));
    });
    fireEvent.change(screen.getByTestId("cm-row-response-edit-value-CM-010"), {
      target: { value: "Updated response." },
    });
    fireEvent.change(screen.getByTestId("cm-row-response-edit-status-CM-010"), {
      target: { value: "compliant" },
    });
    fireEvent.change(screen.getByTestId("cm-row-response-edit-notes-CM-010"), {
      target: { value: "Reviewed and approved." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-response-edit-submit"));
    });

    await screen.findByTestId("cm-row-response-edit-success");

    const post = calls.find(
      (call) => call.url === ROWS_REVIEW_URL && call.init?.method === "POST"
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      decisions: [
        {
          rowId: "CM-010",
          action: "edit",
          editedFields: {
            response: "Updated response.",
            complianceStatus: "compliant",
            notes: "Reviewed and approved.",
          },
        },
      ],
    });
    // The response edit never reaches the artifact-level review route.
    expect(
      calls.some(
        (call) =>
          call.url === ARTIFACT_REVIEW_URL && call.init?.method === "POST"
      )
    ).toBe(false);
    // The persisted list and the detail for the returned v2 id are reloaded.
    expect(
      calls.filter((call) => call.url === COMPLIANCE_MATRIX_LIST_URL).length
    ).toBeGreaterThanOrEqual(2);
    expect(calls.some((call) => call.url === V2_DETAIL_URL)).toBe(true);
  });

  it("keeps the row response edit submit disabled until an enabled row holds a changed nonblank response", async () => {
    stubFetch(stage5ComplianceFetch(complianceMatrixStage5DetailResponse()));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-detail-row");

    expect(screen.getByTestId("cm-row-response-edit-submit")).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-response-edit-enable-CM-010"));
    });
    fireEvent.change(screen.getByTestId("cm-row-response-edit-value-CM-010"), {
      target: { value: "   " },
    });
    expect(screen.getByTestId("cm-row-response-edit-submit")).toBeDisabled();

    fireEvent.change(screen.getByTestId("cm-row-response-edit-value-CM-010"), {
      target: { value: "Reworded compliant response." },
    });
    expect(
      screen.getByTestId("cm-row-response-edit-submit")
    ).not.toBeDisabled();
  });

  it("enables submit on a status-only change and posts only the changed complianceStatus", async () => {
    const ROWS_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/rows/review`;
    const calls = stubFetch((url, init) => {
      if (url === ROWS_REVIEW_URL && init?.method === "POST") {
        return jsonResponse(
          {
            artifact: artifact(
              COMPLIANCE_MATRIX_ARTIFACT_ID,
              "compliance_matrix",
              "needs_review",
              1
            ),
          },
          200
        );
      }
      return stage5ComplianceFetch(complianceMatrixStage5DetailResponse())(url);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-detail-row");

    expect(screen.getByTestId("cm-row-response-edit-submit")).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-response-edit-enable-CM-010"));
    });
    // Leave the response and notes at their seeded values; change only status.
    fireEvent.change(screen.getByTestId("cm-row-response-edit-status-CM-010"), {
      target: { value: "compliant" },
    });
    expect(
      screen.getByTestId("cm-row-response-edit-submit")
    ).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-response-edit-submit"));
    });
    await screen.findByTestId("cm-row-response-edit-success");

    const post = calls.find(
      (call) => call.url === ROWS_REVIEW_URL && call.init?.method === "POST"
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      decisions: [
        {
          rowId: "CM-010",
          action: "edit",
          editedFields: { complianceStatus: "compliant" },
        },
      ],
    });
  });

  it("does not render row response edit controls or submit for an approved compliance matrix", async () => {
    const approvedDetail = complianceMatrixStage5DetailResponse();
    approvedDetail.artifact = artifact(
      COMPLIANCE_MATRIX_ARTIFACT_ID,
      "compliance_matrix",
      "approved",
      1,
      [BASELINE_ARTIFACT_ID, EVIDENCE_PACKAGE_APPROVED_ID, CONFIG_EXPANSION_ARTIFACT_ID]
    );
    stubFetch(stage5ComplianceFetch(approvedDetail));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-detail-row");

    // Stage 5 metadata still renders for the approved matrix.
    expect(screen.getByTestId("cm-detail-section-reference")).toHaveTextContent(
      "SEC-REF-3.2.1"
    );
    // No engineer row response edit surface on an approved matrix.
    expect(
      screen.queryByTestId("cm-row-response-edit-enable-CM-010")
    ).toBeNull();
    expect(screen.queryByTestId("cm-row-response-edit-submit")).toBeNull();

    // The approved matrix offers a CSV export link to the compliance-matrix
    // export route for the loaded artifact.
    const exportLink = screen.getByTestId("cm-export-download");
    expect(exportLink).toHaveAttribute(
      "href",
      `/api/projects/${PROJECT_ID}/rfp/artifacts/${COMPLIANCE_MATRIX_ARTIFACT_ID}/compliance-matrix/export`
    );
  });

  it("requires a reason to mark a row not applicable and posts only the lifecycle decision to the rows/review route", async () => {
    const ROWS_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/rows/review`;
    const ARTIFACT_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/review`;
    const calls = stubFetch((url, init) => {
      if (url === ROWS_REVIEW_URL && init?.method === "POST") {
        return jsonResponse(
          {
            artifact: artifact(
              COMPLIANCE_MATRIX_ARTIFACT_ID,
              "compliance_matrix",
              "needs_review",
              1
            ),
          },
          200
        );
      }
      return stage5ComplianceFetch(complianceMatrixStage5DetailResponse())(url);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-detail-row");

    // No action selected -> submit is disabled.
    expect(screen.getByTestId("cm-row-lifecycle-submit")).toBeDisabled();

    fireEvent.change(screen.getByTestId("cm-row-lifecycle-action-CM-010"), {
      target: { value: "mark_not_applicable" },
    });
    // Reason still blank -> submit stays disabled.
    expect(screen.getByTestId("cm-row-lifecycle-submit")).toBeDisabled();

    fireEvent.change(screen.getByTestId("cm-row-lifecycle-reason-CM-010"), {
      target: { value: "Out of scope." },
    });
    expect(screen.getByTestId("cm-row-lifecycle-submit")).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-lifecycle-submit"));
    });
    await screen.findByTestId("cm-row-lifecycle-success");

    const post = calls.find(
      (call) => call.url === ROWS_REVIEW_URL && call.init?.method === "POST"
    );
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body));
    expect(body).toEqual({
      decisions: [
        {
          rowId: "CM-010",
          action: "mark_not_applicable",
          reason: "Out of scope.",
        },
      ],
    });
    // Lifecycle decisions never carry editedFields and never approve the artifact.
    expect(body.decisions[0].editedFields).toBeUndefined();
    expect(
      calls.some(
        (call) =>
          call.url === ARTIFACT_REVIEW_URL && call.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("posts a remove lifecycle decision with its reason and no editedFields", async () => {
    const ROWS_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/rows/review`;
    const calls = stubFetch((url, init) => {
      if (url === ROWS_REVIEW_URL && init?.method === "POST") {
        return jsonResponse(
          {
            artifact: artifact(
              COMPLIANCE_MATRIX_ARTIFACT_ID,
              "compliance_matrix",
              "needs_review",
              1
            ),
          },
          200
        );
      }
      return stage5ComplianceFetch(complianceMatrixStage5DetailResponse())(url);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-detail-row");

    fireEvent.change(screen.getByTestId("cm-row-lifecycle-action-CM-010"), {
      target: { value: "remove" },
    });
    fireEvent.change(screen.getByTestId("cm-row-lifecycle-reason-CM-010"), {
      target: { value: "Duplicate of CM-001." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-lifecycle-submit"));
    });
    await screen.findByTestId("cm-row-lifecycle-success");

    const post = calls.find(
      (call) => call.url === ROWS_REVIEW_URL && call.init?.method === "POST"
    );
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body));
    expect(body).toEqual({
      decisions: [
        { rowId: "CM-010", action: "remove", reason: "Duplicate of CM-001." },
      ],
    });
    expect(body.decisions[0].editedFields).toBeUndefined();
  });

  it("restores a removed row from the drawer history with an optional note", async () => {
    const ROWS_REVIEW_URL = `${COMPLIANCE_MATRIX_DETAIL_URL}/rows/review`;
    const calls = stubFetch((url, init) => {
      if (url === ROWS_REVIEW_URL && init?.method === "POST") {
        return jsonResponse(
          {
            artifact: artifact(
              COMPLIANCE_MATRIX_ARTIFACT_ID,
              "compliance_matrix",
              "needs_review",
              1
            ),
          },
          200
        );
      }
      return stage5ComplianceFetch(complianceMatrixRemovedRowDetailResponse())(
        url
      );
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-decided-rows");

    // The removed row only surfaces under the removed filter, so switch to it
    // before driving the restore lifecycle control.
    fireEvent.change(screen.getByTestId("cm-status-filter"), {
      target: { value: "removed" },
    });

    fireEvent.change(screen.getByTestId("cm-row-lifecycle-action-CM-020"), {
      target: { value: "restore" },
    });
    fireEvent.change(screen.getByTestId("cm-row-lifecycle-note-CM-020"), {
      target: { value: "Back in scope after clarification." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("cm-row-lifecycle-submit"));
    });
    await screen.findByTestId("cm-row-lifecycle-success");

    const post = calls.find(
      (call) => call.url === ROWS_REVIEW_URL && call.init?.method === "POST"
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      decisions: [
        {
          rowId: "CM-020",
          action: "restore",
          note: "Back in scope after clarification.",
        },
      ],
    });
  });

  it("does not render row lifecycle controls or submit for an approved compliance matrix", async () => {
    const approvedDetail = complianceMatrixStage5DetailResponse();
    approvedDetail.artifact = artifact(
      COMPLIANCE_MATRIX_ARTIFACT_ID,
      "compliance_matrix",
      "approved",
      1,
      [BASELINE_ARTIFACT_ID, EVIDENCE_PACKAGE_APPROVED_ID, CONFIG_EXPANSION_ARTIFACT_ID]
    );
    stubFetch(stage5ComplianceFetch(approvedDetail));
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    await act(async () => {
      fireEvent.click(generate);
    });
    await screen.findByTestId("cm-detail-row");

    // Stage 5 metadata still renders for the approved matrix.
    expect(screen.getByTestId("cm-detail-section-reference")).toHaveTextContent(
      "SEC-REF-3.2.1"
    );
    // No engineer lifecycle surface on an approved matrix.
    expect(
      screen.queryByTestId("cm-row-lifecycle-action-CM-010")
    ).toBeNull();
    expect(screen.queryByTestId("cm-row-lifecycle-submit")).toBeNull();
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

  it("auto-generates compliance from latest approved requirements, evidence, and required approved configuration", async () => {
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

    await screen.findByTestId("baseline-card-review");
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-card-review"));
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

  function uploadedFile(
    id: string,
    fileName: string,
    fileRole: string
  ): Record<string, unknown> {
    return {
      id,
      fileName,
      fileRole,
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedAt: "2026-06-01T00:00:00.000Z",
    };
  }

  function workspaceWithUploadedFiles(
    uploadedFiles: Record<string, unknown>[]
  ): Record<string, unknown> {
    const body = rfpBoqWorkspaceResponse();
    const workspace = body.workspace as Record<string, unknown>;
    workspace.uploadedFiles = uploadedFiles;
    // No input package: keep the page in the upload/create-package stage.
    workspace.artifacts = [];
    workspace.spineArtifacts = {
      normalized_boq: null,
      sku_resolution: null,
      configuration_expansion: null,
      priced_boq: null,
      export_package: null,
    };
    return body;
  }

  it("supports selecting multiple files and queues them with per-file role selects", async () => {
    stubFetch((url) => {
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const input = await screen.findByTestId("rfp-file-input");
    expect(input).toHaveAttribute("multiple");

    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            new File(["a"], "main-rfp.pdf", { type: "application/pdf" }),
            new File(["b"], "scope.pdf", { type: "application/pdf" }),
          ],
        },
      });
    });

    expect(screen.getAllByTestId("rfp-upload-queue-item")).toHaveLength(2);
    expect(screen.getByTestId("rfp-upload-queue-name-0")).toHaveTextContent("main-rfp.pdf");
    expect(screen.getByTestId("rfp-upload-queue-name-1")).toHaveTextContent("scope.pdf");
    expect(screen.getByTestId("rfp-upload-queue-role-0")).toBeInTheDocument();
    expect(screen.getByTestId("rfp-upload-queue-role-1")).toBeInTheDocument();

    // A queued file can be removed before upload.
    await act(async () => {
      fireEvent.click(screen.getByTestId("rfp-upload-queue-remove-1"));
    });
    expect(screen.getAllByTestId("rfp-upload-queue-item")).toHaveLength(1);
  });

  it("uploads every queued file in sequence with its per-file role, then clears the queue and shows a concise count plus a grouped side panel", async () => {
    let uploadCount = 0;
    const uploadRoles: string[] = [];
    const calls = stubFetch((url, init) => {
      if (url === `/api/projects/${PROJECT_ID}/rfp/files` && init?.method === "POST") {
        uploadCount += 1;
        const body = init.body as FormData;
        uploadRoles.push(String(body.get("fileRole")));
        return jsonResponse({ ok: true }, 201);
      }
      if (url === RFP_BOQ_WORKSPACE_URL) {
        // After uploads land, the workspace reports the two persisted files.
        return jsonResponse(
          uploadCount >= 2
            ? workspaceWithUploadedFiles([
                uploadedFile("file-rfp-1", "main-rfp.pdf", "rfp"),
                uploadedFile("file-sow-1", "scope.pdf", "scope_of_work"),
              ])
            : workspaceWithUploadedFiles([])
        );
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const input = await screen.findByTestId("rfp-file-input");
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            new File(["a"], "main-rfp.pdf", { type: "application/pdf" }),
            new File(["b"], "scope.pdf", { type: "application/pdf" }),
          ],
        },
      });
    });

    fireEvent.change(screen.getByTestId("rfp-upload-queue-role-0"), {
      target: { value: "rfp" },
    });
    fireEvent.change(screen.getByTestId("rfp-upload-queue-role-1"), {
      target: { value: "scope_of_work" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("rfp-upload-submit"));
    });

    await waitFor(() => {
      const uploads = calls.filter(
        (call) =>
          call.url === `/api/projects/${PROJECT_ID}/rfp/files` &&
          call.init?.method === "POST"
      );
      expect(uploads).toHaveLength(2);
    });
    expect(uploadRoles).toEqual(["rfp", "scope_of_work"]);

    // The queue clears and the center area is concise (count only), with the
    // grouped persisted filenames shown in the side status panel.
    await waitFor(() => {
      expect(screen.queryAllByTestId("rfp-upload-queue-item")).toHaveLength(0);
    });
    expect(screen.getByTestId("rfp-uploaded-count")).toHaveTextContent("2 files uploaded");

    const panel = screen.getByTestId("rfp-uploaded-files-panel");
    expect(within(panel).getByTestId("rfp-uploaded-role-rfp")).toHaveTextContent("main-rfp.pdf");
    expect(within(panel).getByTestId("rfp-uploaded-role-scope_of_work")).toHaveTextContent(
      "scope.pdf"
    );
  });

  it("derives the next action from all uploaded files, not only BoQ files", async () => {
    stubFetch((url) => {
      if (url === RFP_BOQ_WORKSPACE_URL) {
        // Only a non-BoQ file uploaded: boqFiles stays empty but the operator
        // can still assemble the input package from uploaded files.
        return jsonResponse(
          workspaceWithUploadedFiles([uploadedFile("file-rfp-1", "main-rfp.pdf", "rfp")])
        );
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByText("RFP operator workflow");
    expect(screen.getByTestId("next-action")).toHaveTextContent("Create input package");
  });

  it("centers step 2 on compiled evidence and demotes extraction decisions to collapsed review history", async () => {
    // A decided (rejected) extraction delta lands in collapsed history rather
    // than as a primary card; its recorded decisions stay reachable via Inspect.
    stubFetch((url) => {
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse("rejected"));
      if (url === EXTRACTION_DELTA_DETAIL_URL) return jsonResponse(deltaDetailResponse());
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const step2 = await screen.findByTestId("workflow-step-2");

    // The primary workflow centers on compiled evidence review and the evidence
    // package cards, keeping their review/inspect drawer actions.
    expect(within(step2).getByTestId("compiled-evidence-review")).toBeInTheDocument();
    expect(within(step2).getByTestId("prepare-evidence-review")).toHaveTextContent(
      "Review evidence package"
    );
    expect(within(step2).getByText("Current evidence package")).toBeInTheDocument();
    expect(within(step2).getByText("Approved evidence package")).toBeInTheDocument();
    // Exactly one primary "Review" action remains (the evidence package); the old
    // extraction-refinement primary Review card is gone. An Inspect action stays.
    expect(within(step2).getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(
      within(step2).getAllByRole("button", { name: "Inspect" }).length
    ).toBeGreaterThanOrEqual(1);
    // No primary "Extraction refinement" card remains - only the collapsed,
    // labeled "Extraction refinement history".
    expect(within(step2).queryByText("Extraction refinement")).toBeNull();

    // Extraction decisions remain accessible under the collapsed, labeled review
    // history: it is closed by default and inspectable.
    const extractionHistory = within(step2)
      .getByText(/Extraction refinement history/)
      .closest("details") as HTMLElement;
    expect(extractionHistory.tagName).toBe("DETAILS");
    expect(extractionHistory.hasAttribute("open")).toBe(false);
    await act(async () => {
      fireEvent.click(within(extractionHistory).getByRole("button", { name: "Inspect" }));
    });

    // Inspecting opens the extraction-refinement drawer with the recorded
    // decisions: the pending candidate plus the decided review history.
    expect(await screen.findByTestId("review-drawer")).toHaveTextContent("Extraction refinement");
    expect(await screen.findByTestId("delta-pending-list")).toHaveTextContent("Missing service SLA");
    const decided = await screen.findByTestId("delta-decided");
    expect(decided.tagName).toBe("DETAILS");
    expect(decided).toHaveTextContent("Review history (1)");
    expect(decided.hasAttribute("open")).toBe(false);
  });

  it("renders delta candidates human-first with raw machine metadata only under collapsed technical/audit details", async () => {
    stubFetch((url) => {
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse("rejected"));
      if (url === EXTRACTION_DELTA_DETAIL_URL) return jsonResponse(deltaDetailResponse());
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const step2 = await screen.findByTestId("workflow-step-2");
    const extractionHistory = within(step2)
      .getByText(/Extraction refinement history/)
      .closest("details") as HTMLElement;
    await act(async () => {
      fireEvent.click(within(extractionHistory).getByRole("button", { name: "Inspect" }));
    });
    await screen.findByTestId("review-drawer");

    // The pending candidate leads with human-reviewable content only.
    const summary = (await screen.findAllByTestId("delta-candidate-summary"))[0];
    expect(summary).toHaveTextContent("Missing service SLA");
    expect(summary).toHaveTextContent("RFP mentions SLA in section 4.");
    // No machine metadata leaks into the primary summary.
    expect(summary).not.toHaveTextContent("cand-1");
    expect(summary).not.toHaveTextContent("file-rfp-1");
    expect(summary).not.toHaveTextContent("ev-text-1");
    expect(summary).not.toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(summary).not.toHaveTextContent("tbl-1");
    expect(summary.textContent ?? "").not.toMatch(/chunk/i);
    expect(summary.textContent ?? "").not.toMatch(/chars/i);

    // The collapsed candidate audit keeps the raw candidate id and the raw
    // evidence/source/package locator data.
    const audit = (await screen.findAllByTestId("delta-candidate-audit"))[0];
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent("cand-1");
    expect(audit).toHaveTextContent("file-rfp-1");
    expect(audit).toHaveTextContent("ev-text-1");
    expect(audit).toHaveTextContent(INPUT_PACKAGE_ARTIFACT_ID);
    expect(audit.textContent ?? "").toMatch(/chunk/i);

    // Proposed evidence shows the reviewable body but hides raw chunk/char
    // locators from its primary metadata, keeping them in the collapsed audit.
    const proposedMeta = screen.getByTestId("delta-proposed-text-meta");
    expect(proposedMeta.textContent ?? "").not.toMatch(/chunk/i);
    expect(proposedMeta.textContent ?? "").not.toMatch(/chars/i);
    expect(screen.getByTestId("delta-proposed-text-body")).toHaveTextContent(
      "Service SLA must be provided."
    );
    const proposedAudit = screen.getByTestId("delta-proposed-audit");
    expect(proposedAudit.tagName).toBe("DETAILS");
    expect(proposedAudit.hasAttribute("open")).toBe(false);
    expect(proposedAudit.textContent ?? "").toMatch(/chunk/i);
    expect(proposedAudit).toHaveTextContent("42 chars");
  });

  it("opens the current evidence package drawer without preparing another package", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    const prepare = await screen.findByTestId("prepare-evidence-review");
    expect(prepare).toHaveTextContent("Review evidence package");
    await act(async () => {
      fireEvent.click(prepare);
    });

    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Compiled evidence package"
    );
    const prepareWrites = calls.filter(
      (call) =>
        call.init?.method === "POST" &&
        (call.url.endsWith(`/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/evidence`) ||
          call.url.endsWith(
            `/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/extraction-delta/generate`
          ) ||
          call.url.endsWith(
            `/artifacts/${INPUT_PACKAGE_ARTIFACT_ID}/evidence-package`
          ))
    );
    expect(prepareWrites).toHaveLength(0);
  });

  it("opens the current requirements baseline drawer without posting to generate", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-baseline");
    expect(generate).toHaveTextContent("Review current baseline");
    expect(generate).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Requirements baseline"
    );
    expect(
      calls.some(
        (call) => call.url === GENERATE_URL && call.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("opens the current compliance matrix drawer without posting to generate", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    expect(generate).toHaveTextContent("Review current matrix");
    expect(generate).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Compliance matrix"
    );
    expect(
      calls.some(
        (call) =>
          call.url === COMPLIANCE_MATRIX_GENERATE_URL &&
          call.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("inspects an approved requirements baseline instead of offering to generate another", async () => {
    const calls = stubFetch((url) => {
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse("approved"));
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-baseline");
    expect(generate).toHaveTextContent("Inspect approved baseline");
    expect(generate).not.toHaveTextContent("Generate");
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Requirements baseline"
    );
    expect(
      calls.some(
        (call) => call.url === GENERATE_URL && call.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("inspects an approved compliance matrix instead of offering to generate another", async () => {
    const calls = stubFetch((url) => {
      if (url === COMPLIANCE_MATRIX_LIST_URL) {
        return jsonResponse(complianceMatrixListResponse("approved"));
      }
      if (url === COMPLIANCE_MATRIX_DETAIL_URL) {
        return jsonResponse(complianceMatrixDetailResponse("approved"));
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    expect(generate).toHaveTextContent("Inspect approved matrix");
    expect(generate).not.toHaveTextContent("Generate");
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Compliance matrix"
    );
    expect(
      calls.some(
        (call) =>
          call.url === COMPLIANCE_MATRIX_GENERATE_URL &&
          call.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("keeps the failed and unattempted files queued and reports the failed filename on a partial upload failure", async () => {
    let uploadCount = 0;
    stubFetch((url, init) => {
      if (url === `/api/projects/${PROJECT_ID}/rfp/files` && init?.method === "POST") {
        uploadCount += 1;
        // The second upload fails; the first succeeds and the third is never
        // attempted.
        return jsonResponse({}, uploadCount === 2 ? 500 : 201);
      }
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(workspaceWithUploadedFiles([]));
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const input = await screen.findByTestId("rfp-file-input");
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            new File(["a"], "main-rfp.pdf", { type: "application/pdf" }),
            new File(["b"], "scope.pdf", { type: "application/pdf" }),
            new File(["c"], "addendum.pdf", { type: "application/pdf" }),
          ],
        },
      });
    });
    expect(screen.getAllByTestId("rfp-upload-queue-item")).toHaveLength(3);

    await act(async () => {
      fireEvent.click(screen.getByTestId("rfp-upload-submit"));
    });

    // The failed file and the unattempted file stay queued; the first
    // (successful) file dropped out, and the error names the failed file.
    await waitFor(() => {
      expect(
        screen.getByText(/Unable to upload RFP file\. \(scope\.pdf\)/)
      ).toBeInTheDocument();
    });
    const remaining = screen.getAllByTestId("rfp-upload-queue-item");
    expect(remaining).toHaveLength(2);
    expect(screen.getByTestId("rfp-upload-queue-name-0")).toHaveTextContent("scope.pdf");
    expect(screen.getByTestId("rfp-upload-queue-name-1")).toHaveTextContent("addendum.pdf");
  });

  it("hides artifact metadata and technical-detail dropdowns from the primary workflow cards while keeping their review/inspect drawer actions", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    // The guided workflow and its status-only cards must be mounted before the
    // absence checks run; an unrendered page would pass every absence check
    // vacuously.
    await screen.findByText("RFP operator workflow");
    await screen.findByTestId("baseline-card-review");

    // The verbose baseline/compliance list rows (inline requirement/row counts
    // plus source ids) are gone, replaced by status-only cards.
    expect(screen.queryByTestId("baseline-row")).toBeNull();
    expect(screen.queryByTestId("cm-row")).toBeNull();

    // No primary artifact card exposes a raw technical-detail dropdown - not the
    // intake overview cards, nor the per-step current/approved cards. In this
    // fixture the evidence-package overview card and both current cards are
    // populated, so these would have rendered before the cleanup.
    for (const technicalTestId of [
      "evidence-package-technical",
      "requirements-baseline-technical",
      "compliance-matrix-technical",
      "current-requirements-baseline-technical",
      "approved-requirements-baseline-technical",
      "current-compliance-matrix-technical",
      "approved-compliance-matrix-technical",
    ]) {
      expect(screen.queryByTestId(technicalTestId)).toBeNull();
    }

    // The cleaned-up cards keep their drawer action: the current requirements
    // baseline card opens the requirements drawer.
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-card-review"));
    });
    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Requirements baseline"
    );

    // Close the requirements drawer before exercising the compliance card.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await waitFor(() => {
      expect(screen.queryByTestId("review-drawer")).toBeNull();
    });

    // Whichever compliance card action the fixture exposes (a reviewable current
    // matrix here, an approved one otherwise) opens the compliance drawer.
    const complianceAction =
      screen.queryByTestId("compliance-card-review") ??
      screen.queryByTestId("compliance-card-inspect");
    expect(complianceAction).not.toBeNull();
    await act(async () => {
      fireEvent.click(complianceAction as HTMLElement);
    });
    expect(await screen.findByTestId("review-drawer")).toHaveTextContent(
      "Compliance matrix"
    );
  });

  it("blocks compliance generation when the BoQ/configuration gate is unsatisfied even with an approved baseline and evidence", async () => {
    const unsatisfiedGate = {
      required: true,
      satisfied: false,
      waived: false,
      status: "requires_configuration_expansion",
      message: "Complete the BoQ configuration review before compliance.",
    };
    const calls = stubFetch((url) => {
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse(evidencePackageApprovedOnlyResponse());
      }
      if (url === COMPLIANCE_MATRIX_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) {
        return jsonResponse(
          workspaceWithConfigurationGate(unsatisfiedGate, {
            nextStepId: "configuration_expansion",
          })
        );
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    await screen.findByText("RFP operator workflow");
    // The next action routes the operator to clear the BoQ/configuration gate.
    await waitFor(() => {
      expect(screen.getByTestId("next-action")).toHaveTextContent(
        "Complete BoQ/configuration review"
      );
    });

    const generate = await screen.findByTestId("generate-compliance");
    expect(generate).toHaveTextContent("Generate compliance matrix");
    expect(generate).toBeDisabled();

    // A click on the disabled control must not POST to compliance generate.
    await act(async () => {
      fireEvent.click(generate);
    });
    expect(
      calls.some(
        (call) =>
          call.url === COMPLIANCE_MATRIX_GENERATE_URL &&
          call.init?.method === "POST"
      )
    ).toBe(false);

    // Both operator lines explain the block in operator language.
    expect(screen.getByTestId("compliance-config-readiness")).toHaveTextContent(
      "Complete the BoQ configuration review before compliance."
    );
    const gateStatus = screen.getByTestId("rfp-config-gate-status");
    expect(gateStatus).toHaveTextContent(
      "Complete the BoQ configuration review before compliance."
    );
    // The next Quick BoM step shows as a human label, not the raw token.
    expect(gateStatus).toHaveTextContent("Next Quick BoM step: Configuration expansion.");
    expect(gateStatus.textContent ?? "").not.toContain("configuration_expansion");
  });

  it("enables compliance generation under an approved no-BoQ service-only exception and sends its artifact id as the configuration expansion id", async () => {
    const NO_BOQ_REASON = "Service-only engagement; no hardware BoQ.";
    const waivedGate = {
      required: true,
      satisfied: true,
      waived: true,
      status: "no_boq_exception_approved",
      message: "Service-only (no-BoQ) exception approved.",
      noBoqExceptionArtifactId: NO_BOQ_EXCEPTION_ARTIFACT_ID,
      noBoqExceptionReason: NO_BOQ_REASON,
    };
    const calls = stubFetch((url) => {
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse(evidencePackageApprovedOnlyResponse());
      }
      if (url === COMPLIANCE_MATRIX_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === COMPLIANCE_MATRIX_GENERATE_URL) {
        return jsonResponse({ artifact: complianceMatrixListItem(), draftSummary: {} }, 201);
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) {
        return jsonResponse(workspaceWithConfigurationGate(waivedGate));
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const generate = await screen.findByTestId("generate-compliance");
    expect(generate).toHaveTextContent("Generate compliance matrix");
    expect(generate).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(generate);
    });

    // The POST sends the approved exception id as the configuration expansion id.
    await waitFor(() => {
      const post = calls.find(
        (call) =>
          call.url === COMPLIANCE_MATRIX_GENERATE_URL &&
          call.init?.method === "POST"
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        requirementsBaselineArtifactId: BASELINE_ARTIFACT_ID,
        evidencePackageArtifactId: EVIDENCE_PACKAGE_APPROVED_ID,
        configurationExpansionArtifactId: NO_BOQ_EXCEPTION_ARTIFACT_ID,
      });
    });

    // The gate line reads as an approved/waived service-only exception with reason.
    const gateStatus = screen.getByTestId("rfp-config-gate-status");
    expect(gateStatus).toHaveTextContent("service-only");
    expect(gateStatus).toHaveTextContent("waived");
    expect(gateStatus).toHaveTextContent(NO_BOQ_REASON);

    // The raw exception artifact id never surfaces in the visible page text.
    expect(document.body.textContent ?? "").not.toContain(
      NO_BOQ_EXCEPTION_ARTIFACT_ID
    );
  });

  it("requests a service-only (no-BoQ) exception when the gate requires a BoQ or exception, posting only the reason and surfacing it for review", async () => {
    const NO_BOQ_EXCEPTION_URL = `/api/projects/${PROJECT_ID}/rfp/boq/no-boq-exception`;
    const REASON = "Pure professional services engagement; no hardware in scope.";
    const requiresGate = {
      required: true,
      satisfied: false,
      waived: false,
      status: "requires_boq_upload_or_exception",
      message:
        "Upload a BoQ file or record an approved no-BoQ service-only exception.",
    };
    const pendingGate = {
      required: true,
      satisfied: false,
      waived: false,
      status: "no_boq_exception_pending_review",
      message: "A no-BoQ service-only exception is pending review.",
      noBoqExceptionArtifactId: NO_BOQ_EXCEPTION_ARTIFACT_ID,
      noBoqExceptionReason: REASON,
    };
    let exceptionRecorded = false;
    const calls = stubFetch((url) => {
      if (url === NO_BOQ_EXCEPTION_URL) {
        exceptionRecorded = true;
        return jsonResponse({ ok: true }, 201);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse(evidencePackageApprovedOnlyResponse());
      }
      if (url === COMPLIANCE_MATRIX_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) {
        return jsonResponse(
          workspaceWithConfigurationGate(exceptionRecorded ? pendingGate : requiresGate)
        );
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    // The exception request form is visible and its submit stays disabled until
    // a nonblank reason is entered.
    const submit = await screen.findByTestId("rfp-no-boq-exception-submit");
    expect(screen.getByTestId("rfp-no-boq-exception-form")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId("rfp-no-boq-exception-reason"), {
      target: { value: `  ${REASON}  ` },
    });
    await waitFor(() => expect(submit).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(submit);
    });

    // The request posts exactly the trimmed reason; it never approves anything.
    await waitFor(() => {
      const post = calls.find(
        (call) =>
          call.url === NO_BOQ_EXCEPTION_URL && call.init?.method === "POST"
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({ reason: REASON });
    });
    expect(
      calls.some(
        (call) =>
          call.url === `/api/projects/${PROJECT_ID}/rfp/boq/approvals` &&
          call.init?.method === "POST"
      )
    ).toBe(false);

    // After refresh the exception reads as pending review with its human reason,
    // and the raw exception artifact id stays out of the visible page text.
    expect(
      await screen.findByTestId("rfp-no-boq-exception-review")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("rfp-no-boq-exception-review-reason")
    ).toHaveTextContent(REASON);
    expect(screen.queryByTestId("rfp-no-boq-exception-form")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(
      NO_BOQ_EXCEPTION_ARTIFACT_ID
    );
  });

  it("approves a pending no-BoQ service-only exception with a note and enables compliance once it is waived", async () => {
    const APPROVALS_URL = `/api/projects/${PROJECT_ID}/rfp/boq/approvals`;
    const REASON = "Service-only engagement; no hardware BoQ.";
    const NOTE = "Confirmed service-only scope with the account team.";
    const pendingGate = {
      required: true,
      satisfied: false,
      waived: false,
      status: "no_boq_exception_pending_review",
      message: "A no-BoQ service-only exception is pending review.",
      noBoqExceptionArtifactId: NO_BOQ_EXCEPTION_ARTIFACT_ID,
      noBoqExceptionReason: REASON,
    };
    const approvedGate = {
      required: true,
      satisfied: true,
      waived: true,
      status: "no_boq_exception_approved",
      message:
        "An approved no-BoQ service-only exception waives the configuration gate.",
      noBoqExceptionArtifactId: NO_BOQ_EXCEPTION_ARTIFACT_ID,
      noBoqExceptionReason: REASON,
    };
    let approved = false;
    const calls = stubFetch((url) => {
      if (url === APPROVALS_URL) {
        approved = true;
        return jsonResponse({ ok: true }, 200);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse("approved"));
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse(evidencePackageApprovedOnlyResponse());
      }
      if (url === COMPLIANCE_MATRIX_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === COMPLIANCE_MATRIX_GENERATE_URL) {
        return jsonResponse({ artifact: complianceMatrixListItem(), draftSummary: {} }, 201);
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) {
        return jsonResponse(
          workspaceWithConfigurationGate(approved ? approvedGate : pendingGate)
        );
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    // The pending-review controls show the reason; the raw artifact id is hidden.
    expect(
      await screen.findByTestId("rfp-no-boq-exception-review")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("rfp-no-boq-exception-review-reason")
    ).toHaveTextContent(REASON);
    expect(document.body.textContent ?? "").not.toContain(
      NO_BOQ_EXCEPTION_ARTIFACT_ID
    );

    // Compliance generation is blocked while the exception is still pending.
    const generate = await screen.findByTestId("generate-compliance");
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByTestId("rfp-no-boq-exception-note"), {
      target: { value: NOTE },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("rfp-no-boq-exception-approve"));
    });

    // The decision posts the artifact id, the approve decision, and the note.
    await waitFor(() => {
      const post = calls.find(
        (call) => call.url === APPROVALS_URL && call.init?.method === "POST"
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        artifactId: NO_BOQ_EXCEPTION_ARTIFACT_ID,
        decision: "approved",
        note: NOTE,
      });
    });

    // After refresh the gate reads as approved/waived service-only and compliance
    // generation is enabled from the approved baseline and evidence.
    await waitFor(() => {
      expect(screen.getByTestId("rfp-config-gate-status")).toHaveTextContent(
        "waived"
      );
    });
    expect(screen.getByTestId("rfp-config-gate-status")).toHaveTextContent(
      "service-only"
    );
    await waitFor(() => {
      expect(screen.getByTestId("generate-compliance")).not.toBeDisabled();
    });
    expect(document.body.textContent ?? "").not.toContain(
      NO_BOQ_EXCEPTION_ARTIFACT_ID
    );
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

  it("posts engineer row response edits to the compliance-matrix rows/review route", () => {
    expect(source).toContain("/compliance-matrix/rows/review");
  });

  it("exposes the compact compliance operator surface controls in source", () => {
    expect(source).toContain("cm-operator-table");
    expect(source).toContain("cm-status-filter");
    expect(source).toContain("cm-search");
    expect(source).toContain("cm-group-by");
  });

  it("exposes row lifecycle controls (mark not applicable, remove, restore) without ever sending bare not_applicable as an edit status", () => {
    // The response edit slice still exposes only response/status/notes controls.
    expect(source).toContain("cm-row-response-edit-status-");
    expect(source).toContain("cm-row-response-edit-notes-");
    // The lifecycle slice now exposes action/reason/note controls and a submit.
    expect(source).toContain("cm-row-lifecycle-action-");
    expect(source).toContain("cm-row-lifecycle-reason-");
    expect(source).toContain("cm-row-lifecycle-note-");
    expect(source).toContain("cm-row-lifecycle-submit");
    // The editable response status set still excludes bare not_applicable; the
    // only quoted literal is the mark_not_applicable lifecycle action.
    expect(source).not.toContain('"not_applicable"');
    expect(source).toContain('"mark_not_applicable"');
    // Lifecycle is its own decision slice and never reaches the artifact-level
    // review route; it posts only to the rows/review route.
    expect(source).toContain("/compliance-matrix/rows/review");
  });
});

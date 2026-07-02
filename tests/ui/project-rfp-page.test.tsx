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
const HLD_READINESS_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-readiness-snapshot`;
const HLD_READINESS_SNAPSHOT_ID = "art-hld-rs-1";
const HLD_READINESS_APPROVED_ID = "art-hld-rs-approved-1";
const HLD_READINESS_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_READINESS_SNAPSHOT_ID}/hld-readiness-snapshot`;
const HLD_READINESS_APPROVED_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_READINESS_APPROVED_ID}/hld-readiness-snapshot`;
const HLD_INTAKE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-intake`;
const HLD_INTAKE_ARTIFACT_ID = "art-hld-intake-1";
const HLD_INTAKE_APPROVED_ID = "art-hld-intake-approved-1";
const HLD_INTAKE_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_INTAKE_ARTIFACT_ID}/hld-intake`;
const HLD_INTAKE_REVIEW_URL = `${HLD_INTAKE_DETAIL_URL}/review`;
const HLD_INTAKE_QUESTIONNAIRE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-intake-questionnaires`;
const HLD_INTAKE_QUESTIONNAIRE_ID = "art-hld-intake-questionnaire-1";
const HLD_INTAKE_QUESTIONNAIRE_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_INTAKE_QUESTIONNAIRE_ID}/hld-intake-questionnaire`;
const HLD_INTAKE_QUESTIONNAIRE_ASSISTED_URL = `/api/projects/${PROJECT_ID}/rfp/hld-intake/questionnaire-assisted`;
const HLD_KNOWLEDGE_PACK_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-knowledge-packs`;
const HLD_KNOWLEDGE_PACK_ARTIFACT_ID = "art-hld-pack-1";
const HLD_KNOWLEDGE_PACK_APPROVED_ID = "art-hld-pack-approved-1";
const HLD_KNOWLEDGE_PACK_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_KNOWLEDGE_PACK_ARTIFACT_ID}/hld-knowledge-pack`;
const HLD_KNOWLEDGE_PACK_REVIEW_URL = `${HLD_KNOWLEDGE_PACK_DETAIL_URL}/review`;
const HLD_SOURCE_BUNDLE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-source-bundle`;
const HLD_SOURCE_BUNDLE_ARTIFACT_ID = "art-hld-source-bundle-1";
const HLD_SOURCE_BUNDLE_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_SOURCE_BUNDLE_ARTIFACT_ID}/hld-source-bundle`;
const HLD_SOURCE_BUNDLE_REVIEW_URL = `${HLD_SOURCE_BUNDLE_DETAIL_URL}/review`;
const HLD_DESIGN_MODEL_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-design-model`;
const HLD_DESIGN_MODEL_ARTIFACT_ID = "art-hld-design-model-1";
const HLD_DESIGN_MODEL_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DESIGN_MODEL_ARTIFACT_ID}/hld-design-model`;
const HLD_DESIGN_MODEL_REVIEW_URL = `${HLD_DESIGN_MODEL_DETAIL_URL}/review`;
const HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID = "art-hld-source-bundle-approved-1";
const HLD_DESIGN_MODEL_REVIEW_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-design-model-review`;
const HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID = "art-hld-design-model-review-1";
const HLD_DESIGN_MODEL_REVIEW_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID}/hld-design-model-review`;
const HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-design-model-rebuild-request`;
const HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID = "art-hld-design-model-rebuild-request-1";
const HLD_DESIGN_MODEL_REBUILD_EXECUTE_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID}/hld-design-model-rebuild-request/execute`;
const HLD_DESIGN_MODEL_REBUILT_ARTIFACT_ID = "art-hld-design-model-2";
const HLD_DESIGN_MODEL_REBUILT_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DESIGN_MODEL_REBUILT_ARTIFACT_ID}/hld-design-model`;
const HLD_GENERATION_READINESS_URL = `/api/projects/${PROJECT_ID}/rfp/hld-generation-readiness`;
const HLD_DIAGRAM_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-diagram`;
const HLD_DIAGRAM_ARTIFACT_ID = "art-hld-diagram-1";
const HLD_DIAGRAM_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DIAGRAM_ARTIFACT_ID}/hld-diagram`;
const HLD_DIAGRAM_REVIEW_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DIAGRAM_ARTIFACT_ID}/hld-diagram/review`;
const HLD_DOCUMENT_MODEL_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-document-model`;
const HLD_DOCUMENT_MODEL_ARTIFACT_ID = "art-hld-document-model-1";
const HLD_DOCUMENT_MODEL_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DOCUMENT_MODEL_ARTIFACT_ID}/hld-document-model`;
const HLD_DOCUMENT_MODEL_REVIEW_URL = `${HLD_DOCUMENT_MODEL_DETAIL_URL}/review`;
const HLD_DIAGRAM_OUTPUT_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/hld-diagram-output`;
const HLD_DIAGRAM_OUTPUT_ARTIFACT_ID = "art-hld-diagram-output-1";
const HLD_DIAGRAM_OUTPUT_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${HLD_DIAGRAM_OUTPUT_ARTIFACT_ID}/hld-diagram-output`;
const HLD_DIAGRAM_OUTPUT_REVIEW_URL = `${HLD_DIAGRAM_OUTPUT_DETAIL_URL}/review`;
const FINAL_HLD_DOCUMENT_STATUS_URL = `/api/projects/${PROJECT_ID}/rfp/hld-document`;
const GENERATED_HLD_DOCUMENT_CREATE_URL = `/api/projects/${PROJECT_ID}/rfp/hld-document/generated`;
const FINAL_HLD_DOCUMENT_REVIEW_ARTIFACT_ID = "art-hld-doc-review-1";
const FINAL_HLD_DOCUMENT_REVIEW_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${FINAL_HLD_DOCUMENT_REVIEW_ARTIFACT_ID}/hld-document/review`;
const HLD_CLOSE_URL = `/api/projects/${PROJECT_ID}/rfp/hld-close`;
const TP_HANDOFF_GATE_URL = `/api/projects/${PROJECT_ID}/rfp/tp-handoff-gate`;
const HLD_INTAKE_FIELD_IDS = [
  "existing_network_context",
  "target_topology_intent",
  "site_room_context",
  "resiliency_expectations",
  "wan_lan_boundaries",
  "rack_power_assumptions",
  "implementation_constraints",
  "exclusions",
  "diagram_notes",
];
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

function hldReadinessListBlocked(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [
      {
        id: HLD_READINESS_SNAPSHOT_ID,
        projectId: PROJECT_ID,
        type: "hld_readiness_snapshot",
        status: "needs_review",
        version: 1,
        payloadSummary: {
          payloadKind: "hld_readiness_snapshot",
          coveredDomainCount: 1,
          missingInputCount: 2,
        },
      },
    ],
    readiness: {
      status: "blocked",
      canCreateReadinessSnapshot: false,
      coveredDomains: ["core_networking"],
      excludedDomains: [],
      missingKnowledgePackDomains: ["campus_switching"],
      domainReadiness: {
        claimedDomains: ["security", "campus_switching"],
        coveredDomains: ["security"],
        excludedDomains: [],
        requiredKnowledgePackDomains: ["security", "campus_switching"],
        missingKnowledgePackDomains: ["campus_switching"],
      },
      missingInputs: ["HLD-MISSING-INPUT-1-CANARY", "HLD-MISSING-INPUT-2-CANARY"],
      validationMessages: ["HLD-VALIDATION-MSG-CANARY"],
      assumptions: [{ fieldId: "hld_assumption_canary", label: "HLD-ASSUMPTION-CANARY", status: "active" }],
      sourceArtifactIds: [COMPLIANCE_MATRIX_ARTIFACT_ID],
    },
  };
}

function hldReadinessListReady(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [
      {
        id: HLD_READINESS_APPROVED_ID,
        projectId: PROJECT_ID,
        type: "hld_readiness_snapshot",
        status: "approved",
        version: 1,
        payloadSummary: {
          payloadKind: "hld_readiness_snapshot",
          coveredDomainCount: 3,
          missingInputCount: 0,
        },
      },
    ],
    readiness: {
      status: "ready",
      canCreateReadinessSnapshot: true,
      coveredDomains: ["core_networking", "security", "compute"],
      excludedDomains: [],
      missingKnowledgePackDomains: [],
      missingInputs: [],
      validationMessages: [],
      assumptions: [{ fieldId: "hld_assumption_ready_canary", label: "HLD-ASSUMPTION-READY-CANARY", status: "active" }],
      sourceArtifactIds: [COMPLIANCE_MATRIX_ARTIFACT_ID],
    },
  };
}

function hldReadinessSnapshotDetail(
  id = HLD_READINESS_SNAPSHOT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id,
      projectId: PROJECT_ID,
      type: "hld_readiness_snapshot",
      status,
      version: 1,
      sourceArtifactIds: [COMPLIANCE_MATRIX_ARTIFACT_ID],
    },
    snapshot: {
      payloadKind: "hld_readiness_snapshot",
      readinessStatus: status === "approved" ? "ready" : "blocked",
      coveredDomains: ["core_networking", "HLD-COVERED-DOMAIN-CANARY"],
      missingInputs: status === "approved" ? [] : ["HLD-SNAPSHOT-MISSING-CANARY"],
      validationMessages: ["HLD-SNAPSHOT-VALIDATION-CANARY"],
      assumptions: [{ fieldId: "hld_snapshot_assumption_canary", label: "HLD-SNAPSHOT-ASSUMPTION-CANARY", status: "active" }],
    },
  };
}

function hldIntakeListItem(
  id = HLD_INTAKE_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    type: "hld_intake",
    status,
    version,
    payloadSummary: {
      payloadKind: "hld_intake",
      answeredCount: 1,
      fieldCount: 9,
    },
  };
}

function hldIntakeListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 2,
    artifacts: [
      hldIntakeListItem(HLD_INTAKE_ARTIFACT_ID, "needs_review", 2),
      hldIntakeListItem(HLD_INTAKE_APPROVED_ID, "approved", 1),
    ],
  };
}

function hldIntakeDetailResponse(
  id = HLD_INTAKE_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id,
      projectId: PROJECT_ID,
      type: "hld_intake",
      status,
      version: 1,
      sourceArtifactIds: [COMPLIANCE_MATRIX_ARTIFACT_ID],
    },
    intake: {
      payloadKind: "hld_intake",
      sourceMode: "manual_override",
      manualOverrideReason: "HLD-INTAKE-OVERRIDE-REASON-CANARY",
      answers: [
        {
          fieldId: "existing_network_context",
          status: "answered",
          value: "HLD-INTAKE-ANSWER-CANARY",
          notes: "HLD-INTAKE-NOTE-CANARY",
        },
        { fieldId: "exclusions", status: "unknown" },
      ],
      sourceArtifactIds: [COMPLIANCE_MATRIX_ARTIFACT_ID],
    },
  };
}

function hldIntakeQuestionnaireListItem(
  id = HLD_INTAKE_QUESTIONNAIRE_ID,
  status = "needs_review",
  version = 2,
  payloadValid = true
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_intake_questionnaire",
    status,
    version,
    sourceArtifactIds: ["art-req-1"],
    payloadSummary: {
      payloadKind: "rfp_hld_intake_questionnaire",
      createdBy: "user-1",
      createdAt: "2026-06-20T09:00:00.000Z",
      questionCount: 3,
      sourceArtifactCount: 1,
      validationStatus: "passed",
      validationFindingCount: 0,
      payloadValid,
    },
  };
}

function hldIntakeQuestionnaireListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 2,
    artifacts: [
      hldIntakeQuestionnaireListItem(HLD_INTAKE_QUESTIONNAIRE_ID, "needs_review", 2),
      hldIntakeQuestionnaireListItem("art-hld-intake-questionnaire-old", "needs_review", 1),
    ],
  };
}

function hldIntakeQuestionnaireDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id: HLD_INTAKE_QUESTIONNAIRE_ID,
      projectId: PROJECT_ID,
      type: "hld_intake_questionnaire",
      status: "needs_review",
      version: 2,
      sourceArtifactIds: ["art-req-1"],
    },
    questionnaire: {
      payloadKind: "rfp_hld_intake_questionnaire",
      createdBy: "user-1",
      createdAt: "2026-06-20T09:00:00.000Z",
      sourceArtifactIds: ["art-req-1"],
      questions: [
        {
          questionId: "q-1",
          order: 1,
          domain: "campus_switching",
          questionText: "What is the access-layer footprint per site?",
          whyAsked: "Sizes the campus access design.",
          answerType: "free_text",
          required: true,
          sourceRefIds: ["art-req-1"],
        },
        {
          questionId: "q-2",
          order: 2,
          domain: "routing_wan",
          questionText: "What WAN bandwidth is required per branch?",
          whyAsked: "Sizes the WAN edge.",
          answerType: "free_text",
          required: false,
          sourceRefIds: ["art-req-1"],
        },
        {
          questionId: "q-3",
          order: 3,
          domain: "security",
          questionText: "Which segmentation model applies?",
          whyAsked: "Sizes the security zoning.",
          answerType: "single_select",
          required: true,
          sourceRefIds: ["art-req-1"],
          allowedOptions: ["Flat", "Zoned"],
        },
      ],
      validation: { status: "passed", findingCount: 0 },
    },
  };
}

function hldKnowledgePackListItem(
  id = HLD_KNOWLEDGE_PACK_ARTIFACT_ID,
  status = "needs_review",
  version = 2,
  domain = "security"
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    type: "design_knowledge_pack",
    status,
    version,
    payloadSummary: {
      payloadKind: "rfp_hld_design_knowledge_pack",
      source: "manual_operator_entry",
      createdBy: "user-1",
      createdAt: "2026-06-20T09:00:00.000Z",
      domain,
      title: `${domain === "security" ? "Security" : "Campus"} design guidance`,
      entryCount: 3,
      sectionCounts: {
        designPrinciples: 1,
        topologyGuidance: 1,
        constraints: 1,
        assumptions: 0,
        exclusions: 0,
        validationNotes: 0,
      },
    },
  };
}

function hldKnowledgePackListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 2,
    artifacts: [
      // The needs_review (v2) revision and the approved (v1) baseline both cover
      // "security" -- a claimed domain that readiness reports as covered. This
      // keeps both a current and an approved pack visible without contradicting
      // the readiness fixture, which reports campus_switching as still missing
      // (no approved pack) until the create-flow test posts a draft for it.
      hldKnowledgePackListItem(HLD_KNOWLEDGE_PACK_ARTIFACT_ID, "needs_review", 2, "security"),
      hldKnowledgePackListItem(HLD_KNOWLEDGE_PACK_APPROVED_ID, "approved", 1, "security"),
    ],
  };
}

function hldKnowledgePackDetailResponse(
  id = HLD_KNOWLEDGE_PACK_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id,
      projectId: PROJECT_ID,
      type: "design_knowledge_pack",
      status,
      version: 2,
      sourceArtifactIds: [],
    },
    pack: {
      payloadKind: "rfp_hld_design_knowledge_pack",
      source: "manual_operator_entry",
      createdBy: "user-1",
      createdAt: "2026-06-20T09:00:00.000Z",
      domain: "security",
      title: "Security design guidance",
      designPrinciples: ["HLD-PACK-PRINCIPLE-CANARY"],
      topologyGuidance: ["HLD-PACK-TOPOLOGY-CANARY"],
      constraints: ["HLD-PACK-CONSTRAINT-CANARY"],
      assumptions: [],
      exclusions: [],
      validationNotes: [],
      entryCount: 3,
    },
  };
}

function sourceBundleListItem(
  id = HLD_SOURCE_BUNDLE_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status,
    version,
    createdAt: "2026-06-21T09:00:00.000Z",
    updatedAt: "2026-06-21T09:05:00.000Z",
    payloadSummary: {
      payloadKind: "rfp_hld_source_bundle",
      createdBy: "user-1",
      createdAt: "2026-06-21T09:00:00.000Z",
      sourceArtifactCount: 7,
      designKnowledgePackCount: 1,
      coveredDomainCount: 1,
      missingDomainCount: 0,
      excludedDomainCount: 1,
      assumptionCount: 1,
      constraintCount: 1,
      warningCount: 0,
      blockerCount: 0,
    },
  };
}

const SOURCE_BUNDLE_READY_READINESS = {
  status: "ready",
  summary: {
    compiledFromReadinessSnapshotArtifactId: "hrs-1",
    sourceArtifactCount: 7,
    designKnowledgePackCount: 1,
    coveredDomainCount: 1,
    missingDomainCount: 0,
    excludedDomainCount: 1,
    assumptionCount: 1,
    constraintCount: 1,
    warningCount: 0,
    blockerCount: 0,
  },
};

const SOURCE_BUNDLE_BLOCKED_READINESS = {
  status: "blocked",
  code: "hld_readiness_not_ready",
  messages: [
    "HLD-SOURCE-BUNDLE-BLOCKER-CANARY An approved HLD readiness snapshot is required.",
  ],
};

function sourceBundleListReady(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [sourceBundleListItem()],
    sourceBundleReadiness: SOURCE_BUNDLE_READY_READINESS,
  };
}

function sourceBundleListBlocked(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 0,
    artifacts: [],
    sourceBundleReadiness: SOURCE_BUNDLE_BLOCKED_READINESS,
  };
}

function sourceBundleDetailResponse(
  id = HLD_SOURCE_BUNDLE_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_source_bundle",
      status,
      version: 1,
      createdAt: "2026-06-21T09:00:00.000Z",
      updatedAt: "2026-06-21T09:05:00.000Z",
    },
    sourceBundle: {
      payloadKind: "rfp_hld_source_bundle",
      createdBy: "user-1",
      createdAt: "2026-06-21T09:00:00.000Z",
      sourceArtifactIds: [
        "evp-1",
        "req-1",
        "cmx-1",
        "cfg-1",
        "intake-1",
        "hrs-1",
        "pack-1",
      ],
      lineage: {
        compiledFromReadinessSnapshotArtifactId: "hrs-1",
        compiledArtifactIds: [
          "evp-1",
          "req-1",
          "cmx-1",
          "cfg-1",
          "intake-1",
          "hrs-1",
          "pack-1",
        ],
      },
      authorities: {
        evidencePackage: {
          artifactId: "evp-1",
          artifactType: "evidence_package",
          stageId: "intake_package_review",
          status: "approved",
          version: 2,
        },
        requirementsBaseline: {
          artifactId: "req-1",
          artifactType: "requirements_baseline",
          stageId: "requirements_baseline_review",
          status: "approved",
          version: 1,
        },
        complianceMatrix: {
          artifactId: "cmx-1",
          artifactType: "compliance_matrix",
          stageId: "compliance_matrix_review",
          status: "approved",
          version: 1,
        },
        configurationAuthority: {
          artifactId: "cfg-1",
          artifactType: "configuration_expansion",
          stageId: "configuration_expansion_review",
          status: "approved",
          version: 1,
          sourceKind: "configuration_expansion",
        },
        hldIntake: {
          artifactId: "intake-1",
          artifactType: "hld_intake",
          stageId: "hld_design_delta_review",
          status: "approved",
          version: 1,
        },
        hldReadinessSnapshot: {
          artifactId: "hrs-1",
          artifactType: "hld_readiness_snapshot",
          stageId: "hld_design_delta_review",
          status: "approved",
          version: 1,
          payloadKind: "rfp_hld_readiness_snapshot",
        },
      },
      designKnowledgePackRefs: [
        {
          artifactId: "pack-1",
          artifactType: "design_knowledge_pack",
          stageId: "hld_design_delta_review",
          status: "approved",
          version: 1,
          payloadKind: "rfp_hld_design_knowledge_pack",
          domain: "campus_switching",
        },
      ],
      coveredDomains: ["campus_switching"],
      missingDomains: [],
      excludedDomains: ["service_only"],
      assumptions: [
        {
          id: "asm-1",
          statement:
            "SOURCE-BUNDLE-ASSUMPTION-CANARY redundant power feeds are present.",
        },
      ],
      constraints: [
        {
          id: "con-1",
          statement: "SOURCE-BUNDLE-CONSTRAINT-CANARY two-rack footprint.",
        },
      ],
      warnings: [
        {
          id: "warn-1",
          code: "SOURCE_BUNDLE_WARNING_CODE",
          message: "SOURCE-BUNDLE-WARNING-CANARY excluded domain not covered.",
          severity: "warning",
        },
      ],
      blockers: [],
      validation: { status: "passed", checkedAt: "2026-06-21T09:00:00.000Z" },
    },
  };
}

function designModelListItem(
  id = HLD_DESIGN_MODEL_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status,
    version,
    createdAt: "2026-06-22T09:00:00.000Z",
    updatedAt: "2026-06-22T09:05:00.000Z",
    payloadSummary: {
      payloadKind: "rfp_hld_design_model",
      createdBy: "user-1",
      createdAt: "2026-06-22T09:00:00.000Z",
      sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      sourceBundleVersion: 3,
      sourceArtifactCount: 7,
      coveredDomainCount: 1,
      excludedDomainCount: 1,
      sourceReferenceCount: 3,
      designSectionCount: 1,
      topologyNodeCount: 2,
      topologyLinkCount: 1,
      topologyZoneCount: 1,
      diagramIntentCount: 1,
      validationFindingCount: 1,
    },
  };
}

const DESIGN_MODEL_READY_READINESS = {
  status: "ready",
  sourceBundle: {
    artifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
    version: 3,
    status: "approved",
    sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "intake-1", "hrs-1", "pack-1"],
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
  },
  expectedSource: {
    sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
    sourceBundleVersion: 3,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "intake-1", "hrs-1", "pack-1"],
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
  },
};

const DESIGN_MODEL_BLOCKED_READINESS = {
  status: "blocked",
  blockedCode: "latest_source_bundle_not_approved",
  messages: [
    "DESIGN-MODEL-BLOCKER-CANARY An approved HLD source bundle is required.",
  ],
};

function designModelListReady(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [designModelListItem()],
    designModelReadiness: DESIGN_MODEL_READY_READINESS,
  };
}

function designModelListBlocked(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 0,
    artifacts: [],
    designModelReadiness: DESIGN_MODEL_BLOCKED_READINESS,
  };
}

function designModelDetailResponse(
  id = HLD_DESIGN_MODEL_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_design_model",
      status,
      version: 1,
      createdAt: "2026-06-22T09:00:00.000Z",
      updatedAt: "2026-06-22T09:05:00.000Z",
    },
    designModel: {
      payloadKind: "rfp_hld_design_model",
      createdBy: "user-1",
      createdAt: "2026-06-22T09:00:00.000Z",
      sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "intake-1", "hrs-1", "pack-1"],
      sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      sourceBundleVersion: 3,
      sourceBundlePayloadKind: "rfp_hld_source_bundle",
      coveredDomains: ["campus_switching"],
      excludedDomains: ["service_only"],
      sourceReferences: [
        {
          id: "src-bundle-ref",
          kind: "source_bundle",
          artifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
          label: "Approved HLD source bundle",
        },
        {
          id: "authority-ref",
          kind: "requirements_baseline",
          artifactId: "req-1",
          label: "Requirements baseline",
        },
        {
          id: "pack-ref",
          kind: "design_knowledge_pack",
          artifactId: "pack-1",
          domain: "campus_switching",
        },
      ],
      assumptionRefs: [{ refId: "asm-1" }],
      constraintRefs: [{ refId: "con-1" }],
      designSections: [
        {
          id: "ds-1",
          domain: "campus_switching",
          title: "DESIGN-SECTION-CANARY core distribution layer",
          sourceRefIds: ["src-bundle-ref", "pack-ref"],
          decisions: [
            {
              id: "dec-1",
              label: "DESIGN-DECISION-CANARY dual-supervisor redundancy",
              sourceRefIds: ["authority-ref"],
            },
          ],
        },
      ],
      topology: {
        nodes: [
          {
            id: "node-1",
            label: "TOPOLOGY-NODE-CANARY core switch",
            nodeType: "core_switch",
            domain: "campus_switching",
            sourceRefIds: ["src-bundle-ref"],
          },
          {
            id: "node-2",
            label: "access switch",
            nodeType: "access_switch",
            sourceRefIds: ["src-bundle-ref"],
          },
        ],
        links: [
          {
            id: "link-1",
            label: "TOPOLOGY-LINK-CANARY uplink",
            fromNodeId: "node-1",
            toNodeId: "node-2",
            linkType: "ethernet",
            sourceRefIds: ["src-bundle-ref"],
          },
        ],
        zones: [
          {
            id: "zone-1",
            label: "TOPOLOGY-ZONE-CANARY campus core",
            domain: "campus_switching",
            nodeIds: ["node-1", "node-2"],
            sourceRefIds: ["src-bundle-ref"],
          },
        ],
      },
      diagramIntents: [
        {
          id: "di-1",
          title: "DIAGRAM-INTENT-CANARY logical topology",
          intentType: "logical_topology",
          sourceRefIds: ["src-bundle-ref"],
        },
      ],
      traceability: {
        requirementRefs: [{ refId: "req-ref-1" }],
        complianceRefs: [{ refId: "cmp-ref-1" }],
        configurationRefs: [{ refId: "cfg-ref-1" }],
        sourceBundleRefs: [{ refId: "src-bundle-ref" }],
      },
      validationFindings: [
        {
          id: "vf-1",
          severity: "warning",
          code: "DESIGN_MODEL_FINDING_CODE",
          message: "VALIDATION-FINDING-CANARY excluded domain not modeled.",
          sourceRefIds: ["src-bundle-ref"],
        },
      ],
      engineerReview: {
        status: "changes_requested",
        requiredActions: ["REVIEW-ACTION-CANARY confirm core topology."],
      },
    },
  };
}

// ---- advisory deterministic design-model review fixtures -------------------

function designModelReviewListItem(
  id = HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID,
  status = "generated",
  version = 1
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status,
    version,
    createdAt: "2026-06-23T09:00:00.000Z",
    updatedAt: "2026-06-23T09:05:00.000Z",
    payloadSummary: {
      payloadKind: "rfp_hld_design_model_review",
      reviewedAt: "2026-06-23T09:00:00.000Z",
      reviewerType: "deterministic",
      sourceHldDesignModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      findingCount: 1,
      findingCountsBySeverity: { blocking: 0, warning: 1, suggestion: 0 },
      recommendation: "rebuild_recommended",
      hasBoundedRebuildInstructions: true,
    },
  };
}

function designModelReviewListEmpty(): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 0, artifacts: [] };
}

function designModelReviewListReady(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [designModelReviewListItem()],
  };
}

function designModelReviewCreateResponse(): Record<string, unknown> {
  return {
    artifact: {
      id: HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID,
      status: "generated",
      version: 1,
    },
    recommendation: "rebuild_recommended",
    findingCount: 1,
    findingCountsBySeverity: { blocking: 0, warning: 1, suggestion: 0 },
  };
}

function designModelReviewDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: {
      id: HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID,
      status: "generated",
      version: 1,
    },
    review: {
      payloadKind: "rfp_hld_design_model_review",
      sourceArtifactIds: [
        HLD_DESIGN_MODEL_ARTIFACT_ID,
        HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      ],
      sourceHldDesignModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      reviewedAt: "2026-06-23T09:00:00.000Z",
      reviewer: { type: "deterministic", label: "Deterministic reviewer" },
      sourceReferences: [
        {
          id: "rev-model-ref-1",
          artifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
          domain: "campus_switching",
        },
        {
          id: "rev-bundle-ref-1",
          artifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
        },
      ],
      findings: [
        {
          id: "rf-1",
          severity: "warning",
          category: "scope_gap",
          message: "REVIEW-FINDING-CANARY excluded domain not modeled.",
          sourceReferenceIds: ["rev-model-ref-1"],
          recommendedAction: "REVIEW-RECOMMENDED-ACTION-CANARY confirm scope.",
        },
      ],
      recommendation: "rebuild_recommended",
      boundedRebuildInstructions: {
        summary: "REVIEW-REBUILD-SUMMARY-CANARY redraft the affected narrative.",
        instructions:
          "REVIEW-REBUILD-INSTRUCTIONS-CANARY restate the affected section from the same approved inputs.",
        maxAttempts: 1,
      },
    },
  };
}

// Advisory review detail that does NOT justify a bounded rebuild: no blocking
// finding and an approve-leaning recommendation. Same review/model ids so the
// detail still matches the open model draft and current advisory review.
function designModelReviewDetailNonJustifying(): Record<string, unknown> {
  const base = designModelReviewDetailResponse();
  const review = base.review as Record<string, unknown>;
  return {
    ...base,
    review: {
      ...review,
      findings: [
        {
          id: "rf-1",
          severity: "suggestion",
          category: "style",
          message: "REVIEW-FINDING-CANARY optional clarity improvement.",
          sourceReferenceIds: ["rev-model-ref-1"],
        },
      ],
      recommendation: "approve_recommended",
      boundedRebuildInstructions: undefined,
    },
  };
}

// ---- generation-readiness fixtures (Stage 6F) ------------------------------

function hldGenerationReadinessReady(): Record<string, unknown> {
  return {
    project: projectContext(),
    status: "ready",
    ready: true,
    approvedModel: {
      id: HLD_DESIGN_MODEL_ARTIFACT_ID,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_design_model",
      status: "approved",
      version: 2,
      createdAt: "2026-06-24T09:00:00.000Z",
      updatedAt: "2026-06-24T09:05:00.000Z",
      sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      sourceBundleVersion: 3,
      coveredDomainCount: 1,
      excludedDomainCount: 1,
      designSectionCount: 1,
      topologyNodeCount: 2,
      topologyLinkCount: 1,
      diagramIntentCount: 1,
    },
    sourceBundle: {
      id: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_source_bundle",
      status: "approved",
      version: 3,
      createdAt: "2026-06-21T09:00:00.000Z",
      updatedAt: "2026-06-21T09:05:00.000Z",
      sourceArtifactCount: 7,
      coveredDomainCount: 1,
      excludedDomainCount: 1,
      designKnowledgePackCount: 1,
      assumptionCount: 1,
      warningCount: 0,
      blockerCount: 0,
    },
    review: {
      id: HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_design_model_review",
      status: "approved",
      version: 1,
      createdAt: "2026-06-24T10:00:00.000Z",
      updatedAt: "2026-06-24T10:05:00.000Z",
      reviewedAt: "2026-06-24T10:00:00.000Z",
      reviewerType: "deterministic",
      sourceHldDesignModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceHldSourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      recommendation: "approve_recommended",
      findingCount: 0,
      findingCounts: { blocking: 0, warning: 0, suggestion: 0 },
    },
    blockers: [],
    warnings: [],
    nextAction: "Approved HLD design model is ready for future HLD generation.",
    technicalAudit: {
      approvedModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      reviewArtifactId: HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID,
      approvedModelSourceArtifactIds: [HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID],
      sourceBundleSourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "intake-1", "hrs-1", "pack-1"],
      reviewSourceArtifactIds: [HLD_DESIGN_MODEL_ARTIFACT_ID, HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID],
    },
  };
}

function hldGenerationReadinessBlocked(): Record<string, unknown> {
  const ready = hldGenerationReadinessReady();
  return {
    ...ready,
    status: "blocked",
    ready: false,
    review: undefined,
    blockers: [
      {
        code: "matching_review_missing",
        message:
          "GENERATION-READINESS-BLOCKER-CANARY No current deterministic advisory review exists for the approved model.",
        details: ["GENERATION-READINESS-DETAIL-CANARY review artifact not current."],
      },
    ],
    nextAction:
      "GENERATION-READINESS-NEXT-ACTION-CANARY Run a fresh deterministic HLD design-model review for the approved model.",
    technicalAudit: {
      approvedModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceBundleArtifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      approvedModelSourceArtifactIds: [HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID],
      sourceBundleSourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "intake-1", "hrs-1", "pack-1"],
    },
  };
}
// ---- HLD diagram draft fixtures (Stage 6G-A) -------------------------------

const HLD_DIAGRAM_SOURCE_BUNDLE_ID = "art-hld-source-bundle-approved-1";
const HLD_DIAGRAM_REVIEW_ID = "art-hld-design-model-review-1";

function hldDiagramListItem(
  id = HLD_DIAGRAM_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    id,
    status,
    version,
    payloadSummary: {
      payloadKind: "rfp_hld_diagram_draft",
      diagramType: "topology",
      title: "HLD-DIAGRAM-TITLE-CANARY topology overview",
      nodeCount: 2,
      linkCount: 1,
      zoneCount: 1,
      sourceReferenceCount: 1,
      validationFindingCount: 1,
      sourceHldDesignModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceHldSourceBundleArtifactId: HLD_DIAGRAM_SOURCE_BUNDLE_ID,
      sourceReviewArtifactId: HLD_DIAGRAM_REVIEW_ID,
      sourceModelVersion: 2,
    },
  };
}

function hldDiagramListEmpty(): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 0, artifacts: [] };
}

function hldDiagramListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [hldDiagramListItem()],
  };
}

function hldDiagramDetailResponse(
  id = HLD_DIAGRAM_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: { id, status, version: 1 },
    diagram: {
      payloadKind: "rfp_hld_diagram_draft",
      createdAt: "2026-06-24T11:00:00.000Z",
      createdBy: "engineer-1",
      sourceArtifactIds: [
        HLD_DESIGN_MODEL_ARTIFACT_ID,
        HLD_DIAGRAM_SOURCE_BUNDLE_ID,
        HLD_DIAGRAM_REVIEW_ID,
      ],
      sourceHldDesignModelArtifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
      sourceHldSourceBundleArtifactId: HLD_DIAGRAM_SOURCE_BUNDLE_ID,
      sourceReviewArtifactId: HLD_DIAGRAM_REVIEW_ID,
      sourceModelVersion: 2,
      diagramType: "topology",
      title: "HLD-DIAGRAM-TITLE-CANARY topology overview",
      nodes: [
        {
          id: "node-core-1",
          label: "HLD-DIAGRAM-NODE-CORE-CANARY",
          nodeType: "core_switch",
          domain: "campus_switching",
          zoneId: "zone-core-1",
          sourceRefIds: ["ref-1"],
        },
        {
          id: "node-access-1",
          label: "HLD-DIAGRAM-NODE-ACCESS-CANARY",
          nodeType: "access_switch",
          domain: "campus_switching",
          zoneId: "zone-core-1",
          sourceRefIds: ["ref-1"],
        },
      ],
      links: [
        {
          id: "link-uplink-1",
          label: "HLD-DIAGRAM-LINK-CANARY",
          fromNodeId: "node-core-1",
          toNodeId: "node-access-1",
          linkType: "uplink",
          sourceRefIds: ["ref-1"],
        },
      ],
      zones: [
        {
          id: "zone-core-1",
          label: "HLD-DIAGRAM-ZONE-CANARY",
          nodeIds: ["node-core-1", "node-access-1"],
          sourceRefIds: ["ref-1"],
        },
      ],
      sourceReferences: [
        {
          id: "ref-1",
          artifactId: HLD_DESIGN_MODEL_ARTIFACT_ID,
          artifactType: "hld_design_model",
          label: "Approved design model topology",
        },
      ],
      validationFindings: [
        {
          id: "finding-1",
          severity: "warning",
          code: "diagram_zone_unlabeled",
          message: "HLD-DIAGRAM-FINDING-CANARY zone label is terse.",
          sourceRefIds: ["ref-1"],
        },
      ],
    },
  };
}

// ---- Stage 6H-A HLD document model fixtures --------------------------------

const HLD_DOC_MODEL_SOURCE_BUNDLE_ID = "art-hld-source-bundle-approved-1";
const HLD_DOC_MODEL_DESIGN_MODEL_ID = "art-hld-design-model-approved-1";
const HLD_DOC_MODEL_DIAGRAM_ID = "art-hld-diagram-approved-1";

function hldDocumentModelListItem(
  id = HLD_DOCUMENT_MODEL_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    id,
    status,
    version,
    payloadSummary: {
      payloadKind: "rfp_hld_document_model",
      title: "HLD-DOCMODEL-TITLE-CANARY network design model",
      coveredDomainCount: 2,
      excludedDomainCount: 1,
      assumptionCount: 1,
      designSummaryCount: 1,
      topologySummaryCount: 1,
      siteOrScopeSummaryCount: 1,
      implementationNoteCount: 1,
      dependencyCount: 1,
      riskCount: 1,
      complianceTraceCount: 1,
      boqTraceCount: 1,
      diagramReferenceCount: 1,
      validationFindingCount: 1,
      sourceHldSourceBundleArtifactId: HLD_DOC_MODEL_SOURCE_BUNDLE_ID,
      sourceHldDesignModelArtifactId: HLD_DOC_MODEL_DESIGN_MODEL_ID,
      sourceHldDiagramArtifactId: HLD_DOC_MODEL_DIAGRAM_ID,
      sourceModelVersion: 2,
      sourceDiagramVersion: 3,
    },
  };
}

function hldDocumentModelListEmpty(): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 0, artifacts: [] };
}

function hldDocumentModelListResponse(
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [
      hldDocumentModelListItem(HLD_DOCUMENT_MODEL_ARTIFACT_ID, status),
    ],
  };
}

function hldDocumentModelDetailResponse(
  id = HLD_DOCUMENT_MODEL_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: { id, status, version: 1 },
    documentModel: {
      payloadKind: "rfp_hld_document_model",
      createdAt: "2026-06-25T09:00:00.000Z",
      createdBy: "engineer-1",
      sourceArtifactIds: [
        HLD_DOC_MODEL_SOURCE_BUNDLE_ID,
        HLD_DOC_MODEL_DESIGN_MODEL_ID,
        HLD_DOC_MODEL_DIAGRAM_ID,
      ],
      sourceHldSourceBundleArtifactId: HLD_DOC_MODEL_SOURCE_BUNDLE_ID,
      sourceHldDesignModelArtifactId: HLD_DOC_MODEL_DESIGN_MODEL_ID,
      sourceHldDiagramArtifactId: HLD_DOC_MODEL_DIAGRAM_ID,
      sourceModelVersion: 2,
      sourceDiagramVersion: 3,
      title: "HLD-DOCMODEL-TITLE-CANARY network design model",
      documentPurpose: "HLD-DOCMODEL-PURPOSE-CANARY structured engineer spine.",
      coveredDomains: ["campus_switching", "data_center"],
      excludedDomains: ["wireless"],
      assumptions: [
        {
          id: "assume-1",
          text: "HLD-DOCMODEL-ASSUMPTION-CANARY existing power is sufficient.",
          sourceRefIds: [HLD_DOC_MODEL_DESIGN_MODEL_ID],
        },
      ],
      designSummary: [
        {
          id: "design-1",
          title: "HLD-DOCMODEL-DESIGN-SECTION-CANARY core layer",
          items: [
            {
              id: "design-item-1",
              text: "HLD-DOCMODEL-DESIGN-ITEM-CANARY redundant core pair.",
              sourceRefIds: [HLD_DOC_MODEL_DESIGN_MODEL_ID],
            },
          ],
          sourceRefIds: [HLD_DOC_MODEL_DESIGN_MODEL_ID],
        },
      ],
      topologySummary: [
        {
          id: "topo-1",
          title: "HLD-DOCMODEL-TOPOLOGY-CANARY spine and leaf",
          items: [],
          sourceRefIds: [HLD_DOC_MODEL_DIAGRAM_ID],
        },
      ],
      siteOrScopeSummary: [
        {
          id: "site-1",
          title: "HLD-DOCMODEL-SITE-CANARY Riyadh DC",
          items: [],
          sourceRefIds: [HLD_DOC_MODEL_SOURCE_BUNDLE_ID],
        },
      ],
      implementationNotes: [
        {
          id: "impl-1",
          text: "HLD-DOCMODEL-IMPL-CANARY staged cutover.",
          sourceRefIds: [HLD_DOC_MODEL_DESIGN_MODEL_ID],
        },
      ],
      dependencies: [
        {
          id: "dep-1",
          text: "HLD-DOCMODEL-DEP-CANARY upstream WAN handoff.",
          sourceRefIds: [HLD_DOC_MODEL_SOURCE_BUNDLE_ID],
        },
      ],
      risksAndCaveats: [
        {
          id: "risk-1",
          text: "HLD-DOCMODEL-RISK-CANARY lead time on optics.",
          sourceRefIds: [HLD_DOC_MODEL_DESIGN_MODEL_ID],
        },
      ],
      complianceTraceSummary: [
        {
          id: "comp-1",
          label: "HLD-DOCMODEL-COMPLIANCE-CANARY mandatory clauses",
          referencedCount: 4,
          sourceRefIds: [HLD_DOC_MODEL_SOURCE_BUNDLE_ID],
        },
      ],
      boqTraceSummary: [
        {
          id: "boq-1",
          label: "HLD-DOCMODEL-BOQ-CANARY priced lines",
          referencedCount: 7,
          sourceRefIds: [HLD_DOC_MODEL_SOURCE_BUNDLE_ID],
        },
      ],
      diagramReferences: [
        {
          id: "dref-1",
          diagramArtifactId: HLD_DOC_MODEL_DIAGRAM_ID,
          diagramTitle: "HLD-DOCMODEL-DIAGRAM-REF-CANARY topology overview",
          diagramType: "topology",
          sourceRefIds: [HLD_DOC_MODEL_DIAGRAM_ID],
        },
      ],
      validationFindings: [
        {
          id: "finding-1",
          severity: "warning",
          code: "document_model_terse_section",
          message: "HLD-DOCMODEL-FINDING-CANARY topology section is terse.",
          sourceRefIds: [HLD_DOC_MODEL_DESIGN_MODEL_ID],
        },
      ],
    },
  };
}

// ---- Stage 6I-C HLD diagram output fixtures --------------------------------

const HLD_DIAGRAM_OUTPUT_SOURCE_DIAGRAM_ID = "art-hld-diagram-approved-out-1";

function hldDiagramOutputListItem(
  id = HLD_DIAGRAM_OUTPUT_ARTIFACT_ID,
  status = "needs_review",
  version = 1
): Record<string, unknown> {
  return {
    id,
    status,
    version,
    payloadSummary: {
      payloadKind: "rfp_hld_diagram_output",
      outputFormat: "layout_projection",
      diagramType: "topology",
      title: "HLD-OUTPUT-TITLE-CANARY topology layout",
      nodeCount: 2,
      linkCount: 1,
      zoneCount: 1,
      validationFindingCount: 1,
      sourceHldDiagramArtifactId: HLD_DIAGRAM_OUTPUT_SOURCE_DIAGRAM_ID,
      sourceDiagramVersion: 4,
      canvasWidth: 1280,
      canvasHeight: 720,
    },
  };
}

function hldDiagramOutputListEmpty(): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 0, artifacts: [] };
}

function hldDiagramOutputListResponse(
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [hldDiagramOutputListItem(HLD_DIAGRAM_OUTPUT_ARTIFACT_ID, status)],
  };
}

function hldDiagramOutputDetailResponse(
  id = HLD_DIAGRAM_OUTPUT_ARTIFACT_ID,
  status = "needs_review"
): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: { id, status, version: 1 },
    diagramOutput: {
      payloadKind: "rfp_hld_diagram_output",
      createdAt: "2026-06-26T11:00:00.000Z",
      createdBy: "engineer-1",
      sourceArtifactIds: [HLD_DIAGRAM_OUTPUT_SOURCE_DIAGRAM_ID],
      sourceHldDiagramArtifactId: HLD_DIAGRAM_OUTPUT_SOURCE_DIAGRAM_ID,
      sourceDiagramVersion: 4,
      outputFormat: "layout_projection",
      diagramType: "topology",
      title: "HLD-OUTPUT-TITLE-CANARY topology layout",
      canvas: { width: 1280, height: 720, gridSize: 10 },
      zones: [
        {
          id: "zone-out-core-1",
          label: "HLD-OUTPUT-ZONE-CANARY",
          geometry: { x: 0, y: 0, width: 400, height: 300 },
          sourceRefIds: ["ref-1"],
        },
      ],
      nodes: [
        {
          id: "node-out-core-1",
          label: "HLD-OUTPUT-NODE-CORE-CANARY",
          zoneId: "zone-out-core-1",
          geometry: { x: 40, y: 40, width: 80, height: 40 },
          sourceRefIds: ["ref-1"],
        },
        {
          id: "node-out-access-1",
          label: "HLD-OUTPUT-NODE-ACCESS-CANARY",
          zoneId: "zone-out-core-1",
          geometry: { x: 200, y: 40, width: 80, height: 40 },
          sourceRefIds: ["ref-1"],
        },
      ],
      links: [
        {
          id: "link-out-uplink-1",
          sourceNodeId: "node-out-core-1",
          targetNodeId: "node-out-access-1",
          label: "HLD-OUTPUT-LINK-CANARY",
          sourceRefIds: ["ref-1"],
        },
      ],
      validationFindings: [
        {
          id: "finding-out-1",
          severity: "warning",
          code: "output_zone_overlap",
          message: "HLD-OUTPUT-FINDING-CANARY zones sit close together.",
          sourceRefIds: ["ref-1"],
        },
      ],
    },
  };
}

// ---- bounded design-model rebuild-request fixtures (Stage 6E-C) ------------

function designModelRebuildRequestListItem(
  id = HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID,
  status = "generated",
  version = 1,
  sourceHldDesignModelArtifactId = HLD_DESIGN_MODEL_ARTIFACT_ID,
  sourceReviewArtifactId = HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID
): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_rebuild_request",
    status,
    version,
    sourceFileIds: [],
    sourceArtifactIds: [sourceHldDesignModelArtifactId, sourceReviewArtifactId],
    createdAt: "2026-06-23T10:00:00.000Z",
    updatedAt: "2026-06-23T10:00:00.000Z",
    payloadSummary: {
      payloadKind: "rfp_hld_design_model_rebuild_request",
      sourceHldDesignModelArtifactId,
      sourceReviewArtifactId,
      requestedAt: "2026-06-23T10:00:00.000Z",
      status: "active",
    },
  };
}

function designModelRebuildRequestListEmpty(): Record<string, unknown> {
  return { project: projectContext(), artifactCount: 0, artifacts: [] };
}

function designModelRebuildRequestListReady(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [designModelRebuildRequestListItem()],
  };
}

// Lean execute ok-response: a fresh candidate hld_design_model (needs_review)
// plus consumed-request/source-bundle/payload summaries; no payload body.
function designModelRebuildExecuteResponse(): Record<string, unknown> {
  return {
    artifact: {
      id: HLD_DESIGN_MODEL_REBUILT_ARTIFACT_ID,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_design_model",
      status: "needs_review",
      version: 2,
      sourceFileIds: [],
      sourceArtifactIds: [HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID],
      createdAt: "2026-06-24T09:00:00.000Z",
      updatedAt: "2026-06-24T09:00:00.000Z",
    },
    consumedRequest: {
      id: HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID,
      status: "consumed",
      version: 1,
    },
    sourceBundle: {
      artifactId: HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID,
      version: 3,
    },
    payloadSummary: {
      payloadKind: "rfp_hld_design_model",
      sourceBundleVersion: 3,
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
      if (url === HLD_READINESS_LIST_URL) return jsonResponse(hldReadinessListBlocked());
      if (url === HLD_READINESS_DETAIL_URL) return jsonResponse(hldReadinessSnapshotDetail());
      if (url === HLD_READINESS_APPROVED_DETAIL_URL) {
        return jsonResponse(hldReadinessSnapshotDetail(HLD_READINESS_APPROVED_ID, "approved"));
      }
      if (url === HLD_INTAKE_REVIEW_URL) return jsonResponse({ artifactStatus: "approved" });
      if (url === HLD_INTAKE_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse({ artifact: hldIntakeListItem() }, 201);
        }
        return jsonResponse(hldIntakeListResponse());
      }
      if (url === HLD_INTAKE_DETAIL_URL) return jsonResponse(hldIntakeDetailResponse());
      if (url === HLD_INTAKE_QUESTIONNAIRE_ASSISTED_URL) {
        return jsonResponse({ artifact: hldIntakeListItem() }, 201);
      }
      if (url === HLD_INTAKE_QUESTIONNAIRE_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse(
            {
              artifact: hldIntakeQuestionnaireListItem(),
              payloadSummary: {},
            },
            201
          );
        }
        return jsonResponse(hldIntakeQuestionnaireListResponse());
      }
      if (url === HLD_INTAKE_QUESTIONNAIRE_DETAIL_URL) {
        return jsonResponse(hldIntakeQuestionnaireDetailResponse());
      }
      if (url === HLD_KNOWLEDGE_PACK_REVIEW_URL) {
        return jsonResponse({ artifactStatus: "approved" });
      }
      if (url === HLD_KNOWLEDGE_PACK_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse({ artifact: hldKnowledgePackListItem() }, 201);
        }
        return jsonResponse(hldKnowledgePackListResponse());
      }
      if (url === HLD_KNOWLEDGE_PACK_DETAIL_URL) {
        return jsonResponse(hldKnowledgePackDetailResponse());
      }
      if (url === HLD_SOURCE_BUNDLE_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse(
            { artifact: sourceBundleListItem(), payloadSummary: {} },
            201
          );
        }
        return jsonResponse(sourceBundleListBlocked());
      }
      if (url === HLD_SOURCE_BUNDLE_DETAIL_URL) {
        return jsonResponse(sourceBundleDetailResponse());
      }
      if (url === HLD_SOURCE_BUNDLE_REVIEW_URL) {
        return jsonResponse({ artifactStatus: "approved" });
      }
      if (url === HLD_DESIGN_MODEL_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse(
            { artifact: designModelListItem(), sourceBundle: {}, payloadSummary: {} },
            201
          );
        }
        return jsonResponse(designModelListBlocked());
      }
      if (url === HLD_DESIGN_MODEL_DETAIL_URL) {
        return jsonResponse(designModelDetailResponse());
      }
      if (url === HLD_DESIGN_MODEL_REVIEW_URL) {
        return jsonResponse({ artifactStatus: "approved" });
      }
      if (url === HLD_DESIGN_MODEL_REVIEW_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse(designModelReviewCreateResponse(), 201);
        }
        return jsonResponse(designModelReviewListEmpty());
      }
      if (url === HLD_DESIGN_MODEL_REVIEW_DETAIL_URL) {
        return jsonResponse(designModelReviewDetailResponse());
      }
      if (url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL) {
        return jsonResponse(designModelRebuildRequestListEmpty());
      }
      if (url === HLD_DIAGRAM_LIST_URL) {
        return jsonResponse(hldDiagramListEmpty());
      }
      if (url === HLD_DOCUMENT_MODEL_LIST_URL) {
        return jsonResponse(hldDocumentModelListEmpty());
      }
      if (url === HLD_DIAGRAM_OUTPUT_LIST_URL) {
        return jsonResponse(hldDiagramOutputListEmpty());
      }
      if (url === FINAL_HLD_DOCUMENT_STATUS_URL) {
        return jsonResponse({ code: "hld_document_not_final" }, 409);
      }
      if (url === HLD_CLOSE_URL) {
        return jsonResponse({ code: "hld_not_closed" }, 409);
      }
      if (url === TP_HANDOFF_GATE_URL) {
        return jsonResponse(
          { code: "tp_handoff_blocked", gateStatus: "blocked" },
          409
        );
      }
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(hldGenerationReadinessBlocked());
      }
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
    if (url === HLD_READINESS_LIST_URL) return jsonResponse(hldReadinessListBlocked());
    if (url === HLD_GENERATION_READINESS_URL) {
      return jsonResponse(hldGenerationReadinessBlocked());
    }
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

describe("ProjectRfpEvidencePage - Stage 6.5 HLD readiness surface", () => {
  it("shows blocked readiness section with humanized missing inputs from GET", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const section = await screen.findByTestId("hld-readiness-section");
    expect(section).toBeInTheDocument();

    const missingBox = await screen.findByTestId("hld-readiness-missing-inputs");
    expect(missingBox).toHaveTextContent("HLD-MISSING-INPUT-1-CANARY");
    expect(missingBox).toHaveTextContent("HLD-MISSING-INPUT-2-CANARY");
    expect(screen.getByTestId("hld-readiness-status")).toHaveTextContent("Blocked");
  });

  it("does not expose raw HLD snapshot artifact IDs as primary visible text", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-readiness-section");
    expect(document.body.textContent ?? "").not.toContain(HLD_READINESS_SNAPSHOT_ID);
  });

  it("opens drawer with covered domains and validation messages on approved snapshot inspect; source IDs only inside technical details", async () => {
    stubFetch((url) => {
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      if (url === HLD_READINESS_LIST_URL) return jsonResponse(hldReadinessListReady());
      if (url === HLD_READINESS_APPROVED_DETAIL_URL) {
        return jsonResponse(hldReadinessSnapshotDetail(HLD_READINESS_APPROVED_ID, "approved"));
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);

    const inspectBtn = await screen.findByTestId("hld-readiness-snapshot-inspect-approved");
    await act(async () => { fireEvent.click(inspectBtn); });

    const drawer = await screen.findByTestId("review-drawer");
    const domainSection = await screen.findByTestId("hld-readiness-drawer-covered-domains");
    expect(domainSection).toHaveTextContent("HLD-COVERED-DOMAIN-CANARY");
    const validationSection = await screen.findByTestId("hld-readiness-drawer-validation");
    expect(validationSection).toHaveTextContent("HLD-SNAPSHOT-VALIDATION-CANARY");

    // Source artifact IDs must live inside TechnicalDetails (collapsed), not as bare primary text in the drawer.
    const techDetails = drawer.querySelector("[data-testid='hld-readiness-drawer-source-ids']");
    expect(techDetails).not.toBeNull();
    expect(techDetails?.textContent ?? "").toContain(COMPLIANCE_MATRIX_ARTIFACT_ID);
    // The drawer content section must NOT render the source ID as a standalone visible paragraph.
    const drawerContent = await screen.findByTestId("hld-readiness-drawer-content");
    const contentOutsideTech = drawerContent.cloneNode(true) as HTMLElement;
    contentOutsideTech.querySelector("[data-testid='hld-readiness-drawer-source-ids']")?.remove();
    expect(contentOutsideTech.textContent ?? "").not.toContain(COMPLIANCE_MATRIX_ARTIFACT_ID);
  });

  it("HLD generation button is disabled/future-labeled and no POST is made to HLD routes", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-readiness-section");
    const btn = screen.getByTestId("hld-generation-disabled");
    expect(btn).toBeDisabled();
    expect(btn.textContent ?? "").toMatch(/future/i);

    const hldPostRoutes = [
      "/rfp/hld-readiness-snapshot",
      "/rfp/hld-model",
      "/rfp/hld-diagram",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
    ];
    const postCalls = calls.filter(
      (c) => c.init?.method === "POST" && hldPostRoutes.some((r) => c.url.includes(r))
    );
    expect(postCalls).toHaveLength(0);
  });
});

describe("ProjectRfpEvidencePage - Stage 6.2 HLD intake surface", () => {
  function lastBody(calls: FetchCall[], url: string): Record<string, unknown> {
    const matching = calls.filter(
      (c) => c.url === url && c.init?.method === "POST"
    );
    const body = matching[matching.length - 1]?.init?.body;
    return JSON.parse(String(body)) as Record<string, unknown>;
  }

  // Switch every field to unknown so the create guard (answered needs a value)
  // is satisfied; tests then configure only the fields under test.
  function clearAllToUnknown(): void {
    for (const fieldId of HLD_INTAKE_FIELD_IDS) {
      fireEvent.change(screen.getByTestId(`hld-intake-status-${fieldId}`), {
        target: { value: "unknown" },
      });
    }
  }

  it("renders the compact intake panel and creates a draft with answers and an override reason", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-intake-panel");
    expect(panel).toBeInTheDocument();
    // The compact form is a collapsed details, not a giant always-open raw form.
    expect(screen.getByTestId("hld-intake-form").tagName).toBe("DETAILS");

    clearAllToUnknown();
    fireEvent.change(
      screen.getByTestId("hld-intake-status-existing_network_context"),
      { target: { value: "answered" } }
    );
    fireEvent.change(
      screen.getByTestId("hld-intake-value-existing_network_context"),
      { target: { value: "Existing core is a Cisco spine-leaf fabric." } }
    );
    // The manual override reason is required before the create action is enabled.
    expect(
      (screen.getByTestId("hld-intake-create") as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(screen.getByTestId("hld-intake-override-reason"), {
      target: { value: "  Questionnaire not yet available; entered manually.  " },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-intake-create"));
    });

    await waitFor(() => {
      expect(
        calls.some((c) => c.url === HLD_INTAKE_LIST_URL && c.init?.method === "POST")
      ).toBe(true);
    });
    const body = lastBody(calls, HLD_INTAKE_LIST_URL);
    expect(Object.keys(body).sort()).toEqual(["answers", "manualOverrideReason"]);
    const answers = body.answers as Record<string, unknown>[];
    expect(answers).toHaveLength(9);
    // The override reason rides along, trimmed; sourceMode is never caller-set.
    expect(body.manualOverrideReason).toBe(
      "Questionnaire not yet available; entered manually."
    );
    expect(body).not.toHaveProperty("sourceMode");
    // No tenant/project/user/artifact/status-of-artifact field rides along.
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("projectId");
    expect(body).not.toHaveProperty("artifactId");
    expect(body).not.toHaveProperty("status");
  });

  it("sends trimmed values for answered fields, omits value for unknown/not applicable, and notes only when nonblank", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");

    clearAllToUnknown();
    // Answered field: trimmed value and trimmed note.
    fireEvent.change(
      screen.getByTestId("hld-intake-status-target_topology_intent"),
      { target: { value: "answered" } }
    );
    fireEvent.change(
      screen.getByTestId("hld-intake-value-target_topology_intent"),
      { target: { value: "   Collapsed core with redundant aggregation.   " } }
    );
    fireEvent.change(
      screen.getByTestId("hld-intake-notes-target_topology_intent"),
      { target: { value: "  pending customer confirmation  " } }
    );
    // Not-applicable field (no value sent).
    fireEvent.change(screen.getByTestId("hld-intake-status-diagram_notes"), {
      target: { value: "not_applicable" },
    });
    fireEvent.change(screen.getByTestId("hld-intake-override-reason"), {
      target: { value: "Manual override for this bid." },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-intake-create"));
    });

    await waitFor(() => {
      expect(
        calls.some((c) => c.url === HLD_INTAKE_LIST_URL && c.init?.method === "POST")
      ).toBe(true);
    });
    const answers = (lastBody(calls, HLD_INTAKE_LIST_URL).answers ??
      []) as Record<string, unknown>[];
    const byField = new Map(answers.map((a) => [a.fieldId, a]));

    const answered = byField.get("target_topology_intent");
    expect(answered?.status).toBe("answered");
    expect(answered?.value).toBe("Collapsed core with redundant aggregation.");
    expect(answered?.notes).toBe("pending customer confirmation");

    const unknown = byField.get("exclusions");
    expect(unknown?.status).toBe("unknown");
    expect(unknown).not.toHaveProperty("value");
    expect(unknown).not.toHaveProperty("notes");

    const notApplicable = byField.get("diagram_notes");
    expect(notApplicable?.status).toBe("not_applicable");
    expect(notApplicable).not.toHaveProperty("value");
  });

  it("inspects a current intake into the drawer with answers and no raw artifact ID as primary text", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-intake-inspect-current");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("review-drawer");
    const content = await screen.findByTestId("hld-intake-drawer-content");
    expect(content).toHaveTextContent("HLD-INTAKE-ANSWER-CANARY");
    expect(content).toHaveTextContent("HLD-INTAKE-NOTE-CANARY");
    // Source mode and the manual override reason are surfaced in the drawer.
    expect(
      content.querySelector("[data-testid='hld-intake-drawer-source-mode']")
        ?.textContent ?? ""
    ).toContain("manual override");
    expect(
      content.querySelector("[data-testid='hld-intake-drawer-override-reason']")
        ?.textContent ?? ""
    ).toContain("HLD-INTAKE-OVERRIDE-REASON-CANARY");

    // The raw artifact id stays inside the collapsed technical details only.
    const audit = content.querySelector("[data-testid='hld-intake-drawer-audit']");
    expect(audit?.textContent ?? "").toContain(HLD_INTAKE_ARTIFACT_ID);
    const primary = content.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-intake-drawer-audit']")
      ?.remove();
    expect(primary.textContent ?? "").not.toContain(HLD_INTAKE_ARTIFACT_ID);
  });

  it("approves an intake posting only { decision }, refreshes lists, and makes no HLD generation POST", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-intake-inspect-current");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-intake-review");

    const intakeGetsBefore = calls.filter(
      (c) => c.url === HLD_INTAKE_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;
    const readinessGetsBefore = calls.filter(
      (c) => c.url === HLD_READINESS_LIST_URL
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-intake-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some((c) => c.url === HLD_INTAKE_REVIEW_URL && c.init?.method === "POST")
      ).toBe(true);
    });
    const reviewBody = JSON.parse(
      String(
        calls.filter((c) => c.url === HLD_INTAKE_REVIEW_URL).slice(-1)[0]?.init?.body
      )
    ) as Record<string, unknown>;
    expect(Object.keys(reviewBody)).toEqual(["decision"]);
    expect(reviewBody.decision).toBe("approved");

    // Review refreshes both the intake list and the HLD readiness list.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) => c.url === HLD_INTAKE_LIST_URL && (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(intakeGetsBefore);
      expect(
        calls.filter((c) => c.url === HLD_READINESS_LIST_URL).length
      ).toBeGreaterThan(readinessGetsBefore);
    });

    // No HLD generation/model/diagram/document/proposal POST ever happens.
    const generationRoutes = [
      "/rfp/hld-model",
      "/rfp/hld-diagram",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-readiness-snapshot",
    ];
    const generationPosts = calls.filter(
      (c) =>
        c.init?.method === "POST" &&
        generationRoutes.some((r) => c.url.includes(r))
    );
    expect(generationPosts).toHaveLength(0);
  });
});

describe("ProjectRfpEvidencePage - Stage 6H-0E-C questionnaire-assisted HLD intake", () => {
  function lastBody(calls: FetchCall[], url: string): Record<string, unknown> {
    const matching = calls.filter(
      (c) => c.url === url && c.init?.method === "POST"
    );
    const body = matching[matching.length - 1]?.init?.body;
    return JSON.parse(String(body)) as Record<string, unknown>;
  }

  async function loadQuestionnaire(): Promise<void> {
    const use = await screen.findByTestId("hld-intake-questionnaire-use");
    await act(async () => {
      fireEvent.click(use);
    });
    await screen.findByTestId("hld-intake-questionnaire-row-0");
  }

  it("loads a candidate questionnaire, reviews questions, and posts only the three allowed keys", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");

    // The section is a compact collapsed details, not an always-open giant form.
    expect(
      screen.getByTestId("hld-intake-questionnaire-section").tagName
    ).toBe("DETAILS");

    await loadQuestionnaire();

    // Seeded rows: q-1 (0), q-2 (1), q-3/single_select (2).
    // Edit q-1, remove q-2, waive q-3, add a human question, change order, answer.
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-0"), {
      target: { value: "edited" },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-text-0"), {
      target: { value: "  What is the access footprint per building?  " },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-answer-value-0"), {
      target: { value: "  Two closets per building.  " },
    });

    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-1"), {
      target: { value: "removed" },
    });

    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-2"), {
      target: { value: "waived" },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-waiver-2"), {
      target: { value: "Segmentation confirmed out of scope." },
    });

    // Add a human question BEFORE reordering, so its seeded order is max(1,2,3)+1 = 4.
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-intake-questionnaire-add"));
    });
    // The added row is appended as row index 3.
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-text-3"), {
      target: { value: "Any brownfield cabling constraints?" },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-why-3"), {
      target: { value: "Captures installation constraints." },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-answer-value-3"), {
      target: { value: "No brownfield cabling constraints." },
    });

    // Reorder the edited q-1 above the added row (still unique among active orders).
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-order-0"), {
      target: { value: "5" },
    });

    const intakeGetsBefore = calls.filter(
      (c) => c.url === HLD_INTAKE_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;
    const readinessGetsBefore = calls.filter(
      (c) => c.url === HLD_READINESS_LIST_URL
    ).length;
    const generationGetsBefore = calls.filter(
      (c) => c.url === HLD_GENERATION_READINESS_URL
    ).length;

    await waitFor(() => {
      expect(
        (screen.getByTestId("hld-intake-questionnaire-submit") as HTMLButtonElement)
          .disabled
      ).toBe(false);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-intake-questionnaire-submit"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_INTAKE_QUESTIONNAIRE_ASSISTED_URL &&
            c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const body = lastBody(calls, HLD_INTAKE_QUESTIONNAIRE_ASSISTED_URL);
    expect(Object.keys(body).sort()).toEqual([
      "answers",
      "reviewedQuestions",
      "sourceQuestionnaireArtifactId",
    ]);
    expect(body.sourceQuestionnaireArtifactId).toBe(HLD_INTAKE_QUESTIONNAIRE_ID);

    const reviewed = body.reviewedQuestions as Record<string, unknown>[];
    expect(reviewed.map((r) => r.action)).toEqual([
      "edited",
      "removed",
      "waived",
      "added",
    ]);
    // Edited row keeps its source id and carries the trimmed text and a numeric order.
    const edited = reviewed[0];
    expect(edited.sourceQuestionId).toBe("q-1");
    expect(edited.questionText).toBe("What is the access footprint per building?");
    expect(edited.order).toBe(5);
    // Removed row carries no order; waived row carries a reason and no order.
    expect(reviewed[1]).not.toHaveProperty("order");
    expect(reviewed[2]).toHaveProperty("waiverReason");
    expect(reviewed[2]).not.toHaveProperty("order");
    // Added row has no source id and an active order.
    expect(reviewed[3]).not.toHaveProperty("sourceQuestionId");
    expect(reviewed[3].action).toBe("added");
    expect(reviewed[3].order).toBe(4);

    // No caller authority/provenance field leaks in any reviewed entry.
    const forbiddenReviewedKeys = [
      "sourceMode",
      "tenantId",
      "projectId",
      "createdBy",
      "status",
      "pricing",
      "sku",
      "catalog",
      "config",
      "authority",
      "manualOverrideReason",
    ];
    for (const entry of reviewed) {
      for (const forbidden of forbiddenReviewedKeys) {
        expect(entry).not.toHaveProperty(forbidden);
      }
    }
    for (const forbidden of ["sourceMode", "manualOverrideReason", "tenantId", "createdBy"]) {
      expect(JSON.stringify(body)).not.toContain(forbidden);
    }

    // Answers: exactly one per active (edited q-1, added) row; none for removed/waived.
    const answers = body.answers as Record<string, unknown>[];
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.questionId).sort()).toEqual([
      "q-1",
      reviewed[3].questionId,
    ].sort());
    const q1Answer = answers.find((a) => a.questionId === "q-1");
    expect(q1Answer?.status).toBe("answered");
    expect(q1Answer?.value).toBe("Two closets per building.");

    // Success clears the draft and refreshes intake, readiness, and generation reads.
    await screen.findByTestId("hld-intake-questionnaire-submit-success");
    expect(screen.queryByTestId("hld-intake-questionnaire-row-0")).toBeNull();
    await waitFor(() => {
      expect(
        calls.filter(
          (c) => c.url === HLD_INTAKE_LIST_URL && (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(intakeGetsBefore);
      expect(
        calls.filter((c) => c.url === HLD_READINESS_LIST_URL).length
      ).toBeGreaterThan(readinessGetsBefore);
      expect(
        calls.filter((c) => c.url === HLD_GENERATION_READINESS_URL).length
      ).toBeGreaterThan(generationGetsBefore);
    });
  });

  it("skips an invalid latest questionnaire candidate and uses the latest valid artifact", async () => {
    const calls = stubFetch((url) => {
      if (url === HLD_INTAKE_QUESTIONNAIRE_LIST_URL) {
        return jsonResponse({
          project: projectContext(),
          artifactCount: 2,
          artifacts: [
            hldIntakeQuestionnaireListItem(
              "art-hld-intake-questionnaire-invalid",
              "needs_review",
              3,
              false
            ),
            hldIntakeQuestionnaireListItem(
              HLD_INTAKE_QUESTIONNAIRE_ID,
              "needs_review",
              2,
              true
            ),
          ],
        });
      }
      if (url === HLD_INTAKE_QUESTIONNAIRE_DETAIL_URL) {
        return jsonResponse(hldIntakeQuestionnaireDetailResponse());
      }
      return jsonResponse({}, 200);
    });
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");

    await loadQuestionnaire();

    expect(
      calls.some((c) => c.url.includes("art-hld-intake-questionnaire-invalid"))
    ).toBe(false);
    expect(calls.some((c) => c.url === HLD_INTAKE_QUESTIONNAIRE_DETAIL_URL)).toBe(
      true
    );
  });

  it("creates a candidate questionnaire via an empty-body POST and reloads the list", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");

    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_INTAKE_QUESTIONNAIRE_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    const create = await screen.findByTestId("hld-intake-questionnaire-create");
    await act(async () => {
      fireEvent.click(create);
    });

    await screen.findByTestId("hld-intake-questionnaire-create-success");

    const post = calls.find(
      (c) =>
        c.url === HLD_INTAKE_QUESTIONNAIRE_LIST_URL &&
        c.init?.method === "POST"
    );
    expect(post).toBeDefined();
    // The POST carries no request body and leaks no caller authority/provenance.
    expect(post?.init?.body === undefined || post?.init?.body === null).toBe(true);
    const forbidden = [
      "tenantId",
      "projectId",
      "createdBy",
      "status",
      "sourceArtifactIds",
      "payload",
      "sourceMode",
      "pricing",
      "sku",
      "catalog",
      "config",
    ];
    const bodyStr = post?.init?.body === undefined ? "" : String(post?.init?.body);
    for (const key of forbidden) expect(bodyStr).not.toContain(key);

    // The candidate list is refreshed after a successful create.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_INTAKE_QUESTIONNAIRE_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });

    // No TP / final HLD / HLD close / export / document / diagram POST is made.
    const forbiddenPostRoutes = [
      "/rfp/hld-intake/questionnaire-assisted",
      "/rfp/hld-close",
      "/rfp/hld-document",
      "/rfp/hld-diagram",
      "/rfp/hld-proposal",
      "/rfp/tp",
      "/rfp/technical-proposal",
    ];
    expect(
      calls.filter(
        (c) =>
          c.init?.method === "POST" &&
          forbiddenPostRoutes.some((r) => c.url.includes(r))
      )
    ).toHaveLength(0);
  });

  it("keeps submit disabled while an active answered row has a blank value", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");
    await loadQuestionnaire();

    // Reduce to a single active accepted row (q-1); q-2 and q-3 removed.
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-1"), {
      target: { value: "removed" },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-2"), {
      target: { value: "removed" },
    });

    // q-1 is answered with a blank value -> submit stays disabled.
    expect(
      (screen.getByTestId("hld-intake-questionnaire-submit") as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-answer-value-0"), {
      target: { value: "Two closets per building." },
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId("hld-intake-questionnaire-submit") as HTMLButtonElement)
          .disabled
      ).toBe(false);
    });
  });

  it("keeps submit disabled while a waived row is missing its waiver reason", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");
    await loadQuestionnaire();

    // q-1 active with an answer; q-2 removed; q-3 waived without a reason.
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-answer-value-0"), {
      target: { value: "Two closets per building." },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-1"), {
      target: { value: "removed" },
    });
    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-action-2"), {
      target: { value: "waived" },
    });

    expect(
      (screen.getByTestId("hld-intake-questionnaire-submit") as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.change(screen.getByTestId("hld-intake-questionnaire-waiver-2"), {
      target: { value: "Segmentation confirmed out of scope." },
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId("hld-intake-questionnaire-submit") as HTMLButtonElement)
          .disabled
      ).toBe(false);
    });
  });

  it("still posts only { answers, manualOverrideReason } from the separate manual override form", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-intake-panel");

    // The manual override form remains a distinct, separate details section.
    expect(screen.getByTestId("hld-intake-form").tagName).toBe("DETAILS");

    for (const fieldId of HLD_INTAKE_FIELD_IDS) {
      fireEvent.change(screen.getByTestId(`hld-intake-status-${fieldId}`), {
        target: { value: "unknown" },
      });
    }
    fireEvent.change(screen.getByTestId("hld-intake-override-reason"), {
      target: { value: "Manual override for this bid." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-intake-create"));
    });

    await waitFor(() => {
      expect(
        calls.some((c) => c.url === HLD_INTAKE_LIST_URL && c.init?.method === "POST")
      ).toBe(true);
    });
    const body = lastBody(calls, HLD_INTAKE_LIST_URL);
    expect(Object.keys(body).sort()).toEqual(["answers", "manualOverrideReason"]);
    expect(body).not.toHaveProperty("sourceQuestionnaireArtifactId");
    expect(body).not.toHaveProperty("reviewedQuestions");
  });
});

describe("ProjectRfpEvidencePage - Stage 6A HLD design knowledge packs", () => {
  it("surfaces a missing knowledge-pack domain and keeps HLD generation disabled/future-labeled", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-knowledge-pack-panel");
    expect(panel).toBeInTheDocument();

    const missing = await screen.findAllByTestId("hld-knowledge-pack-missing-domain");
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing.map((m) => m.textContent).join(" ")).toContain("campus switching");
    expect(
      screen.getByTestId("hld-knowledge-pack-create-domain-campus_switching")
    ).toBeInTheDocument();

    // The disabled/future-labeled HLD generation control stays disabled.
    const gen = screen.getByTestId("hld-generation-disabled");
    expect(gen).toBeDisabled();
    expect(gen.textContent ?? "").toMatch(/future/i);
  });

  it("creates a manual pack draft posting only allowed content fields with trimmed newline-split arrays", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId(
      "hld-knowledge-pack-create-domain-campus_switching"
    );
    await act(async () => {
      fireEvent.click(createBtn);
    });

    // The form is hidden until a domain is selected, not a giant always-open form.
    const form = await screen.findByTestId("hld-knowledge-pack-form");
    expect(form).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("hld-knowledge-pack-title"), {
      target: { value: "  Campus switching pack  " },
    });
    fireEvent.change(
      screen.getByTestId("hld-knowledge-pack-section-designPrinciples"),
      { target: { value: "  Redundant uplinks  \n\n  Stacked access  \n" } }
    );
    // Whitespace-only section drops to an empty array, not a blank entry.
    fireEvent.change(
      screen.getByTestId("hld-knowledge-pack-section-constraints"),
      { target: { value: "   " } }
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-knowledge-pack-create"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_KNOWLEDGE_PACK_LIST_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls
      .filter(
        (c) => c.url === HLD_KNOWLEDGE_PACK_LIST_URL && c.init?.method === "POST"
      )
      .slice(-1)[0];
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "assumptions",
      "constraints",
      "designPrinciples",
      "domain",
      "exclusions",
      "title",
      "topologyGuidance",
      "validationNotes",
    ]);
    expect(body.domain).toBe("campus_switching");
    expect(body.title).toBe("Campus switching pack");
    expect(body.designPrinciples).toEqual(["Redundant uplinks", "Stacked access"]);
    expect(body.constraints).toEqual([]);

    // No tenant/project/authority/configuration field rides along.
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "status",
      "stage",
      "stageId",
      "type",
      "payloadKind",
      "source",
      "payload",
      "artifactId",
      "sku",
      "pricing",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("inspects and approves a needs_review pack, posting only { decision } and refreshing the pack and readiness lists", async () => {
    const calls = stubFetch();
    render(<ProjectRfpEvidencePage />);

    // The needs_review (v2) pack sorts first; inspect it.
    const inspects = await screen.findAllByTestId("hld-knowledge-pack-inspect");
    await act(async () => {
      fireEvent.click(inspects[0]);
    });

    await screen.findByTestId("review-drawer");
    const content = await screen.findByTestId("hld-knowledge-pack-drawer-content");
    expect(content).toHaveTextContent("HLD-PACK-PRINCIPLE-CANARY");

    const packGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_KNOWLEDGE_PACK_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;
    const readinessGetsBefore = calls.filter(
      (c) => c.url === HLD_READINESS_LIST_URL
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-knowledge-pack-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_KNOWLEDGE_PACK_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const reviewBody = JSON.parse(
      String(
        calls
          .filter((c) => c.url === HLD_KNOWLEDGE_PACK_REVIEW_URL)
          .slice(-1)[0]?.init?.body
      )
    ) as Record<string, unknown>;
    expect(Object.keys(reviewBody)).toEqual(["decision"]);
    expect(reviewBody.decision).toBe("approved");

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_KNOWLEDGE_PACK_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(packGetsBefore);
      expect(
        calls.filter((c) => c.url === HLD_READINESS_LIST_URL).length
      ).toBeGreaterThan(readinessGetsBefore);
    });
  });

  it("keeps raw pack artifact ids out of primary text and only inside collapsed technical details", async () => {
    stubFetch();
    render(<ProjectRfpEvidencePage />);

    // The compact list never renders the raw artifact id as visible text.
    const list = await screen.findByTestId("hld-knowledge-pack-list");
    expect(list.textContent ?? "").not.toContain(HLD_KNOWLEDGE_PACK_ARTIFACT_ID);

    const inspects = await screen.findAllByTestId("hld-knowledge-pack-inspect");
    await act(async () => {
      fireEvent.click(inspects[0]);
    });

    const content = await screen.findByTestId("hld-knowledge-pack-drawer-content");
    const audit = content.querySelector(
      "[data-testid='hld-knowledge-pack-drawer-audit']"
    );
    expect(audit?.textContent ?? "").toContain(HLD_KNOWLEDGE_PACK_ARTIFACT_ID);

    const primary = content.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-knowledge-pack-drawer-audit']")
      ?.remove();
    expect(primary.textContent ?? "").not.toContain(HLD_KNOWLEDGE_PACK_ARTIFACT_ID);
  });
});

describe("ProjectRfpEvidencePage - Stage 6B HLD source bundle", () => {
  // Drive the source-bundle slice while keeping the rest of the page healthy.
  function sourceBundleFetch(
    listBody: Record<string, unknown>,
    detailBody: Record<string, unknown> = sourceBundleDetailResponse(),
    onReview?: (init?: RequestInit) => Response
  ): (url: string, init?: RequestInit) => Response {
    return (url, init) => {
      if (url === HLD_SOURCE_BUNDLE_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse(
            { artifact: sourceBundleListItem(), payloadSummary: {} },
            201
          );
        }
        return jsonResponse(listBody);
      }
      if (url === HLD_SOURCE_BUNDLE_DETAIL_URL) return jsonResponse(detailBody);
      if (url === HLD_SOURCE_BUNDLE_REVIEW_URL) {
        return onReview ? onReview(init) : jsonResponse({ artifactStatus: "approved" });
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      if (url === HLD_READINESS_LIST_URL) return jsonResponse(hldReadinessListReady());
      if (url === HLD_INTAKE_LIST_URL) return jsonResponse(hldIntakeListResponse());
      if (url === HLD_KNOWLEDGE_PACK_LIST_URL) return jsonResponse(hldKnowledgePackListResponse());
      if (url === HLD_DIAGRAM_LIST_URL) return jsonResponse(hldDiagramListEmpty());
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(hldGenerationReadinessBlocked());
      }
      return jsonResponse({}, 200);
    };
  }

  // Future HLD generation/proposal POST routes the source-bundle slice must never call.
  const HLD_GENERATION_POST_ROUTES = [
    "/rfp/hld-model",
    "/rfp/hld-diagram",
    "/rfp/hld-document",
    "/rfp/hld-proposal",
    "/rfp/hld-html",
    "/rfp/drawio",
    "/rfp/hld-readiness-snapshot",
  ];
  function generationPosts(calls: FetchCall[]): FetchCall[] {
    return calls.filter(
      (c) =>
        c.init?.method === "POST" &&
        HLD_GENERATION_POST_ROUTES.some((route) => c.url.includes(route))
    );
  }

  it("renders the ready source-bundle panel with compact counts, an enabled create button, and no raw artifact ids", async () => {
    stubFetch(sourceBundleFetch(sourceBundleListReady()));
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-source-bundle-panel");
    expect(panel).toBeInTheDocument();

    const readiness = await screen.findByTestId("hld-source-bundle-readiness");
    expect(readiness).toHaveTextContent("Ready to compile");
    const summary = screen.getByTestId("hld-source-bundle-ready-summary");
    expect(summary).toHaveTextContent("Source authorities: 7");
    expect(summary).toHaveTextContent("Knowledge packs: 1");
    expect(summary).toHaveTextContent("Covered domains: 1");
    expect(summary).toHaveTextContent("Excluded domains: 1");

    expect(screen.getByTestId("hld-source-bundle-create")).not.toBeDisabled();

    // The compact panel never renders raw artifact / provenance ids as primary text.
    const panelText = panel.textContent ?? "";
    expect(panelText).not.toContain(HLD_SOURCE_BUNDLE_ARTIFACT_ID);
    expect(panelText).not.toContain("hrs-1");
    expect(screen.getByTestId("hld-source-bundle-list").textContent ?? "").not.toContain(
      HLD_SOURCE_BUNDLE_ARTIFACT_ID
    );
  });

  it("renders a blocked source-bundle panel with a stable blocker code and a disabled create button", async () => {
    stubFetch(sourceBundleFetch(sourceBundleListBlocked()));
    render(<ProjectRfpEvidencePage />);

    const blocked = await screen.findByTestId("hld-source-bundle-blocked");
    expect(blocked).toHaveTextContent("hld_readiness_not_ready");
    expect(blocked).toHaveTextContent("HLD-SOURCE-BUNDLE-BLOCKER-CANARY");

    expect(screen.getByTestId("hld-source-bundle-create")).toBeDisabled();
    // No persisted bundles yet -> empty state, not a list table.
    expect(screen.getByTestId("hld-source-bundle-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("hld-source-bundle-list")).toBeNull();
    expect(screen.queryByTestId("hld-source-bundle-ready-summary")).toBeNull();
  });

  it("compiles a source bundle with no authority body, refreshes the list, and makes no HLD generation POST", async () => {
    const calls = stubFetch(sourceBundleFetch(sourceBundleListReady()));
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId("hld-source-bundle-create");
    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_SOURCE_BUNDLE_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_SOURCE_BUNDLE_LIST_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_SOURCE_BUNDLE_LIST_URL && c.init?.method === "POST"
    );
    const rawBody = post?.init?.body;
    const bodyText =
      rawBody === undefined || rawBody === null ? "" : String(rawBody);
    // Posted body is empty/absent; no authority fields ride along.
    expect(rawBody === undefined || rawBody === null || bodyText === "{}").toBe(true);
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "status",
      "sourceArtifactIds",
      "payload",
      "artifactId",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    // The list refreshes after a successful compile.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_SOURCE_BUNDLE_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });

    // No HLD model/diagram/document/proposal/readiness-snapshot generation POST.
    expect(generationPosts(calls)).toHaveLength(0);
  });

  it("inspects a source bundle into the drawer with distinct covered/excluded/missing sections and raw ids only in the audit", async () => {
    stubFetch(sourceBundleFetch(sourceBundleListReady()));
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-source-bundle-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("review-drawer");
    const content = await screen.findByTestId("hld-source-bundle-drawer-content");

    // Covered, excluded, and missing domains render as distinct sections.
    expect(
      screen.getByTestId("hld-source-bundle-drawer-covered")
    ).toHaveTextContent("campus switching");
    expect(
      screen.getByTestId("hld-source-bundle-drawer-excluded")
    ).toHaveTextContent("service only");
    expect(
      screen.getByTestId("hld-source-bundle-drawer-missing")
    ).toHaveTextContent("None");

    // Assumptions and warnings are visible as structured text.
    expect(
      screen.getByTestId("hld-source-bundle-drawer-assumptions")
    ).toHaveTextContent("SOURCE-BUNDLE-ASSUMPTION-CANARY");
    expect(
      screen.getByTestId("hld-source-bundle-drawer-warnings")
    ).toHaveTextContent("SOURCE-BUNDLE-WARNING-CANARY");

    // Raw artifact / source / authority ids live only in the collapsed audit.
    const audit = content.querySelector(
      "[data-testid='hld-source-bundle-drawer-audit']"
    );
    const auditText = audit?.textContent ?? "";
    expect(auditText).toContain(HLD_SOURCE_BUNDLE_ARTIFACT_ID);
    expect(auditText).toContain("evp-1");
    expect(auditText).toContain("hrs-1");
    expect(auditText).toContain("pack-1");

    const primary = content.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-source-bundle-drawer-audit']")
      ?.remove();
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain(HLD_SOURCE_BUNDLE_ARTIFACT_ID);
    expect(primaryText).not.toContain("evp-1");
    expect(primaryText).not.toContain("hrs-1");
    expect(primaryText).not.toContain("pack-1");
  });

  it("approves a source bundle posting only { decision }, refreshes the list, and makes no HLD generation POST", async () => {
    const calls = stubFetch(sourceBundleFetch(sourceBundleListReady()));
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-source-bundle-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-source-bundle-review");

    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_SOURCE_BUNDLE_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-source-bundle-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_SOURCE_BUNDLE_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });
    const reviewBody = JSON.parse(
      String(
        calls
          .filter((c) => c.url === HLD_SOURCE_BUNDLE_REVIEW_URL)
          .slice(-1)[0]?.init?.body
      )
    ) as Record<string, unknown>;
    expect(Object.keys(reviewBody)).toEqual(["decision"]);
    expect(reviewBody.decision).toBe("approved");
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "status",
      "payload",
      "sourceArtifactIds",
    ]) {
      expect(reviewBody).not.toHaveProperty(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_SOURCE_BUNDLE_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(generationPosts(calls)).toHaveLength(0);
  });

  it("sends an optional review note as { decision, note } when requesting changes", async () => {
    const calls = stubFetch(sourceBundleFetch(sourceBundleListReady()));
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-source-bundle-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-source-bundle-review");

    fireEvent.change(screen.getByTestId("hld-source-bundle-review-note"), {
      target: { value: "  Snapshot looks stale.  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-source-bundle-reject"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_SOURCE_BUNDLE_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });
    const reviewBody = JSON.parse(
      String(
        calls
          .filter((c) => c.url === HLD_SOURCE_BUNDLE_REVIEW_URL)
          .slice(-1)[0]?.init?.body
      )
    ) as Record<string, unknown>;
    expect(Object.keys(reviewBody).sort()).toEqual(["decision", "note"]);
    expect(reviewBody.decision).toBe("rejected");
    expect(reviewBody.note).toBe("Snapshot looks stale.");
    expect(generationPosts(calls)).toHaveLength(0);
  });

  it("shows a compact review error and never dumps server JSON when the review fails", async () => {
    stubFetch(
      sourceBundleFetch(
        sourceBundleListReady(),
        sourceBundleDetailResponse(),
        () =>
          jsonResponse(
            {
              code: "hld_source_bundle_payload_stale",
              staleCode: "recompute_blocked",
              errors: ["SERVER-JSON-LEAK-CANARY"],
            },
            409
          )
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-source-bundle-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-source-bundle-review");

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-source-bundle-approve"));
    });

    const reviewError = await screen.findByTestId("hld-source-bundle-review-error");
    expect(reviewError).toHaveTextContent("Unable to review HLD source bundle.");
    // The compact error never echoes the server JSON payload.
    const errorText = reviewError.textContent ?? "";
    expect(errorText).not.toContain("SERVER-JSON-LEAK-CANARY");
    expect(errorText).not.toContain("recompute_blocked");
  });
});

describe("ProjectRfpEvidencePage - Stage 6D HLD design model", () => {
  // Drive the design-model slice while keeping the rest of the page healthy.
  function designModelFetch(
    listBody: Record<string, unknown>,
    detailBody: Record<string, unknown> = designModelDetailResponse(),
    onReview?: (init?: RequestInit) => Response,
    reviewListBody: Record<string, unknown> = designModelReviewListEmpty(),
    reviewDetailBody: Record<string, unknown> = designModelReviewDetailResponse(),
    onRunReview?: (init?: RequestInit) => Response,
    rebuildRequestListBody:
      | Record<string, unknown>
      | (() => Record<string, unknown>) = designModelRebuildRequestListEmpty(),
    onExecuteRebuild?: (init?: RequestInit) => Response,
    onCreateRebuildRequest?: (init?: RequestInit) => Response
  ): (url: string, init?: RequestInit) => Response {
    return (url, init) => {
      if (url === HLD_DESIGN_MODEL_LIST_URL) {
        if (init?.method === "POST") {
          return jsonResponse(
            { artifact: designModelListItem(), sourceBundle: {}, payloadSummary: {} },
            201
          );
        }
        return jsonResponse(listBody);
      }
      if (url === HLD_DESIGN_MODEL_DETAIL_URL) return jsonResponse(detailBody);
      // The freshly rebuilt candidate draft the UI opens after an execution.
      if (url === HLD_DESIGN_MODEL_REBUILT_DETAIL_URL) {
        return jsonResponse(
          designModelDetailResponse(HLD_DESIGN_MODEL_REBUILT_ARTIFACT_ID, "needs_review")
        );
      }
      if (url === HLD_DESIGN_MODEL_REVIEW_LIST_URL) {
        if (init?.method === "POST") {
          return onRunReview
            ? onRunReview(init)
            : jsonResponse(designModelReviewCreateResponse(), 201);
        }
        return jsonResponse(reviewListBody);
      }
      if (url === HLD_DESIGN_MODEL_REVIEW_DETAIL_URL) {
        return jsonResponse(reviewDetailBody);
      }
      if (url === HLD_DESIGN_MODEL_REVIEW_URL) {
        return onReview ? onReview(init) : jsonResponse({ artifactStatus: "approved" });
      }
      if (url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL) {
        if (init?.method === "POST") {
          return onCreateRebuildRequest
            ? onCreateRebuildRequest(init)
            : jsonResponse(
                { artifact: designModelRebuildRequestListItem() },
                201
              );
        }
        return jsonResponse(
          typeof rebuildRequestListBody === "function"
            ? rebuildRequestListBody()
            : rebuildRequestListBody
        );
      }
      if (url === HLD_DESIGN_MODEL_REBUILD_EXECUTE_URL) {
        return onExecuteRebuild
          ? onExecuteRebuild(init)
          : jsonResponse(designModelRebuildExecuteResponse(), 201);
      }
      if (url === LIST_URL) return jsonResponse(listResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === COMPLIANCE_MATRIX_LIST_URL) return jsonResponse(complianceMatrixListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(deltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === RFP_BOQ_WORKSPACE_URL) return jsonResponse(rfpBoqWorkspaceResponse());
      if (url === HLD_READINESS_LIST_URL) return jsonResponse(hldReadinessListReady());
      if (url === HLD_INTAKE_LIST_URL) return jsonResponse(hldIntakeListResponse());
      if (url === HLD_KNOWLEDGE_PACK_LIST_URL) return jsonResponse(hldKnowledgePackListResponse());
      if (url === HLD_SOURCE_BUNDLE_LIST_URL) return jsonResponse(sourceBundleListReady());
      if (url === HLD_DIAGRAM_LIST_URL) return jsonResponse(hldDiagramListEmpty());
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(hldGenerationReadinessBlocked());
      }
      return jsonResponse({}, 200);
    };
  }

  // Final HLD generation/document/diagram/proposal POST routes the design-model
  // slice must never call. It is allowed to POST /rfp/hld-design-model.
  const FINAL_HLD_POST_ROUTES = [
    "/rfp/hld-diagram",
    "/rfp/hld-document",
    "/rfp/hld-proposal",
    "/rfp/hld-html",
    "/rfp/drawio",
  ];
  function finalHldPosts(calls: FetchCall[]): FetchCall[] {
    return calls.filter(
      (c) =>
        c.init?.method === "POST" &&
        FINAL_HLD_POST_ROUTES.some((route) => c.url.includes(route))
    );
  }

  // --- Stage 6F generation-readiness gate ----------------------------------

  it("renders the ready generation-readiness gate with compact summaries and raw ids only in collapsed audit", async () => {
    const calls = stubFetch((url, init) => {
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(hldGenerationReadinessReady());
      }
      return designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady()
      )(url, init);
    });
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-generation-readiness-panel");
    const summary = await screen.findByTestId("hld-generation-readiness-summary");
    expect(summary).toHaveTextContent("Ready for future HLD generation");
    expect(summary).toHaveTextContent("Approved model: v2 (approved)");
    expect(summary).toHaveTextContent("Source bundle: v3 (approved)");
    expect(summary).toHaveTextContent("Review: v1 (approved)");
    expect(summary).toHaveTextContent("approve recommended");
    expect(screen.queryByTestId("hld-generation-readiness-blockers")).toBeNull();
    expect(within(panel).queryByRole("button", { name: /generate/i })).toBeNull();

    const primary = panel.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-generation-readiness-audit']")
      ?.remove();
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID);

    const audit = screen.getByTestId("hld-generation-readiness-audit");
    expect(audit.tagName).toBe("DETAILS");
    expect(audit.hasAttribute("open")).toBe(false);
    expect(audit).toHaveTextContent(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(audit).toHaveTextContent(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(audit).toHaveTextContent(HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID);
    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("renders the blocked generation-readiness gate with stable blocker copy and no primary raw ids", async () => {
    stubFetch((url, init) => {
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(hldGenerationReadinessBlocked());
      }
      return designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady()
      )(url, init);
    });
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-generation-readiness-panel");
    const summary = await screen.findByTestId("hld-generation-readiness-summary");
    expect(summary).toHaveTextContent("Blocked");
    expect(summary).toHaveTextContent("GENERATION-READINESS-NEXT-ACTION-CANARY");

    const blockers = await screen.findByTestId("hld-generation-readiness-blockers");
    expect(blockers).toHaveTextContent("matching_review_missing");
    expect(blockers).toHaveTextContent("GENERATION-READINESS-BLOCKER-CANARY");

    const primary = panel.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-generation-readiness-audit']")
      ?.remove();
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(primaryText).not.toContain("GENERATION-READINESS-DETAIL-CANARY");

    const audit = screen.getByTestId("hld-generation-readiness-audit");
    expect(audit).toHaveTextContent(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(audit).toHaveTextContent(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(audit).toHaveTextContent("GENERATION-READINESS-DETAIL-CANARY");
  });
  it("renders the ready design-model panel with compact counts, an enabled create button, a list, and no raw ids", async () => {
    stubFetch(designModelFetch(designModelListReady()));
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-design-model-panel");
    expect(panel).toBeInTheDocument();

    const readiness = await screen.findByTestId("hld-design-model-readiness");
    expect(readiness).toHaveTextContent("Ready to draft");
    const summary = screen.getByTestId("hld-design-model-ready-summary");
    expect(summary).toHaveTextContent("Source bundle version: 3");
    expect(summary).toHaveTextContent("Source authorities: 7");
    expect(summary).toHaveTextContent("Covered domains: 1");
    expect(summary).toHaveTextContent("Excluded domains: 1");

    expect(screen.getByTestId("hld-design-model-create")).not.toBeDisabled();
    expect(screen.getByTestId("hld-design-model-list")).toBeInTheDocument();

    // The compact panel never renders raw artifact / source bundle ids.
    const panelText = panel.textContent ?? "";
    expect(panelText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(panelText).not.toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(screen.getByTestId("hld-design-model-list").textContent ?? "").not.toContain(
      HLD_DESIGN_MODEL_ARTIFACT_ID
    );
  });

  it("renders a blocked design-model panel with a stable blocker code, a disabled create button, and an empty state", async () => {
    stubFetch(designModelFetch(designModelListBlocked()));
    render(<ProjectRfpEvidencePage />);

    const blocked = await screen.findByTestId("hld-design-model-blocked");
    expect(blocked).toHaveTextContent("latest_source_bundle_not_approved");
    expect(blocked).toHaveTextContent("DESIGN-MODEL-BLOCKER-CANARY");

    expect(screen.getByTestId("hld-design-model-create")).toBeDisabled();
    expect(screen.getByTestId("hld-design-model-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("hld-design-model-list")).toBeNull();
    expect(screen.queryByTestId("hld-design-model-ready-summary")).toBeNull();
  });

  it("creates a design model with no body/authority fields, refreshes the list, and makes no final HLD POST", async () => {
    const calls = stubFetch(designModelFetch(designModelListReady()));
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId("hld-design-model-create");
    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_DESIGN_MODEL_LIST_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DESIGN_MODEL_LIST_URL && c.init?.method === "POST"
    );
    const rawBody = post?.init?.body;
    const bodyText =
      rawBody === undefined || rawBody === null ? "" : String(rawBody);
    expect(rawBody === undefined || rawBody === null || bodyText === "{}").toBe(true);
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "status",
      "sourceArtifactIds",
      "payload",
      "artifactId",
      "sourceHldSourceBundleArtifactId",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });

    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("inspects a design model into the drawer with sections/topology/diagram-intent/finding/review action, raw ids only in the audit", async () => {
    stubFetch(designModelFetch(designModelListReady()));
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("review-drawer");
    const content = await screen.findByTestId("hld-design-model-drawer-content");

    expect(
      screen.getByTestId("hld-design-model-drawer-covered")
    ).toHaveTextContent("campus switching");
    expect(
      screen.getByTestId("hld-design-model-drawer-excluded")
    ).toHaveTextContent("service only");

    const sections = screen.getByTestId("hld-design-model-drawer-sections");
    expect(sections).toHaveTextContent("DESIGN-SECTION-CANARY");
    expect(sections).toHaveTextContent("DESIGN-DECISION-CANARY");

    const topology = screen.getByTestId("hld-design-model-drawer-topology");
    expect(topology).toHaveTextContent("TOPOLOGY-NODE-CANARY");
    expect(topology).toHaveTextContent("TOPOLOGY-LINK-CANARY");
    expect(topology).toHaveTextContent("TOPOLOGY-ZONE-CANARY");

    const intents = screen.getByTestId("hld-design-model-drawer-diagram-intents");
    expect(intents).toHaveTextContent("DIAGRAM-INTENT-CANARY");
    // Diagram intents are intent records only; no rendered diagram surface.
    expect(content.querySelector("svg")).toBeNull();

    expect(
      screen.getByTestId("hld-design-model-drawer-findings")
    ).toHaveTextContent("VALIDATION-FINDING-CANARY");
    expect(
      screen.getByTestId("hld-design-model-drawer-review-actions")
    ).toHaveTextContent("REVIEW-ACTION-CANARY");

    // Raw artifact / source bundle / source reference ids live only in the audit.
    const audit = content.querySelector(
      "[data-testid='hld-design-model-drawer-audit']"
    );
    const auditText = audit?.textContent ?? "";
    expect(auditText).toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(auditText).toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(auditText).toContain("src-bundle-ref");
    expect(auditText).toContain("authority-ref");
    expect(auditText).toContain("pack-ref");

    const primary = content.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-design-model-drawer-audit']")
      ?.remove();
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(primaryText).not.toContain("src-bundle-ref");
    expect(primaryText).not.toContain("authority-ref");
    expect(primaryText).not.toContain("pack-ref");
  });

  it("approves a design model posting only { decision }, refreshes the list, and makes no final HLD POST", async () => {
    const calls = stubFetch(designModelFetch(designModelListReady()));
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-design-model-review");

    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-design-model-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_DESIGN_MODEL_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });
    const reviewBody = JSON.parse(
      String(
        calls
          .filter((c) => c.url === HLD_DESIGN_MODEL_REVIEW_URL)
          .slice(-1)[0]?.init?.body
      )
    ) as Record<string, unknown>;
    expect(Object.keys(reviewBody)).toEqual(["decision"]);
    expect(reviewBody.decision).toBe("approved");
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "status",
      "payload",
      "sourceArtifactIds",
    ]) {
      expect(reviewBody).not.toHaveProperty(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("requests changes posting { decision, note } with a trimmed note", async () => {
    const calls = stubFetch(designModelFetch(designModelListReady()));
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-design-model-review");

    fireEvent.change(screen.getByTestId("hld-design-model-review-note"), {
      target: { value: "  Topology needs review.  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-design-model-reject"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_DESIGN_MODEL_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });
    const reviewBody = JSON.parse(
      String(
        calls
          .filter((c) => c.url === HLD_DESIGN_MODEL_REVIEW_URL)
          .slice(-1)[0]?.init?.body
      )
    ) as Record<string, unknown>;
    expect(Object.keys(reviewBody).sort()).toEqual(["decision", "note"]);
    expect(reviewBody.decision).toBe("rejected");
    expect(reviewBody.note).toBe("Topology needs review.");
    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("shows a compact review error and never dumps server JSON when the review fails", async () => {
    stubFetch(
      designModelFetch(
        designModelListReady(),
        designModelDetailResponse(),
        () =>
          jsonResponse(
            {
              code: "hld_design_model_payload_stale",
              staleCode: "redraft_required",
              errors: ["DESIGN-MODEL-SERVER-JSON-LEAK-CANARY"],
            },
            409
          )
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-design-model-review");

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-design-model-approve"));
    });

    const reviewError = await screen.findByTestId("hld-design-model-review-error");
    expect(reviewError).toHaveTextContent("Unable to review HLD design model.");
    const errorText = reviewError.textContent ?? "";
    expect(errorText).not.toContain("DESIGN-MODEL-SERVER-JSON-LEAK-CANARY");
    expect(errorText).not.toContain("redraft_required");
  });

  // --- Stage 6E-B advisory deterministic review surface --------------------

  it("shows the advisory deterministic review summary on the model row with no raw ids", async () => {
    stubFetch(
      designModelFetch(designModelListReady(), undefined, undefined, designModelReviewListReady())
    );
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-design-model-panel");
    const summary = await screen.findByTestId("hld-design-model-review-summary");
    // Advisory/deterministic label, recommendation, and severity counts.
    expect(summary).toHaveTextContent("Deterministic / advisory");
    expect(summary).toHaveTextContent("deterministic");
    expect(summary).toHaveTextContent("rebuild recommended");
    expect(summary).toHaveTextContent("Blocking 0");
    expect(summary).toHaveTextContent("Warning 1");
    expect(summary).toHaveTextContent("Suggestion 0");
    // A run/re-run action is present on the row.
    expect(screen.getByTestId("hld-design-model-review-run")).toBeInTheDocument();

    // The compact panel still never renders raw model/source-bundle/review ids.
    const panelText = panel.textContent ?? "";
    expect(panelText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(panelText).not.toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(panelText).not.toContain(HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID);
  });

  it("runs the deterministic review posting exactly { sourceHldDesignModelArtifactId }, refreshes both lists, and makes no final HLD POST", async () => {
    const calls = stubFetch(
      designModelFetch(designModelListReady(), undefined, undefined, designModelReviewListReady())
    );
    render(<ProjectRfpEvidencePage />);

    const runBtn = await screen.findByTestId("hld-design-model-review-run");
    const reviewGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_REVIEW_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;
    const modelGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DESIGN_MODEL_REVIEW_LIST_URL &&
            c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) =>
        c.url === HLD_DESIGN_MODEL_REVIEW_LIST_URL && c.init?.method === "POST"
    );
    const reviewBody = JSON.parse(String(post?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(reviewBody)).toEqual(["sourceHldDesignModelArtifactId"]);
    expect(reviewBody.sourceHldDesignModelArtifactId).toBe(
      HLD_DESIGN_MODEL_ARTIFACT_ID
    );
    for (const forbidden of [
      "tenantId",
      "projectId",
      "reviewedBy",
      "status",
      "payload",
      "sourceArtifactIds",
      "sku",
      "pricing",
      "catalog",
    ]) {
      expect(reviewBody).not.toHaveProperty(forbidden);
    }

    // Both the review list and the model list refresh after a successful run.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_REVIEW_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(reviewGetsBefore);
    });
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(modelGetsBefore);
    });
    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("opens the drawer showing review findings and bounded rebuild, with raw ids only in the collapsed review audit", async () => {
    stubFetch(
      designModelFetch(designModelListReady(), undefined, undefined, designModelReviewListReady())
    );
    render(<ProjectRfpEvidencePage />);

    // Wait for the review list to load so the drawer resolves a matching review.
    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const content = await screen.findByTestId("hld-design-model-drawer-content");
    const reviewPanel = await screen.findByTestId(
      "hld-design-model-review-panel"
    );
    // Advisory/deterministic framing and not-final-authority language.
    expect(reviewPanel).toHaveTextContent("advisory");
    expect(reviewPanel).toHaveTextContent("engineer approval remains required");

    const findings = await screen.findByTestId(
      "hld-design-model-review-findings"
    );
    expect(findings).toHaveTextContent("REVIEW-FINDING-CANARY");
    expect(findings).toHaveTextContent("REVIEW-RECOMMENDED-ACTION-CANARY");

    const rebuild = screen.getByTestId("hld-design-model-review-rebuild");
    expect(rebuild).toHaveTextContent("REVIEW-REBUILD-SUMMARY-CANARY");
    expect(rebuild).toHaveTextContent("REVIEW-REBUILD-INSTRUCTIONS-CANARY");
    // The review surface renders no machine-readable diagram/JSON dump.
    expect(content.querySelector("svg")).toBeNull();
    expect(content.querySelector("pre")).toBeNull();

    // Raw review/model/source-bundle/source-reference ids live only in audits.
    const reviewAudit = content.querySelector(
      "[data-testid='hld-design-model-review-audit']"
    );
    const reviewAuditText = reviewAudit?.textContent ?? "";
    expect(reviewAuditText).toContain(HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID);
    expect(reviewAuditText).toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(reviewAuditText).toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(reviewAuditText).toContain("rev-model-ref-1");
    expect(reviewAuditText).toContain("rev-bundle-ref-1");

    // Strip BOTH collapsed audit areas; no raw id may remain in primary text.
    const primary = content.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-design-model-review-audit']")
      ?.remove();
    primary
      .querySelector("[data-testid='hld-design-model-drawer-audit']")
      ?.remove();
    const primaryText = primary.textContent ?? "";
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID);
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(primaryText).not.toContain(HLD_DESIGN_MODEL_SOURCE_BUNDLE_APPROVED_ID);
    expect(primaryText).not.toContain("rev-model-ref-1");
    expect(primaryText).not.toContain("rev-bundle-ref-1");
  });

  it("shows a compact run-review error and never dumps server JSON when review creation fails", async () => {
    stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        undefined,
        () =>
          jsonResponse(
            {
              code: "hld_design_model_review_source_bundle_unavailable",
              blockerCode: "latest_source_bundle_not_approved",
              errors: ["REVIEW-RUN-SERVER-JSON-LEAK-CANARY"],
            },
            409
          )
      )
    );
    render(<ProjectRfpEvidencePage />);

    const runBtn = await screen.findByTestId("hld-design-model-review-run");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    const runError = await screen.findByTestId(
      "hld-design-model-review-run-error"
    );
    expect(runError).toHaveTextContent(
      "Unable to run deterministic design-model review."
    );
    const runErrorText = runError.textContent ?? "";
    expect(runErrorText).not.toContain("REVIEW-RUN-SERVER-JSON-LEAK-CANARY");
    expect(runErrorText).not.toContain("latest_source_bundle_not_approved");
  });

  it("disables run-review for a non-reviewable model row and drawer but keeps Inspect available", async () => {
    const listBody = {
      project: projectContext(),
      artifactCount: 1,
      artifacts: [designModelListItem(HLD_DESIGN_MODEL_ARTIFACT_ID, "approved")],
      designModelReadiness: DESIGN_MODEL_READY_READINESS,
    };
    stubFetch(
      designModelFetch(
        listBody,
        designModelDetailResponse(HLD_DESIGN_MODEL_ARTIFACT_ID, "approved"),
        undefined,
        designModelReviewListEmpty()
      )
    );
    render(<ProjectRfpEvidencePage />);

    // The row run-review action is disabled for a non-reviewable model...
    const runBtn = await screen.findByTestId("hld-design-model-review-run");
    expect(runBtn).toBeDisabled();
    // ...but Inspect stays available.
    const inspect = screen.getByTestId("hld-design-model-inspect");
    expect(inspect).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-design-model-drawer-content");

    // The drawer's run action is disabled too.
    const drawerRun = screen.getByTestId("hld-design-model-review-run-drawer");
    expect(drawerRun).toBeDisabled();
  });

  it("auto-fetches the review detail for an already-open model drawer once the review list arrives", async () => {
    let releaseReviewList: () => void = () => {};
    const reviewListGate = new Promise<void>((resolve) => {
      releaseReviewList = resolve;
    });
    const base = designModelFetch(
      designModelListReady(),
      designModelDetailResponse(),
      undefined,
      designModelReviewListReady()
    );
    const calls = stubFetch(async (url, init) => {
      if (
        url === HLD_DESIGN_MODEL_REVIEW_LIST_URL &&
        (init?.method ?? "GET") === "GET"
      ) {
        await reviewListGate;
      }
      return base(url, init);
    });
    render(<ProjectRfpEvidencePage />);

    // Open the drawer before the (gated) review list resolves.
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-design-model-drawer-content");

    // With no review yet, the sanitized detail has not been requested.
    expect(
      calls.some((c) => c.url === HLD_DESIGN_MODEL_REVIEW_DETAIL_URL)
    ).toBe(false);

    // Release the review list; the open drawer should now fetch the detail.
    await act(async () => {
      releaseReviewList();
    });
    await waitFor(() => {
      expect(
        calls.some((c) => c.url === HLD_DESIGN_MODEL_REVIEW_DETAIL_URL)
      ).toBe(true);
    });
  });

  // --- Stage 6E-C bounded design-model rebuild execute surface -------------

  it("disables the execute-rebuild action with explanatory text and no raw request id when no active rebuild request matches", async () => {
    // A matching advisory review with bounded rebuild instructions, but the
    // rebuild-request list is empty (default) so no request matches.
    stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady()
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    // The bounded rebuild instructions render and carry the execute action.
    await screen.findByTestId("hld-design-model-review-rebuild");
    const executeBtn = await screen.findByTestId(
      "hld-design-model-rebuild-execute"
    );
    expect(executeBtn).toBeDisabled();
    expect(
      screen.getByTestId("hld-design-model-rebuild-execute-none")
    ).toHaveTextContent("No active bounded rebuild request");

    // With no active request there is no audit and no raw request id anywhere.
    expect(
      screen.queryByTestId("hld-design-model-rebuild-execute-audit")
    ).toBeNull();
    const content = screen.getByTestId("hld-design-model-drawer-content");
    expect(content.textContent ?? "").not.toContain(
      HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID
    );
  });

  it("enables the execute-rebuild action with same-approved-source-bundle copy and keeps the request id in a collapsed audit", async () => {
    stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        undefined,
        undefined,
        designModelRebuildRequestListReady()
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const executeBtn = await screen.findByTestId(
      "hld-design-model-rebuild-execute"
    );
    await waitFor(() => expect(executeBtn).not.toBeDisabled());

    // Primary UI explains a same-approved-source-bundle candidate model draft.
    const explainer = screen.getByTestId(
      "hld-design-model-rebuild-execute-explainer"
    );
    expect(explainer).toHaveTextContent("same approved source bundle");
    expect(explainer).toHaveTextContent("candidate model draft");
    // The disabled-state copy is gone once a request matches.
    expect(
      screen.queryByTestId("hld-design-model-rebuild-execute-none")
    ).toBeNull();
    // With a request already active, no second create action is offered.
    expect(
      screen.queryByTestId("hld-design-model-rebuild-request-create")
    ).toBeNull();
    expect(
      screen.queryByTestId("hld-design-model-rebuild-request-submit")
    ).toBeNull();

    // The request id lives only in the collapsed rebuild audit.
    const audit = screen.getByTestId("hld-design-model-rebuild-execute-audit");
    expect(audit).toHaveTextContent(HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID);
    const content = screen.getByTestId("hld-design-model-drawer-content");
    const primary = content.cloneNode(true) as HTMLElement;
    primary
      .querySelector("[data-testid='hld-design-model-rebuild-execute-audit']")
      ?.remove();
    expect(primary.textContent ?? "").not.toContain(
      HLD_DESIGN_MODEL_REBUILD_REQUEST_ARTIFACT_ID
    );
    // The review surface renders no machine-readable diagram/JSON dump.
    expect(content.querySelector("svg")).toBeNull();
    expect(content.querySelector("pre")).toBeNull();
  });

  it("executes the bounded rebuild with an empty body, refreshes all three lists, opens the needs-review draft, and makes no final HLD POST", async () => {
    const calls = stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        undefined,
        undefined,
        designModelRebuildRequestListReady()
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    const executeBtn = await screen.findByTestId(
      "hld-design-model-rebuild-execute"
    );
    await waitFor(() => expect(executeBtn).not.toBeDisabled());

    const modelGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;
    const reviewGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_REVIEW_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;
    const rebuildGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(executeBtn);
    });

    // The POST goes to the execute route with an absent/empty body.
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DESIGN_MODEL_REBUILD_EXECUTE_URL &&
            c.init?.method === "POST"
        )
      ).toBe(true);
    });
    const post = calls.find(
      (c) =>
        c.url === HLD_DESIGN_MODEL_REBUILD_EXECUTE_URL &&
        c.init?.method === "POST"
    );
    const rawBody = post?.init?.body;
    const bodyText =
      rawBody === undefined || rawBody === null ? "" : String(rawBody);
    expect(rawBody === undefined || rawBody === null || bodyText === "{}").toBe(
      true
    );
    for (const forbidden of [
      "tenantId",
      "projectId",
      "userId",
      "status",
      "payload",
      "sourceArtifactIds",
      "sourceHldDesignModelArtifactId",
      "sourceReviewArtifactId",
      "sku",
      "pricing",
      "catalog",
      "config",
      "executor",
      "provider",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    // The design-model, advisory-review, and rebuild-request lists all refresh.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(modelGetsBefore);
    });
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_REVIEW_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(reviewGetsBefore);
    });
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(rebuildGetsBefore);
    });

    // The fresh candidate draft is opened and shows as needs_review with no
    // deterministic review yet (needing a fresh review + engineer approval).
    await waitFor(() => {
      expect(
        calls.some((c) => c.url === HLD_DESIGN_MODEL_REBUILT_DETAIL_URL)
      ).toBe(true);
    });
    const drawerContent = await screen.findByTestId(
      "hld-design-model-drawer-content"
    );
    expect(drawerContent).toHaveTextContent("needs review");
    await screen.findByTestId("hld-design-model-review-empty");

    // Compact success copy appears and survives the switch to the new draft.
    const success = await screen.findByTestId(
      "hld-design-model-rebuild-execute-success"
    );
    expect(success).toHaveTextContent(
      "New candidate model draft needs deterministic review"
    );

    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("shows a compact execute error, never dumps server JSON, opens no draft, and makes no final HLD POST when execution fails", async () => {
    const calls = stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        undefined,
        undefined,
        designModelRebuildRequestListReady(),
        () =>
          jsonResponse(
            {
              code: "hld_design_model_rebuild_drafting_unavailable",
              providerDetail: "REBUILD-EXECUTE-SERVER-JSON-LEAK-CANARY",
              errors: ["REBUILD-EXECUTE-PROVIDER-CANARY"],
            },
            503
          )
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    const executeBtn = await screen.findByTestId(
      "hld-design-model-rebuild-execute"
    );
    await waitFor(() => expect(executeBtn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(executeBtn);
    });

    const execError = await screen.findByTestId(
      "hld-design-model-rebuild-execute-error"
    );
    expect(execError).toHaveTextContent(
      "Unable to execute bounded HLD design model rebuild."
    );
    const execErrorText = execError.textContent ?? "";
    expect(execErrorText).not.toContain("REBUILD-EXECUTE-SERVER-JSON-LEAK-CANARY");
    expect(execErrorText).not.toContain("REBUILD-EXECUTE-PROVIDER-CANARY");
    expect(execErrorText).not.toContain(
      "hld_design_model_rebuild_drafting_unavailable"
    );

    // A failed execution opens no new draft and triggers no final HLD output.
    expect(
      calls.some((c) => c.url === HLD_DESIGN_MODEL_REBUILT_DETAIL_URL)
    ).toBe(false);
    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  // --- Stage 6E-D bounded design-model rebuild-request create surface -------

  it("creates a bounded rebuild request with exactly the four allowed body keys, then refreshes the list so the create form disappears and Execute becomes enabled", async () => {
    let created = false;
    const calls = stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        undefined,
        undefined,
        // Dynamic list: empty until a request is created, ready afterwards.
        () =>
          created
            ? designModelRebuildRequestListReady()
            : designModelRebuildRequestListEmpty(),
        undefined,
        (init) => {
          created = true;
          // The route returns 201 { artifact } on success.
          return jsonResponse(
            { artifact: designModelRebuildRequestListItem() },
            201
          );
        }
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    // The create form is eligible (justified review, empty request list) and the
    // instructions field is prefilled from the advisory bounded instructions.
    const createForm = await screen.findByTestId(
      "hld-design-model-rebuild-request-create"
    );
    expect(createForm).toBeInTheDocument();
    const reason = screen.getByTestId(
      "hld-design-model-rebuild-request-reason"
    ) as HTMLTextAreaElement;
    const instructions = screen.getByTestId(
      "hld-design-model-rebuild-request-instructions"
    ) as HTMLTextAreaElement;
    expect(instructions.value).toContain("REVIEW-REBUILD-INSTRUCTIONS-CANARY");

    await act(async () => {
      fireEvent.change(reason, {
        target: { value: "Address the excluded scope domain." },
      });
      fireEvent.change(instructions, {
        target: { value: "Restate the affected section from the same inputs." },
      });
    });

    const submit = screen.getByTestId("hld-design-model-rebuild-request-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(submit);
    });

    // The POST carries exactly the four allowed keys and no forbidden field.
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL &&
            c.init?.method === "POST"
        )
      ).toBe(true);
    });
    const post = calls.find(
      (c) =>
        c.url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL &&
        c.init?.method === "POST"
    );
    const parsed = JSON.parse(String(post?.init?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(parsed).sort()).toEqual([
      "instructions",
      "reason",
      "sourceHldDesignModelArtifactId",
      "sourceReviewArtifactId",
    ]);
    expect(parsed.sourceHldDesignModelArtifactId).toBe(
      HLD_DESIGN_MODEL_ARTIFACT_ID
    );
    expect(parsed.sourceReviewArtifactId).toBe(
      HLD_DESIGN_MODEL_REVIEW_ARTIFACT_ID
    );
    for (const forbidden of [
      "tenantId",
      "projectId",
      "userId",
      "status",
      "payload",
      "sourceArtifactIds",
      "sku",
      "pricing",
      "catalog",
      "config",
      "executor",
      "provider",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(parsed, forbidden)).toBe(
        false
      );
    }

    // Compact success copy appears.
    const success = await screen.findByTestId(
      "hld-design-model-rebuild-request-success"
    );
    expect(success).toHaveTextContent("Bounded rebuild requested");

    // The list refresh makes the create form disappear and Execute enable.
    await waitFor(() => {
      expect(
        screen.queryByTestId("hld-design-model-rebuild-request-create")
      ).toBeNull();
    });
    const executeBtn = await screen.findByTestId(
      "hld-design-model-rebuild-execute"
    );
    await waitFor(() => expect(executeBtn).not.toBeDisabled());

    // No execution was triggered and no final HLD route was posted.
    expect(
      calls.some(
        (c) =>
          c.url === HLD_DESIGN_MODEL_REBUILD_EXECUTE_URL &&
          c.init?.method === "POST"
      )
    ).toBe(false);
    expect(finalHldPosts(calls)).toHaveLength(0);
  });

  it("does not offer a create action and never POSTs when the current advisory review does not justify a rebuild", async () => {
    const calls = stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        designModelReviewDetailNonJustifying()
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    // Detail loaded and matches, but the review does not justify a rebuild.
    await screen.findByTestId("hld-design-model-rebuild-request-ineligible");
    expect(
      screen.queryByTestId("hld-design-model-rebuild-request-create")
    ).toBeNull();
    expect(
      screen.queryByTestId("hld-design-model-rebuild-request-submit")
    ).toBeNull();

    // No create POST was ever made.
    expect(
      calls.some(
        (c) =>
          c.url === HLD_DESIGN_MODEL_REBUILD_REQUEST_LIST_URL &&
          c.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("shows a compact create error that never leaks server JSON/codes/provider text and makes no final HLD POST when creation fails", async () => {
    const calls = stubFetch(
      designModelFetch(
        designModelListReady(),
        undefined,
        undefined,
        designModelReviewListReady(),
        undefined,
        undefined,
        designModelRebuildRequestListEmpty(),
        undefined,
        () =>
          jsonResponse(
            {
              code: "hld_design_model_rebuild_request_payload_invalid",
              providerDetail: "REBUILD-CREATE-SERVER-JSON-LEAK-CANARY",
              errors: ["REBUILD-CREATE-PROVIDER-CANARY"],
            },
            409
          )
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-design-model-review-summary");
    const inspect = await screen.findByTestId("hld-design-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const reason = await screen.findByTestId(
      "hld-design-model-rebuild-request-reason"
    );
    const instructions = screen.getByTestId(
      "hld-design-model-rebuild-request-instructions"
    );
    await act(async () => {
      fireEvent.change(reason, { target: { value: "Address the gap." } });
      fireEvent.change(instructions, { target: { value: "Restate it." } });
    });
    const submit = screen.getByTestId("hld-design-model-rebuild-request-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(submit);
    });

    const createError = await screen.findByTestId(
      "hld-design-model-rebuild-request-error"
    );
    expect(createError).toHaveTextContent(
      "Unable to request bounded HLD design model rebuild."
    );
    const errorText = createError.textContent ?? "";
    expect(errorText).not.toContain("REBUILD-CREATE-SERVER-JSON-LEAK-CANARY");
    expect(errorText).not.toContain("REBUILD-CREATE-PROVIDER-CANARY");
    expect(errorText).not.toContain(
      "hld_design_model_rebuild_request_payload_invalid"
    );

    expect(finalHldPosts(calls)).toHaveLength(0);
  });
});

describe("ProjectRfpEvidencePage - Stage 6G-A HLD diagram draft surface", () => {
  // Final HLD diagram-output / document / proposal POST routes the diagram draft
  // slice must never call. It is allowed to GET/POST the internal /rfp/hld-diagram
  // draft list/create route.
  const FINAL_DIAGRAM_POST_ROUTES = [
    "/rfp/hld-diagram/generate",
    "/rfp/hld-diagram/download",
    "/rfp/hld-diagram/upload",
    "/rfp/hld-diagram/export",
    "/rfp/hld-diagram/final",
    "/rfp/hld-document",
    "/rfp/hld-proposal",
    "/rfp/hld-html",
    "/rfp/drawio",
    "/rfp/hld-export",
  ];
  function finalDiagramPosts(calls: FetchCall[]): FetchCall[] {
    return calls.filter(
      (c) =>
        c.init?.method === "POST" &&
        FINAL_DIAGRAM_POST_ROUTES.some((route) => c.url.includes(route))
    );
  }

  function diagramFetch(
    readinessBody: Record<string, unknown>,
    listBody: Record<string, unknown> = hldDiagramListEmpty(),
    detailBody: Record<string, unknown> = hldDiagramDetailResponse(),
    onCreate?: (init?: RequestInit) => Response,
    onReview?: (init?: RequestInit) => Response
  ): (url: string, init?: RequestInit) => Response {
    return (url, init) => {
      if (url === HLD_DIAGRAM_REVIEW_URL && init?.method === "POST") {
        return onReview ? onReview(init) : jsonResponse({ ok: true }, 200);
      }
      if (url === HLD_DIAGRAM_LIST_URL) {
        if (init?.method === "POST") {
          return onCreate
            ? onCreate(init)
            : jsonResponse(
                { artifact: hldDiagramListItem(), payloadSummary: {} },
                201
              );
        }
        return jsonResponse(listBody);
      }
      if (url === HLD_DIAGRAM_DETAIL_URL) return jsonResponse(detailBody);
      if (url === HLD_GENERATION_READINESS_URL) return jsonResponse(readinessBody);
      return jsonResponse({}, 200);
    };
  }

  it("renders the panel as blocked and hides the create button when Stage 6F readiness is blocked", async () => {
    stubFetch(diagramFetch(hldGenerationReadinessBlocked()));
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-diagram-panel");
    expect(within(panel).getByTestId("hld-diagram-readiness")).toHaveTextContent(
      "Blocked"
    );
    expect(await screen.findByTestId("hld-diagram-blocked")).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-create")).toBeNull();
    // Empty internal draft list -> empty state, not a table.
    expect(await screen.findByTestId("hld-diagram-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-list")).toBeNull();
  });

  it("renders the create button and a compact empty state when Stage 6F readiness is ready", async () => {
    stubFetch(diagramFetch(hldGenerationReadinessReady()));
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-diagram-panel");
    const createBtn = await screen.findByTestId("hld-diagram-create");
    expect(createBtn).not.toBeDisabled();
    expect(createBtn.textContent ?? "").toContain("Create HLD diagram draft");
    expect(await screen.findByTestId("hld-diagram-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-blocked")).toBeNull();
  });

  it("creates a diagram draft posting no body/authority fields, refreshes the list, opens the new draft, and makes no final-output POST", async () => {
    const calls = stubFetch(diagramFetch(hldGenerationReadinessReady()));
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId("hld-diagram-create");
    const listGetsBefore = calls.filter(
      (c) => c.url === HLD_DIAGRAM_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_DIAGRAM_LIST_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DIAGRAM_LIST_URL && c.init?.method === "POST"
    );
    const rawBody = post?.init?.body;
    const bodyText =
      rawBody === undefined || rawBody === null ? "" : String(rawBody);
    // No body is sent; no authority/source/payload field rides along.
    expect(rawBody === undefined || rawBody === null || bodyText === "{}").toBe(
      true
    );
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "status",
      "sourceArtifactIds",
      "sourceHldDesignModelArtifactId",
      "payload",
      "artifactId",
      "diagramType",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    // The list refreshes and the created draft opens for inspection.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DIAGRAM_LIST_URL && (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      await screen.findByTestId("hld-diagram-create-success")
    ).toBeInTheDocument();
    await screen.findByTestId("hld-diagram-drawer-content");

    expect(finalDiagramPosts(calls)).toHaveLength(0);
  });

  it("inspects a draft into the drawer with resolved node/link/zone labels and validation findings, raw ids only in the collapsed audit", async () => {
    stubFetch(
      diagramFetch(hldGenerationReadinessReady(), hldDiagramListResponse())
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const content = await screen.findByTestId("hld-diagram-drawer-content");
    expect(screen.getByTestId("hld-diagram-drawer-nodes")).toHaveTextContent(
      "HLD-DIAGRAM-NODE-CORE-CANARY"
    );
    // Links resolve node ids to labels rather than showing the raw ids.
    const linksSection = screen.getByTestId("hld-diagram-drawer-links");
    expect(linksSection).toHaveTextContent("HLD-DIAGRAM-NODE-CORE-CANARY");
    expect(linksSection).toHaveTextContent("HLD-DIAGRAM-NODE-ACCESS-CANARY");
    expect(screen.getByTestId("hld-diagram-drawer-zones")).toHaveTextContent(
      "HLD-DIAGRAM-ZONE-CANARY"
    );
    expect(screen.getByTestId("hld-diagram-drawer-findings")).toHaveTextContent(
      "HLD-DIAGRAM-FINDING-CANARY"
    );

    // Raw artifact/source/model/node/link/zone ids live ONLY in the collapsed audit.
    const audit = content.querySelector(
      "[data-testid='hld-diagram-drawer-audit']"
    );
    expect(audit).not.toBeNull();
    expect((audit as HTMLElement).tagName).toBe("DETAILS");
    expect((audit as HTMLElement).hasAttribute("open")).toBe(false);
    expect(audit?.textContent ?? "").toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);

    const outside = content.cloneNode(true) as HTMLElement;
    outside
      .querySelector("[data-testid='hld-diagram-drawer-audit']")
      ?.remove();
    const outsideText = outside.textContent ?? "";
    expect(outsideText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(outsideText).not.toContain(HLD_DIAGRAM_SOURCE_BUNDLE_ID);
    expect(outsideText).not.toContain(HLD_DIAGRAM_REVIEW_ID);
    expect(outsideText).not.toContain("node-core-1");
    expect(outsideText).not.toContain("link-uplink-1");
    expect(outsideText).not.toContain("zone-core-1");
    // The needs_review review controls also keep raw ids out of the primary view.
    const review = content.querySelector("[data-testid='hld-diagram-review']");
    expect(review).not.toBeNull();
    const reviewText = (review as HTMLElement).textContent ?? "";
    expect(reviewText).not.toContain(HLD_DESIGN_MODEL_ARTIFACT_ID);
    expect(reviewText).not.toContain(HLD_DIAGRAM_SOURCE_BUNDLE_ID);
    expect(reviewText).not.toContain(HLD_DIAGRAM_REVIEW_ID);
    expect(reviewText).not.toContain(HLD_DIAGRAM_ARTIFACT_ID);
    expect(reviewText).not.toContain("node-core-1");
    expect(reviewText).not.toContain("link-uplink-1");
    expect(reviewText).not.toContain("zone-core-1");
  });

  it("exposes approve/request-changes controls for a needs_review diagram draft", async () => {
    stubFetch(
      diagramFetch(hldGenerationReadinessReady(), hldDiagramListResponse())
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("hld-diagram-drawer-content");
    expect(screen.getByTestId("hld-diagram-review")).toBeInTheDocument();
    expect(screen.getByTestId("hld-diagram-review-note")).toBeInTheDocument();
    expect(screen.getByTestId("hld-diagram-approve")).toBeInTheDocument();
    expect(screen.getByTestId("hld-diagram-reject")).toBeInTheDocument();
  });

  it("approves a draft posting exactly { decision: approve }, refreshes list and detail, shows compact success, and makes no final-output POST", async () => {
    const calls = stubFetch(
      diagramFetch(hldGenerationReadinessReady(), hldDiagramListResponse())
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-diagram-drawer-content");

    const listGetsBefore = calls.filter(
      (c) => c.url === HLD_DIAGRAM_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;
    const detailGetsBefore = calls.filter(
      (c) => c.url === HLD_DIAGRAM_DETAIL_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-diagram-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_DIAGRAM_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DIAGRAM_REVIEW_URL && c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({ decision: "approve" });
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "status",
      "stage",
      "type",
      "sourceArtifactIds",
      "payload",
      "note",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DIAGRAM_LIST_URL && (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      calls.filter(
        (c) =>
          c.url === HLD_DIAGRAM_DETAIL_URL && (c.init?.method ?? "GET") === "GET"
      ).length
    ).toBeGreaterThan(detailGetsBefore);
    expect(
      await screen.findByTestId("hld-diagram-review-success")
    ).toBeInTheDocument();
    expect(finalDiagramPosts(calls)).toHaveLength(0);
  });

  it("requests changes with a note posting exactly { decision: reject, note }, refreshes list and detail, shows compact success, and makes no final-output POST", async () => {
    const calls = stubFetch(
      diagramFetch(hldGenerationReadinessReady(), hldDiagramListResponse())
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-diagram-drawer-content");

    const listGetsBefore = calls.filter(
      (c) => c.url === HLD_DIAGRAM_LIST_URL && (c.init?.method ?? "GET") === "GET"
    ).length;
    const detailGetsBefore = calls.filter(
      (c) => c.url === HLD_DIAGRAM_DETAIL_URL && (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.change(screen.getByTestId("hld-diagram-review-note"), {
        target: { value: "  please relabel the core zone  " },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-diagram-reject"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === HLD_DIAGRAM_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DIAGRAM_REVIEW_URL && c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({
      decision: "reject",
      note: "please relabel the core zone",
    });
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "status",
      "stage",
      "type",
      "sourceArtifactIds",
      "payload",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DIAGRAM_LIST_URL && (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      calls.filter(
        (c) =>
          c.url === HLD_DIAGRAM_DETAIL_URL && (c.init?.method ?? "GET") === "GET"
      ).length
    ).toBeGreaterThan(detailGetsBefore);
    expect(
      await screen.findByTestId("hld-diagram-review-success")
    ).toBeInTheDocument();
    expect(finalDiagramPosts(calls)).toHaveLength(0);
  });

  it("shows an approved draft read-only with no approve/request-changes buttons", async () => {
    stubFetch(
      diagramFetch(
        hldGenerationReadinessReady(),
        hldDiagramListResponse(),
        hldDiagramDetailResponse(HLD_DIAGRAM_ARTIFACT_ID, "approved")
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("hld-diagram-drawer-content");
    expect(
      screen.getByTestId("hld-diagram-review-approved")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-review")).toBeNull();
    expect(screen.queryByTestId("hld-diagram-approve")).toBeNull();
    expect(screen.queryByTestId("hld-diagram-reject")).toBeNull();
  });

  it("shows a rejected/requested-changes draft read-only with no approve/request-changes buttons", async () => {
    stubFetch(
      diagramFetch(
        hldGenerationReadinessReady(),
        hldDiagramListResponse(),
        hldDiagramDetailResponse(HLD_DIAGRAM_ARTIFACT_ID, "rejected")
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("hld-diagram-drawer-content");
    expect(
      screen.getByTestId("hld-diagram-review-rejected")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-review")).toBeNull();
    expect(screen.queryByTestId("hld-diagram-approve")).toBeNull();
    expect(screen.queryByTestId("hld-diagram-reject")).toBeNull();
  });
});

describe("ProjectRfpEvidencePage - Stage 6H-A HLD document model surface", () => {
  // Final document-output / proposal POST routes the internal document-model
  // surface must never call. It may GET/POST the internal /rfp/hld-document-model
  // list/create route and the artifact-scoped /hld-document-model/review route
  // (Stage 6H-B); only the document-output suffixes below stay forbidden.
  const FINAL_DOC_MODEL_ROUTES = [
    "/rfp/hld-document-model/download",
    "/rfp/hld-document-model/upload",
    "/rfp/hld-document-model/export",
    "/rfp/hld-document-model/final",
    "/rfp/hld-document-model/generate",
    "/rfp/hld-document-model/render",
    "/rfp/hld-document/review",
    "/rfp/hld-document/download",
    "/rfp/hld-document/upload",
    "/rfp/hld-document/export",
    "/rfp/hld-document/final",
    "/rfp/hld-proposal",
    "/rfp/hld-html",
    "/rfp/drawio",
    "/rfp/hld-export",
  ];
  function finalDocModelCalls(calls: FetchCall[]): FetchCall[] {
    return calls.filter((c) =>
      FINAL_DOC_MODEL_ROUTES.some((route) => c.url.includes(route))
    );
  }

  function approvedDiagramList(): Record<string, unknown> {
    return {
      project: projectContext(),
      artifactCount: 1,
      artifacts: [hldDiagramListItem(HLD_DIAGRAM_ARTIFACT_ID, "approved")],
    };
  }

  function docModelFetch(
    readinessBody: Record<string, unknown>,
    diagramListBody: Record<string, unknown> = hldDiagramListEmpty(),
    docListBody: Record<string, unknown> = hldDocumentModelListEmpty(),
    docDetailBody: Record<string, unknown> = hldDocumentModelDetailResponse(),
    onCreate?: (init?: RequestInit) => Response,
    onReview?: (init?: RequestInit) => Response
  ): (url: string, init?: RequestInit) => Response {
    return (url, init) => {
      if (url === HLD_DOCUMENT_MODEL_REVIEW_URL && init?.method === "POST") {
        return onReview ? onReview(init) : jsonResponse({ ok: true }, 200);
      }
      if (url === HLD_DOCUMENT_MODEL_LIST_URL) {
        if (init?.method === "POST") {
          return onCreate
            ? onCreate(init)
            : jsonResponse(
                { artifact: { id: HLD_DOCUMENT_MODEL_ARTIFACT_ID } },
                201
              );
        }
        return jsonResponse(docListBody);
      }
      if (url === HLD_DOCUMENT_MODEL_DETAIL_URL) {
        return jsonResponse(docDetailBody);
      }
      if (url === HLD_DIAGRAM_LIST_URL) return jsonResponse(diagramListBody);
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(readinessBody);
      }
      return jsonResponse({}, 200);
    };
  }

  it("renders the document-model panel after the HLD diagram panel and hides the create button when Stage 6F readiness is blocked", async () => {
    stubFetch(docModelFetch(hldGenerationReadinessBlocked()));
    render(<ProjectRfpEvidencePage />);

    const diagramPanel = await screen.findByTestId("hld-diagram-panel");
    const docPanel = await screen.findByTestId("hld-document-model-panel");
    // The document model is an internal stage that follows the diagram panel.
    expect(
      diagramPanel.compareDocumentPosition(docPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(
      within(docPanel).getByTestId("hld-document-model-readiness")
    ).toHaveTextContent("Blocked");
    expect(
      await screen.findByTestId("hld-document-model-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-document-model-create")).toBeNull();
    expect(
      await screen.findByTestId("hld-document-model-empty")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-document-model-list")).toBeNull();
  });

  it("hides the create button when Stage 6F readiness is ready but no approved hld_diagram exists", async () => {
    stubFetch(
      docModelFetch(hldGenerationReadinessReady(), hldDiagramListEmpty())
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-document-model-panel");
    expect(
      await screen.findByTestId("hld-document-model-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-document-model-create")).toBeNull();
  });

  it("shows the create button when Stage 6F readiness is ready and an approved hld_diagram exists", async () => {
    stubFetch(
      docModelFetch(hldGenerationReadinessReady(), approvedDiagramList())
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-document-model-panel");
    const createBtn = await screen.findByTestId("hld-document-model-create");
    expect(createBtn).not.toBeDisabled();
    expect(createBtn.textContent ?? "").toContain("Create HLD document model");
    expect(screen.queryByTestId("hld-document-model-blocked")).toBeNull();
  });

  it("creates a document model posting no body and no authority/source/payload field, refreshes the list, opens the new artifact drawer, fetches sanitized detail, and makes no final-output call", async () => {
    const calls = stubFetch(
      docModelFetch(hldGenerationReadinessReady(), approvedDiagramList())
    );
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId("hld-document-model-create");
    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DOCUMENT_MODEL_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_LIST_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DOCUMENT_MODEL_LIST_URL && c.init?.method === "POST"
    );
    const rawBody = post?.init?.body;
    const bodyText =
      rawBody === undefined || rawBody === null ? "" : String(rawBody);
    // No body is sent; no tenant/project/user/source/status/payload/authority/
    // SKU/pricing/catalog/config/provider field rides along.
    expect(rawBody === undefined || rawBody === null || bodyText === "{}").toBe(
      true
    );
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "userId",
      "status",
      "sourceArtifactIds",
      "sourceHldDesignModelArtifactId",
      "sourceHldDiagramArtifactId",
      "payload",
      "authority",
      "sku",
      "pricing",
      "catalog",
      "config",
      "provider",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    // The list refreshes and the created artifact opens with sanitized detail.
    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      await screen.findByTestId("hld-document-model-create-success")
    ).toBeInTheDocument();
    await screen.findByTestId("hld-document-model-drawer-content");
    expect(
      calls.some(
        (c) =>
          c.url === HLD_DOCUMENT_MODEL_DETAIL_URL &&
          (c.init?.method ?? "GET") === "GET"
      )
    ).toBe(true);

    expect(finalDocModelCalls(calls)).toHaveLength(0);
  });

  it("renders needs_review, approved, and rejected document-model rows when present", async () => {
    const multiList: Record<string, unknown> = {
      project: projectContext(),
      artifactCount: 3,
      artifacts: [
        hldDocumentModelListItem("art-doc-model-nr", "needs_review", 3),
        hldDocumentModelListItem("art-doc-model-ap", "approved", 2),
        hldDocumentModelListItem("art-doc-model-rj", "rejected", 1),
      ],
    };
    stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        multiList
      )
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-document-model-panel");
    const list = await screen.findByTestId("hld-document-model-list");
    expect(screen.getAllByTestId("hld-document-model-row")).toHaveLength(3);
    const listText = list.textContent ?? "";
    expect(listText).toMatch(/needs review/i);
    expect(listText).toMatch(/approved/i);
    expect(listText).toMatch(/rejected/i);
  });

  it("inspects a document model into the drawer with all structured sections and raw ids only inside the collapsed audit", async () => {
    stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const content = await screen.findByTestId(
      "hld-document-model-drawer-content"
    );
    const sections: [string, string][] = [
      ["hld-document-model-drawer-purpose", "HLD-DOCMODEL-PURPOSE-CANARY"],
      ["hld-document-model-drawer-domains", "campus switching"],
      ["hld-document-model-drawer-assumptions", "HLD-DOCMODEL-ASSUMPTION-CANARY"],
      ["hld-document-model-drawer-design", "HLD-DOCMODEL-DESIGN-SECTION-CANARY"],
      ["hld-document-model-drawer-topology", "HLD-DOCMODEL-TOPOLOGY-CANARY"],
      ["hld-document-model-drawer-sites", "HLD-DOCMODEL-SITE-CANARY"],
      ["hld-document-model-drawer-implementation", "HLD-DOCMODEL-IMPL-CANARY"],
      ["hld-document-model-drawer-dependencies", "HLD-DOCMODEL-DEP-CANARY"],
      ["hld-document-model-drawer-risks", "HLD-DOCMODEL-RISK-CANARY"],
      ["hld-document-model-drawer-compliance", "HLD-DOCMODEL-COMPLIANCE-CANARY"],
      ["hld-document-model-drawer-boq", "HLD-DOCMODEL-BOQ-CANARY"],
      ["hld-document-model-drawer-diagrams", "HLD-DOCMODEL-DIAGRAM-REF-CANARY"],
      ["hld-document-model-drawer-findings", "HLD-DOCMODEL-FINDING-CANARY"],
    ];
    for (const [testId, canary] of sections) {
      expect(within(content).getByTestId(testId)).toHaveTextContent(canary);
    }

    // Raw artifact/source/diagram ids live ONLY in the collapsed audit.
    const audit = content.querySelector(
      "[data-testid='hld-document-model-drawer-audit']"
    );
    expect(audit).not.toBeNull();
    expect((audit as HTMLElement).tagName).toBe("DETAILS");
    expect((audit as HTMLElement).hasAttribute("open")).toBe(false);
    expect(audit?.textContent ?? "").toContain(HLD_DOCUMENT_MODEL_ARTIFACT_ID);

    const outside = content.cloneNode(true) as HTMLElement;
    outside
      .querySelector("[data-testid='hld-document-model-drawer-audit']")
      ?.remove();
    const outsideText = outside.textContent ?? "";
    expect(outsideText).not.toContain(HLD_DOCUMENT_MODEL_ARTIFACT_ID);
    expect(outsideText).not.toContain(HLD_DOC_MODEL_SOURCE_BUNDLE_ID);
    expect(outsideText).not.toContain(HLD_DOC_MODEL_DESIGN_MODEL_ID);
    expect(outsideText).not.toContain(HLD_DOC_MODEL_DIAGRAM_ID);
  });

  it("renders no raw JSON/pre dump in the document-model drawer and calls no document-model output route", async () => {
    const calls = stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const content = await screen.findByTestId(
      "hld-document-model-drawer-content"
    );
    // No raw JSON/pre/blob dump in the drawer.
    expect(content.querySelector("pre")).toBeNull();
    // No document-output (download/upload/export/final/generate/render) route is
    // ever called from the inspection surface.
    expect(finalDocModelCalls(calls)).toHaveLength(0);
  });

  // ---- Stage 6H-B HLD document model review controls -----------------------

  it("exposes approve/request-changes controls and a note input for a needs_review document model", async () => {
    stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("hld-document-model-drawer-content");
    expect(screen.getByTestId("hld-document-model-review")).toBeInTheDocument();
    expect(
      screen.getByTestId("hld-document-model-review-note")
    ).toBeInTheDocument();
    expect(screen.getByTestId("hld-document-model-approve")).toBeInTheDocument();
    expect(screen.getByTestId("hld-document-model-reject")).toBeInTheDocument();
  });

  it("keeps an approved document model readable and read-only with no approve/request-changes controls", async () => {
    stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse("approved"),
        hldDocumentModelDetailResponse(
          HLD_DOCUMENT_MODEL_ARTIFACT_ID,
          "approved"
        )
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const content = await screen.findByTestId(
      "hld-document-model-drawer-content"
    );
    // The structured spine is still readable.
    expect(
      within(content).getByTestId("hld-document-model-drawer-purpose")
    ).toHaveTextContent("HLD-DOCMODEL-PURPOSE-CANARY");
    // But there are no review controls.
    expect(screen.queryByTestId("hld-document-model-review")).toBeNull();
    expect(screen.queryByTestId("hld-document-model-approve")).toBeNull();
    expect(screen.queryByTestId("hld-document-model-reject")).toBeNull();
    expect(
      screen.getByTestId("hld-document-model-review-approved")
    ).toBeInTheDocument();
  });

  it("keeps a rejected document model readable and read-only with no approve/request-changes controls", async () => {
    stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse("rejected"),
        hldDocumentModelDetailResponse(
          HLD_DOCUMENT_MODEL_ARTIFACT_ID,
          "rejected"
        )
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("hld-document-model-drawer-content");
    expect(screen.queryByTestId("hld-document-model-review")).toBeNull();
    expect(screen.queryByTestId("hld-document-model-approve")).toBeNull();
    expect(screen.queryByTestId("hld-document-model-reject")).toBeNull();
    expect(
      screen.getByTestId("hld-document-model-review-rejected")
    ).toBeInTheDocument();
  });

  it("approves a document model posting exactly { decision: approve }, refreshes list and detail, shows compact success, and makes no output POST", async () => {
    const calls = stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-document-model-drawer-content");

    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DOCUMENT_MODEL_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;
    const detailGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DOCUMENT_MODEL_DETAIL_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-document-model-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DOCUMENT_MODEL_REVIEW_URL && c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({ decision: "approve" });
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "source",
      "status",
      "payload",
      "authority",
      "sku",
      "pricing",
      "catalog",
      "config",
      "provider",
      "note",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      calls.filter(
        (c) =>
          c.url === HLD_DOCUMENT_MODEL_DETAIL_URL &&
          (c.init?.method ?? "GET") === "GET"
      ).length
    ).toBeGreaterThan(detailGetsBefore);
    expect(
      await screen.findByTestId("hld-document-model-review-success")
    ).toBeInTheDocument();
    expect(finalDocModelCalls(calls)).toHaveLength(0);
  });

  it("requests changes with a note posting exactly { decision: reject, note }, refreshes list and detail, shows compact success, and makes no output POST", async () => {
    const calls = stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-document-model-drawer-content");

    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DOCUMENT_MODEL_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;
    const detailGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DOCUMENT_MODEL_DETAIL_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.change(screen.getByTestId("hld-document-model-review-note"), {
        target: { value: "  tighten the site scope summary  " },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-document-model-reject"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DOCUMENT_MODEL_REVIEW_URL && c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({
      decision: "reject",
      note: "tighten the site scope summary",
    });
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "source",
      "status",
      "payload",
      "authority",
      "sku",
      "pricing",
      "catalog",
      "config",
      "provider",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      calls.filter(
        (c) =>
          c.url === HLD_DOCUMENT_MODEL_DETAIL_URL &&
          (c.init?.method ?? "GET") === "GET"
      ).length
    ).toBeGreaterThan(detailGetsBefore);
    expect(
      await screen.findByTestId("hld-document-model-review-success")
    ).toBeInTheDocument();
    expect(finalDocModelCalls(calls)).toHaveLength(0);
  });

  it("shows a stable compact error and dumps no raw server JSON when a review fails", async () => {
    const calls = stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse(),
        hldDocumentModelDetailResponse(),
        undefined,
        () =>
          jsonResponse(
            { error: "DOC_MODEL_REVIEW_RAW_SERVER_CANARY", code: 500 },
            500
          )
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-document-model-drawer-content");

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-document-model-approve"));
    });

    const error = await screen.findByTestId("hld-document-model-review-error");
    expect(error).toHaveTextContent("Unable to review HLD document model.");
    // The stable copy is shown; the raw server payload never reaches the DOM.
    expect(document.body.textContent ?? "").not.toContain(
      "DOC_MODEL_REVIEW_RAW_SERVER_CANARY"
    );
    expect(screen.queryByTestId("hld-document-model-review-success")).toBeNull();
    expect(finalDocModelCalls(calls)).toHaveLength(0);
  });

  it("calls no document-model output/download/upload/export/final/generate/render route across an approve review", async () => {
    const calls = stubFetch(
      docModelFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDocumentModelListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-document-model-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-document-model-drawer-content");

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-document-model-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DOCUMENT_MODEL_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    // The only POST is the artifact-scoped review; no output/final route fires.
    expect(finalDocModelCalls(calls)).toHaveLength(0);
    for (const route of [
      "/hld-document-model/download",
      "/hld-document-model/upload",
      "/hld-document-model/export",
      "/hld-document-model/final",
      "/hld-document-model/generate",
      "/hld-document-model/render",
    ]) {
      expect(calls.some((c) => c.url.includes(route))).toBe(false);
    }
  });
});

describe("ProjectRfpEvidencePage static guards", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-rfp-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  // Precise matcher for the forbidden final /rfp/hld-document authority-write
  // suffixes (review/download/upload/export/final/render). It deliberately does
  // NOT match the allowed internal /rfp/hld-document-model route (which has a
  // "-model" suffix), the Stage 6I-E lean status GET (bare /rfp/hld-document),
  // or the Stage 6I-E generated create POST (/rfp/hld-document/generated).
  // Existing guards that forbade the bare "/rfp/hld-document" output route now
  // use this so they keep forbidding the final-authority routes while allowing
  // the Stage 6I-E readiness status GET and generated create POST.
  const FINAL_HLD_DOCUMENT_ROUTE_RE =
    /\/rfp\/hld-document\/(?:review|download|upload|export|final|render)(?:$|["'`/?#])/;

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
    expect(source).toContain("/rfp/hld-readiness-snapshot");
    expect(source).toContain("/rfp/hld-intake");
    expect(source).toContain("/rfp/hld-knowledge-packs");
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

  it("wires the HLD source-bundle routes and adds no future HLD generation, document, draw.io, or proposal route", () => {
    expect(source).toContain("/rfp/hld-source-bundle");
    // The source-bundle surface is read/compile/review only; it must never call
    // any future HLD model/diagram/document/html/draw.io/proposal route.
    for (const forbidden of [
      "/rfp/hld-model",
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("wires the HLD design-model routes and adds no future final HLD document, diagram, draw.io, or proposal route", () => {
    expect(source).toContain("/rfp/hld-design-model");
    // The design-model surface is read/create/review only; it must never call
    // any final HLD diagram/document/html/draw.io/proposal route. The internal
    // /rfp/hld-diagram draft list/create route is allowed (Stage 6G-A); only its
    // final-output variants stay forbidden.
    for (const forbidden of [
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("wires the advisory deterministic design-model review route and adds no final-output route or server-service import", () => {
    // The advisory review surface is wired and posts only the model artifact id.
    expect(source).toContain("/rfp/hld-design-model-review");
    expect(source).toContain("sourceHldDesignModelArtifactId");
    // It stays advisory: no final HLD document/diagram/html/draw.io/proposal/
    // export route call may appear anywhere in the page source. The internal
    // /rfp/hld-diagram draft route is allowed; only its final-output variants
    // stay forbidden.
    for (const forbidden of [
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // And it imports no review server service, store, or provider SDK.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-design-model-review",
      "project-rfp-hld-design-model-review-inspection",
      "project-rfp-hld-design-model-review-deterministic",
      "@/lib/db/",
      "@anthropic-ai/sdk",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("wires the HLD generation-readiness gate without final-output route, POST action, or server-service import", () => {
    expect(source).toContain("/rfp/hld-generation-readiness");
    expect(source).toContain("hld-generation-readiness-panel");
    expect(source).not.toContain("/rfp/hld-generation-readiness/generate");
    for (const forbidden of [
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-generation-readiness",
      "@/lib/db/",
      "@anthropic-ai/sdk",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });
  it("wires the bounded design-model rebuild-request discovery and execute routes with no final-output route or server-service import", () => {
    // The discovery (GET list) and execute (POST) routes are both wired.
    expect(source).toContain("/rfp/hld-design-model-rebuild-request");
    expect(source).toContain("/hld-design-model-rebuild-request/execute");
    // Executing a bounded rebuild stays subordinate to a fresh review and
    // engineer approval: no final HLD document/diagram/html/draw.io/proposal/
    // export route may appear anywhere in the page source. The internal
    // /rfp/hld-diagram draft route is allowed; only its final-output variants
    // stay forbidden.
    for (const forbidden of [
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // And it imports no rebuild server service/executor/store or provider SDK.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-design-model-rebuild-request-service",
      "project-rfp-hld-design-model-rebuild-executor",
      "project-rfp-hld-design-model-rebuild-request",
      "project-rfp-hld-design-model-rebuild-candidate-input",
      "@/lib/db/",
      "@anthropic-ai/sdk",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("wires the internal Stage 6G-A HLD diagram draft route and panel but adds no final HLD output route, control, or server-service import", () => {
    // The internal draft list/create route and the compact panel are wired.
    expect(source).toContain("/rfp/hld-diagram");
    expect(source).toContain("hld-diagram-panel");
    // It is inspection/create only: no final HLD diagram-output, document, HTML,
    // draw.io, proposal, export, or final-variant route may appear in the source.
    for (const forbidden of [
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // And it imports no diagram server service/store or provider SDK into the page.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-diagram",
      "project-rfp-hld-diagram-draft",
      "project-rfp-hld-diagram-inspection",
      "@/lib/db/",
      "@anthropic-ai/sdk",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("wires the internal Stage 6G-B HLD diagram review route and controls but adds no final HLD output route or server-service import", () => {
    // The internal review route segment and the compact review controls are wired.
    expect(source).toContain("/hld-diagram/review");
    expect(source).toContain("hld-diagram-review");
    expect(source).toContain("hld-diagram-review-note");
    expect(source).toContain("hld-diagram-approve");
    expect(source).toContain("hld-diagram-reject");
    // Review is decision-only: no final HLD output route may appear in the source.
    for (const forbidden of [
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // And it imports no diagram review server service/store or provider SDK.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-diagram-review",
      "project-rfp-hld-diagram",
      "@/lib/db/",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai/sdk",
      "openai",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("wires the internal Stage 6H-A HLD document model route and panel but adds no document-output route, control, or server-service import", () => {
    // The internal draft list/create route and the compact panel are wired.
    expect(source).toContain("/rfp/hld-document-model");
    expect(source).toContain("hld-document-model-panel");
    // The bare future final /rfp/hld-document output route is forbidden, but the
    // allowed internal /rfp/hld-document-model route (with the -model suffix) is
    // not tripped by this matcher.
    expect(FINAL_HLD_DOCUMENT_ROUTE_RE.test(source)).toBe(false);
    // It is inspection/create plus the artifact-scoped review route (Stage 6H-B):
    // the document-model output suffixes and the final HLD document/diagram/html/
    // draw.io/proposal/export routes stay forbidden.
    for (const forbidden of [
      "/rfp/hld-document-model/download",
      "/rfp/hld-document-model/upload",
      "/rfp/hld-document-model/export",
      "/rfp/hld-document-model/final",
      "/rfp/hld-document-model/generate",
      "/rfp/hld-document-model/render",
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // And it imports no document-model server service/store or provider SDK.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-document-model-service",
      "project-rfp-hld-document-model-inspection",
      "project-rfp-hld-document-model",
      "@/lib/db/",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai/sdk",
      "openai",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("wires the internal Stage 6H-B HLD document model review route and controls but adds no document-output route or server-service import", () => {
    // The artifact-scoped review route segment and compact controls are wired.
    expect(source).toContain("/hld-document-model/review");
    expect(source).toContain("hld-document-model-review");
    expect(source).toContain("hld-document-model-review-note");
    expect(source).toContain("hld-document-model-approve");
    expect(source).toContain("hld-document-model-reject");
    // The bare future final /rfp/hld-document output route stays forbidden; the
    // allowed /rfp/hld-document-model route (with the -model suffix) and the
    // artifact-scoped review route do not trip the matcher.
    expect(FINAL_HLD_DOCUMENT_ROUTE_RE.test(source)).toBe(false);
    // Review is decision-only: no document-model output suffix and no final HLD
    // document/diagram/html/draw.io/proposal/export route may appear.
    for (const forbidden of [
      "/rfp/hld-document-model/download",
      "/rfp/hld-document-model/upload",
      "/rfp/hld-document-model/export",
      "/rfp/hld-document-model/final",
      "/rfp/hld-document-model/generate",
      "/rfp/hld-document-model/render",
      "/rfp/hld-diagram/generate",
      "/rfp/hld-diagram/download",
      "/rfp/hld-diagram/upload",
      "/rfp/hld-diagram/export",
      "/rfp/hld-diagram/final",
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // And it imports no document-model review server service/store or provider SDK.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-document-model-review",
      "project-rfp-hld-document-model",
      "@/lib/db/",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai/sdk",
      "openai",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });

  it("keeps the HLD document-model page section free of output-stage terms", () => {
    // Extract every marked HLD-DOC-MODEL-COPY section (drawer + panel) and assert
    // its added page comments and visible strings carry no output-stage vocab.
    const sections = Array.from(
      source.matchAll(
        /HLD-DOC-MODEL-COPY-START([\s\S]*?)HLD-DOC-MODEL-COPY-END/g
      )
    ).map((match) => match[1]);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const forbiddenTerms = [
      "final",
      "render",
      "rendered",
      "download",
      "upload",
      "export",
      "html",
      "pdf",
      "docx",
      "svg",
      "xml",
      "mermaid",
      "draw.io",
      "technical proposal",
      "proposal",
      "customer deliverable",
    ];
    for (const section of sections) {
      const lower = section.toLowerCase();
      for (const term of forbiddenTerms) {
        expect(lower).not.toContain(term);
      }
    }
  });
});

describe("ProjectRfpEvidencePage - Stage 6I-C internal HLD diagram output review gate", () => {
  // Final/customer output routes the internal diagram-output review gate must
  // never call. It may GET/POST the internal /rfp/hld-diagram-output list/create
  // route and the artifact-scoped /hld-diagram-output/review route.
  const FINAL_OUTPUT_ROUTES = [
    "/rfp/hld-diagram-output/download",
    "/rfp/hld-diagram-output/upload",
    "/rfp/hld-diagram-output/export",
    "/rfp/hld-diagram-output/final",
    "/rfp/hld-diagram-output/render",
    "/rfp/hld-diagram-output/drawio",
    "/rfp/hld-proposal",
    "/rfp/hld-html",
    "/rfp/drawio",
    "/rfp/hld-export",
  ];
  function finalOutputCalls(calls: FetchCall[]): FetchCall[] {
    return calls.filter((c) => {
      const path = new URL(c.url, "http://localhost").pathname;
      return (
        FINAL_OUTPUT_ROUTES.some((route) => path.includes(route)) ||
        // The Stage 6I-E lean status GET (/rfp/hld-document) and the generated
        // create POST (/rfp/hld-document/generated) are allowed; only the final
        // authority write suffixes stay forbidden here.
        /\/rfp\/hld-document\/(?:review|download|upload|export|final|render)(?:\/|$)/.test(
          path
        )
      );
    });
  }

  function approvedDiagramList(): Record<string, unknown> {
    return {
      project: projectContext(),
      artifactCount: 1,
      artifacts: [hldDiagramListItem(HLD_DIAGRAM_ARTIFACT_ID, "approved")],
    };
  }

  function outputFetch(
    readinessBody: Record<string, unknown>,
    diagramListBody: Record<string, unknown> = hldDiagramListEmpty(),
    outputListBody: Record<string, unknown> = hldDiagramOutputListEmpty(),
    outputDetailBody: Record<string, unknown> = hldDiagramOutputDetailResponse(),
    onCreate?: (init?: RequestInit) => Response,
    onReview?: (init?: RequestInit) => Response
  ): (url: string, init?: RequestInit) => Response {
    return (url, init) => {
      if (url === HLD_DIAGRAM_OUTPUT_REVIEW_URL && init?.method === "POST") {
        return onReview
          ? onReview(init)
          : jsonResponse({ artifactStatus: "approved" }, 200);
      }
      if (url === HLD_DIAGRAM_OUTPUT_LIST_URL) {
        if (init?.method === "POST") {
          return onCreate
            ? onCreate(init)
            : jsonResponse(
                { artifact: { id: HLD_DIAGRAM_OUTPUT_ARTIFACT_ID } },
                201
              );
        }
        return jsonResponse(outputListBody);
      }
      if (url === HLD_DIAGRAM_OUTPUT_DETAIL_URL) {
        return jsonResponse(outputDetailBody);
      }
      if (url === HLD_DIAGRAM_LIST_URL) return jsonResponse(diagramListBody);
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(readinessBody);
      }
      return jsonResponse({}, 200);
    };
  }

  it("renders the output panel after the HLD diagram panel and hides create when Stage 6F readiness is blocked", async () => {
    stubFetch(outputFetch(hldGenerationReadinessBlocked(), approvedDiagramList()));
    render(<ProjectRfpEvidencePage />);

    const diagramPanel = await screen.findByTestId("hld-diagram-panel");
    const outputPanel = await screen.findByTestId("hld-diagram-output-panel");
    expect(
      diagramPanel.compareDocumentPosition(outputPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const docPanel = await screen.findByTestId("hld-document-model-panel");
    // The output panel sits before the document-model panel.
    expect(
      outputPanel.compareDocumentPosition(docPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(
      await screen.findByTestId("hld-diagram-output-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-output-create")).toBeNull();
    expect(
      await screen.findByTestId("hld-diagram-output-empty")
    ).toBeInTheDocument();
  });

  it("hides create when readiness is ready but no approved hld_diagram exists", async () => {
    stubFetch(
      outputFetch(hldGenerationReadinessReady(), hldDiagramListEmpty())
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-diagram-output-panel");
    expect(
      await screen.findByTestId("hld-diagram-output-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-output-create")).toBeNull();
  });

  it("hides create when a generated/needs_review/approved output already exists", async () => {
    for (const status of ["generated", "needs_review", "approved"]) {
      cleanup();
      vi.unstubAllGlobals();
      stubFetch(
        outputFetch(
          hldGenerationReadinessReady(),
          approvedDiagramList(),
          hldDiagramOutputListResponse(status)
        )
      );
      render(<ProjectRfpEvidencePage />);
      await screen.findByTestId("hld-diagram-output-panel");
      await screen.findByTestId("hld-diagram-output-list");
      expect(screen.queryByTestId("hld-diagram-output-create")).toBeNull();
    }
  });

  it("shows create when readiness is ready, an approved hld_diagram exists, and the output list is empty or only rejected", async () => {
    // Empty output list -> create visible.
    stubFetch(
      outputFetch(hldGenerationReadinessReady(), approvedDiagramList())
    );
    const { unmount } = render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-diagram-output-panel");
    const createBtn = await screen.findByTestId("hld-diagram-output-create");
    expect(createBtn).not.toBeDisabled();
    expect(createBtn.textContent ?? "").toContain("Create HLD diagram output");
    unmount();

    // Only a rejected output -> a fresh one may still be created.
    cleanup();
    vi.unstubAllGlobals();
    stubFetch(
      outputFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDiagramOutputListResponse("rejected")
      )
    );
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("hld-diagram-output-panel");
    expect(
      await screen.findByTestId("hld-diagram-output-create")
    ).toBeInTheDocument();
  });

  // The current-output list must be verified before create is ever offered.
  function readyOutputListFetch(
    outputListGet: () => Response | Promise<Response>
  ): (url: string, init?: RequestInit) => Response | Promise<Response> {
    return (url, init) => {
      if (
        url === HLD_DIAGRAM_OUTPUT_LIST_URL &&
        (init?.method ?? "GET") === "GET"
      ) {
        return outputListGet();
      }
      if (url === HLD_DIAGRAM_LIST_URL) return jsonResponse(approvedDiagramList());
      if (url === HLD_GENERATION_READINESS_URL) {
        return jsonResponse(hldGenerationReadinessReady());
      }
      return jsonResponse({}, 200);
    };
  }

  it("hides create while the current-output list is still loading, even when readiness is ready and an approved diagram exists", async () => {
    stubFetch(
      readyOutputListFetch(() => new Promise<Response>(() => {}))
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-diagram-output-panel");
    expect(
      await screen.findByTestId("hld-diagram-output-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-output-create")).toBeNull();
  });

  it("hides create when the current-output list fails to load and surfaces the error", async () => {
    stubFetch(
      readyOutputListFetch(() => jsonResponse({ code: "boom" }, 500))
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-diagram-output-panel");
    expect(
      await screen.findByTestId("hld-diagram-output-error")
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("hld-diagram-output-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-output-create")).toBeNull();
  });

  it("hides create when the current-output list is null/unknown-shaped", async () => {
    stubFetch(
      readyOutputListFetch(() => jsonResponse({ project: projectContext() }, 200))
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("hld-diagram-output-panel");
    expect(
      await screen.findByTestId("hld-diagram-output-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hld-diagram-output-create")).toBeNull();
  });

  it("creates an output posting no body/authority fields, refreshes the list, opens the created detail, and makes no final-output call", async () => {
    const calls = stubFetch(
      outputFetch(hldGenerationReadinessReady(), approvedDiagramList())
    );
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId("hld-diagram-output-create");
    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DIAGRAM_OUTPUT_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DIAGRAM_OUTPUT_LIST_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DIAGRAM_OUTPUT_LIST_URL && c.init?.method === "POST"
    );
    const rawBody = post?.init?.body;
    const bodyText =
      rawBody === undefined || rawBody === null ? "" : String(rawBody);
    expect(rawBody === undefined || rawBody === null || bodyText === "{}").toBe(
      true
    );
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "userId",
      "status",
      "sourceArtifactIds",
      "sourceHldDiagramArtifactId",
      "payload",
      "authority",
      "diagramType",
      "sku",
      "pricing",
      "catalog",
      "config",
      "provider",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DIAGRAM_OUTPUT_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      await screen.findByTestId("hld-diagram-output-create-success")
    ).toBeInTheDocument();
    await screen.findByTestId("hld-diagram-output-drawer-content");
    expect(
      calls.some(
        (c) =>
          c.url === HLD_DIAGRAM_OUTPUT_DETAIL_URL &&
          (c.init?.method ?? "GET") === "GET"
      )
    ).toBe(true);
    expect(finalOutputCalls(calls).map((c) => c.url)).toEqual([]);
  });

  it("inspects a needs_review output with approve/reject controls, resolved labels, validation findings, and raw ids only in the collapsed audit", async () => {
    stubFetch(
      outputFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDiagramOutputListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-output-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    const content = await screen.findByTestId(
      "hld-diagram-output-drawer-content"
    );
    expect(
      screen.getByTestId("hld-diagram-output-drawer-nodes")
    ).toHaveTextContent("HLD-OUTPUT-NODE-CORE-CANARY");
    const linksSection = screen.getByTestId("hld-diagram-output-drawer-links");
    expect(linksSection).toHaveTextContent("HLD-OUTPUT-NODE-CORE-CANARY");
    expect(linksSection).toHaveTextContent("HLD-OUTPUT-NODE-ACCESS-CANARY");
    expect(
      screen.getByTestId("hld-diagram-output-drawer-zones")
    ).toHaveTextContent("HLD-OUTPUT-ZONE-CANARY");
    expect(
      screen.getByTestId("hld-diagram-output-drawer-findings")
    ).toHaveTextContent("HLD-OUTPUT-FINDING-CANARY");

    // needs_review review controls are present.
    expect(screen.getByTestId("hld-diagram-output-review")).toBeInTheDocument();
    expect(
      screen.getByTestId("hld-diagram-output-review-note")
    ).toBeInTheDocument();
    expect(screen.getByTestId("hld-diagram-output-approve")).toBeInTheDocument();
    expect(screen.getByTestId("hld-diagram-output-reject")).toBeInTheDocument();

    // Raw artifact/source/node/link/zone ids live ONLY in the collapsed audit.
    const audit = content.querySelector(
      "[data-testid='hld-diagram-output-drawer-audit']"
    );
    expect(audit).not.toBeNull();
    expect((audit as HTMLElement).tagName).toBe("DETAILS");
    expect((audit as HTMLElement).hasAttribute("open")).toBe(false);
    expect(audit?.textContent ?? "").toContain(
      HLD_DIAGRAM_OUTPUT_SOURCE_DIAGRAM_ID
    );

    const outside = content.cloneNode(true) as HTMLElement;
    outside
      .querySelector("[data-testid='hld-diagram-output-drawer-audit']")
      ?.remove();
    const outsideText = outside.textContent ?? "";
    expect(outsideText).not.toContain(HLD_DIAGRAM_OUTPUT_SOURCE_DIAGRAM_ID);
    expect(outsideText).not.toContain("node-out-core-1");
    expect(outsideText).not.toContain("link-out-uplink-1");
    expect(outsideText).not.toContain("zone-out-core-1");
  });

  it("approves an output posting exactly { decision: approve }, refreshes list and detail, and shows success", async () => {
    const calls = stubFetch(
      outputFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDiagramOutputListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-output-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-diagram-output-drawer-content");

    const listGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DIAGRAM_OUTPUT_LIST_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;
    const detailGetsBefore = calls.filter(
      (c) =>
        c.url === HLD_DIAGRAM_OUTPUT_DETAIL_URL &&
        (c.init?.method ?? "GET") === "GET"
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-diagram-output-approve"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DIAGRAM_OUTPUT_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DIAGRAM_OUTPUT_REVIEW_URL && c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({ decision: "approve" });
    for (const forbidden of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "payload",
      "note",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    await waitFor(() => {
      expect(
        calls.filter(
          (c) =>
            c.url === HLD_DIAGRAM_OUTPUT_LIST_URL &&
            (c.init?.method ?? "GET") === "GET"
        ).length
      ).toBeGreaterThan(listGetsBefore);
    });
    expect(
      calls.filter(
        (c) =>
          c.url === HLD_DIAGRAM_OUTPUT_DETAIL_URL &&
          (c.init?.method ?? "GET") === "GET"
      ).length
    ).toBeGreaterThan(detailGetsBefore);
    expect(
      await screen.findByTestId("hld-diagram-output-review-success")
    ).toBeInTheDocument();
    expect(finalOutputCalls(calls).map((c) => c.url)).toEqual([]);
  });

  it("requests changes with a note posting exactly { decision: reject, note: trimmed }", async () => {
    const calls = stubFetch(
      outputFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDiagramOutputListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-output-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    await screen.findByTestId("hld-diagram-output-drawer-content");

    await act(async () => {
      fireEvent.change(screen.getByTestId("hld-diagram-output-review-note"), {
        target: { value: "  tighten the core zone spacing  " },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("hld-diagram-output-reject"));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === HLD_DIAGRAM_OUTPUT_REVIEW_URL && c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) => c.url === HLD_DIAGRAM_OUTPUT_REVIEW_URL && c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({
      decision: "reject",
      note: "tighten the core zone spacing",
    });
  });

  it("keeps an approved output read-only, internal, and free of approve/reject controls", async () => {
    stubFetch(
      outputFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDiagramOutputListResponse("approved"),
        hldDiagramOutputDetailResponse(HLD_DIAGRAM_OUTPUT_ARTIFACT_ID, "approved")
      )
    );
    render(<ProjectRfpEvidencePage />);

    const inspect = await screen.findByTestId("hld-diagram-output-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });

    await screen.findByTestId("hld-diagram-output-drawer-content");
    const approved = screen.getByTestId("hld-diagram-output-review-approved");
    expect(approved).toBeInTheDocument();
    expect(approved.textContent ?? "").toMatch(/internal/i);
    expect(approved.textContent ?? "").toMatch(/read-only/i);
    expect(screen.queryByTestId("hld-diagram-output-review")).toBeNull();
    expect(screen.queryByTestId("hld-diagram-output-approve")).toBeNull();
    expect(screen.queryByTestId("hld-diagram-output-reject")).toBeNull();
  });

  it("does not expose output/export affordances or raw JSON dumps in the new panel or drawer", async () => {
    stubFetch(
      outputFetch(
        hldGenerationReadinessReady(),
        approvedDiagramList(),
        hldDiagramOutputListResponse()
      )
    );
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("hld-diagram-output-panel");
    const inspect = await screen.findByTestId("hld-diagram-output-inspect");
    await act(async () => {
      fireEvent.click(inspect);
    });
    const drawer = await screen.findByTestId(
      "hld-diagram-output-drawer-content"
    );

    // No raw JSON/pre dump in either the panel or the drawer.
    expect(panel.querySelector("pre")).toBeNull();
    expect(drawer.querySelector("pre")).toBeNull();

    // Scoped to the NEW panel + drawer only (older HLD panels may carry
    // historical boundary wording); no download/export/final/draw.io/xml/svg
    // affordance vocabulary appears.
    const scopedText = `${panel.textContent ?? ""} ${drawer.textContent ?? ""}`.toLowerCase();
    for (const term of [
      "download",
      "export",
      "draw.io",
      "drawio",
      "xml",
      "svg",
      "mermaid",
      "final authority",
      "certified",
      ".docx",
      ".pdf",
    ]) {
      expect(scopedText).not.toContain(term);
    }
  });
});

describe("ProjectRfpEvidencePage - Stage 6I-E generated HLD document readiness", () => {
  // Matching source diagram id/version shared by the newest approved document
  // model and the approved diagram output. A DIFFERENT id/version stands in for
  // wrong-source / wrong-version outputs and for a non-newest approved model.
  const GEN_DOC_MODEL_ID = "art-hld-document-model-approved-gen-1";
  const GEN_MATCH_DIAGRAM_ID = "art-hld-diagram-approved-gen-1";
  const GEN_MATCH_DIAGRAM_VERSION = 5;
  const GEN_OTHER_DIAGRAM_ID = "art-hld-diagram-approved-gen-other-1";
  const GEN_OTHER_DIAGRAM_VERSION = 9;

  function genModelItem(
    id: string,
    status: string,
    version: number,
    sourceId: unknown,
    sourceVersion: unknown
  ): Record<string, unknown> {
    return {
      id,
      status,
      version,
      payloadSummary: {
        payloadKind: "rfp_hld_document_model",
        title: "GEN-DOCMODEL-CANARY network design model",
        sourceHldDiagramArtifactId: sourceId,
        sourceDiagramVersion: sourceVersion,
      },
    };
  }

  function genModelList(items: Record<string, unknown>[]): Record<string, unknown> {
    return {
      project: projectContext(),
      artifactCount: items.length,
      artifacts: items,
    };
  }

  function genOutputItem(
    id: string,
    status: string,
    summary: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      id,
      status,
      version: 1,
      payloadSummary: {
        payloadKind: "rfp_hld_diagram_output",
        outputFormat: "layout_projection",
        diagramType: "topology",
        ...summary,
      },
    };
  }

  function genOutputList(items: Record<string, unknown>[]): Record<string, unknown> {
    return {
      project: projectContext(),
      artifactCount: items.length,
      artifacts: items,
    };
  }

  // The newest approved model uses the matching source diagram id/version.
  function matchingModelList(): Record<string, unknown> {
    return genModelList([
      genModelItem(
        GEN_DOC_MODEL_ID,
        "approved",
        2,
        GEN_MATCH_DIAGRAM_ID,
        GEN_MATCH_DIAGRAM_VERSION
      ),
      // A newer draft that is NOT approved must be ignored by the gate.
      genModelItem(
        "art-hld-document-model-draft-1",
        "needs_review",
        3,
        GEN_OTHER_DIAGRAM_ID,
        GEN_OTHER_DIAGRAM_VERSION
      ),
    ]);
  }

  function matchingApprovedOutputList(): Record<string, unknown> {
    return genOutputList([
      genOutputItem("art-hld-diagram-output-gen-1", "approved", {
        sourceHldDiagramArtifactId: GEN_MATCH_DIAGRAM_ID,
        sourceDiagramVersion: GEN_MATCH_DIAGRAM_VERSION,
      }),
    ]);
  }

  const STATUS_NONE_BODY = {
    code: "hld_document_not_final",
    blockerCode: "no_final_authority",
  };
  const STATUS_PENDING_BODY = {
    code: "hld_document_not_final",
    blockerCode: "awaiting_review",
    latestArtifact: { id: "art-hld-doc-latest-1", status: "needs_review" },
  };
  const STATUS_STALE_CODE = "hld_document_final_authority_stale";
  const STATUS_STALE_BODY = {
    code: STATUS_STALE_CODE,
    blockerCode: "authority_stale",
    artifact: { id: "art-hld-doc-final-stale-1", status: "approved" },
  };
  const STATUS_FINAL_BODY = {
    project: projectContext(),
    finalAuthority: { id: "art-hld-doc-final-1", status: "approved" },
  };

  function genFetch(opts?: {
    statusGet?: () => Response | Promise<Response>;
    modelList?: Record<string, unknown>;
    outputList?: Record<string, unknown>;
    onGeneratedCreate?: (init?: RequestInit) => Response;
  }): (url: string, init?: RequestInit) => Response | Promise<Response> {
    return (url, init) => {
      if (url === FINAL_HLD_DOCUMENT_STATUS_URL) {
        return opts?.statusGet
          ? opts.statusGet()
          : jsonResponse(STATUS_NONE_BODY, 409);
      }
      if (
        url === GENERATED_HLD_DOCUMENT_CREATE_URL &&
        init?.method === "POST"
      ) {
        return opts?.onGeneratedCreate
          ? opts.onGeneratedCreate(init)
          : jsonResponse(
              { artifact: { id: "art-hld-doc-gen-1" }, payloadSummary: {} },
              201
            );
      }
      if (url === HLD_DOCUMENT_MODEL_LIST_URL) {
        return jsonResponse(opts?.modelList ?? genModelList([]));
      }
      if (url === HLD_DIAGRAM_OUTPUT_LIST_URL) {
        return jsonResponse(opts?.outputList ?? genOutputList([]));
      }
      return jsonResponse({}, 200);
    };
  }

  it("hides create and shows the blocker when no approved diagram output exists", async () => {
    stubFetch(
      genFetch({
        modelList: matchingModelList(),
        outputList: genOutputList([]),
      })
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("generated-hld-document-panel");
    expect(
      await screen.findByTestId("generated-hld-document-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("generated-hld-document-create")).toBeNull();
  });

  it("shows create only with an approved output tied to the newest approved model source id/version plus loaded status/model/output prerequisites", async () => {
    stubFetch(
      genFetch({
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
      })
    );
    const { unmount } = render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("generated-hld-document-panel");
    const createBtn = await screen.findByTestId(
      "generated-hld-document-create"
    );
    expect(createBtn).not.toBeDisabled();
    expect(createBtn.textContent ?? "").toContain(
      "Create generated HLD document"
    );
    expect(screen.queryByTestId("generated-hld-document-blocked")).toBeNull();
    unmount();

    // An approved output tied only to the OLDER approved model's source (not the
    // newest approved model) must not satisfy the gate.
    cleanup();
    vi.unstubAllGlobals();
    stubFetch(
      genFetch({
        modelList: genModelList([
          genModelItem(
            GEN_DOC_MODEL_ID,
            "approved",
            2,
            GEN_MATCH_DIAGRAM_ID,
            GEN_MATCH_DIAGRAM_VERSION
          ),
          genModelItem(
            "art-hld-document-model-approved-old-1",
            "approved",
            1,
            GEN_OTHER_DIAGRAM_ID,
            GEN_OTHER_DIAGRAM_VERSION
          ),
        ]),
        outputList: genOutputList([
          genOutputItem("art-hld-diagram-output-old-1", "approved", {
            sourceHldDiagramArtifactId: GEN_OTHER_DIAGRAM_ID,
            sourceDiagramVersion: GEN_OTHER_DIAGRAM_VERSION,
          }),
        ]),
      })
    );
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("generated-hld-document-panel");
    expect(
      await screen.findByTestId("generated-hld-document-blocked")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("generated-hld-document-create")).toBeNull();
  });

  it("hides create while the final HLD document status is still loading", async () => {
    stubFetch(
      genFetch({
        statusGet: () => new Promise<Response>(() => {}),
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
      })
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("generated-hld-document-panel");
    expect(
      await screen.findByTestId("generated-hld-document-status-loading")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("generated-hld-document-create")).toBeNull();
    expect(screen.queryByTestId("generated-hld-document-status")).toBeNull();
  });

  it("does not satisfy the gate for rejected/needs_review/generated/wrong-source/wrong-version/unknown/empty outputs", async () => {
    const nonQualifying: Record<string, unknown>[] = [
      // Right source/version but not approved.
      genOutputList([
        genOutputItem("out-rej", "rejected", {
          sourceHldDiagramArtifactId: GEN_MATCH_DIAGRAM_ID,
          sourceDiagramVersion: GEN_MATCH_DIAGRAM_VERSION,
        }),
      ]),
      genOutputList([
        genOutputItem("out-nr", "needs_review", {
          sourceHldDiagramArtifactId: GEN_MATCH_DIAGRAM_ID,
          sourceDiagramVersion: GEN_MATCH_DIAGRAM_VERSION,
        }),
      ]),
      genOutputList([
        genOutputItem("out-gen", "generated", {
          sourceHldDiagramArtifactId: GEN_MATCH_DIAGRAM_ID,
          sourceDiagramVersion: GEN_MATCH_DIAGRAM_VERSION,
        }),
      ]),
      // Approved but wrong source id.
      genOutputList([
        genOutputItem("out-wrong-src", "approved", {
          sourceHldDiagramArtifactId: GEN_OTHER_DIAGRAM_ID,
          sourceDiagramVersion: GEN_MATCH_DIAGRAM_VERSION,
        }),
      ]),
      // Approved but wrong source version.
      genOutputList([
        genOutputItem("out-wrong-ver", "approved", {
          sourceHldDiagramArtifactId: GEN_MATCH_DIAGRAM_ID,
          sourceDiagramVersion: GEN_MATCH_DIAGRAM_VERSION + 1,
        }),
      ]),
      // Approved but unknown-shaped (no source id/version).
      genOutputList([genOutputItem("out-unknown", "approved", {})]),
      // Empty output list.
      genOutputList([]),
    ];

    for (const outputList of nonQualifying) {
      cleanup();
      vi.unstubAllGlobals();
      stubFetch(
        genFetch({ modelList: matchingModelList(), outputList })
      );
      render(<ProjectRfpEvidencePage />);
      await screen.findByTestId("generated-hld-document-panel");
      await screen.findByTestId("generated-hld-document-blocked");
      expect(screen.queryByTestId("generated-hld-document-create")).toBeNull();
    }
  });

  it("blocks create for a final authority and for a pending latest artifact, with generic pending copy that is not generated-specific", async () => {
    // Final authority present -> create hidden, generic final copy.
    stubFetch(
      genFetch({
        statusGet: () => jsonResponse(STATUS_FINAL_BODY, 200),
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
      })
    );
    const { unmount } = render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("generated-hld-document-panel");
    expect(
      await screen.findByTestId("generated-hld-document-status")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("generated-hld-document-create")).toBeNull();
    unmount();

    // Pending final document (manual OR generated) -> create hidden and the
    // pending copy stays generic, never naming the generated flow.
    cleanup();
    vi.unstubAllGlobals();
    stubFetch(
      genFetch({
        statusGet: () => jsonResponse(STATUS_PENDING_BODY, 409),
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
      })
    );
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("generated-hld-document-panel");
    const status = await screen.findByTestId("generated-hld-document-status");
    expect(status.textContent ?? "").toContain(
      "A final HLD document is awaiting review."
    );
    expect((status.textContent ?? "").toLowerCase()).not.toContain("generated");
    expect(screen.queryByTestId("generated-hld-document-create")).toBeNull();
  });

  it("renders compact stale copy without leaking the raw stale code or blockerCode", async () => {
    const panelCalls = stubFetch(
      genFetch({
        statusGet: () => jsonResponse(STATUS_STALE_BODY, 409),
        modelList: matchingModelList(),
        outputList: genOutputList([]),
      })
    );
    render(<ProjectRfpEvidencePage />);

    const panel = await screen.findByTestId("generated-hld-document-panel");
    const status = await screen.findByTestId("generated-hld-document-status");
    expect((status.textContent ?? "").toLowerCase()).toContain("stale");
    const panelText = panel.textContent ?? "";
    expect(panelText).not.toContain(STATUS_STALE_CODE);
    expect(panelText).not.toContain("authority_stale");
    // The status GET is a lean read only; no final-authority write route fires.
    expect(
      panelCalls.some((c) =>
        /\/rfp\/hld-document\/(?:review|final|download|upload|export)/.test(
          c.url
        )
      )
    ).toBe(false);
  });

  it("posts exactly { documentModelArtifactId } with no authority/source/payload/provider/pricing/SKU/catalog/config fields, then shows success and reloads status", async () => {
    const calls = stubFetch(
      genFetch({
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
      })
    );
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId(
      "generated-hld-document-create"
    );
    const statusGetsBefore = calls.filter(
      (c) => c.url === FINAL_HLD_DOCUMENT_STATUS_URL
    ).length;

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === GENERATED_HLD_DOCUMENT_CREATE_URL &&
            c.init?.method === "POST"
        )
      ).toBe(true);
    });

    const post = calls.find(
      (c) =>
        c.url === GENERATED_HLD_DOCUMENT_CREATE_URL &&
        c.init?.method === "POST"
    );
    const bodyText = String(post?.init?.body ?? "");
    expect(JSON.parse(bodyText)).toEqual({
      documentModelArtifactId: GEN_DOC_MODEL_ID,
    });
    for (const forbidden of [
      "tenantId",
      "projectId",
      "createdBy",
      "userId",
      "status",
      "payload",
      "sourceArtifactIds",
      "sourceHldDiagramArtifactId",
      "sourceDiagramVersion",
      "authority",
      "drawioXml",
      "drawio",
      "xml",
      "provider",
      "pricing",
      "sku",
      "catalog",
      "config",
    ]) {
      expect(bodyText).not.toContain(forbidden);
    }

    expect(
      await screen.findByTestId("generated-hld-document-create-success")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        calls.filter((c) => c.url === FINAL_HLD_DOCUMENT_STATUS_URL).length
      ).toBeGreaterThan(statusGetsBefore);
    });
    // The generated flow never posts to the final /rfp/hld-document authority
    // route nor changes the manual-upload path.
    expect(
      calls.some(
        (c) =>
          c.url === FINAL_HLD_DOCUMENT_STATUS_URL && c.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("shows compact blocker copy on a diagram_output_unavailable failure without leaking raw JSON, code, blockerCode, provider text, or errors arrays", async () => {
    const calls = stubFetch(
      genFetch({
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
        onGeneratedCreate: () =>
          jsonResponse(
            {
              code: "hld_document_precondition_failed",
              blockerCode: "diagram_output_unavailable",
              provider: "PROVIDER-LEAK-CANARY",
              errors: ["ERRORS-ARRAY-LEAK-CANARY"],
            },
            409
          ),
      })
    );
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId(
      "generated-hld-document-create"
    );
    await act(async () => {
      fireEvent.click(createBtn);
    });

    const errorEl = await screen.findByTestId(
      "generated-hld-document-create-error"
    );
    expect(errorEl.textContent ?? "").toBe(
      "Approved HLD diagram output is required before creating the generated HLD document."
    );
    const panel = screen.getByTestId("generated-hld-document-panel");
    const panelText = panel.textContent ?? "";
    for (const leak of [
      "hld_document_precondition_failed",
      "diagram_output_unavailable",
      "PROVIDER-LEAK-CANARY",
      "ERRORS-ARRAY-LEAK-CANARY",
      "blockerCode",
    ]) {
      expect(panelText).not.toContain(leak);
    }
    expect(panel.querySelector("pre")).toBeNull();
    // No success and no status reload on failure.
    expect(
      screen.queryByTestId("generated-hld-document-create-success")
    ).toBeNull();
    expect(
      calls.some(
        (c) =>
          c.url === GENERATED_HLD_DOCUMENT_CREATE_URL &&
          c.init?.method === "POST"
      )
    ).toBe(true);
  });

  it("shows stable compact error copy on a non-blocker failure without leaking raw JSON", async () => {
    stubFetch(
      genFetch({
        modelList: matchingModelList(),
        outputList: matchingApprovedOutputList(),
        onGeneratedCreate: () =>
          jsonResponse({ code: "internal_error", detail: "DETAIL-LEAK" }, 500),
      })
    );
    render(<ProjectRfpEvidencePage />);

    const createBtn = await screen.findByTestId(
      "generated-hld-document-create"
    );
    await act(async () => {
      fireEvent.click(createBtn);
    });

    const errorEl = await screen.findByTestId(
      "generated-hld-document-create-error"
    );
    expect(errorEl.textContent ?? "").toBe(
      "Unable to create the generated HLD document."
    );
    const panel = screen.getByTestId("generated-hld-document-panel");
    expect(panel.textContent ?? "").not.toContain("DETAIL-LEAK");
    expect(panel.textContent ?? "").not.toContain("internal_error");
  });

  it("static: wires the lean status GET and generated create POST but no final-authority write, TP, provider, or manual-upload drift in the generated flow", () => {
    const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");
    const source = readFileSync(SRC_PATH, "utf8");
    // The lean status GET and the generated create POST are wired.
    expect(source).toContain("/rfp/hld-document/generated");
    expect(source).toContain("generated-hld-document-panel");
    expect(source).toContain("documentModelArtifactId");
    // The generated flow must not add final-authority write, output-render,
    // proposal/TP, or provider routes.
    for (const forbidden of [
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-document/render",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "/rfp/hld-export",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // The generated create sends exactly the document-model id and no authority/
    // source/payload/provider fields in its POST body construction.
    expect(source).toContain(
      "JSON.stringify({ documentModelArtifactId })"
    );
    // No new server service / DB / provider SDK import for the generated flow.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "project-rfp-hld-document-service",
      "project-rfp-hld-document-generation",
      "project-rfp-hld-document",
      "@/lib/db/",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai/sdk",
      "openai",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });
});

describe("ProjectRfpEvidencePage - Stage 6I-F final HLD review, close, and TP handoff", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");

  const PENDING_GENERATED_BODY = {
    code: "hld_document_not_final",
    blockerCode: "generated_hld_document_pending_review",
    latestArtifact: {
      id: FINAL_HLD_DOCUMENT_REVIEW_ARTIFACT_ID,
      status: "needs_review",
      version: 3,
    },
  };
  const PENDING_MANUAL_BODY = {
    code: "hld_document_not_final",
    blockerCode: "manual_upload_pending_review",
    latestArtifact: {
      id: FINAL_HLD_DOCUMENT_REVIEW_ARTIFACT_ID,
      status: "needs_review",
      version: 1,
    },
  };
  const CLOSE_BLOCKED_BODY = {
    code: "hld_not_closed",
    blockerCode: "no_final_authority",
  };
  const CLOSE_STALE_BODY = {
    code: "hld_close_final_authority_stale",
    staleCode: "authority_stale",
    blockerCode: "authority_stale",
    artifact: { id: "art-hld-doc-close-stale-1", status: "approved" },
  };
  const CLOSE_CLOSED_GENERATED_BODY = {
    project: projectContext(),
    closeStatus: "closed",
    closeKind: "generated",
    closedAt: "2026-06-10T09:00:00.000Z",
    finalAuthority: { payloadSummary: { sourceMode: "generated" } },
  };
  const CLOSE_CLOSED_MANUAL_BODY = {
    project: projectContext(),
    closeStatus: "closed",
    closeKind: "manual",
    closedAt: "2026-06-10T09:00:00.000Z",
    finalAuthority: { payloadSummary: { sourceMode: "manual_upload" } },
  };
  const TP_BLOCKED_BODY = {
    code: "tp_handoff_blocked",
    gateStatus: "blocked",
    blockerCode: "hld_not_closed",
    hldCloseBlockerCode: "no_final_authority",
  };
  const TP_READY_BODY = {
    project: projectContext(),
    gateStatus: "ready",
    hldClose: { closeStatus: "closed", closeKind: "generated" },
  };

  // A lean handler for the Stage 6I-F reads: final status, the artifact-scoped
  // review POST, HLD close, and TP handoff. Everything else degrades to an empty
  // 200 so the page still mounts (the panels under test are what we assert on).
  function sixIFFetch(opts?: {
    statusGet?: () => Response | Promise<Response>;
    closeGet?: () => Response | Promise<Response>;
    tpGet?: () => Response | Promise<Response>;
    onReview?: (init?: RequestInit) => Response;
  }): (url: string, init?: RequestInit) => Response | Promise<Response> {
    return (url, init) => {
      if (url === FINAL_HLD_DOCUMENT_STATUS_URL) {
        return opts?.statusGet
          ? opts.statusGet()
          : jsonResponse({ code: "hld_document_not_final" }, 409);
      }
      if (url === FINAL_HLD_DOCUMENT_REVIEW_URL && init?.method === "POST") {
        return opts?.onReview
          ? opts.onReview(init)
          : jsonResponse({ artifactStatus: "approved" }, 200);
      }
      if (url === HLD_CLOSE_URL) {
        return opts?.closeGet
          ? opts.closeGet()
          : jsonResponse(CLOSE_BLOCKED_BODY, 409);
      }
      if (url === TP_HANDOFF_GATE_URL) {
        return opts?.tpGet ? opts.tpGet() : jsonResponse(TP_BLOCKED_BODY, 409);
      }
      return jsonResponse({}, 200);
    };
  }

  function countUrl(calls: FetchCall[], url: string): number {
    return calls.filter((c) => c.url === url).length;
  }

  function reviewPosts(calls: FetchCall[]): FetchCall[] {
    return calls.filter(
      (c) => c.url === FINAL_HLD_DOCUMENT_REVIEW_URL && c.init?.method === "POST"
    );
  }

  it("Stage 6I-F shows a pending generated final HLD document as reviewable", async () => {
    stubFetch(
      sixIFFetch({ statusGet: () => jsonResponse(PENDING_GENERATED_BODY, 409) })
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("final-hld-document-review-panel");
    const state = await screen.findByTestId("final-hld-document-review-state");
    expect(state.textContent ?? "").toContain(
      "generated HLD document is awaiting SE review"
    );
    expect(
      await screen.findByTestId("final-hld-document-review-controls")
    ).toBeInTheDocument();
    expect(screen.getByTestId("final-hld-document-approve")).toBeInTheDocument();
    expect(screen.getByTestId("final-hld-document-reject")).toBeInTheDocument();
  });

  it("Stage 6I-F shows a pending manual upload as manual and distinct from generated", async () => {
    stubFetch(
      sixIFFetch({ statusGet: () => jsonResponse(PENDING_MANUAL_BODY, 409) })
    );
    render(<ProjectRfpEvidencePage />);

    const state = await screen.findByTestId("final-hld-document-review-state");
    expect(state.textContent ?? "").toContain(
      "manual draw.io upload is awaiting SE review"
    );
    expect((state.textContent ?? "").toLowerCase()).not.toContain("generated");
    // A manual pending upload is still reviewable through the same route.
    expect(
      await screen.findByTestId("final-hld-document-review-controls")
    ).toBeInTheDocument();
  });

  it("Stage 6I-F approve/request-changes post only { decision } or { decision, note } to the artifact-scoped review route", async () => {
    const calls = stubFetch(
      sixIFFetch({ statusGet: () => jsonResponse(PENDING_GENERATED_BODY, 409) })
    );
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("final-hld-document-review-controls");

    async function clickAndSettle(
      testId: string,
      expected: number
    ): Promise<void> {
      await act(async () => {
        fireEvent.click(screen.getByTestId(testId));
      });
      await waitFor(() => {
        expect(reviewPosts(calls)).toHaveLength(expected);
      });
      await waitFor(() => {
        expect(screen.getByTestId(testId)).not.toBeDisabled();
      });
    }

    // approve, no note
    await clickAndSettle("final-hld-document-approve", 1);
    // approve, with a note that is trimmed before sending
    fireEvent.change(screen.getByTestId("final-hld-document-review-note"), {
      target: { value: "  tighten scope  " },
    });
    await clickAndSettle("final-hld-document-approve", 2);
    // request changes, with a note
    fireEvent.change(screen.getByTestId("final-hld-document-review-note"), {
      target: { value: "add BoQ trace" },
    });
    await clickAndSettle("final-hld-document-reject", 3);
    // request changes, no note (cleared on the prior success)
    await clickAndSettle("final-hld-document-reject", 4);

    const bodies = reviewPosts(calls).map((c) =>
      JSON.parse(String(c.init?.body))
    );
    expect(bodies).toEqual([
      { decision: "approve" },
      { decision: "approve", note: "tighten scope" },
      { decision: "reject", note: "add BoQ trace" },
      { decision: "reject" },
    ]);
    // Only ever the two strict keys; no authority/source/payload/provider leak.
    const raw = reviewPosts(calls)
      .map((c) => String(c.init?.body))
      .join("|");
    for (const forbidden of [
      "tenantId",
      "projectId",
      "userId",
      "status",
      "payload",
      "source",
      "authority",
      "drawioXml",
      "provider",
      "pricing",
      "sku",
      "catalog",
      "config",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("Stage 6I-F reloads final status, HLD close, and TP handoff after a review", async () => {
    const calls = stubFetch(
      sixIFFetch({ statusGet: () => jsonResponse(PENDING_GENERATED_BODY, 409) })
    );
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("final-hld-document-review-controls");

    const before = {
      status: countUrl(calls, FINAL_HLD_DOCUMENT_STATUS_URL),
      close: countUrl(calls, HLD_CLOSE_URL),
      tp: countUrl(calls, TP_HANDOFF_GATE_URL),
    };
    await act(async () => {
      fireEvent.click(screen.getByTestId("final-hld-document-approve"));
    });
    await screen.findByTestId("final-hld-document-review-success");
    await waitFor(() => {
      expect(countUrl(calls, FINAL_HLD_DOCUMENT_STATUS_URL)).toBeGreaterThan(
        before.status
      );
      expect(countUrl(calls, HLD_CLOSE_URL)).toBeGreaterThan(before.close);
      expect(countUrl(calls, TP_HANDOFF_GATE_URL)).toBeGreaterThan(before.tp);
    });
    // The review posts only to the artifact-scoped route, never a bare final
    // authority write on the status route.
    expect(
      calls.some(
        (c) =>
          c.url === FINAL_HLD_DOCUMENT_STATUS_URL && c.init?.method === "POST"
      )
    ).toBe(false);
  });

  it("Stage 6I-F renders compact safe review error copy without leaking raw code/JSON/provider/XML", async () => {
    stubFetch(
      sixIFFetch({
        statusGet: () => jsonResponse(PENDING_GENERATED_BODY, 409),
        onReview: () =>
          jsonResponse(
            {
              code: "hld_document_review_failed",
              blockerCode: "BLOCKER-LEAK-CANARY",
              staleCode: "STALE-LEAK-CANARY",
              provider: "PROVIDER-LEAK-CANARY",
              errors: ["ERRORS-LEAK-CANARY"],
              drawioXml: "<mxGraphModel>MXCELL-LEAK-CANARY</mxGraphModel>",
            },
            409
          ),
      })
    );
    render(<ProjectRfpEvidencePage />);

    const approve = await screen.findByTestId("final-hld-document-approve");
    await act(async () => {
      fireEvent.click(approve);
    });

    const err = await screen.findByTestId("final-hld-document-review-error");
    expect(err.textContent ?? "").toBe(
      "Unable to review the final HLD document."
    );
    const panel = screen.getByTestId("final-hld-document-review-panel");
    const text = panel.textContent ?? "";
    for (const leak of [
      "hld_document_review_failed",
      "BLOCKER-LEAK-CANARY",
      "STALE-LEAK-CANARY",
      "PROVIDER-LEAK-CANARY",
      "ERRORS-LEAK-CANARY",
      "MXCELL-LEAK-CANARY",
      "mxGraphModel",
      "blockerCode",
      "staleCode",
    ]) {
      expect(text).not.toContain(leak);
    }
    expect(panel.querySelector("pre")).toBeNull();
    expect(screen.queryByTestId("final-hld-document-review-success")).toBeNull();
  });

  it("Stage 6I-F HLD close readiness is blocked, stale, or closed by the lean gate with no close mutation", async () => {
    // Blocked until a valid final authority exists.
    stubFetch(
      sixIFFetch({ closeGet: () => jsonResponse(CLOSE_BLOCKED_BODY, 409) })
    );
    const first = render(<ProjectRfpEvidencePage />);
    const blocked = await screen.findByTestId("hld-close-readiness-blocked");
    expect(blocked.textContent ?? "").toContain(
      "HLD cannot be closed until a valid final HLD document authority exists"
    );
    expect(
      screen.getByTestId("hld-close-readiness-panel").querySelector("button")
    ).toBeNull();
    first.unmount();
    cleanup();
    vi.unstubAllGlobals();

    // Stale authority - compact copy, no raw stale code.
    stubFetch(
      sixIFFetch({ closeGet: () => jsonResponse(CLOSE_STALE_BODY, 409) })
    );
    const second = render(<ProjectRfpEvidencePage />);
    const stale = await screen.findByTestId("hld-close-readiness-stale");
    expect(stale.textContent ?? "").toContain("stale");
    expect(
      screen.getByTestId("hld-close-readiness-panel").textContent ?? ""
    ).not.toContain("authority_stale");
    second.unmount();
    cleanup();
    vi.unstubAllGlobals();

    // Closed on a generated authority.
    stubFetch(
      sixIFFetch({
        closeGet: () => jsonResponse(CLOSE_CLOSED_GENERATED_BODY, 200),
      })
    );
    const third = render(<ProjectRfpEvidencePage />);
    const closedGen = await screen.findByTestId("hld-close-readiness-closed");
    expect(closedGen.textContent ?? "").toContain(
      "generated HLD document authority"
    );
    third.unmount();
    cleanup();
    vi.unstubAllGlobals();

    // Closed on an approved manual upload authority (distinct copy).
    stubFetch(
      sixIFFetch({ closeGet: () => jsonResponse(CLOSE_CLOSED_MANUAL_BODY, 200) })
    );
    render(<ProjectRfpEvidencePage />);
    const closedMan = await screen.findByTestId("hld-close-readiness-closed");
    expect(closedMan.textContent ?? "").toContain(
      "manual draw.io upload authority"
    );
    expect(
      screen.getByTestId("hld-close-readiness-panel").querySelector("button")
    ).toBeNull();
  });

  it("Stage 6I-F TP handoff gate stays read-only: blocked until closed, ready only after, no TP create action", async () => {
    // Blocked while the HLD is not final/closed.
    stubFetch(sixIFFetch({ tpGet: () => jsonResponse(TP_BLOCKED_BODY, 409) }));
    const first = render(<ProjectRfpEvidencePage />);
    const panel = await screen.findByTestId("tp-handoff-gate-panel");
    const blocked = await screen.findByTestId("tp-handoff-gate-blocked");
    expect(blocked.textContent ?? "").toContain(
      "TP handoff is read-only and blocked until the HLD is final and closed"
    );
    expect(panel.querySelector("button")).toBeNull();
    first.unmount();
    cleanup();
    vi.unstubAllGlobals();

    // Ready only once the HLD is closed - still just a read-only gate status.
    const calls = stubFetch(
      sixIFFetch({ tpGet: () => jsonResponse(TP_READY_BODY, 200) })
    );
    render(<ProjectRfpEvidencePage />);
    const ready = await screen.findByTestId("tp-handoff-gate-ready");
    expect(ready.textContent ?? "").toContain("read-only gate status");
    expect(
      screen.getByTestId("tp-handoff-gate-panel").querySelector("button")
    ).toBeNull();
    // The gate is a GET only; no TP/proposal create POST ever fires.
    expect(
      calls.some(
        (c) =>
          c.init?.method === "POST" &&
          (c.url === TP_HANDOFF_GATE_URL ||
            /technical-proposal|hld-proposal|\/rfp\/tp\//.test(c.url))
      )
    ).toBe(false);
  });

  it("Stage 6I-F renders no draw.io XML, raw JSON, provider, file-path, pricing/SKU/catalog/config, or certification leakage", async () => {
    stubFetch(
      sixIFFetch({
        statusGet: () =>
          jsonResponse(
            {
              code: "hld_document_not_final",
              blockerCode: "generated_hld_document_pending_review",
              provider: "STATUS-PROVIDER-LEAK",
              drawioXml: "<mxGraphModel>STATUS-MXCELL-LEAK</mxGraphModel>",
              errors: ["STATUS-ERRORS-LEAK"],
              latestArtifact: {
                id: FINAL_HLD_DOCUMENT_REVIEW_ARTIFACT_ID,
                status: "needs_review",
                version: 4,
                sourceText: "SOURCE-TEXT-LEAK",
                filePath: "C:/secret/network-hld.drawio",
                payload: {
                  sku: "SKU-LEAK",
                  price: 987654,
                  catalog: "CATALOG-LEAK",
                  config: "CONFIG-LEAK",
                },
              },
            },
            409
          ),
        closeGet: () =>
          jsonResponse(
            {
              code: "hld_not_closed",
              blockerCode: "CLOSE-BLOCKER-LEAK",
              provider: "CLOSE-PROVIDER-LEAK",
            },
            409
          ),
        tpGet: () =>
          jsonResponse(
            {
              code: "tp_handoff_blocked",
              gateStatus: "blocked",
              hldCloseBlockerCode: "TP-CLOSE-LEAK",
              provider: "TP-PROVIDER-LEAK",
            },
            409
          ),
      })
    );
    render(<ProjectRfpEvidencePage />);

    await screen.findByTestId("final-hld-document-review-controls");
    await screen.findByTestId("hld-close-readiness-blocked");
    await screen.findByTestId("tp-handoff-gate-blocked");

    const panels = [
      screen.getByTestId("final-hld-document-review-panel"),
      screen.getByTestId("hld-close-readiness-panel"),
      screen.getByTestId("tp-handoff-gate-panel"),
    ];
    const text = panels.map((el) => el.textContent ?? "").join("\n");
    for (const leak of [
      "STATUS-PROVIDER-LEAK",
      "STATUS-MXCELL-LEAK",
      "mxGraphModel",
      "STATUS-ERRORS-LEAK",
      "SOURCE-TEXT-LEAK",
      "C:/secret",
      "network-hld.drawio",
      "SKU-LEAK",
      "987654",
      "CATALOG-LEAK",
      "CONFIG-LEAK",
      "CLOSE-BLOCKER-LEAK",
      "CLOSE-PROVIDER-LEAK",
      "TP-CLOSE-LEAK",
      "TP-PROVIDER-LEAK",
      "blockerCode",
      "staleCode",
      "drawioXml",
      "provider",
      "payload",
      "generated_hld_document_pending_review",
    ]) {
      expect(text).not.toContain(leak);
    }
    // No certification/approval claims for any vendor or model provider.
    for (const cert of [
      "certified",
      "certification",
      "OpenAI",
      "Anthropic",
      "Claude",
    ]) {
      expect(text).not.toContain(cert);
    }
    for (const el of panels) {
      expect(el.querySelector("pre")).toBeNull();
    }
  });

  it("Stage 6I-F static: generated HLD document create still posts exactly { documentModelArtifactId }", () => {
    const source = readFileSync(SRC_PATH, "utf8");
    expect(source).toContain("/rfp/hld-document/generated");
    expect(source).toContain("JSON.stringify({ documentModelArtifactId })");
  });

  it("Stage 6I-F static: wires the artifact-scoped review, close, and TP handoff routes but no bare final write, TP/proposal, or provider route", () => {
    const source = readFileSync(SRC_PATH, "utf8");
    // The final HLD document review is wired ONLY in the artifact-scoped form.
    expect(source).toContain(
      "/rfp/artifacts/${artifactId}/hld-document/review"
    );
    expect(source).toContain("/rfp/hld-close");
    expect(source).toContain("/rfp/tp-handoff-gate");
    expect(source).toContain("final-hld-document-review-panel");
    expect(source).toContain("hld-close-readiness-panel");
    expect(source).toContain("tp-handoff-gate-panel");
    // The review body is exactly { decision } or { decision, note }.
    expect(source).toContain('note === "" ? { decision } : { decision, note }');
    // The bare final-authority review route stays forbidden; only the
    // artifact-scoped variant is allowed. Upload/download/export/final/render, a
    // close mutation, TP/proposal generation, and provider routes stay out.
    for (const forbidden of [
      "/rfp/hld-document/review",
      "/rfp/hld-document/download",
      "/rfp/hld-document/upload",
      "/rfp/hld-document/export",
      "/rfp/hld-document/final",
      "/rfp/hld-document/render",
      "/rfp/hld-close/close",
      "/rfp/tp-handoff-gate/generate",
      "/rfp/technical-proposal",
      "/rfp/hld-proposal",
      "/rfp/hld-html",
      "/rfp/drawio",
      "technical_proposal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // No new server service / DB / provider SDK import for the Stage 6I-F flow.
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    for (const token of [
      "@/lib/db/",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai/sdk",
      "openai",
      "project-rfp-hld-close",
      "project-rfp-tp-handoff",
    ]) {
      expect(importLines.join("\n")).not.toContain(token);
    }
  });
});

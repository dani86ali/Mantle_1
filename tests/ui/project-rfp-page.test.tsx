import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ProjectRfpEvidencePage from "@/app/projects/[id]/rfp/page";

// The page reads the project id from the route. Only useParams is consumed.
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
const EXTRACTION_DELTA_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/extraction-delta`;
const EXTRACTION_DELTA_ARTIFACT_ID = "art-ed-1";
const EXTRACTION_DELTA_DETAIL_URL = `${EXTRACTION_DELTA_LIST_URL}/${EXTRACTION_DELTA_ARTIFACT_ID}`;
const EVIDENCE_PACKAGE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/evidence-package`;
const EVIDENCE_PACKAGE_ARTIFACT_ID = "art-ep-1";
const EVIDENCE_PACKAGE_DETAIL_URL = `${EVIDENCE_PACKAGE_LIST_URL}/${EVIDENCE_PACKAGE_ARTIFACT_ID}`;

// Persisted-content canaries. Both are smuggled into the lean list response
// (which the read model would never carry) AND returned by the detail stubs.
// They may reach the DOM only after an explicit Inspect click.
const TEXT_BODY_CANARY = "TEXT-BODY-CANARY";
const TABLE_CELL_CANARY = "TABLE-CELL-CANARY";

// Baseline canaries. Smuggled into the baseline list/detail stubs where the
// real read models would never carry them; none may ever reach the DOM.
const LIST_REQUIREMENT_TEXT_CANARY = "LIST-REQUIREMENT-TEXT-CANARY";
const RAW_EVIDENCE_TEXT_CANARY = "RAW-EVIDENCE-TEXT-CANARY";
const RAW_TABLE_ROW_CANARY = "RAW-TABLE-ROW-CANARY";
const STORAGE_PATH_CANARY = "STORAGE-PATH-CANARY";
const TENANT_ID_CANARY = "TENANT-ID-CANARY";
const SMUGGLED_KEY_CANARY = "SMUGGLED-KEY-CANARY";

// Generate-response canary: the page must ignore the generate POST response
// body entirely, so nothing from it may ever reach the DOM.
const GENERATE_RESPONSE_CANARY = "GENERATE-RESPONSE-CANARY";

// Extraction-delta canaries. The LIST group is smuggled into the lean list
// response (which the read model would never carry) and must never reach the
// DOM. The DETAIL group is the sanitized proposal/review trail the detail
// surfaces for review, so it MAY render only after an explicit Inspect.
const DELTA_LIST_CANDIDATE_CANARY = "DELTA-LIST-CANDIDATE-CANARY";
const DELTA_PROPOSED_TEXT_CANARY = "DELTA-PROPOSED-TEXT-CANARY";
const DELTA_PROPOSED_ROW_CANARY = "DELTA-PROPOSED-ROW-CANARY";
const DELTA_HISTORY_NOTE_CANARY = "DELTA-HISTORY-NOTE-CANARY";

// Evidence-package canaries. The LIST group is smuggled into the lean list and
// must never render; the DETAIL group is the sanitized final evidence content
// under human review, so it MAY render only after an explicit Inspect.
const PACKAGE_LIST_EVIDENCE_CANARY = "PACKAGE-LIST-EVIDENCE-CANARY";
const PACKAGE_EVIDENCE_TEXT_CANARY = "PACKAGE-EVIDENCE-TEXT-CANARY";
const PACKAGE_TABLE_CELL_CANARY = "PACKAGE-TABLE-CELL-CANARY";

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

// Fresh copy per call so a mutated fixture in one test cannot leak into another.
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
      inputPackageArtifactId: "art-ip-1",
      sourceFileName: "rfp-main.pdf",
      sourceFileRole: "rfp_main_document",
      chunkIndex: 0,
      chunkCount: 4,
      charCount: 1810,
      documentMetrics: {
        textCharCount: 7200,
        nonWhitespaceTextCharCount: 6804,
        tableCount: 2,
        tableRowCount: 18,
      },
      // Never present in the real lean read model; planted to prove the list
      // view renders only whitelisted summary fields.
      text: TEXT_BODY_CANARY,
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
      inputPackageArtifactId: "art-ip-1",
      sourceFileName: "rfp-scope.xlsx",
      sourceFileRole: "rfp_attachment",
      tableId: "tbl-1",
      sheetName: "Scope",
      rowCount: 12,
      columnCount: 5,
      // Same smuggling trick for table content.
      rows: [[TABLE_CELL_CANARY]],
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
        inputPackageArtifactId: "art-ip-1",
        sourceFileId: "file-rfp-1",
        sourceFileName: "rfp-main.pdf",
        sourceFileRole: "rfp_main_document",
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
        inputPackageArtifactId: "art-ip-1",
        sourceFileId: "file-rfp-2",
        sourceFileName: "rfp-scope.xlsx",
        sourceFileRole: "rfp_attachment",
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

/** Serializable artifact summary shared by the baseline list/detail stubs. */
function baselineArtifactSummary(): Record<string, unknown> {
  return {
    id: BASELINE_ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "needs_review",
    version: 1,
    sourceFileIds: ["file-rfp-1", "file-rfp-2"],
    sourceArtifactIds: ["art-ip-1"],
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: "2026-06-04T09:05:00.000Z",
  };
}

function baselineListItem(): Record<string, unknown> {
  return {
    ...baselineArtifactSummary(),
    payloadSummary: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 3,
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
      // Never present in the real lean read model; planted to prove the
      // list renders identifier/count fields only - never requirement text.
      requirementTexts: [LIST_REQUIREMENT_TEXT_CANARY],
    },
    // Smuggled keys the page must ignore entirely.
    payload: {
      requirements: [{ id: "RFP-REQ-001", text: LIST_REQUIREMENT_TEXT_CANARY }],
    },
    tenantId: TENANT_ID_CANARY,
    storagePath: STORAGE_PATH_CANARY,
  };
}

function baselineListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [baselineListItem()],
  };
}

function baselineDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: baselineArtifactSummary(),
    baseline: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 3,
      // Smuggled keys the page must ignore entirely.
      tenantId: TENANT_ID_CANARY,
      storagePath: STORAGE_PATH_CANARY,
      requirements: [
        {
          id: "RFP-REQ-001",
          text: "The supplier shall provide redundant core switching.",
          category: "technical",
          priority: "mandatory",
          title: "Core redundancy",
          notes: "From section 3.1.",
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              evidenceKind: "rfp_document_text_chunk",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: "art-ip-1",
              chunkIndex: 0,
              chunkCount: 4,
              charCount: 1810,
              // Raw persisted content a locator reference never carries.
              text: RAW_EVIDENCE_TEXT_CANARY,
              tenantId: TENANT_ID_CANARY,
            },
            {
              evidenceId: "ev-table-1",
              evidenceKind: "rfp_document_table",
              sourceFileId: "file-rfp-2",
              inputPackageArtifactId: "art-ip-1",
              tableId: "tbl-1",
              sheetName: "Scope",
              rowCount: 12,
              columnCount: 5,
              rows: [[RAW_TABLE_ROW_CANARY]],
              storagePath: STORAGE_PATH_CANARY,
            },
          ],
        },
        {
          id: "RFP-REQ-002",
          text: "The solution shall include redundant uplinks per access switch.",
          category: "technical",
          priority: "optional",
          smuggledKey: SMUGGLED_KEY_CANARY,
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              evidenceKind: "rfp_document_text_chunk",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: "art-ip-1",
              chunkIndex: 2,
              chunkCount: 4,
              charCount: 950,
            },
          ],
        },
      ],
    },
  };
}

/** Baseline detail response whose artifact carries an arbitrary status. */
function baselineDetailResponseWithStatus(status: string): Record<string, unknown> {
  const body = baselineDetailResponse();
  (body.artifact as Record<string, unknown>).status = status;
  return body;
}

/**
 * Success response of the review POST, mirroring the real route contract:
 * `artifact` is the PRE-approval summary (status still needs_review) while
 * `artifactStatus` carries the post-decision status the page must display.
 */
function baselineReviewSuccessResponse(
  decision: "approved" | "rejected"
): Record<string, unknown> {
  return {
    approval: {
      id: "appr-rb-1",
      projectId: PROJECT_ID,
      artifactId: BASELINE_ARTIFACT_ID,
      artifactVersion: 1,
      decision,
      decidedBy: "user-1",
      decidedAt: "2026-06-05T10:00:00.000Z",
    },
    artifactStatus: decision,
    stageStatus: decision,
    artifact: baselineArtifactSummary(),
  };
}

/**
 * Success (201) response of the generate POST, mirroring the real route
 * contract plus smuggled keys: the page must not render anything from it
 * and must not auto-inspect the created artifact.
 */
function generateSuccessResponse(): Record<string, unknown> {
  return {
    artifact: { ...baselineArtifactSummary(), tenantId: TENANT_ID_CANARY },
    payloadSummary: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: "user-1",
      createdAt: "2026-06-10T12:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 2,
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
      // Never present in the real payload summary; planted to prove the
      // page renders nothing from the generate response.
      requirementTexts: [GENERATE_RESPONSE_CANARY],
    },
    candidateSummary: {
      candidateCount: 2,
      evidenceCount: 2,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: ["art-ip-1"],
    },
  };
}

/** Serializable artifact summary shared by the delta list/detail stubs. */
function extractionDeltaArtifactSummary(): Record<string, unknown> {
  return {
    id: EXTRACTION_DELTA_ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "intake_package_review",
    type: "extraction_delta",
    status: "needs_review",
    version: 2,
    sourceFileIds: ["file-rfp-1", "file-rfp-2"],
    sourceArtifactIds: ["art-ip-1"],
    createdAt: "2026-06-04T08:00:00.000Z",
    updatedAt: "2026-06-04T08:30:00.000Z",
  };
}

function extractionDeltaListItem(): Record<string, unknown> {
  return {
    ...extractionDeltaArtifactSummary(),
    payloadSummary: {
      payloadKind: "rfp_extraction_delta",
      createdBy: "user-1",
      createdAt: "2026-06-04T08:00:00.000Z",
      proposalSource: "deterministic",
      inputPackageArtifactId: "art-ip-1",
      candidateCount: 3,
      evidenceReferenceCount: 4,
      pendingCount: 1,
      acceptedCount: 1,
      rejectedCount: 1,
      waivedCount: 0,
      reviewedBy: "user-2",
      reviewedAt: "2026-06-04T08:25:00.000Z",
      reviewedDecisionCount: 2,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: ["art-ip-1"],
      // Never present in the real lean read model; planted to prove the list
      // renders identifier/count fields only - never a candidate body.
      candidates: [{ id: "RFP-DELTA-001", title: DELTA_LIST_CANDIDATE_CANARY }],
    },
    // Smuggled keys the page must ignore entirely.
    payload: { candidates: [{ proposedEvidence: { text: DELTA_LIST_CANDIDATE_CANARY } } ] },
    tenantId: TENANT_ID_CANARY,
    storagePath: STORAGE_PATH_CANARY,
  };
}

function extractionDeltaListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [extractionDeltaListItem()],
  };
}

function extractionDeltaDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: extractionDeltaArtifactSummary(),
    delta: {
      payloadKind: "rfp_extraction_delta",
      createdBy: "user-1",
      createdAt: "2026-06-04T08:00:00.000Z",
      proposalSource: "deterministic",
      inputPackageArtifactId: "art-ip-1",
      candidateCount: 2,
      evidenceReferenceCount: 2,
      pendingCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      waivedCount: 0,
      reviewedBy: "user-2",
      reviewedAt: "2026-06-04T08:25:00.000Z",
      reviewedDecisionCount: 1,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: ["art-ip-1"],
      // Smuggled keys the page must ignore entirely.
      tenantId: TENANT_ID_CANARY,
      storagePath: STORAGE_PATH_CANARY,
      candidates: [
        {
          id: "RFP-DELTA-001",
          kind: "missing_evidence",
          sourceFileId: "file-rfp-1",
          title: "Missing redundancy requirement",
          description: "Section 3.1 lists a redundancy requirement not captured.",
          severity: "blocking",
          reviewStatus: "pending_review",
          confidence: 0.82,
          rationale: "Found in scope table but absent from extraction.",
          smuggledKey: SMUGGLED_KEY_CANARY,
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              evidenceKind: "rfp_document_text_chunk",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: "art-ip-1",
              chunkIndex: 0,
              chunkCount: 4,
              charCount: 1810,
            },
          ],
          proposedEvidence: {
            evidenceKind: "rfp_document_text_chunk",
            text: `${DELTA_PROPOSED_TEXT_CANARY} The supplier shall provide redundant cores.`,
            sourceFileName: "rfp-main.pdf",
            sourceFileRole: "rfp_main_document",
            chunkIndex: 0,
            chunkCount: 4,
            charCount: 64,
          },
          reviewHistory: [],
        },
        {
          id: "RFP-DELTA-002",
          kind: "table_reconstruction",
          sourceFileId: "file-rfp-2",
          title: "Rebuild scope table",
          description: "Table 1 lost its header row during extraction.",
          severity: "warning",
          reviewStatus: "accepted",
          evidenceReferences: [
            {
              evidenceId: "ev-table-1",
              evidenceKind: "rfp_document_table",
              sourceFileId: "file-rfp-2",
              inputPackageArtifactId: "art-ip-1",
              tableId: "tbl-1",
              sheetName: "Scope",
              rowCount: 12,
              columnCount: 5,
            },
          ],
          proposedEvidence: {
            evidenceKind: "rfp_document_table",
            tableId: "tbl-1",
            sourceFileName: "rfp-scope.xlsx",
            sourceFileRole: "rfp_attachment",
            sheetName: "Scope",
            rowCount: 2,
            columnCount: 2,
            rows: [
              ["Item", "Qty"],
              [DELTA_PROPOSED_ROW_CANARY, "4"],
            ],
          },
          reviewHistory: [
            {
              action: "accept",
              decidedBy: "user-2",
              decidedAt: "2026-06-04T08:25:00.000Z",
              previousReviewStatus: "pending_review",
              nextReviewStatus: "accepted",
              note: DELTA_HISTORY_NOTE_CANARY,
            },
          ],
        },
      ],
    },
  };
}

/** Serializable artifact summary shared by the package list/detail stubs. */
function evidencePackageArtifactSummary(): Record<string, unknown> {
  return {
    id: EVIDENCE_PACKAGE_ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "needs_review",
    version: 1,
    sourceFileIds: ["file-rfp-1", "file-rfp-2"],
    sourceArtifactIds: ["art-ip-1"],
    createdAt: "2026-06-04T09:10:00.000Z",
    updatedAt: "2026-06-04T09:20:00.000Z",
  };
}

function evidencePackageListItem(): Record<string, unknown> {
  return {
    ...evidencePackageArtifactSummary(),
    payloadSummary: {
      payloadKind: "rfp_evidence_package",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:10:00.000Z",
      inputPackageArtifactId: "art-ip-1",
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: ["art-ip-1"],
      // Never present in the real lean read model; planted to prove the list
      // renders identifier/count fields only - never a final evidence body.
      evidence: [{ text: PACKAGE_LIST_EVIDENCE_CANARY }],
    },
    // Smuggled keys the page must ignore entirely.
    payload: { evidence: [{ rows: [[PACKAGE_LIST_EVIDENCE_CANARY]] }] },
    tenantId: TENANT_ID_CANARY,
    storagePath: STORAGE_PATH_CANARY,
  };
}

function evidencePackageListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [evidencePackageListItem()],
  };
}

function evidencePackageDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: evidencePackageArtifactSummary(),
    package: {
      payloadKind: "rfp_evidence_package",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:10:00.000Z",
      inputPackageArtifactId: "art-ip-1",
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      sourceFileIds: ["file-rfp-1", "file-rfp-2"],
      sourceArtifactIds: ["art-ip-1"],
      // Smuggled keys the page must ignore entirely.
      tenantId: TENANT_ID_CANARY,
      storagePath: STORAGE_PATH_CANARY,
      evidence: [
        {
          evidenceId: "ev-text-1",
          evidenceKind: "rfp_document_text_chunk",
          sourceFileId: "file-rfp-1",
          inputPackageArtifactId: "art-ip-1",
          sourceFileName: "rfp-main.pdf",
          sourceFileRole: "rfp_main_document",
          chunkIndex: 0,
          chunkCount: 4,
          charCount: 1810,
          text: `${PACKAGE_EVIDENCE_TEXT_CANARY} The supplier shall provide a network design.`,
          documentMetrics: {
            textCharCount: 7200,
            nonWhitespaceTextCharCount: 6804,
            tableCount: 2,
            tableRowCount: 18,
          },
        },
        {
          evidenceId: "ev-table-1",
          evidenceKind: "rfp_document_table",
          sourceFileId: "file-rfp-2",
          inputPackageArtifactId: "art-ip-1",
          sourceFileName: "rfp-scope.xlsx",
          sourceFileRole: "rfp_attachment",
          tableId: "tbl-1",
          sheetName: "Scope",
          rowCount: 2,
          columnCount: 2,
          rows: [
            ["Item", "Qty"],
            [PACKAGE_TABLE_CELL_CANARY, "4"],
          ],
        },
      ],
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Recorded {
  url: string;
  method: string;
  body: unknown;
  contentType: string | null;
}

// Stub fetch with a handler and capture every call for method/url assertions.
function stubFetch(
  handler: (url: string, init?: RequestInit) => Response
): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const rawBody = init?.body;
      const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof rawBody === "string" ? JSON.parse(rawBody) : (rawBody ?? null),
        contentType: rawHeaders["Content-Type"] ?? null,
      });
      return Promise.resolve(handler(url, init));
    })
  );
  return calls;
}

// Default: evidence list (with or without query), both evidence detail
// endpoints, the baseline list/detail endpoints, and the baseline review and
// generate POSTs all succeed. The review branch echoes the posted decision
// back as the post-decision artifactStatus, like the real route; the
// generate branch answers 201 like the real route.
function stubDefault(): Recorded[] {
  return stubFetch((url, init) => {
    if (url === GENERATE_URL && init?.method === "POST") {
      return jsonResponse(generateSuccessResponse(), 201);
    }
    if (url === REVIEW_URL) {
      const raw = typeof init?.body === "string" ? init.body : "{}";
      const decision =
        (JSON.parse(raw) as { decision?: string }).decision === "rejected"
          ? "rejected"
          : "approved";
      return jsonResponse(baselineReviewSuccessResponse(decision));
    }
    if (url === `${LIST_URL}/ev-text-1`) return jsonResponse(textDetailResponse());
    if (url === `${LIST_URL}/ev-table-1`) return jsonResponse(tableDetailResponse());
    if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
    if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse());
    // The evidence-package endpoints share the /rfp/evidence prefix, so match
    // them by exact url BEFORE the startsWith(LIST_URL) evidence fallback.
    if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(extractionDeltaListResponse());
    if (url === EXTRACTION_DELTA_DETAIL_URL) return jsonResponse(extractionDeltaDetailResponse());
    if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
    if (url === EVIDENCE_PACKAGE_DETAIL_URL) return jsonResponse(evidencePackageDetailResponse());
    if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
    return jsonResponse({}, 404);
  });
}

// The evidence inspection surface is LIST_URL itself, its ?query variants, and
// its /<evidenceId> detail children - never the sibling evidence-package
// endpoint, which only shares the /rfp/evidence text prefix.
function isEvidenceUrl(url: string): boolean {
  return (
    url === LIST_URL ||
    url.startsWith(`${LIST_URL}?`) ||
    url.startsWith(`${LIST_URL}/`)
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectRfpEvidencePage - list load", () => {
  it("GETs all four inspection list endpoints on mount and renders context, counts, and lean rows", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);

    expect(await screen.findByTestId("project-name")).toHaveTextContent("STC Riyadh DC RFP");
    expect(screen.getByTestId("customer-name")).toHaveTextContent("STC");
    expect(screen.getByTestId("project-mode")).toHaveTextContent("rfp");
    expect(screen.getByTestId("project-mode")).toHaveTextContent(PROJECT_ID);

    const counts = screen.getByTestId("evidence-counts");
    expect(counts).toHaveTextContent("2 total");
    expect(counts).toHaveTextContent("text chunks: 1");
    expect(counts).toHaveTextContent("tables: 1");

    const rows = screen.getAllByTestId("evidence-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("ev-text-1");
    expect(rows[0]).toHaveTextContent("text");
    expect(rows[0]).toHaveTextContent("rfp-main.pdf");
    expect(rows[0]).toHaveTextContent("rfp_main_document");
    expect(rows[0]).toHaveTextContent("file-rfp-1");
    expect(rows[0]).toHaveTextContent("chunk 1/4");
    expect(rows[0]).toHaveTextContent("1810 chars");
    expect(rows[0]).toHaveTextContent("art-ip-1");
    expect(rows[0]).toHaveTextContent("2026-06-03T08:00:00.000Z");
    expect(rows[1]).toHaveTextContent("ev-table-1");
    expect(rows[1]).toHaveTextContent("table tbl-1");
    expect(rows[1]).toHaveTextContent("sheet Scope");
    expect(rows[1]).toHaveTextContent("12 rows x 5 cols");

    await screen.findByTestId("delta-row");
    await screen.findByTestId("ep-row");

    const gets = calls.filter((c) => c.method === "GET");
    expect(gets).toHaveLength(4);
    const urls = gets.map((c) => c.url);
    expect(urls).toContain(LIST_URL);
    expect(urls).toContain(EXTRACTION_DELTA_LIST_URL);
    expect(urls).toContain(EVIDENCE_PACKAGE_LIST_URL);
    expect(urls).toContain(BASELINE_LIST_URL);
    expect(gets.every((c) => c.body === null)).toBe(true);
  });

  it("shows a list loading state while the list GET is pending", async () => {
    let resolveList: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        if (url === EXTRACTION_DELTA_LIST_URL) {
          return Promise.resolve(jsonResponse(extractionDeltaListResponse()));
        }
        if (url === EVIDENCE_PACKAGE_LIST_URL) {
          return Promise.resolve(jsonResponse(evidencePackageListResponse()));
        }
        return new Promise<Response>((r) => { resolveList = r; });
      })
    );
    render(<ProjectRfpEvidencePage />);
    expect(screen.getByTestId("list-loading")).toBeInTheDocument();

    await act(async () => {
      resolveList(jsonResponse(listResponse()));
    });
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.queryByTestId("list-loading")).toBeNull();
  });

  it("never renders persisted text bodies or table cells in the list view (before Inspect)", async () => {
    stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");
    await screen.findByTestId("baseline-row");
    await screen.findByTestId("delta-row");
    await screen.findByTestId("ep-row");

    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(TEXT_BODY_CANARY);
    expect(body).not.toContain(TABLE_CELL_CANARY);
    expect(body).not.toContain(LIST_REQUIREMENT_TEXT_CANARY);
    expect(body).not.toContain(DELTA_LIST_CANDIDATE_CANARY);
    expect(body).not.toContain(PACKAGE_LIST_EVIDENCE_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
  });

  it('renders exactly "Unable to load RFP evidence." when the list GET returns non-ok', async () => {
    stubFetch(() => jsonResponse({ code: "rfp_evidence_inspection_failed" }, 500));
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("list-error");
    expect(err.textContent).toBe("Unable to load RFP evidence.");
    expect(screen.queryByTestId("evidence-row")).toBeNull();
    expect(screen.queryByTestId("project-name")).toBeNull();
  });

  it("renders the exact list error when the list GET throws, without leaking the failure detail", async () => {
    const secret = "list-boom-stack-detail";
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error(secret))));
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("list-error");
    expect(err.textContent).toBe("Unable to load RFP evidence.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });
});

describe("ProjectRfpEvidencePage - filters", () => {
  it("Apply reloads the list with sourceFileId, inputPackageArtifactId, and kind query params", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");

    fireEvent.change(screen.getByTestId("filter-source-file-id"), {
      target: { value: "file-rfp-1" },
    });
    fireEvent.change(screen.getByTestId("filter-artifact-id"), {
      target: { value: "art-ip-1" },
    });
    fireEvent.change(screen.getByTestId("filter-kind"), {
      target: { value: "rfp_document_table" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });

    const evidenceGets = calls.filter(
      (c) => c.method === "GET" && isEvidenceUrl(c.url)
    );
    expect(evidenceGets).toHaveLength(2);
    const applied = new URL(evidenceGets[1].url, "http://localhost");
    expect(applied.pathname).toBe(LIST_URL);
    expect(applied.searchParams.get("sourceFileId")).toBe("file-rfp-1");
    expect(applied.searchParams.get("inputPackageArtifactId")).toBe("art-ip-1");
    expect(applied.searchParams.get("kind")).toBe("rfp_document_table");
  });

  it("Reset clears the filter inputs and reloads the unfiltered list endpoint", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");

    fireEvent.change(screen.getByTestId("filter-source-file-id"), {
      target: { value: "file-rfp-2" },
    });
    fireEvent.change(screen.getByTestId("filter-artifact-id"), {
      target: { value: "art-ip-9" },
    });
    fireEvent.change(screen.getByTestId("filter-kind"), {
      target: { value: "rfp_document_text_chunk" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-reset"));
    });

    expect(screen.getByTestId("filter-source-file-id")).toHaveValue("");
    expect(screen.getByTestId("filter-artifact-id")).toHaveValue("");
    expect(screen.getByTestId("filter-kind")).toHaveValue("all");

    const evidenceGets = calls.filter(
      (c) => c.method === "GET" && isEvidenceUrl(c.url)
    );
    expect(evidenceGets).toHaveLength(3);
    expect(evidenceGets[1].url).toContain("?");
    expect(evidenceGets[2].url).toBe(LIST_URL);
  });
});

describe("ProjectRfpEvidencePage - detail inspection", () => {
  it("Inspect on a text row GETs the detail endpoint and renders the persisted text body and metadata", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-text-1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-text-1"));
    });

    const bodyEl = await screen.findByTestId("detail-text-body");
    expect(bodyEl).toHaveTextContent(TEXT_BODY_CANARY);
    expect(bodyEl).toHaveTextContent("The supplier shall provide a network design.");
    expect(screen.getByTestId("detail-meta")).toHaveTextContent("ev-text-1");
    expect(screen.getByTestId("detail-meta")).toHaveTextContent("file-rfp-1");
    const meta = screen.getByTestId("detail-text");
    expect(meta).toHaveTextContent("rfp-main.pdf");
    expect(meta).toHaveTextContent("rfp_main_document");
    expect(meta).toHaveTextContent("chunk 1/4");
    expect(meta).toHaveTextContent("art-ip-1");

    const detailCall = calls.find((c) => c.url === `${LIST_URL}/ev-text-1`);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
  });

  it("Inspect on a table row GETs the detail endpoint and renders the table rows and cells", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-table-1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-table-1"));
    });

    await screen.findByTestId("detail-table");
    const rows = screen.getAllByTestId("detail-table-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Item");
    expect(rows[0]).toHaveTextContent("Qty");
    expect(rows[1]).toHaveTextContent(TABLE_CELL_CANARY);
    expect(rows[1]).toHaveTextContent("4");
    expect(screen.getByTestId("detail-table")).toHaveTextContent("tbl-1");
    expect(screen.getByTestId("detail-table")).toHaveTextContent("2 rows x 2 cols");

    const detailCall = calls.find((c) => c.url === `${LIST_URL}/ev-table-1`);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
  });

  it("shows a detail loading state while the detail GET is pending", async () => {
    let resolveDetail: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === `${LIST_URL}/ev-text-1`) {
          return new Promise<Response>((r) => { resolveDetail = r; });
        }
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        if (url === EXTRACTION_DELTA_LIST_URL) {
          return Promise.resolve(jsonResponse(extractionDeltaListResponse()));
        }
        if (url === EVIDENCE_PACKAGE_LIST_URL) {
          return Promise.resolve(jsonResponse(evidencePackageListResponse()));
        }
        return Promise.resolve(jsonResponse(listResponse()));
      })
    );

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-text-1");
    fireEvent.click(screen.getByTestId("inspect-ev-text-1"));

    expect(await screen.findByTestId("detail-loading")).toBeInTheDocument();
    await act(async () => {
      resolveDetail(jsonResponse(textDetailResponse()));
    });
    expect(await screen.findByTestId("detail-text-body")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-loading")).toBeNull();
  });

  it('renders exactly "Unable to load evidence detail." when the detail GET fails, keeping the list', async () => {
    stubFetch((url) => {
      if (url === `${LIST_URL}/ev-text-1`) {
        return jsonResponse({ code: "rfp_evidence_not_found" }, 404);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-text-1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-text-1"));
    });

    const err = await screen.findByTestId("detail-error");
    expect(err.textContent).toBe("Unable to load evidence detail.");
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    expect(screen.getByTestId("project-name")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(TEXT_BODY_CANARY);
  });
});

describe("ProjectRfpEvidencePage - requirements baseline list", () => {
  it("GETs the baseline list on mount and renders the count and a lean artifact row", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);

    const row = await screen.findByTestId("baseline-row");
    expect(screen.getByTestId("baseline-count")).toHaveTextContent("Baseline artifacts: 1");
    expect(row).toHaveTextContent(BASELINE_ARTIFACT_ID);
    expect(row).toHaveTextContent("version 1");
    expect(row).toHaveTextContent("needs_review");
    expect(row).toHaveTextContent("created 2026-06-04T09:00:00.000Z");
    expect(row).toHaveTextContent("updated 2026-06-04T09:05:00.000Z");
    expect(row).toHaveTextContent("requirements: 2");
    expect(row).toHaveTextContent("evidence refs: 3");
    expect(row).toHaveTextContent("RFP-REQ-001, RFP-REQ-002");
    expect(row).toHaveTextContent("source artifacts: art-ip-1");
    expect(row).toHaveTextContent("source files: file-rfp-1, file-rfp-2");

    const baselineGets = calls.filter((c) => c.url === BASELINE_LIST_URL);
    expect(baselineGets).toHaveLength(1);
    expect(baselineGets[0].method).toBe("GET");
    expect(baselineGets[0].body).toBeNull();

    // The list never renders requirement text, even when smuggled in.
    expect(document.body.textContent ?? "").not.toContain(LIST_REQUIREMENT_TEXT_CANARY);
  });

  it('renders exactly "No requirements baseline artifacts yet." when the baseline list is empty', async () => {
    stubFetch((url) => {
      if (url === BASELINE_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const empty = await screen.findByTestId("baseline-empty");
    expect(empty.textContent).toBe("No requirements baseline artifacts yet.");
    expect(screen.getByTestId("baseline-count")).toHaveTextContent("Baseline artifacts: 0");
    expect(screen.queryByTestId("baseline-row")).toBeNull();
    expect(screen.queryByTestId("baseline-error")).toBeNull();
  });

  it('renders exactly "Unable to load requirements baseline." when the baseline list GET fails, keeping evidence', async () => {
    stubFetch((url) => {
      if (url === BASELINE_LIST_URL) {
        return jsonResponse({ code: "rfp_requirements_baseline_inspection_failed" }, 500);
      }
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("baseline-error");
    expect(err.textContent).toBe("Unable to load requirements baseline.");
    expect(screen.queryByTestId("baseline-row")).toBeNull();
    expect(screen.queryByTestId("baseline-count")).toBeNull();
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
  });
});

describe("ProjectRfpEvidencePage - requirements baseline detail", () => {
  it("Inspect GETs the exact artifact detail endpoint and renders requirement text plus locator-only references", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });

    await screen.findByTestId("baseline-detail-panel");
    const meta = screen.getByTestId("baseline-detail-meta");
    expect(meta).toHaveTextContent(BASELINE_ARTIFACT_ID);
    expect(meta).toHaveTextContent("version 1");
    expect(meta).toHaveTextContent("needs_review");
    expect(meta).toHaveTextContent("created by user-1");
    expect(meta).toHaveTextContent("requirements: 2");
    expect(meta).toHaveTextContent("evidence refs: 3");

    const reqs = screen.getAllByTestId("baseline-detail-requirement");
    expect(reqs).toHaveLength(2);
    expect(reqs[0]).toHaveTextContent("RFP-REQ-001");
    expect(reqs[0]).toHaveTextContent("technical");
    expect(reqs[0]).toHaveTextContent("mandatory");
    expect(reqs[0]).toHaveTextContent("Core redundancy");
    expect(reqs[0]).toHaveTextContent("Notes: From section 3.1.");
    expect(reqs[1]).toHaveTextContent("RFP-REQ-002");
    expect(reqs[1]).toHaveTextContent("optional");

    const texts = screen.getAllByTestId("baseline-detail-requirement-text");
    expect(texts).toHaveLength(2);
    expect(texts[0]).toHaveTextContent(
      "The supplier shall provide redundant core switching."
    );
    expect(texts[1]).toHaveTextContent(
      "The solution shall include redundant uplinks per access switch."
    );

    const refs = screen.getAllByTestId("baseline-detail-reference");
    expect(refs).toHaveLength(3);
    expect(refs[0]).toHaveTextContent("ev-text-1");
    expect(refs[0]).toHaveTextContent("text");
    expect(refs[0]).toHaveTextContent("chunk 1/4");
    expect(refs[0]).toHaveTextContent("1810 chars");
    expect(refs[0]).toHaveTextContent("file file-rfp-1");
    expect(refs[0]).toHaveTextContent("package art-ip-1");
    expect(refs[1]).toHaveTextContent("ev-table-1");
    expect(refs[1]).toHaveTextContent("table tbl-1");
    expect(refs[1]).toHaveTextContent("sheet Scope");
    expect(refs[1]).toHaveTextContent("12 rows x 5 cols");
    expect(refs[2]).toHaveTextContent("chunk 3/4");
    expect(refs[2]).toHaveTextContent("950 chars");

    // Locator-only: raw evidence content, storage/tenant fields, and
    // arbitrary smuggled keys never reach the DOM.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(RAW_EVIDENCE_TEXT_CANARY);
    expect(body).not.toContain(RAW_TABLE_ROW_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(SMUGGLED_KEY_CANARY);
    expect(body).not.toContain(LIST_REQUIREMENT_TEXT_CANARY);

    const detailCall = calls.find((c) => c.url === BASELINE_DETAIL_URL);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
    expect(detailCall!.body).toBeNull();
  });

  it("shows a baseline detail loading state while the detail GET is pending", async () => {
    let resolveDetail: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === BASELINE_DETAIL_URL) {
          return new Promise<Response>((r) => { resolveDetail = r; });
        }
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        if (url === EXTRACTION_DELTA_LIST_URL) {
          return Promise.resolve(jsonResponse(extractionDeltaListResponse()));
        }
        if (url === EVIDENCE_PACKAGE_LIST_URL) {
          return Promise.resolve(jsonResponse(evidencePackageListResponse()));
        }
        return Promise.resolve(jsonResponse(listResponse()));
      })
    );

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);
    fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));

    expect(await screen.findByTestId("baseline-detail-loading")).toBeInTheDocument();
    await act(async () => {
      resolveDetail(jsonResponse(baselineDetailResponse()));
    });
    expect(await screen.findByTestId("baseline-detail-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-detail-loading")).toBeNull();
  });

  it('renders exactly "Unable to load requirements baseline detail." when the detail GET fails, keeping list and evidence', async () => {
    stubFetch((url) => {
      if (url === BASELINE_DETAIL_URL) {
        return jsonResponse({ code: "requirements_baseline_artifact_not_found" }, 404);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });

    const err = await screen.findByTestId("baseline-detail-error");
    expect(err.textContent).toBe("Unable to load requirements baseline detail.");
    expect(screen.queryByTestId("baseline-detail-panel")).toBeNull();
    expect(screen.getAllByTestId("baseline-row")).toHaveLength(1);
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    expect(screen.getByTestId("project-name")).toBeInTheDocument();
  });
});

describe("ProjectRfpEvidencePage - requirements baseline review", () => {
  async function inspectBaseline(): Promise<void> {
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });
    await screen.findByTestId("baseline-detail-panel");
  }

  it("shows the note textarea and enabled Approve/Reject for a loaded needs_review baseline detail", async () => {
    stubDefault();
    render(<ProjectRfpEvidencePage />);
    await inspectBaseline();

    expect(screen.getByTestId("baseline-review-note")).toBeInTheDocument();
    expect(screen.getByTestId("baseline-review-approve")).toBeEnabled();
    expect(screen.getByTestId("baseline-review-reject")).toBeEnabled();
    expect(screen.queryByTestId("baseline-review-readonly")).toBeNull();
    expect(screen.queryByTestId("baseline-review-error")).toBeNull();
    expect(screen.queryByTestId("baseline-review-success")).toBeNull();
  });

  it("Approve POSTs exactly { decision: \"approved\" } (blank note omitted), applies the post-decision status, shows success, and reloads the baseline list", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await inspectBaseline();
    expect(screen.getByTestId("baseline-detail-meta")).toHaveTextContent("needs_review");

    // Whitespace-only note must trim to blank and be omitted from the body.
    fireEvent.change(screen.getByTestId("baseline-review-note"), {
      target: { value: "   " },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-approve"));
    });

    const success = await screen.findByTestId("baseline-review-success");
    expect(success.textContent).toBe("Requirements baseline approved.");

    const meta = screen.getByTestId("baseline-detail-meta");
    expect(meta).toHaveTextContent("approved");
    expect(meta).not.toHaveTextContent("needs_review");

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(REVIEW_URL);
    expect(posts[0].body).toEqual({ decision: "approved" });

    const baselineListGets = calls.filter((c) => c.url === BASELINE_LIST_URL);
    expect(baselineListGets).toHaveLength(2);
    expect(baselineListGets.every((c) => c.method === "GET")).toBe(true);

    // The decided artifact is no longer reviewable: controls collapse.
    expect(screen.queryByTestId("baseline-review-approve")).toBeNull();
    expect(screen.queryByTestId("baseline-review-reject")).toBeNull();
    expect(screen.getByTestId("baseline-review-readonly")).toHaveTextContent("approved");
  });

  it("Reject with a padded note POSTs { decision: \"rejected\", note } trimmed, applies the status, and reloads the baseline list", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await inspectBaseline();

    fireEvent.change(screen.getByTestId("baseline-review-note"), {
      target: { value: "  Scope section is incomplete.  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-reject"));
    });

    const success = await screen.findByTestId("baseline-review-success");
    expect(success.textContent).toBe("Requirements baseline rejected.");
    expect(screen.getByTestId("baseline-detail-meta")).toHaveTextContent("rejected");

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(REVIEW_URL);
    expect(posts[0].body).toEqual({
      decision: "rejected",
      note: "Scope section is incomplete.",
    });

    expect(calls.filter((c) => c.url === BASELINE_LIST_URL)).toHaveLength(2);
    expect(screen.queryByTestId("baseline-review-approve")).toBeNull();
  });

  it('renders exactly "Unable to review requirements baseline." on a non-ok review response, keeping the loaded detail and not reloading the list', async () => {
    const secret = "review-internal-code-detail";
    const calls = stubFetch((url, init) => {
      if (url === REVIEW_URL && init?.method === "POST") {
        return jsonResponse(
          { code: "requirements_baseline_review_failed", error: secret },
          409
        );
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await inspectBaseline();

    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-approve"));
    });

    const err = await screen.findByTestId("baseline-review-error");
    expect(err.textContent).toBe("Unable to review requirements baseline.");
    expect(screen.queryByTestId("baseline-review-success")).toBeNull();

    // The loaded detail survives the failure and stays reviewable.
    expect(screen.getByTestId("baseline-detail-panel")).toBeInTheDocument();
    expect(screen.getAllByTestId("baseline-detail-requirement")).toHaveLength(2);
    expect(screen.getByTestId("baseline-detail-meta")).toHaveTextContent("needs_review");
    expect(screen.getByTestId("baseline-review-approve")).toBeEnabled();
    expect(screen.getByTestId("baseline-review-reject")).toBeEnabled();

    expect(calls.filter((c) => c.url === BASELINE_LIST_URL)).toHaveLength(1);
    expect(document.body.textContent ?? "").not.toContain(secret);
  });

  it("renders the exact review error when the review POST throws, without leaking the thrown detail", async () => {
    const secret = "review-boom-stack-detail";
    stubFetch((url, init) => {
      if (url === REVIEW_URL && init?.method === "POST") {
        throw new Error(secret);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await inspectBaseline();

    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-reject"));
    });

    const err = await screen.findByTestId("baseline-review-error");
    expect(err.textContent).toBe("Unable to review requirements baseline.");
    expect(screen.getByTestId("baseline-detail-panel")).toBeInTheDocument();
    expect(screen.getAllByTestId("baseline-detail-requirement")).toHaveLength(2);
    expect(document.body.textContent ?? "").not.toContain(secret);
  });

  it("disables Approve and Reject while the review POST is pending", async () => {
    let resolveReview: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === REVIEW_URL && init?.method === "POST") {
          return new Promise<Response>((r) => { resolveReview = r; });
        }
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        if (url === BASELINE_DETAIL_URL) {
          return Promise.resolve(jsonResponse(baselineDetailResponse()));
        }
        if (url === EXTRACTION_DELTA_LIST_URL) {
          return Promise.resolve(jsonResponse(extractionDeltaListResponse()));
        }
        if (url === EVIDENCE_PACKAGE_LIST_URL) {
          return Promise.resolve(jsonResponse(evidencePackageListResponse()));
        }
        return Promise.resolve(jsonResponse(listResponse()));
      })
    );
    render(<ProjectRfpEvidencePage />);
    await inspectBaseline();

    fireEvent.click(screen.getByTestId("baseline-review-approve"));
    await waitFor(() =>
      expect(screen.getByTestId("baseline-review-approve")).toBeDisabled()
    );
    expect(screen.getByTestId("baseline-review-reject")).toBeDisabled();

    await act(async () => {
      resolveReview(jsonResponse(baselineReviewSuccessResponse("approved")));
    });
    expect(await screen.findByTestId("baseline-review-success")).toBeInTheDocument();
  });

  it("treats generated as reviewable and every decided/terminal status as read-only with no review buttons", async () => {
    const cases: Array<{ status: string; reviewable: boolean }> = [
      { status: "generated", reviewable: true },
      { status: "approved", reviewable: false },
      { status: "rejected", reviewable: false },
      { status: "stale", reviewable: false },
      { status: "failed", reviewable: false },
      { status: "not_applicable", reviewable: false },
      { status: "missing", reviewable: false },
    ];
    for (const { status, reviewable } of cases) {
      cleanup();
      vi.unstubAllGlobals();
      stubFetch((url) => {
        if (url === BASELINE_DETAIL_URL) {
          return jsonResponse(baselineDetailResponseWithStatus(status));
        }
        if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
        if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
        return jsonResponse({}, 404);
      });
      render(<ProjectRfpEvidencePage />);
      await inspectBaseline();

      if (reviewable) {
        expect(screen.getByTestId("baseline-review-note"), status).toBeInTheDocument();
        expect(screen.getByTestId("baseline-review-approve"), status).toBeEnabled();
        expect(screen.getByTestId("baseline-review-reject"), status).toBeEnabled();
        expect(screen.queryByTestId("baseline-review-readonly"), status).toBeNull();
      } else {
        expect(screen.queryByTestId("baseline-review-approve"), status).toBeNull();
        expect(screen.queryByTestId("baseline-review-reject"), status).toBeNull();
        expect(screen.queryByTestId("baseline-review-note"), status).toBeNull();
        expect(screen.getByTestId("baseline-review-readonly"), status).toHaveTextContent(
          status
        );
      }
    }
  });
});

describe("ProjectRfpEvidencePage - requirements baseline generation", () => {
  it("renders a checkbox per evidence row and tracks the selected count as rows toggle", async () => {
    stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 0"
    );
    expect(screen.getByTestId("evidence-select-ev-text-1")).not.toBeChecked();
    expect(screen.getByTestId("evidence-select-ev-table-1")).not.toBeChecked();

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    expect(screen.getByTestId("evidence-select-ev-text-1")).toBeChecked();
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 1"
    );

    fireEvent.click(screen.getByTestId("evidence-select-ev-table-1"));
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 2"
    );

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    expect(screen.getByTestId("evidence-select-ev-text-1")).not.toBeChecked();
    expect(screen.getByTestId("evidence-select-ev-table-1")).toBeChecked();
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 1"
    );
  });

  it("disables Generate with zero selected ids and enables it once a row is selected", async () => {
    stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    expect(screen.getByTestId("generate-baseline")).toBeDisabled();
    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    expect(screen.getByTestId("generate-baseline")).toBeEnabled();
    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    expect(screen.getByTestId("generate-baseline")).toBeDisabled();
  });

  it("Generate POSTs application/json with exactly { evidenceIds } for the selected rows and nothing else", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    fireEvent.click(screen.getByTestId("evidence-select-ev-table-1"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(GENERATE_URL);
    expect(posts[0].contentType).toBe("application/json");
    expect(Object.keys(posts[0].body as Record<string, unknown>)).toEqual([
      "evidenceIds",
    ]);
    expect(posts[0].body).toEqual({ evidenceIds: ["ev-text-1", "ev-table-1"] });

    // No decoy authority/content/decision field rides along.
    const serialized = JSON.stringify(posts[0].body);
    for (const banned of [
      TEXT_BODY_CANARY,
      TABLE_CELL_CANARY,
      TENANT_ID_CANARY,
      "tenant",
      "project",
      "status",
      "payload",
      "artifact",
      "decision",
      "approv",
      "requestedBy",
      "createdBy",
      "rows",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("successful generation shows the exact success copy, clears the selection, and reloads only the baseline list", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    fireEvent.click(screen.getByTestId("evidence-select-ev-table-1"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });

    const success = await screen.findByTestId("generate-success");
    expect(success.textContent).toBe("Requirements baseline draft generated.");
    expect(screen.queryByTestId("generate-error")).toBeNull();

    // Selection is cleared, so the button drops back to disabled.
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 0"
    );
    expect(screen.getByTestId("evidence-select-ev-text-1")).not.toBeChecked();
    expect(screen.getByTestId("evidence-select-ev-table-1")).not.toBeChecked();
    expect(screen.getByTestId("generate-baseline")).toBeDisabled();

    // Only the baseline list reloads: no evidence list reload, no evidence
    // detail fetch, no auto-inspection of the created artifact, no review.
    expect(calls.filter((c) => c.url === BASELINE_LIST_URL)).toHaveLength(2);
    expect(
      calls.filter((c) => c.method === "GET" && isEvidenceUrl(c.url))
    ).toHaveLength(1);
    expect(calls.some((c) => c.url === BASELINE_DETAIL_URL)).toBe(false);
    expect(calls.some((c) => c.url === REVIEW_URL)).toBe(false);
    expect(calls.some((c) => c.url === `${LIST_URL}/ev-text-1`)).toBe(false);
    expect(calls.some((c) => c.url === `${LIST_URL}/ev-table-1`)).toBe(false);

    // Nothing from the generate response body ever renders.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(GENERATE_RESPONSE_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
  });

  it('renders exactly "Unable to generate requirements baseline." on a non-ok response, keeping the selection and not reloading the baseline list', async () => {
    const secret = "generate-internal-code-detail";
    const calls = stubFetch((url, init) => {
      if (url === GENERATE_URL && init?.method === "POST") {
        return jsonResponse(
          { code: "rfp_requirements_candidate_drafting_unavailable", error: secret },
          503
        );
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    fireEvent.click(screen.getByTestId("evidence-select-ev-table-1"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });

    const err = await screen.findByTestId("generate-error");
    expect(err.textContent).toBe("Unable to generate requirements baseline.");
    expect(screen.queryByTestId("generate-success")).toBeNull();

    // The selection survives the failure so the engineer can retry.
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 2"
    );
    expect(screen.getByTestId("evidence-select-ev-text-1")).toBeChecked();
    expect(screen.getByTestId("evidence-select-ev-table-1")).toBeChecked();
    expect(screen.getByTestId("generate-baseline")).toBeEnabled();

    expect(calls.filter((c) => c.url === BASELINE_LIST_URL)).toHaveLength(1);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(secret);
    expect(body).not.toContain("rfp_requirements_candidate_drafting_unavailable");
  });

  it("renders the exact generate error when the POST throws, without leaking the thrown detail", async () => {
    const secret = "generate-boom-stack-detail";
    const calls = stubFetch((url, init) => {
      if (url === GENERATE_URL && init?.method === "POST") {
        throw new Error(secret);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });

    const err = await screen.findByTestId("generate-error");
    expect(err.textContent).toBe("Unable to generate requirements baseline.");
    expect(screen.queryByTestId("generate-success")).toBeNull();
    expect(screen.getByTestId("evidence-select-ev-text-1")).toBeChecked();
    expect(calls.filter((c) => c.url === BASELINE_LIST_URL)).toHaveLength(1);
    expect(document.body.textContent ?? "").not.toContain(secret);
  });

  it("disables the Generate button while the generate POST is pending", async () => {
    let resolveGenerate: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === GENERATE_URL && init?.method === "POST") {
          return new Promise<Response>((r) => { resolveGenerate = r; });
        }
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        if (url === EXTRACTION_DELTA_LIST_URL) {
          return Promise.resolve(jsonResponse(extractionDeltaListResponse()));
        }
        if (url === EVIDENCE_PACKAGE_LIST_URL) {
          return Promise.resolve(jsonResponse(evidencePackageListResponse()));
        }
        return Promise.resolve(jsonResponse(listResponse()));
      })
    );
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    expect(screen.getByTestId("generate-baseline")).toBeEnabled();
    fireEvent.click(screen.getByTestId("generate-baseline"));
    await waitFor(() =>
      expect(screen.getByTestId("generate-baseline")).toBeDisabled()
    );
    // Still pending: the selection has not been cleared yet.
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 1"
    );

    await act(async () => {
      resolveGenerate(jsonResponse(generateSuccessResponse(), 201));
    });
    expect(await screen.findByTestId("generate-success")).toBeInTheDocument();
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 0"
    );
  });

  it("drops selections for evidence rows no longer present after a filtered reload", async () => {
    let listCallCount = 0;
    const calls = stubFetch((url, init) => {
      if (url === GENERATE_URL && init?.method === "POST") {
        return jsonResponse(generateSuccessResponse(), 201);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) {
        return jsonResponse(extractionDeltaListResponse());
      }
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse(evidencePackageListResponse());
      }
      if (url.startsWith(LIST_URL)) {
        listCallCount += 1;
        if (listCallCount > 1) {
          return jsonResponse({
            project: projectContext(),
            filters: {},
            evidenceCount: 1,
            textChunkCount: 0,
            tableEvidenceCount: 1,
            evidence: [tableListItem()],
          });
        }
        return jsonResponse(listResponse());
      }
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    fireEvent.click(screen.getByTestId("evidence-select-ev-table-1"));
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 2"
    );

    fireEvent.change(screen.getByTestId("filter-kind"), {
      target: { value: "rfp_document_table" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });

    // The text row left the list, so its selection is dropped; the still
    // visible table row stays selected.
    expect(screen.queryByTestId("evidence-select-ev-text-1")).toBeNull();
    expect(screen.getByTestId("evidence-select-ev-table-1")).toBeChecked();
    expect(screen.getByTestId("generate-selected-count")).toHaveTextContent(
      "Selected evidence: 1"
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ evidenceIds: ["ev-table-1"] });
  });
});

describe("ProjectRfpEvidencePage - extraction delta list", () => {
  it("GETs the extraction delta list on mount and renders the count and a lean artifact row", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);

    const row = await screen.findByTestId("delta-row");
    expect(screen.getByTestId("delta-count")).toHaveTextContent("Extraction deltas: 1");
    expect(row).toHaveTextContent(EXTRACTION_DELTA_ARTIFACT_ID);
    expect(row).toHaveTextContent("version 2");
    expect(row).toHaveTextContent("needs_review");
    expect(row).toHaveTextContent("source deterministic");
    expect(row).toHaveTextContent("package art-ip-1");
    expect(row).toHaveTextContent("candidates 3");
    expect(row).toHaveTextContent("pending 1");
    expect(row).toHaveTextContent("accepted 1");
    expect(row).toHaveTextContent("rejected 1");
    expect(row).toHaveTextContent("waived 0");
    expect(row).toHaveTextContent("source artifacts: art-ip-1");
    expect(row).toHaveTextContent("source files: file-rfp-1, file-rfp-2");
    expect(row).toHaveTextContent("created 2026-06-04T08:00:00.000Z");
    expect(row).toHaveTextContent("updated 2026-06-04T08:30:00.000Z");

    const gets = calls.filter((c) => c.url === EXTRACTION_DELTA_LIST_URL);
    expect(gets).toHaveLength(1);
    expect(gets[0].method).toBe("GET");
    expect(gets[0].body).toBeNull();

    // The lean list never renders a candidate body or any smuggled key.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(DELTA_LIST_CANDIDATE_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
  });

  it('renders exactly "No extraction delta artifacts yet." when the list is empty', async () => {
    stubFetch((url) => {
      if (url === EXTRACTION_DELTA_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const empty = await screen.findByTestId("delta-empty");
    expect(empty.textContent).toBe("No extraction delta artifacts yet.");
    expect(screen.getByTestId("delta-count")).toHaveTextContent("Extraction deltas: 0");
    expect(screen.queryByTestId("delta-row")).toBeNull();
    expect(screen.queryByTestId("delta-list-error")).toBeNull();
  });

  it('renders exactly "Unable to load extraction deltas." when the list GET fails, keeping evidence', async () => {
    stubFetch((url) => {
      if (url === EXTRACTION_DELTA_LIST_URL) {
        return jsonResponse({ code: "rfp_extraction_delta_inspection_failed" }, 500);
      }
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("delta-list-error");
    expect(err.textContent).toBe("Unable to load extraction deltas.");
    expect(screen.queryByTestId("delta-row")).toBeNull();
    expect(screen.queryByTestId("delta-count")).toBeNull();
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
  });
});

describe("ProjectRfpEvidencePage - extraction delta detail", () => {
  async function inspectDelta(): Promise<void> {
    await screen.findByTestId(`delta-inspect-${EXTRACTION_DELTA_ARTIFACT_ID}`);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`delta-inspect-${EXTRACTION_DELTA_ARTIFACT_ID}`));
    });
    await screen.findByTestId("delta-detail-panel");
  }

  it("Inspect GETs the exact detail endpoint, shows pending candidates by default, and keeps decided candidates and history collapsed", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await inspectDelta();

    const meta = screen.getByTestId("delta-detail-meta");
    expect(meta).toHaveTextContent(EXTRACTION_DELTA_ARTIFACT_ID);
    expect(meta).toHaveTextContent("version 2");
    expect(meta).toHaveTextContent("candidates 2");
    expect(meta).toHaveTextContent("pending 1");
    expect(meta).toHaveTextContent("accepted 1");

    // Default focus: the pending candidate is surfaced directly.
    const pendingList = screen.getByTestId("delta-pending-list");
    expect(pendingList).toHaveTextContent("RFP-DELTA-001");
    expect(pendingList).toHaveTextContent("Missing redundancy requirement");
    expect(pendingList).toHaveTextContent("missing_evidence");
    expect(pendingList).toHaveTextContent("blocking");
    expect(pendingList).toHaveTextContent("confidence 0.82");
    expect(pendingList).toHaveTextContent("Found in scope table");
    expect(pendingList).toHaveTextContent("source file file-rfp-1");

    // Locator-only evidence reference (identifiers, positions, counts only).
    const refs = screen.getAllByTestId("delta-reference");
    expect(refs[0]).toHaveTextContent("ev-text-1");
    expect(refs[0]).toHaveTextContent("chunk 1/4");
    expect(refs[0]).toHaveTextContent("1810 chars");
    expect(refs[0]).toHaveTextContent("file file-rfp-1");
    expect(refs[0]).toHaveTextContent("package art-ip-1");

    // Proposed evidence is surfaced for review (a proposal, not authority).
    expect(screen.getByTestId("delta-proposed-text-body")).toHaveTextContent(
      DELTA_PROPOSED_TEXT_CANARY
    );

    // Decided candidate and its review history stay in collapsed details.
    const decided = screen.getByTestId("delta-decided");
    expect(decided.tagName).toBe("DETAILS");
    expect(decided).not.toHaveAttribute("open");
    expect(decided).toHaveTextContent("RFP-DELTA-002");
    expect(decided).toHaveTextContent("Rebuild scope table");
    const history = screen.getByTestId("delta-review-history");
    expect(history.tagName).toBe("DETAILS");
    expect(history).not.toHaveAttribute("open");
    expect(history).toHaveTextContent("accept");
    expect(history).toHaveTextContent("pending_review to accepted");
    expect(history).toHaveTextContent(DELTA_HISTORY_NOTE_CANARY);

    const detailCall = calls.find((c) => c.url === EXTRACTION_DELTA_DETAIL_URL);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
    expect(detailCall!.body).toBeNull();

    // Smuggled tenant/storage/arbitrary keys never reach the DOM.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
    expect(body).not.toContain(SMUGGLED_KEY_CANARY);
  });

  it('renders exactly "Unable to load extraction delta detail." when the detail GET fails, keeping the list', async () => {
    stubFetch((url) => {
      if (url === EXTRACTION_DELTA_DETAIL_URL) {
        return jsonResponse({ code: "extraction_delta_artifact_not_found" }, 404);
      }
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(extractionDeltaListResponse());
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`delta-inspect-${EXTRACTION_DELTA_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`delta-inspect-${EXTRACTION_DELTA_ARTIFACT_ID}`));
    });

    const err = await screen.findByTestId("delta-detail-error");
    expect(err.textContent).toBe("Unable to load extraction delta detail.");
    expect(screen.queryByTestId("delta-detail-panel")).toBeNull();
    expect(screen.getByTestId("delta-row")).toBeInTheDocument();
  });
});

describe("ProjectRfpEvidencePage - evidence package list", () => {
  it("GETs the evidence package list on mount and renders the count and a lean artifact row", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);

    const row = await screen.findByTestId("ep-row");
    expect(screen.getByTestId("ep-count")).toHaveTextContent("Final evidence packages: 1");
    expect(row).toHaveTextContent(EVIDENCE_PACKAGE_ARTIFACT_ID);
    expect(row).toHaveTextContent("version 1");
    expect(row).toHaveTextContent("needs_review");
    expect(row).toHaveTextContent("package art-ip-1");
    expect(row).toHaveTextContent("evidence 2");
    expect(row).toHaveTextContent("text 1");
    expect(row).toHaveTextContent("tables 1");
    expect(row).toHaveTextContent("source artifacts: art-ip-1");
    expect(row).toHaveTextContent("source files: file-rfp-1, file-rfp-2");
    expect(row).toHaveTextContent("created 2026-06-04T09:10:00.000Z");
    expect(row).toHaveTextContent("updated 2026-06-04T09:20:00.000Z");

    const gets = calls.filter((c) => c.url === EVIDENCE_PACKAGE_LIST_URL);
    expect(gets).toHaveLength(1);
    expect(gets[0].method).toBe("GET");
    expect(gets[0].body).toBeNull();

    // The lean list never renders a final evidence body or any smuggled key.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(PACKAGE_LIST_EVIDENCE_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
  });

  it('renders exactly "No final evidence package artifacts yet." when the list is empty', async () => {
    stubFetch((url) => {
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(extractionDeltaListResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const empty = await screen.findByTestId("ep-empty");
    expect(empty.textContent).toBe("No final evidence package artifacts yet.");
    expect(screen.getByTestId("ep-count")).toHaveTextContent("Final evidence packages: 0");
    expect(screen.queryByTestId("ep-row")).toBeNull();
    expect(screen.queryByTestId("ep-list-error")).toBeNull();
  });

  it('renders exactly "Unable to load final evidence packages." when the list GET fails, keeping evidence', async () => {
    stubFetch((url) => {
      if (url === EVIDENCE_PACKAGE_LIST_URL) {
        return jsonResponse({ code: "rfp_evidence_package_inspection_failed" }, 500);
      }
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(extractionDeltaListResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("ep-list-error");
    expect(err.textContent).toBe("Unable to load final evidence packages.");
    expect(screen.queryByTestId("ep-row")).toBeNull();
    expect(screen.queryByTestId("ep-count")).toBeNull();
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
  });
});

describe("ProjectRfpEvidencePage - evidence package detail", () => {
  async function inspectPackage(): Promise<void> {
    await screen.findByTestId(`ep-inspect-${EVIDENCE_PACKAGE_ARTIFACT_ID}`);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ep-inspect-${EVIDENCE_PACKAGE_ARTIFACT_ID}`));
    });
    await screen.findByTestId("ep-detail-panel");
  }

  it("Inspect GETs the exact detail endpoint and renders sanitized final evidence text and table content with source traceability", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await inspectPackage();

    const meta = screen.getByTestId("ep-detail-meta");
    expect(meta).toHaveTextContent(EVIDENCE_PACKAGE_ARTIFACT_ID);
    expect(meta).toHaveTextContent("version 1");
    expect(meta).toHaveTextContent("needs_review");
    expect(meta).toHaveTextContent("package art-ip-1");
    expect(meta).toHaveTextContent("evidence 2");
    expect(meta).toHaveTextContent("text 1");
    expect(meta).toHaveTextContent("tables 1");

    const entries = screen.getAllByTestId("ep-evidence");
    expect(entries).toHaveLength(2);

    // Final evidence text body is rendered (the package is under human review).
    const textBody = screen.getByTestId("ep-evidence-text-body");
    expect(textBody).toHaveTextContent(PACKAGE_EVIDENCE_TEXT_CANARY);
    expect(textBody).toHaveTextContent("The supplier shall provide a network design.");
    // Text entry source traceability.
    expect(entries[0]).toHaveTextContent("ev-text-1");
    expect(entries[0]).toHaveTextContent("rfp-main.pdf");
    expect(entries[0]).toHaveTextContent("rfp_main_document");
    expect(entries[0]).toHaveTextContent("chunk 1/4");
    expect(entries[0]).toHaveTextContent("file file-rfp-1");
    expect(entries[0]).toHaveTextContent("package art-ip-1");

    // Final evidence table rows are rendered with traceability.
    const rows = screen.getAllByTestId("ep-evidence-table-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Item");
    expect(rows[0]).toHaveTextContent("Qty");
    expect(rows[1]).toHaveTextContent(PACKAGE_TABLE_CELL_CANARY);
    expect(rows[1]).toHaveTextContent("4");
    expect(entries[1]).toHaveTextContent("tbl-1");
    expect(entries[1]).toHaveTextContent("sheet Scope");
    expect(entries[1]).toHaveTextContent("2 rows x 2 cols");

    // Long content sits inside collapsed details for scannability.
    expect(screen.getByTestId("ep-evidence-text").tagName).toBe("DETAILS");
    expect(screen.getByTestId("ep-evidence-table").tagName).toBe("DETAILS");

    const detailCall = calls.find((c) => c.url === EVIDENCE_PACKAGE_DETAIL_URL);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
    expect(detailCall!.body).toBeNull();

    // Even in the detail, storage/tenant fields never reach the DOM.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
  });

  it('renders exactly "Unable to load final evidence package detail." when the detail GET fails, keeping the list', async () => {
    stubFetch((url) => {
      if (url === EVIDENCE_PACKAGE_DETAIL_URL) {
        return jsonResponse({ code: "evidence_package_artifact_not_found" }, 404);
      }
      if (url === EVIDENCE_PACKAGE_LIST_URL) return jsonResponse(evidencePackageListResponse());
      if (url === EXTRACTION_DELTA_LIST_URL) return jsonResponse(extractionDeltaListResponse());
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`ep-inspect-${EVIDENCE_PACKAGE_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`ep-inspect-${EVIDENCE_PACKAGE_ARTIFACT_ID}`));
    });

    const err = await screen.findByTestId("ep-detail-error");
    expect(err.textContent).toBe("Unable to load final evidence package detail.");
    expect(screen.queryByTestId("ep-detail-panel")).toBeNull();
    expect(screen.getByTestId("ep-row")).toBeInTheDocument();
  });
});

describe("ProjectRfpEvidencePage - read-only fetch boundary", () => {
  it("issues only default-GET fetches to the four inspection endpoints and never calls write or other RFP endpoints", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");
    await screen.findByTestId("baseline-row");

    fireEvent.change(screen.getByTestId("filter-source-file-id"), {
      target: { value: "file-rfp-1" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-text-1"));
    });
    await screen.findByTestId("detail-text-body");
    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-table-1"));
    });
    await screen.findByTestId("detail-table");
    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });
    await screen.findByTestId("baseline-detail-panel");

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(6));
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.body).toBeNull();
      expect(call.url).not.toMatch(/\/review/);
      expect(call.url).not.toMatch(/\/generate/);
      expect(call.url).not.toMatch(/upload/);
      expect(call.url).not.toMatch(/input-package/);
      expect(call.url).not.toMatch(/\/approvals/);
      expect(call.url).not.toMatch(/\/extract(?:\/|$)/);
      expect(call.url).not.toMatch(/\/files/);
    }
    // Every call targets the evidence or baseline inspection surface only.
    const allowedExact = new Set([
      LIST_URL,
      `${LIST_URL}/ev-text-1`,
      `${LIST_URL}/ev-table-1`,
      EXTRACTION_DELTA_LIST_URL,
      EXTRACTION_DELTA_DETAIL_URL,
      EVIDENCE_PACKAGE_LIST_URL,
      EVIDENCE_PACKAGE_DETAIL_URL,
      BASELINE_LIST_URL,
      BASELINE_DETAIL_URL,
    ]);
    for (const call of calls) {
      const ok = allowedExact.has(call.url) || call.url.startsWith(`${LIST_URL}?`);
      expect(ok, `unexpected fetch url: ${call.url}`).toBe(true);
    }
  });

  it("keeps every fetch a GET except exactly one POST to the exact review endpoint whose body is only decision and optional note", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });
    await screen.findByTestId("baseline-detail-panel");
    fireEvent.change(screen.getByTestId("baseline-review-note"), {
      target: { value: "ok to ship" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-approve"));
    });
    await screen.findByTestId("baseline-review-success");

    const nonGets = calls.filter((c) => c.method !== "GET");
    expect(nonGets).toHaveLength(1);
    expect(nonGets[0].method).toBe("POST");
    expect(nonGets[0].url).toBe(REVIEW_URL);
    expect(Object.keys(nonGets[0].body as Record<string, unknown>).sort()).toEqual([
      "decision",
      "note",
    ]);
    expect(nonGets[0].body).toEqual({ decision: "approved", note: "ok to ship" });

    const allowedExact = new Set([
      LIST_URL,
      EXTRACTION_DELTA_LIST_URL,
      EXTRACTION_DELTA_DETAIL_URL,
      EVIDENCE_PACKAGE_LIST_URL,
      EVIDENCE_PACKAGE_DETAIL_URL,
      BASELINE_LIST_URL,
      BASELINE_DETAIL_URL,
      REVIEW_URL,
    ]);
    for (const call of calls) {
      const ok = allowedExact.has(call.url) || call.url.startsWith(`${LIST_URL}?`);
      expect(ok, `unexpected fetch url: ${call.url}`).toBe(true);
      if (call.url !== REVIEW_URL) {
        expect(call.method).toBe("GET");
        expect(call.body).toBeNull();
      }
      expect(call.method).not.toBe("PUT");
      expect(call.method).not.toBe("PATCH");
      expect(call.method).not.toBe("DELETE");
      expect(call.url).not.toMatch(
        /upload|input-package|\/approvals|\/extract(?:\/|$)|\/files|\/export/
      );
    }
  });

  it("performs exactly two POSTs - generate then review - across the full explicit write flow", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("evidence-select-ev-text-1");

    fireEvent.click(screen.getByTestId("evidence-select-ev-text-1"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("generate-baseline"));
    });
    await screen.findByTestId("generate-success");

    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });
    await screen.findByTestId("baseline-detail-panel");
    await act(async () => {
      fireEvent.click(screen.getByTestId("baseline-review-approve"));
    });
    await screen.findByTestId("baseline-review-success");

    // Generate and review are the page's only two write endpoints, each
    // POSTed exactly once with its own minimal body.
    const nonGets = calls.filter((c) => c.method !== "GET");
    expect(nonGets).toHaveLength(2);
    expect(nonGets[0].method).toBe("POST");
    expect(nonGets[0].url).toBe(GENERATE_URL);
    expect(nonGets[0].body).toEqual({ evidenceIds: ["ev-text-1"] });
    expect(nonGets[1].method).toBe("POST");
    expect(nonGets[1].url).toBe(REVIEW_URL);
    expect(nonGets[1].body).toEqual({ decision: "approved" });

    const allowedExact = new Set([
      LIST_URL,
      EXTRACTION_DELTA_LIST_URL,
      EXTRACTION_DELTA_DETAIL_URL,
      EVIDENCE_PACKAGE_LIST_URL,
      EVIDENCE_PACKAGE_DETAIL_URL,
      BASELINE_LIST_URL,
      BASELINE_DETAIL_URL,
      REVIEW_URL,
      GENERATE_URL,
    ]);
    for (const call of calls) {
      const ok = allowedExact.has(call.url) || call.url.startsWith(`${LIST_URL}?`);
      expect(ok, `unexpected fetch url: ${call.url}`).toBe(true);
      expect(call.method).not.toBe("PUT");
      expect(call.method).not.toBe("PATCH");
      expect(call.method).not.toBe("DELETE");
      expect(call.url).not.toMatch(
        /upload|input-package|\/approvals|\/extract(?:\/|$)|\/files|\/export/
      );
    }
  });
});

describe("ProjectRfpEvidencePage - static source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-rfp-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("is a client component that reads the id from next/navigation and calls the inspection APIs", () => {
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("useParams");
    expect(source).toContain("/rfp/evidence");
    expect(source).toContain("/rfp/requirements-baseline");
    expect(source).toContain("/rfp/artifacts/");
  });

  it("imports only react, next/navigation, and the type-only inspection read models", () => {
    const statements = source.match(/^import[^;]+;/gm) ?? [];
    expect(statements.length).toBeGreaterThanOrEqual(4);
    const allowed = new Set([
      "react",
      "next/navigation",
      "@/lib/projects/project-rfp-evidence-inspection",
      "@/lib/projects/project-rfp-requirements-baseline-inspection",
      "@/lib/projects/project-rfp-extraction-delta-inspection",
      "@/lib/projects/project-rfp-evidence-package-inspection",
    ]);
    for (const statement of statements) {
      const m = statement.match(/from\s+"([^"]+)"/);
      expect(m, `import without a module source: ${statement}`).not.toBeNull();
      const spec = m![1];
      expect(allowed.has(spec), `unexpected import source: ${spec}`).toBe(true);
      if (spec.startsWith("@/lib/projects/")) {
        expect(statement.startsWith("import type")).toBe(true);
      }
    }
    expect(source).not.toContain("import(");
    expect(source).not.toContain("require(");
  });

  it("contains no db/store/route/write/persistence/run/AI/authority tokens and no mutation methods beyond the review POST", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/app/api',
      'from "@/lib/middleware',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      '"use server"',
      "project-rfp-evidence-persistence",
      "project-rfp-evidence-run",
      "project-rfp-input-package",
      "input-package",
      "/approvals",
      "/files",
      "/upload",
      "/download",
      '"PUT"',
      '"PATCH"',
      '"DELETE"',
      "FormData",
      "storagePath",
      "node:fs",
      "drizzle",
      "pricing",
      "priced",
      "catalog",
      "configuration-expansion",
      "config-expansion",
      "sku-resolution",
      "export-package",
      "@anthropic-ai",
      "anthropic",
      "openai",
      "provider",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("permits exactly two POSTs - the baseline generate fetch and the review fetch - and no other write path", () => {
    expect((source.match(/"POST"/g) ?? []).length).toBe(2);
    expect((source.match(/method:/g) ?? []).length).toBe(2);
    // Every /review occurrence is the requirements-baseline review endpoint
    // and every /generate occurrence is the requirements-baseline generate
    // endpoint; no arbitrary review, approvals, or generation path appears
    // anywhere in the page.
    const reviewMentions = source.match(/\/review/g) ?? [];
    const baselineReviewMentions = source.match(/requirements-baseline\/review/g) ?? [];
    expect(baselineReviewMentions.length).toBeGreaterThanOrEqual(1);
    expect(reviewMentions.length).toBe(baselineReviewMentions.length);
    const generateMentions = source.match(/\/generate/g) ?? [];
    const baselineGenerateMentions =
      source.match(/requirements-baseline\/generate/g) ?? [];
    expect(baselineGenerateMentions.length).toBeGreaterThanOrEqual(1);
    expect(generateMentions.length).toBe(baselineGenerateMentions.length);
  });

  it("keeps the page and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

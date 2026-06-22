/**
 * RFP compliance-matrix STANDARD CSV export service (Stage 5).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts; payload contract:
 * src/lib/projects/project-rfp-compliance-matrix.ts.
 *
 * Produces ONE deterministic, customer-facing CSV download from the exact
 * already-APPROVED compliance_matrix artifact named by the caller. It gates on
 * rfp mode, compliance_matrix type/stage, and approved status, then validates the
 * payload discriminator and rows. Only ACTIVE rows (rowReviewStatus !== "removed")
 * are exported, and only the four customer-facing columns are emitted:
 *   Section Reference, Description, Comply/Not Comply, Notes
 *
 * AUTHORITY / PRIVACY BOUNDARY: this is a pure projection of an approved artifact.
 * It reads nothing but the project and the one artifact (tenant-scoped), creates
 * or mutates nothing, runs no AI/model, reads no filesystem/document, and makes no
 * pricing, SKU, catalog, or configuration decision. It deliberately drops every
 * internal field - evidence/source/requirement/artifact ids, owner/response lanes,
 * impact flags, review history, removed reasons, configuration references, prices,
 * SKUs, and catalog fields - so none of that leaks into the deliverable. The
 * compliance verdict text is copied verbatim from the reviewed payload; it is never
 * recomputed here.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND } from "@/lib/projects/project-rfp-compliance-matrix";
import type { Project, ProjectArtifact, ProjectMode } from "@/types/project";

/** Exact CSV header columns, in order. The only columns the deliverable carries. */
const CSV_HEADER = [
  "Section Reference",
  "Description",
  "Comply/Not Comply",
  "Notes",
] as const;

/** RFC-4180 row separator chosen for the export. */
const CSV_ROW_SEPARATOR = "\r\n";

/** MIME type stamped on the OK result and the route response. */
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

/** Caller-facing input; every value is server-derived (session tenant + route params). */
export interface ExportRfpComplianceMatrixCsvInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpComplianceMatrixExportProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Discriminated result of {@link exportRfpComplianceMatrixCsv}. */
export type ExportRfpComplianceMatrixCsvResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpComplianceMatrixExportProjectSummary }
  | { status: "compliance_matrix_not_found" }
  | { status: "artifact_not_compliance_matrix" }
  | { status: "compliance_matrix_not_approved" }
  | { status: "invalid_payload" }
  | { status: "no_exportable_rows" }
  | {
      status: "ok";
      csv: string;
      bytes: Buffer;
      contentType: typeof CSV_CONTENT_TYPE;
      contentLength: number;
      filename: string;
      rowCount: number;
    };

const COMPLIANCE_MATRIX_ARTIFACT_TYPE: ProjectArtifact["type"] = "compliance_matrix";
const COMPLIANCE_MATRIX_STAGE_ID: ProjectArtifact["stageId"] = "compliance_matrix_review";

type Row = Record<string, unknown>;

/** A plain (non-array) object row. */
function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value as a string, or "" when it is not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A nonblank string check that narrows the value to string. */
function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Validate the discriminator and that rows is an array of plain row objects. */
function isExportablePayload(payload: unknown): payload is { rows: Row[] } {
  if (!isRow(payload)) return false;
  if (payload.payloadKind !== RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND) return false;
  if (!Array.isArray(payload.rows)) return false;
  return payload.rows.every(isRow);
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpComplianceMatrixExportProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Replace any character outside [A-Za-z0-9._-] with "_" for a safe ASCII segment. */
function safeFilenameSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** RFC-4180 field escaping: quote and double-up quotes when comma/quote/CR/LF present. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build the Notes cell from response, notes, and a not-applicable reason (when present). */
function buildNotes(row: Row): string {
  const parts: string[] = [];
  if (isNonBlank(row.response)) parts.push(row.response);
  if (isNonBlank(row.notes)) parts.push(row.notes);
  if (row.complianceStatus === "not_applicable" && isNonBlank(row.notApplicableReason)) {
    parts.push(`Not applicable: ${row.notApplicableReason}`);
  }
  return parts.join(" | ");
}

/** Build the four-column CSV record for one active row. */
function toCsvRecord(row: Row): string {
  const sectionReference = asString(row.sectionReference);
  const description = asString(row.requirementText);
  const comply = row.complianceStatus === "compliant" ? "Comply" : "Not Comply";
  const notes = buildNotes(row);
  return [sectionReference, description, comply, notes].map(csvField).join(",");
}

/**
 * Export the approved RFP compliance matrix as a standard four-column CSV, tenant
 * scoped on every store call. Gates project (not_found / wrong_mode) and artifact
 * (compliance_matrix_not_found / artifact_not_compliance_matrix /
 * compliance_matrix_not_approved) BEFORE touching the payload, then validates the
 * payload (invalid_payload) and requires at least one active row (no_exportable_rows).
 * On success it returns the CSV text, its UTF-8 bytes, the MIME type, content length,
 * the server-derived filename, and the exported row count. It mutates nothing and
 * surfaces no internal ids, lanes, impact flags, reasons, references, prices, or SKUs.
 */
export async function exportRfpComplianceMatrixCsv(
  input: ExportRfpComplianceMatrixCsvInput
): Promise<ExportRfpComplianceMatrixCsvResult> {
  const { tenantId, projectId, artifactId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "compliance_matrix_not_found" };
  if (
    artifact.type !== COMPLIANCE_MATRIX_ARTIFACT_TYPE ||
    artifact.stageId !== COMPLIANCE_MATRIX_STAGE_ID
  ) {
    return { status: "artifact_not_compliance_matrix" };
  }
  if (artifact.status !== "approved") {
    return { status: "compliance_matrix_not_approved" };
  }

  if (!isExportablePayload(artifact.payload)) return { status: "invalid_payload" };

  const activeRows = artifact.payload.rows.filter(
    (row) => row.rowReviewStatus !== "removed"
  );
  if (activeRows.length === 0) return { status: "no_exportable_rows" };

  const lines = [CSV_HEADER.map(csvField).join(","), ...activeRows.map(toCsvRecord)];
  const csv = lines.join(CSV_ROW_SEPARATOR);
  const bytes = Buffer.from(csv, "utf8");
  const filename = `BOMATIC-RFP-Compliance-Matrix-${safeFilenameSegment(
    project.name
  )}-v${artifact.version}.csv`;

  return {
    status: "ok",
    csv,
    bytes,
    contentType: CSV_CONTENT_TYPE,
    contentLength: bytes.length,
    filename,
    rowCount: activeRows.length,
  };
}

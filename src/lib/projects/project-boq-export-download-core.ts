/**
 * Shared Project BoQ export-package DOWNLOAD core: load ONE already-APPROVED
 * `export_package` artifact and serve the exact workbook file it references.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 15 Artifact Types; section 16 Approval Model). Canonical shapes:
 * src/types/project.ts.
 *
 * This is the lane-agnostic core behind the Quick BoM and RFP BoQ export download step.
 * RFP and Quick BoM `export_package` artifacts are produced by the SAME deterministic
 * export-creation path, so they share this identical download/serve path - only the mode
 * gate and the served filename's lane label differ per lane, both pinned by the caller
 * through the lane config (`expectedMode`, `filenameLabel`). This is download/serve ONLY:
 * it never builds, regenerates, re-prices, re-resolves SKUs, re-expands configuration, or
 * infers categories. It verifies the Project (not_found / wrong_mode against the
 * caller-supplied `expectedMode`) BEFORE loading the artifact, loads the exact
 * tenant/project/artifact triple, checks it is an approved `export_package`, and reads the
 * bytes at the artifact's OWN stored file path.
 *
 * AUTHORITY BOUNDARY: every authority is server-side - the tenant session, the route
 * params, the stored Project, and the stored artifact. The caller supplies no file path,
 * output path, filename, status, approval, tenant, project, or artifact authority; the
 * lane wrapper pins only the trusted `expectedMode` and `filenameLabel`. The artifact's
 * stored filePath is the ONLY workbook path and it is never echoed back. The path must end
 * in .xlsx and resolve to a regular file; a missing file maps to a safe status and any
 * unexpected filesystem fault is re-thrown for the route to map to a controlled 500. It
 * runs no AI, performs no math/pricing/lookup, creates no artifact version or approval,
 * updates no stage, and touches the filesystem read-only. It returns lean serializable
 * summaries plus the workbook bytes only - never the artifact payload, the stored filePath,
 * priced lines, totals, or any pricing/configuration detail - and never mutates its input,
 * the Project, the artifact, or the bytes.
 *
 * The ONLY lane-specific behavior is the `project.mode !== expectedMode` gate and the
 * served filename's lane label, so each lane (Quick BoM, RFP BoQ) keeps its own surface
 * and download filename while sharing this deterministic core. The result status names are
 * kept verbatim for the existing route API contract even though the core is now generic.
 */
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/** Fixed Office Open XML spreadsheet MIME for the served .xlsx workbook. */
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;

/** The only file extension a downloadable export workbook may carry. */
const XLSX_EXTENSION = ".xlsx";

/** Caller-facing download request shared by every BoQ export lane (no lane config). */
export interface ProjectBoqExportDownloadRequest {
  tenantId: string;
  projectId: string;
  /** The exact export_package artifact whose workbook is served. */
  artifactId: string;
}

/** Full core input: the caller request plus the two values a lane wrapper pins. */
export interface LoadProjectBoqExportDownloadCoreInput
  extends ProjectBoqExportDownloadRequest {
  /** Project.mode this lane operates on; any mismatch yields wrong_mode. */
  expectedMode: ProjectMode;
  /**
   * Lane-pinned filename middle segment (e.g. "Quick-BoM" or "RFP-BoQ"). Trusted lane
   * config, never a caller body field; the sanitized customer/project label and version
   * are composed around it. The original Quick download embedded this segment as a string
   * literal, so pinning it here is behavior-preserving.
   */
  filenameLabel: string;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface ProjectBoqExportDownloadProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload/filePath. */
export interface ProjectBoqExportDownloadArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Discriminated result of {@link loadProjectBoqExportDownloadCore}. */
export type LoadProjectBoqExportDownloadResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectBoqExportDownloadProjectSummary }
  | { status: "export_package_not_found" }
  | { status: "artifact_not_export_package" }
  | { status: "export_package_not_approved" }
  | { status: "export_package_file_missing" }
  | { status: "export_package_file_invalid" }
  | { status: "export_package_file_unavailable" }
  | {
      status: "ok";
      /** Raw workbook bytes read from the artifact's stored path. */
      bytes: Uint8Array;
      mimeType: typeof XLSX_MIME;
      /** Safe ASCII download filename; never the stored path or caller input. */
      filename: string;
      contentLength: number;
      artifact: ProjectBoqExportDownloadArtifactSummary;
    };

/** Maximum length of the sanitized customer/project label inside the download filename. */
const MAX_LABEL_LENGTH = 48;

/**
 * Sanitize a customer/project label into a short, professional, ASCII-safe filename token:
 * trim, replace every non-alphanumeric run with a single "-", collapse duplicate "-", trim
 * leading/trailing "-", cap at {@link MAX_LABEL_LENGTH}, and fall back to "Project" when the
 * result is empty. Deterministic and derived only from server-side Project metadata.
 */
function sanitizeLabel(value: string): string {
  const collapsed = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const capped = collapsed.slice(0, MAX_LABEL_LENGTH).replace(/-+$/g, "");
  return capped === "" ? "Project" : capped;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): ProjectBoqExportDownloadProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, no payload/path. */
function toArtifactSummary(
  artifact: ProjectArtifact
): ProjectBoqExportDownloadArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/**
 * Build a short, professional, ASCII-safe download filename from the lane label plus the
 * Project + artifact identity only: `BOMATIC-<filenameLabel>-<label>-v<version>.xlsx`,
 * where `<filenameLabel>` is the trusted lane segment, `<label>` is the sanitized customer
 * name (falling back to the project name, then "Project"), and `<version>` is the stored
 * artifact version. It never includes the artifact id, never derives from caller input, and
 * never exposes the stored path.
 */
function buildDownloadFilename(
  filenameLabel: string,
  project: Project,
  artifact: ProjectArtifact
): string {
  const safeFilenameLabel = sanitizeLabel(filenameLabel);
  const label = sanitizeLabel(project.customerName ?? project.name ?? "Project");
  return `BOMATIC-${safeFilenameLabel}-${label}-v${artifact.version}.xlsx`;
}

/** True when a thrown filesystem error is a missing-path ENOENT. */
function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Load one already-approved `export_package` artifact and serve the exact workbook bytes
 * it references, tenant-scoped on every store call. It verifies the Project within its
 * tenant (not_found / wrong_mode against the caller-supplied `expectedMode`, lean summary)
 * BEFORE loading the artifact or touching the filesystem, then loads the exact
 * tenant/project/artifact triple and rejects a missing artifact, a non-export_package
 * type, or a non-approved status. The artifact's stored filePath is the only workbook
 * path: a blank path is file_missing, a non-.xlsx path is file_invalid, and the path is
 * then stat-checked (ENOENT -> file_unavailable, non-regular-file -> file_invalid) and read
 * read-only (ENOENT -> file_unavailable). Any other filesystem fault is re-thrown for the
 * route to map to a safe 500. On success it returns the workbook bytes, the fixed xlsx
 * MIME, a safe filename derived from the lane label and Project/artifact identity, the byte
 * length, and a lean artifact summary - never the artifact payload, the stored path, or any
 * pricing detail. The input, Project, artifact, and bytes are never mutated.
 */
export async function loadProjectBoqExportDownloadCore(
  input: LoadProjectBoqExportDownloadCoreInput
): Promise<LoadProjectBoqExportDownloadResult> {
  const { tenantId, projectId, artifactId, expectedMode, filenameLabel } = input;

  // Read-only download loader: archived Projects remain downloadable (QBM-LOG-006).
  const project = await getProjectById(tenantId, projectId, { includeArchived: true });
  if (project === null) return { status: "not_found" };
  if (project.mode !== expectedMode) {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "export_package_not_found" };
  if (artifact.type !== "export_package") return { status: "artifact_not_export_package" };
  if (artifact.status !== "approved") return { status: "export_package_not_approved" };

  // The artifact's own stored path is the only workbook authority; caller input never
  // reaches here. A blank path cannot be served; a non-.xlsx path is rejected outright.
  const filePath = artifact.filePath;
  if (filePath === undefined || filePath.trim() === "") {
    return { status: "export_package_file_missing" };
  }
  if (extname(filePath).toLowerCase() !== XLSX_EXTENSION) {
    return { status: "export_package_file_invalid" };
  }

  // Confirm the path resolves to a regular file before reading. ENOENT is a safe
  // "unavailable"; a non-regular file is "invalid"; anything else is unexpected.
  let isRegularFile: boolean;
  try {
    isRegularFile = (await stat(filePath)).isFile();
  } catch (error) {
    if (isMissingPathError(error)) return { status: "export_package_file_unavailable" };
    throw error;
  }
  if (!isRegularFile) return { status: "export_package_file_invalid" };

  let bytes: Uint8Array;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    if (isMissingPathError(error)) return { status: "export_package_file_unavailable" };
    throw error;
  }

  return {
    status: "ok",
    bytes,
    mimeType: XLSX_MIME,
    filename: buildDownloadFilename(filenameLabel, project, artifact),
    contentLength: bytes.byteLength,
    artifact: toArtifactSummary(artifact),
  };
}

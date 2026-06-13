/**
 * RFP BoQ export-package DOWNLOAD service: the RFP lane wrapper over the shared Project BoQ
 * export-package DOWNLOAD core. It loads ONE already-APPROVED RFP `export_package` artifact
 * and serves the exact workbook file it references. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 15 Artifact Types;
 * section 16 Approval Model). Canonical shapes: src/types/project.ts.
 *
 * RFP `export_package` artifacts are produced by the SAME deterministic export-creation
 * path as Quick BoM, so they download through this identical serve path. All deterministic
 * work - project verification (not_found / wrong_mode), the exact tenant/project/artifact
 * load, the approved-export_package gating, the stored-filePath authority and
 * .xlsx/regular-file checks, the read-only byte read, the ENOENT-to-safe status mapping,
 * the authority boundary, and the lean serializable summaries - lives in
 * project-boq-export-download-core. This wrapper only pins the lane's `expectedMode` to
 * "rfp" and the RFP filename label ("RFP-BoQ", yielding the
 * `BOMATIC-RFP-BoQ-<label>-v<version>.xlsx` shape), and exports RFP-specific type aliases
 * over the shared shapes so callers keep a stable surface. A non-rfp (e.g. quick_bom)
 * project therefore returns the same lean `wrong_mode` summary and serves nothing. It
 * imports the shared core only and adds no stores, filesystem access, pricing math,
 * fixture/catalog reader, runner, AI/LLM, catalog, engine, coordinator, adapter, or package
 * dependency of its own, and adds no pricing or download authority.
 */
import {
  loadProjectBoqExportDownloadCore,
  type ProjectBoqExportDownloadRequest,
  type ProjectBoqExportDownloadProjectSummary,
  type ProjectBoqExportDownloadArtifactSummary,
  type LoadProjectBoqExportDownloadResult,
} from "@/lib/projects/project-boq-export-download-core";

/** Lane-pinned filename middle segment; RFP-specific. */
const RFP_BOQ_DOWNLOAD_FILENAME_LABEL = "RFP-BoQ";

/** Input for {@link loadProjectRfpBoqExportDownload}; every field is server-derived. */
export type LoadProjectRfpBoqExportDownloadInput = ProjectBoqExportDownloadRequest;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type RfpBoqExportDownloadProjectSummary = ProjectBoqExportDownloadProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload/filePath. */
export type RfpBoqExportDownloadArtifactSummary = ProjectBoqExportDownloadArtifactSummary;

/** Discriminated result of {@link loadProjectRfpBoqExportDownload}. */
export type LoadProjectRfpBoqExportDownloadResult = LoadProjectBoqExportDownloadResult;

/**
 * Load one already-approved RFP `export_package` artifact and serve the exact workbook
 * bytes it references by delegating to the shared download core with the RFP `expectedMode`
 * and the "RFP-BoQ" filename label. Behavior, status order, authority boundary,
 * stored-filePath authority, filesystem checks, error mapping, and immutability are exactly
 * the core's; only non-rfp projects diverge, returning the lean `wrong_mode` summary
 * without serving anything.
 */
export async function loadProjectRfpBoqExportDownload(
  input: LoadProjectRfpBoqExportDownloadInput
): Promise<LoadProjectRfpBoqExportDownloadResult> {
  return loadProjectBoqExportDownloadCore({
    tenantId: input.tenantId,
    projectId: input.projectId,
    artifactId: input.artifactId,
    expectedMode: "rfp",
    filenameLabel: RFP_BOQ_DOWNLOAD_FILENAME_LABEL,
  });
}

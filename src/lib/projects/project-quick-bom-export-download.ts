/**
 * Quick BoM export-package DOWNLOAD service: the Quick BoM lane wrapper over the shared
 * Project BoQ export-package DOWNLOAD core. It loads ONE already-APPROVED Quick BoM
 * `export_package` artifact and serves the exact workbook file it references. Source of
 * truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 15 Artifact
 * Types; section 16 Approval Model). Canonical shapes: src/types/project.ts.
 *
 * All deterministic work - project verification (not_found / wrong_mode), the exact
 * tenant/project/artifact load, the approved-export_package gating, the stored-filePath
 * authority and .xlsx/regular-file checks, the read-only byte read, the ENOENT-to-safe
 * status mapping, the authority boundary, and the lean serializable summaries - lives in
 * project-boq-export-download-core. This wrapper only pins the lane's `expectedMode` to
 * "quick_bom" and the lane's filename label ("Quick-BoM", preserving the existing
 * `BOMATIC-Quick-BoM-<label>-v<version>.xlsx` shape), and re-exports the legacy
 * LoadProjectQuickBomExportDownload* / QuickBomExportDownload* public names (as aliases
 * over the shared shapes) so the Quick BoM export download route keeps a stable surface. A
 * non-quick_bom project therefore returns the same lean `wrong_mode` summary and serves
 * nothing. It imports the shared core only and adds no stores, filesystem access, pricing
 * math, fixture/catalog reader, runner, AI/LLM, catalog, engine, coordinator, adapter, or
 * package dependency of its own, and adds no pricing or download authority.
 */
import {
  loadProjectBoqExportDownloadCore,
  type ProjectBoqExportDownloadRequest,
  type ProjectBoqExportDownloadProjectSummary,
  type ProjectBoqExportDownloadArtifactSummary,
  type LoadProjectBoqExportDownloadResult,
} from "@/lib/projects/project-boq-export-download-core";

/** Lane-pinned filename middle segment; preserves the existing Quick download shape. */
const QUICK_BOM_DOWNLOAD_FILENAME_LABEL = "Quick-BoM";

/** Input for {@link loadProjectQuickBomExportDownload}; every field is server-derived. */
export type LoadProjectQuickBomExportDownloadInput = ProjectBoqExportDownloadRequest;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type QuickBomExportDownloadProjectSummary = ProjectBoqExportDownloadProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload/filePath. */
export type QuickBomExportDownloadArtifactSummary = ProjectBoqExportDownloadArtifactSummary;

/** Discriminated result of {@link loadProjectQuickBomExportDownload}. */
export type LoadProjectQuickBomExportDownloadResult = LoadProjectBoqExportDownloadResult;

/**
 * Load one already-approved Quick BoM `export_package` artifact and serve the exact
 * workbook bytes it references by delegating to the shared download core with the Quick
 * BoM `expectedMode` and the existing "Quick-BoM" filename label. Behavior, status order,
 * authority boundary, stored-filePath authority, filesystem checks, error mapping, and
 * immutability are exactly the core's; only non-quick_bom projects diverge, returning the
 * lean `wrong_mode` summary without serving anything.
 */
export async function loadProjectQuickBomExportDownload(
  input: LoadProjectQuickBomExportDownloadInput
): Promise<LoadProjectQuickBomExportDownloadResult> {
  return loadProjectBoqExportDownloadCore({
    tenantId: input.tenantId,
    projectId: input.projectId,
    artifactId: input.artifactId,
    expectedMode: "quick_bom",
    filenameLabel: QUICK_BOM_DOWNLOAD_FILENAME_LABEL,
  });
}

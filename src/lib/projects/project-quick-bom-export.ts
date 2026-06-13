/**
 * Quick BoM export service: the Quick BoM lane wrapper over the shared Project BoQ
 * export-package CREATION core. It creates ONE Mantle `export_package` artifact (status
 * `needs_review`) from ONE already-APPROVED Quick BoM `priced_boq` artifact. Source of
 * truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 10 Priced
 * Output Contract; section 19 task 8k). Canonical shapes: src/types/project.ts.
 *
 * All deterministic work - project verification, the server-side workbook path
 * generation, the committed Honeywell demo category/row-order fixture delegation, the
 * {@link createMantleExportArtifact} delegation, the known-error translation, the
 * best-effort cleanup, the authority boundary, and the lean serializable summaries -
 * lives in project-boq-export-core. This wrapper only pins the lane's `expectedMode` to
 * "quick_bom" and the lane's generated workbook filename prefix
 * ("bomatic-quick-bom-export"), and re-exports the legacy QuickBomExport* /
 * CreateProjectQuickBomExportPackage* public names (as aliases over the shared shapes) so
 * the Quick BoM export route keeps a stable surface. A non-quick_bom project therefore
 * returns the same lean `wrong_mode` summary and exports nothing. It imports the shared
 * core only and adds no stores, pricing math, fixture/catalog reader, export helper,
 * runner, AI/LLM, catalog, engine, coordinator, adapter, or package dependency of its
 * own, and adds no pricing or export authority.
 */
import {
  createProjectBoqExportPackageCore,
  type ProjectBoqExportType,
  type ProjectBoqExportTotals,
  type ProjectBoqExportPackageRequest,
  type ProjectBoqExportProjectSummary,
  type ProjectBoqExportArtifactSummary,
  type ProjectBoqExportCategorySourceSummary,
  type ProjectBoqExportPayloadSummary,
  type ProjectBoqExportSummary,
  type CreateProjectBoqExportPackageResult,
} from "@/lib/projects/project-boq-export-core";

/** Lane-pinned generated workbook filename prefix; preserves the existing Quick prefix. */
const QUICK_BOM_EXPORT_FILE_NAME_PREFIX = "bomatic-quick-bom-export";

/** The export type discriminator echoed onto the lean payload summary. */
export type QuickBomExportType = ProjectBoqExportType;

/** The Mantle total-bucket roll-up echoed onto the summaries (no per-line detail). */
export type QuickBomExportTotals = ProjectBoqExportTotals;

/** Input for {@link createProjectQuickBomExportPackage}. */
export type CreateProjectQuickBomExportPackageInput = ProjectBoqExportPackageRequest;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type QuickBomExportProjectSummary = ProjectBoqExportProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type QuickBomExportArtifactSummary = ProjectBoqExportArtifactSummary;

/** The category-source boundary block carried on the payload summary. */
export type QuickBomExportCategorySourceSummary = ProjectBoqExportCategorySourceSummary;

/** Serializable export-payload summary; no priced lines, amounts, or category map. */
export type QuickBomExportPayloadSummary = ProjectBoqExportPayloadSummary;

/** Lean export roll-up: row count, totals, warnings, and the generated workbook path. */
export type QuickBomExportSummary = ProjectBoqExportSummary;

/** Discriminated result of {@link createProjectQuickBomExportPackage}. */
export type CreateProjectQuickBomExportPackageResult = CreateProjectBoqExportPackageResult;

/**
 * Create a Mantle `export_package` artifact from one already-approved Quick BoM
 * `priced_boq` artifact by delegating to the shared export-package core with the Quick
 * BoM `expectedMode` and the existing "bomatic-quick-bom-export" filename prefix.
 * Behavior, status order, authority boundary, server-side path generation, error
 * translation, best-effort cleanup, and immutability are exactly the core's; only
 * non-quick_bom projects diverge, returning the lean `wrong_mode` summary without
 * exporting.
 */
export async function createProjectQuickBomExportPackage(
  input: CreateProjectQuickBomExportPackageInput
): Promise<CreateProjectQuickBomExportPackageResult> {
  return createProjectBoqExportPackageCore({
    tenantId: input.tenantId,
    projectId: input.projectId,
    pricedBoqArtifactId: input.pricedBoqArtifactId,
    expectedMode: "quick_bom",
    fileNamePrefix: QUICK_BOM_EXPORT_FILE_NAME_PREFIX,
  });
}

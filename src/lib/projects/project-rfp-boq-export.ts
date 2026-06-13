/**
 * RFP BoQ export service: the RFP lane wrapper over the shared Project BoQ export-package
 * CREATION core. It creates ONE Mantle `export_package` artifact (status `needs_review`)
 * from ONE already-APPROVED RFP `priced_boq` artifact. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 10 Priced Output
 * Contract; section 19 task 8k). Canonical shapes: src/types/project.ts.
 *
 * RFP priced_boq artifacts are created by the SAME deterministic pricing core as Quick
 * BoM, so they export through this identical creation path. All deterministic work -
 * project verification, the server-side workbook path generation, the committed Honeywell
 * demo category/row-order fixture delegation, the {@link createMantleExportArtifact}
 * delegation, the known-error translation, the best-effort cleanup, the authority
 * boundary, and the lean serializable summaries - lives in project-boq-export-core. This
 * wrapper only pins the lane's `expectedMode` to "rfp" and the RFP generated workbook
 * filename prefix ("bomatic-rfp-boq-export"), and exports RFP-specific type aliases over
 * the shared shapes so callers keep a stable surface. A non-rfp (e.g. quick_bom) project
 * therefore returns the same lean `wrong_mode` summary and exports nothing. It imports the
 * shared core only and adds no stores, pricing math, fixture/catalog reader, export
 * helper, runner, AI/LLM, catalog, engine, coordinator, adapter, or package dependency,
 * and adds no pricing or export authority of its own.
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

/** Lane-pinned generated workbook filename prefix; RFP-specific. */
const RFP_BOQ_EXPORT_FILE_NAME_PREFIX = "bomatic-rfp-boq-export";

/** The export type discriminator echoed onto the lean payload summary. */
export type RfpBoqExportType = ProjectBoqExportType;

/** The Mantle total-bucket roll-up echoed onto the summaries (no per-line detail). */
export type RfpBoqExportTotals = ProjectBoqExportTotals;

/** Input for {@link createProjectRfpBoqExportPackage}. */
export type CreateProjectRfpBoqExportPackageInput = ProjectBoqExportPackageRequest;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type RfpBoqExportProjectSummary = ProjectBoqExportProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type RfpBoqExportArtifactSummary = ProjectBoqExportArtifactSummary;

/** The category-source boundary block carried on the payload summary. */
export type RfpBoqExportCategorySourceSummary = ProjectBoqExportCategorySourceSummary;

/** Serializable export-payload summary; no priced lines, amounts, or category map. */
export type RfpBoqExportPayloadSummary = ProjectBoqExportPayloadSummary;

/** Lean export roll-up: row count, totals, warnings, and the generated workbook path. */
export type RfpBoqExportSummary = ProjectBoqExportSummary;

/** Discriminated result of {@link createProjectRfpBoqExportPackage}. */
export type CreateProjectRfpBoqExportPackageResult = CreateProjectBoqExportPackageResult;

/**
 * Create a Mantle `export_package` artifact from one already-approved RFP `priced_boq`
 * artifact by delegating to the shared export-package core with the RFP `expectedMode`
 * and the "bomatic-rfp-boq-export" filename prefix. Behavior, status order, authority
 * boundary, server-side path generation, error translation, best-effort cleanup, and
 * immutability are exactly the core's; only non-rfp projects diverge, returning the lean
 * `wrong_mode` summary without exporting.
 */
export async function createProjectRfpBoqExportPackage(
  input: CreateProjectRfpBoqExportPackageInput
): Promise<CreateProjectRfpBoqExportPackageResult> {
  return createProjectBoqExportPackageCore({
    tenantId: input.tenantId,
    projectId: input.projectId,
    pricedBoqArtifactId: input.pricedBoqArtifactId,
    expectedMode: "rfp",
    fileNamePrefix: RFP_BOQ_EXPORT_FILE_NAME_PREFIX,
  });
}

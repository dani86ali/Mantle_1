/**
 * Configured RFP compliance-matrix drafting executor factory (Stage 4).
 *
 * No live provider adapter is approved for compliance-matrix drafting yet. This
 * factory is the future wiring seam, but today it returns null unconditionally so
 * routes can expose a controlled 503 without loading approved evidence bodies or
 * creating a compliance_matrix artifact. It imports only the provider-neutral
 * executor type and constructs no AI/client/SDK.
 */
import type {
  RfpComplianceMatrixDraftingExecutor,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting";

export function getConfiguredRfpComplianceMatrixDraftingExecutor(): RfpComplianceMatrixDraftingExecutor | null {
  return null;
}

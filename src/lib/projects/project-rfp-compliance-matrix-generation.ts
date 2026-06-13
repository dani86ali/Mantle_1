/**
 * RFP compliance-matrix generation orchestration (Stage 4, provider-neutral).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Composes exactly two already-reviewed services: compliance row drafting
 * (provider-neutral, injected executor, no persistence) and compliance-matrix
 * draft creation (re-gates approved upstream artifacts and persists one
 * needs_review compliance_matrix artifact). This module adds no DB calls,
 * parsing, AI/provider wiring, pricing, SKU, catalog, configuration decision,
 * approval, export, or UI. Drafted rows are candidate material only; the
 * persisted compliance_matrix still has no runtime authority until a human
 * approves it at compliance_matrix_review.
 */
import {
  draftRfpComplianceMatrixRows,
  type DraftRfpComplianceMatrixRowsInput,
  type DraftRfpComplianceMatrixRowsResult,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting";
import {
  createRfpComplianceMatrixDraft,
  type CreateRfpComplianceMatrixDraftResult,
  type RfpComplianceMatrixDraftArtifactSummary,
} from "@/lib/projects/project-rfp-compliance-matrix-draft";
import type {
  RfpComplianceMatrixPayloadSummary,
} from "@/lib/projects/project-rfp-compliance-matrix";

export type GenerateRfpComplianceMatrixDraftInput =
  DraftRfpComplianceMatrixRowsInput;

export type RfpComplianceMatrixGenerationDraftingBlockedResult = Exclude<
  DraftRfpComplianceMatrixRowsResult,
  { status: "ok" }
>;

export type RfpComplianceMatrixGenerationCreationBlockedResult = Exclude<
  CreateRfpComplianceMatrixDraftResult,
  { status: "ok" }
>;

export type GenerateRfpComplianceMatrixDraftResult =
  | {
      status: "blocked";
      phase: "compliance_drafting";
      drafting: RfpComplianceMatrixGenerationDraftingBlockedResult;
    }
  | {
      status: "blocked";
      phase: "compliance_matrix_creation";
      creation: RfpComplianceMatrixGenerationCreationBlockedResult;
    }
  | {
      status: "ok";
      requirementsBaselineArtifactId: string;
      evidencePackageArtifactId: string;
      configurationExpansionArtifactId?: string;
      rowCount: number;
      requirementCount: number;
      evidenceCount: number;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
      artifact: RfpComplianceMatrixDraftArtifactSummary;
      payloadSummary: RfpComplianceMatrixPayloadSummary;
    };

function copyArtifactSummary(
  summary: RfpComplianceMatrixDraftArtifactSummary
): RfpComplianceMatrixDraftArtifactSummary {
  return {
    id: summary.id,
    projectId: summary.projectId,
    stageId: summary.stageId,
    type: summary.type,
    status: summary.status,
    version: summary.version,
    sourceFileIds: summary.sourceFileIds.slice(),
    sourceArtifactIds: summary.sourceArtifactIds.slice(),
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

function copyPayloadSummary(
  summary: RfpComplianceMatrixPayloadSummary
): RfpComplianceMatrixPayloadSummary {
  return {
    payloadKind: summary.payloadKind,
    sourceRequirementsBaselineArtifactId:
      summary.sourceRequirementsBaselineArtifactId,
    sourceEvidencePackageArtifactId: summary.sourceEvidencePackageArtifactId,
    ...(summary.sourceConfigurationExpansionArtifactId !== undefined
      ? {
          sourceConfigurationExpansionArtifactId:
            summary.sourceConfigurationExpansionArtifactId,
        }
      : {}),
    createdBy: summary.createdBy,
    createdAt: summary.createdAt,
    rowCount: summary.rowCount,
    rowIds: summary.rowIds.slice(),
    requirementIds: summary.requirementIds.slice(),
    sourceFileIds: summary.sourceFileIds.slice(),
    sourceArtifactIds: summary.sourceArtifactIds.slice(),
    statusCounts: { ...summary.statusCounts },
  };
}

export async function generateRfpComplianceMatrixDraft(
  input: GenerateRfpComplianceMatrixDraftInput
): Promise<GenerateRfpComplianceMatrixDraftResult> {
  const drafting = await draftRfpComplianceMatrixRows({
    tenantId: input.tenantId,
    projectId: input.projectId,
    requirementsBaselineArtifactId: input.requirementsBaselineArtifactId,
    evidencePackageArtifactId: input.evidencePackageArtifactId,
    ...(input.configurationExpansionArtifactId !== undefined
      ? { configurationExpansionArtifactId: input.configurationExpansionArtifactId }
      : {}),
    requestedBy: input.requestedBy,
    executor: input.executor,
  });
  if (drafting.status !== "ok") {
    return { status: "blocked", phase: "compliance_drafting", drafting };
  }

  const creation = await createRfpComplianceMatrixDraft({
    tenantId: input.tenantId,
    projectId: input.projectId,
    createdBy: input.requestedBy.trim(),
    sourceRequirementsBaselineArtifactId:
      drafting.requirementsBaselineArtifactId,
    sourceEvidencePackageArtifactId: drafting.evidencePackageArtifactId,
    ...(drafting.configurationExpansionArtifactId !== undefined
      ? {
          sourceConfigurationExpansionArtifactId:
            drafting.configurationExpansionArtifactId,
        }
      : {}),
    rows: drafting.rows,
  });
  if (creation.status !== "ok") {
    return {
      status: "blocked",
      phase: "compliance_matrix_creation",
      creation,
    };
  }

  return {
    status: "ok",
    requirementsBaselineArtifactId: drafting.requirementsBaselineArtifactId,
    evidencePackageArtifactId: drafting.evidencePackageArtifactId,
    ...(drafting.configurationExpansionArtifactId !== undefined
      ? { configurationExpansionArtifactId: drafting.configurationExpansionArtifactId }
      : {}),
    rowCount: drafting.rowCount,
    requirementCount: drafting.requirementCount,
    evidenceCount: drafting.evidenceCount,
    sourceFileIds: drafting.sourceFileIds.slice(),
    sourceArtifactIds: drafting.sourceArtifactIds.slice(),
    artifact: copyArtifactSummary(creation.artifact),
    payloadSummary: copyPayloadSummary(creation.payloadSummary),
  };
}

/**
 * RFP requirements-baseline generation orchestration (Milestone 2,
 * provider-neutral).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Turns selected persisted RFP extraction evidence ids into ONE reviewable
 * requirements_baseline draft by composing, in order, exactly two
 * already-reviewed services: the candidate-drafting contract
 * (src/lib/projects/project-rfp-requirements-candidate-drafting.ts), which
 * loads the evidence, gates approved input_package provenance, invokes the
 * INJECTED executor, and sanitizes whatever it returns; then the baseline
 * draft service (src/lib/projects/project-rfp-requirements-baseline.ts),
 * which re-gates the cited evidence and persists the single needs_review
 * artifact version. This module adds NO gate, validation, sanitization, or
 * persistence of its own: it never reads a file, raw evidence body, table
 * row, or storage path, never touches a store, route, or UI, and never
 * imports an AI, LLM, provider, agent, coordinator, catalog, pricing, SKU,
 * configuration, export, or Quick BoM module. The only evidence-body
 * exposure stays inside the drafting service's executor boundary, and the
 * generated draft carries no runtime authority until a human approves it at
 * requirements_baseline_review.
 *
 * Candidate drafting runs first with the caller's exact
 * tenant/project/evidence/requestedBy/executor; any non-ok drafting outcome
 * is returned as status blocked with phase candidate_drafting wrapping the
 * lean drafting result, and the baseline service is never called. On
 * drafting success the baseline service receives the same tenant/project,
 * createdBy = the trimmed requestedBy (the drafting gates already proved it
 * a nonblank string), and exactly the sanitized candidates the drafting
 * service returned; any non-ok create outcome is returned as status blocked
 * with phase baseline_creation wrapping the lean create result. The ok
 * result is lean and serializable: the drafting counts and unique
 * source-file / package ids plus the created artifact and payload
 * summaries, every array freshly copied so mutating the result never
 * reaches either composed service's return value. Inputs are never mutated;
 * thrown service errors (programmer-error validation, store failures)
 * bubble to the caller unhidden.
 */
import {
  draftRfpRequirementCandidatesFromEvidence,
  draftRfpRequirementCandidatesFromEvidencePackage,
  type DraftRfpRequirementCandidatesFromEvidenceInput,
  type DraftRfpRequirementCandidatesFromEvidenceResult,
  type DraftRfpRequirementCandidatesFromEvidencePackageInput,
  type DraftRfpRequirementCandidatesFromEvidencePackageResult,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting";
import {
  createRfpRequirementsBaselineDraft,
  type CreateRfpRequirementsBaselineDraftResult,
  type RfpRequirementsBaselineArtifactSummary,
  type RfpRequirementsBaselinePayloadSummary,
} from "@/lib/projects/project-rfp-requirements-baseline";

/**
 * Input for {@link generateRfpRequirementsBaselineDraftFromEvidence}: exactly
 * the drafting contract's input (tenantId, projectId, evidenceIds,
 * requestedBy, executor), aliased so the two stay in lockstep. The executor
 * is the INJECTED drafting dependency; this module never constructs or names
 * a real implementation.
 */
export type GenerateRfpRequirementsBaselineDraftFromEvidenceInput =
  DraftRfpRequirementCandidatesFromEvidenceInput;

/**
 * Input for {@link generateRfpRequirementsBaselineDraftFromEvidencePackage}:
 * exactly the package-based drafting contract's input (tenantId, projectId,
 * evidencePackageArtifactId, requestedBy, executor), aliased so the two stay
 * in lockstep. No raw ProjectEvidence ids are accepted on this path.
 */
export type GenerateRfpRequirementsBaselineDraftFromEvidencePackageInput =
  DraftRfpRequirementCandidatesFromEvidencePackageInput;

/** Every candidate-drafting outcome that blocks baseline creation. */
export type RfpBaselineGenerationDraftingBlockedResult = Exclude<
  DraftRfpRequirementCandidatesFromEvidenceResult,
  { status: "ok" }
>;

/** Every package-based candidate-drafting outcome that blocks creation. */
export type RfpBaselineGenerationPackageDraftingBlockedResult = Exclude<
  DraftRfpRequirementCandidatesFromEvidencePackageResult,
  { status: "ok" }
>;

/** Every baseline-create outcome that blocks the generated draft. */
export type RfpBaselineGenerationCreationBlockedResult = Exclude<
  CreateRfpRequirementsBaselineDraftResult,
  { status: "ok" }
>;

/**
 * Discriminated result of
 * {@link generateRfpRequirementsBaselineDraftFromEvidence}. A blocked result
 * names the phase that stopped the chain and wraps that service's own lean
 * result untouched; the ok result carries identifier/count fields and the
 * created summaries only - never candidates, never a project summary, never
 * a tenantId.
 */
export type GenerateRfpRequirementsBaselineDraftFromEvidenceResult =
  | {
      status: "blocked";
      phase: "candidate_drafting";
      drafting: RfpBaselineGenerationDraftingBlockedResult;
    }
  | {
      status: "blocked";
      phase: "baseline_creation";
      creation: RfpBaselineGenerationCreationBlockedResult;
    }
  | {
      status: "ok";
      candidateCount: number;
      /** Count of unique loaded evidence rows handed to the executor. */
      evidenceCount: number;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
      artifact: RfpRequirementsBaselineArtifactSummary;
      payloadSummary: RfpRequirementsBaselinePayloadSummary;
    };

/**
 * Discriminated result of
 * {@link generateRfpRequirementsBaselineDraftFromEvidencePackage}. Identical
 * in shape to the raw-evidence result except the candidate_drafting block
 * wraps the package-based drafting statuses and the ok result also carries
 * the approved evidence_package id this draft was generated from.
 */
export type GenerateRfpRequirementsBaselineDraftFromEvidencePackageResult =
  | {
      status: "blocked";
      phase: "candidate_drafting";
      drafting: RfpBaselineGenerationPackageDraftingBlockedResult;
    }
  | {
      status: "blocked";
      phase: "baseline_creation";
      creation: RfpBaselineGenerationCreationBlockedResult;
    }
  | {
      status: "ok";
      candidateCount: number;
      /** Count of sanitized evidence entries read from the package payload. */
      evidenceCount: number;
      /** The approved evidence_package this draft was generated from. */
      evidencePackageArtifactId: string;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
      artifact: RfpRequirementsBaselineArtifactSummary;
      payloadSummary: RfpRequirementsBaselinePayloadSummary;
    };

/** Fresh copy of the created artifact summary; arrays are never aliased. */
function copyArtifactSummary(
  summary: RfpRequirementsBaselineArtifactSummary
): RfpRequirementsBaselineArtifactSummary {
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

/** Fresh copy of the created payload summary; arrays are never aliased. */
function copyPayloadSummary(
  summary: RfpRequirementsBaselinePayloadSummary
): RfpRequirementsBaselinePayloadSummary {
  return {
    payloadKind: summary.payloadKind,
    createdBy: summary.createdBy,
    createdAt: summary.createdAt,
    requirementCount: summary.requirementCount,
    evidenceCount: summary.evidenceCount,
    sourceFileIds: summary.sourceFileIds.slice(),
    sourceArtifactIds: summary.sourceArtifactIds.slice(),
    requirementIds: summary.requirementIds.slice(),
  };
}

/**
 * Generate ONE reviewable requirements_baseline draft from selected persisted
 * RFP extraction evidence ids by running candidate drafting first and, only
 * when it succeeds, the baseline draft service. Adds no gate or validation of
 * its own: the drafting service owns input validation, evidence loading,
 * provenance gating, executor invocation, and candidate sanitization; the
 * baseline service re-gates the citations and owns persistence. A non-ok
 * outcome from either service is wrapped as status blocked naming that phase,
 * and a drafting block never reaches the baseline service. On success the
 * result carries the drafting counts and source ids plus the created artifact
 * and payload summaries, all arrays freshly copied. Inputs are never mutated;
 * thrown service errors bubble unhidden.
 */
export async function generateRfpRequirementsBaselineDraftFromEvidence(
  input: GenerateRfpRequirementsBaselineDraftFromEvidenceInput
): Promise<GenerateRfpRequirementsBaselineDraftFromEvidenceResult> {
  const drafting = await draftRfpRequirementCandidatesFromEvidence({
    tenantId: input.tenantId,
    projectId: input.projectId,
    evidenceIds: input.evidenceIds,
    requestedBy: input.requestedBy,
    executor: input.executor,
  });
  if (drafting.status !== "ok") {
    return { status: "blocked", phase: "candidate_drafting", drafting };
  }

  // The drafting gates have already proved requestedBy a nonblank string;
  // its trim is exactly the requestedBy the executor received.
  const creation = await createRfpRequirementsBaselineDraft({
    tenantId: input.tenantId,
    projectId: input.projectId,
    createdBy: input.requestedBy.trim(),
    candidates: drafting.candidates,
  });
  if (creation.status !== "ok") {
    return { status: "blocked", phase: "baseline_creation", creation };
  }

  return {
    status: "ok",
    candidateCount: drafting.candidateCount,
    evidenceCount: drafting.evidenceCount,
    sourceFileIds: drafting.sourceFileIds.slice(),
    sourceArtifactIds: drafting.sourceArtifactIds.slice(),
    artifact: copyArtifactSummary(creation.artifact),
    payloadSummary: copyPayloadSummary(creation.payloadSummary),
  };
}

/**
 * Generate ONE reviewable requirements_baseline draft from an approved final
 * evidence_package artifact by running package-based candidate drafting first
 * and, only when it succeeds, the baseline draft service. This is the
 * package-authority path: its input has no raw ProjectEvidence id list, and
 * candidate drafting reads evidence bodies only from the approved
 * evidence_package payload. This orchestrator still adds no stores, parsing,
 * validation, sanitization, or persistence of its own; it composes the two
 * services and returns copied summaries.
 */
export async function generateRfpRequirementsBaselineDraftFromEvidencePackage(
  input: GenerateRfpRequirementsBaselineDraftFromEvidencePackageInput
): Promise<GenerateRfpRequirementsBaselineDraftFromEvidencePackageResult> {
  const drafting = await draftRfpRequirementCandidatesFromEvidencePackage({
    tenantId: input.tenantId,
    projectId: input.projectId,
    evidencePackageArtifactId: input.evidencePackageArtifactId,
    requestedBy: input.requestedBy,
    executor: input.executor,
  });
  if (drafting.status !== "ok") {
    return { status: "blocked", phase: "candidate_drafting", drafting };
  }

  const creation = await createRfpRequirementsBaselineDraft({
    tenantId: input.tenantId,
    projectId: input.projectId,
    createdBy: input.requestedBy.trim(),
    candidates: drafting.candidates,
  });
  if (creation.status !== "ok") {
    return { status: "blocked", phase: "baseline_creation", creation };
  }

  return {
    status: "ok",
    candidateCount: drafting.candidateCount,
    evidenceCount: drafting.evidenceCount,
    evidencePackageArtifactId: drafting.evidencePackageArtifactId,
    sourceFileIds: drafting.sourceFileIds.slice(),
    sourceArtifactIds: drafting.sourceArtifactIds.slice(),
    artifact: copyArtifactSummary(creation.artifact),
    payloadSummary: copyPayloadSummary(creation.payloadSummary),
  };
}

/**
 * RFP extraction-delta generation orchestration (Stage 1A, provider-neutral).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Turns ONE approved input_package version into ONE reviewable
 * extraction_delta draft by composing, in order, exactly two already-reviewed
 * services: the extraction-delta candidate-drafting contract
 * (src/lib/projects/project-rfp-extraction-delta-candidate-drafting.ts), which
 * gates approved input_package provenance, prepares the persisted non-BoQ RFP
 * extraction evidence, invokes the INJECTED executor, and sanitizes whatever
 * it returns; then the extraction-delta draft service
 * (src/lib/projects/project-rfp-extraction-delta.ts), which re-gates the cited
 * evidence and persists the single needs_review extraction_delta version. This
 * module adds NO gate, validation, sanitization, or persistence of its own: it
 * never reads a file, raw evidence body, table row, or storage path, never
 * touches a store, route, or UI, and never imports an AI, LLM, provider,
 * factory, adapter, agent, coordinator, engine, catalog, pricing, SKU,
 * configuration, export, or Quick BoM module. It never calls the executor
 * itself - it only forwards the injected executor into the drafting contract -
 * and the generated draft carries no runtime authority: reviewing or applying
 * a delta and approving the final evidence_package are separate, later steps.
 *
 * Candidate drafting runs first with the caller's exact
 * tenant/project/inputPackageArtifactId/requestedBy/executor; any non-ok
 * drafting outcome is returned as status blocked with phase candidate_drafting
 * wrapping the lean drafting result, and the draft service is never called. On
 * drafting success the draft service receives the same
 * tenant/project/inputPackageArtifactId, createdBy = the trimmed requestedBy
 * (the drafting gates already proved it a nonblank string), proposalSource
 * "ai", and exactly the sanitized candidates the drafting service returned;
 * any non-ok create outcome is returned as status blocked with phase
 * delta_creation wrapping the lean create result. The ok result is lean and
 * serializable: the drafting candidate/evidence counts and unique source-file /
 * package ids plus the created artifact and payload summaries, every array
 * freshly copied so mutating the result never reaches either composed
 * service's return value. Inputs are never mutated; thrown service errors
 * (programmer-error validation, store failures) bubble to the caller unhidden.
 */
import {
  draftRfpExtractionDeltaCandidates,
  type DraftRfpExtractionDeltaCandidatesInput,
  type DraftRfpExtractionDeltaCandidatesResult,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting";
import {
  createRfpExtractionDeltaDraft,
  type CreateRfpExtractionDeltaDraftResult,
  type RfpExtractionDeltaArtifactSummary,
  type RfpExtractionDeltaPayloadSummary,
} from "@/lib/projects/project-rfp-extraction-delta";

/**
 * Input for {@link generateRfpExtractionDeltaDraft}: exactly the drafting
 * contract's input (tenantId, projectId, inputPackageArtifactId, requestedBy,
 * executor), aliased so the two stay in lockstep. The executor is the INJECTED
 * drafting dependency; this module never constructs or names a real
 * implementation and never invokes it.
 */
export type GenerateRfpExtractionDeltaDraftInput =
  DraftRfpExtractionDeltaCandidatesInput;

/** Every candidate-drafting outcome that blocks delta creation. */
export type RfpExtractionDeltaGenerationDraftingBlockedResult = Exclude<
  DraftRfpExtractionDeltaCandidatesResult,
  { status: "ok" }
>;

/** Every delta-create outcome that blocks the generated draft. */
export type RfpExtractionDeltaGenerationCreationBlockedResult = Exclude<
  CreateRfpExtractionDeltaDraftResult,
  { status: "ok" }
>;

/**
 * Discriminated result of {@link generateRfpExtractionDeltaDraft}. A blocked
 * result names the phase that stopped the chain and wraps that service's own
 * lean result untouched; the ok result carries identifier/count fields and the
 * created summaries only - never candidates, never a project summary, never a
 * tenantId, never a proposed evidence body.
 */
export type GenerateRfpExtractionDeltaDraftResult =
  | {
      status: "blocked";
      phase: "candidate_drafting";
      drafting: RfpExtractionDeltaGenerationDraftingBlockedResult;
    }
  | {
      status: "blocked";
      phase: "delta_creation";
      creation: RfpExtractionDeltaGenerationCreationBlockedResult;
    }
  | {
      status: "ok";
      candidateCount: number;
      /** Count of non-BoQ evidence rows handed to the executor. */
      evidenceCount: number;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
      artifact: RfpExtractionDeltaArtifactSummary;
      payloadSummary: RfpExtractionDeltaPayloadSummary;
    };

/** Fresh copy of the created artifact summary; arrays are never aliased. */
function copyArtifactSummary(
  summary: RfpExtractionDeltaArtifactSummary
): RfpExtractionDeltaArtifactSummary {
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
  summary: RfpExtractionDeltaPayloadSummary
): RfpExtractionDeltaPayloadSummary {
  return {
    payloadKind: summary.payloadKind,
    createdBy: summary.createdBy,
    createdAt: summary.createdAt,
    proposalSource: summary.proposalSource,
    inputPackageArtifactId: summary.inputPackageArtifactId,
    candidateCount: summary.candidateCount,
    evidenceReferenceCount: summary.evidenceReferenceCount,
    sourceFileIds: summary.sourceFileIds.slice(),
    sourceArtifactIds: summary.sourceArtifactIds.slice(),
  };
}

/**
 * Generate ONE reviewable extraction_delta draft against ONE approved
 * input_package version by running candidate drafting first and, only when it
 * succeeds, the extraction-delta draft service. Adds no gate or validation of
 * its own: the drafting service owns input validation, evidence preparation,
 * provenance gating, executor invocation, and candidate sanitization; the
 * draft service re-gates the citations and owns persistence. A non-ok outcome
 * from either service is wrapped as status blocked naming that phase, and a
 * drafting block never reaches the draft service. On success the result
 * carries the drafting counts and source ids plus the created artifact and
 * payload summaries, all arrays freshly copied. The draft is recorded
 * needs_review and stays a proposal; this module never reviews, applies, or
 * approves anything. Inputs are never mutated; thrown service errors bubble
 * unhidden.
 */
export async function generateRfpExtractionDeltaDraft(
  input: GenerateRfpExtractionDeltaDraftInput
): Promise<GenerateRfpExtractionDeltaDraftResult> {
  const drafting = await draftRfpExtractionDeltaCandidates({
    tenantId: input.tenantId,
    projectId: input.projectId,
    inputPackageArtifactId: input.inputPackageArtifactId,
    requestedBy: input.requestedBy,
    executor: input.executor,
  });
  if (drafting.status !== "ok") {
    return { status: "blocked", phase: "candidate_drafting", drafting };
  }

  // The drafting gates have already proved requestedBy a nonblank string; its
  // trim is exactly the requestedBy the executor received. proposalSource is
  // fixed "ai": this orchestrator exists to record an executor-proposed delta.
  const creation = await createRfpExtractionDeltaDraft({
    tenantId: input.tenantId,
    projectId: input.projectId,
    inputPackageArtifactId: input.inputPackageArtifactId,
    createdBy: input.requestedBy.trim(),
    proposalSource: "ai",
    candidates: drafting.candidates,
  });
  if (creation.status !== "ok") {
    return { status: "blocked", phase: "delta_creation", creation };
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

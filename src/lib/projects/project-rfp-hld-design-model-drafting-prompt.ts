/**
 * Pure, deterministic RFP HLD design-model DRAFTING PROMPT serializer (Stage 6E-A-002).
 *
 * Serializes a deterministic {@link RfpHldDesignModelCandidateInputBundle} into a
 * provider-neutral prompt/input payload ({ system, user }) for a LATER drafting
 * executor. It is pure and contract-only: NO provider/AI/network call, NO DB/file
 * read, NO env access, NO persistence, NO route/UI work. It wires NO provider here.
 *
 * The serialized user payload is a strict WHITELIST of already-approved
 * source-bundle-derived candidate input, including the approved design-knowledge
 * content blocks (curated, engineer-approved guidance, per-field mirrored). It
 * carries NO raw document bodies, extracted evidence, file/storage paths,
 * sourceFileIds, compiledArtifactIds, tenantId, prices, catalog lookups,
 * SKU/config decisions, or smuggled extra fields. It introduces no runtime AI
 * authority: any future drafting is candidate-only, subordinate to deterministic
 * validation and human approval.
 *
 * When (and only when) the bundle carries a rebuild context, an additional
 * explicit, whitelisted `rebuild` section is appended framing ONE bounded
 * correction pass from the SAME approved source bundle with no new authority.
 * The fixed system instruction is unchanged across both paths.
 *
 * Imports EXACTLY the candidate-input contract and the design-model kind - nothing
 * else; the rebuild-context shape is derived from the bundle type, not imported.
 */
import {
  RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";

/**
 * Fixed system instruction for the later provider adapter. Frames every drafting
 * run as candidate-only, source-bound, non-authoritative, strict-JSON, and gated
 * by deterministic validation plus human engineer review.
 */
export const RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT: string = [
  "You draft a CANDIDATE rfp_hld_design_model. Output is candidate-only and",
  "unapproved.",
  "Work ONLY from the supplied deterministic candidate input. Never invent",
  "topology facts, scope, source ids, domains, links, assumptions, constraints,",
  "evidence, or authority.",
  "Never make SKU, pricing, catalog, configuration, validation, topology-fact,",
  "scope, or final design approval decisions.",
  "Treat the approved HLD intake answers as source-bound input only; do not",
  "expand scope, invent facts, or create new authority beyond them.",
  "Never emit final HLD documents, HTML, diagrams, Mermaid, draw.io/XML, SVG/XML,",
  "TP/proposal, or any customer-facing deliverable content.",
  "Never claim Cisco-certified, CVD-certified, BOMATIC-certified, or AI-certified",
  "authority.",
  "Respond with strict JSON only: no markdown, no code fences, no prose wrapper.",
  "The target top-level object must be exactly one rfp_hld_design_model payload.",
  "Deterministic validation and human engineer review remain the hard gates.",
].join("\n");

/** The non-optional rebuild context carried on a redraft bundle. */
type RfpHldDesignModelDraftingRebuildContext = NonNullable<
  RfpHldDesignModelCandidateInputBundle["rebuildContext"]
>;

/** One approved design-knowledge content block carried in the candidate input. */
type RfpHldDesignModelDraftingKnowledgeContent = NonNullable<
  RfpHldDesignModelCandidateInputBundle["designKnowledgePackContents"]
>[number];

/** The sanitized approved HLD intake answers carried in the candidate input. */
type RfpHldDesignModelDraftingIntakeAnswers = NonNullable<
  RfpHldDesignModelCandidateInputBundle["hldIntakeAnswers"]
>;

/** One sanitized approved HLD intake answer. */
type RfpHldDesignModelDraftingIntakeAnswer =
  RfpHldDesignModelDraftingIntakeAnswers["answers"][number];

/**
 * Fixed framing for a bounded rebuild correction pass. Provider-neutral; mirrors
 * and reinforces the redraft limitations carried in the candidate input. Listing
 * the prohibited actions here is instruction text, never emitted content.
 */
export const RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_INSTRUCTION: string = [
  "This run is exactly ONE bounded correction pass on a prior CANDIDATE",
  "rfp_hld_design_model, driven by its advisory review. Redraft ONLY from the",
  "same approved hld_source_bundle-derived candidate input above; add no new",
  "source artifacts, scope, domains, SKU, pricing, catalog, or configuration",
  "decisions, no hardware sizing, and no invented topology facts.",
  "Emit no final HLD document, HTML, diagram, Mermaid, draw.io/XML, SVG,",
  "TP/proposal, export, or certification claim.",
  "Output stays candidate-only, subordinate to deterministic validation and",
  "human engineer approval.",
].join("\n");

/**
 * The whitelisted rebuild section, mirrored field-by-field from the bundle's
 * rebuild context (plus the fixed framing). Any field smuggled onto the context
 * is structurally excluded.
 */
export interface RfpHldDesignModelDraftingRebuildPayload {
  mode: "bounded_correction_pass";
  instruction: string;
  sourceHldSourceBundleArtifactId: RfpHldDesignModelDraftingRebuildContext["sourceHldSourceBundleArtifactId"];
  rebuildRequestArtifactId: RfpHldDesignModelDraftingRebuildContext["rebuildRequestArtifactId"];
  sourceModelArtifactId: RfpHldDesignModelDraftingRebuildContext["sourceModelArtifactId"];
  sourceReviewArtifactId: RfpHldDesignModelDraftingRebuildContext["sourceReviewArtifactId"];
  priorModelSummary: RfpHldDesignModelDraftingRebuildContext["priorModelSummary"];
  reviewRecommendation: RfpHldDesignModelDraftingRebuildContext["reviewRecommendation"];
  reviewFindingSummaries: RfpHldDesignModelDraftingRebuildContext["reviewFindingSummaries"];
  engineerReason: RfpHldDesignModelDraftingRebuildContext["engineerReason"];
  engineerInstructions: RfpHldDesignModelDraftingRebuildContext["engineerInstructions"];
  limitations: RfpHldDesignModelDraftingRebuildContext["limitations"];
}

/**
 * The whitelisted user payload, built with explicit, stable key ordering. Mirrors
 * only fields already present on the candidate-input bundle, plus an optional
 * `rebuild` section when the bundle carries a rebuild context.
 */
export interface RfpHldDesignModelDraftingUserPayload {
  payloadKind: RfpHldDesignModelCandidateInputBundle["payloadKind"];
  targetPayloadKind: typeof RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND;
  createdBy: RfpHldDesignModelCandidateInputBundle["createdBy"];
  createdAt: RfpHldDesignModelCandidateInputBundle["createdAt"];
  sourceHldSourceBundleArtifactId: RfpHldDesignModelCandidateInputBundle["sourceHldSourceBundleArtifactId"];
  sourceHldSourceBundleVersion: RfpHldDesignModelCandidateInputBundle["sourceHldSourceBundleVersion"];
  sourceHldSourceBundlePayloadKind: RfpHldDesignModelCandidateInputBundle["sourceHldSourceBundlePayloadKind"];
  sourceArtifactIds: RfpHldDesignModelCandidateInputBundle["sourceArtifactIds"];
  coveredDomains: RfpHldDesignModelCandidateInputBundle["coveredDomains"];
  excludedDomains: RfpHldDesignModelCandidateInputBundle["excludedDomains"];
  authorities: RfpHldDesignModelCandidateInputBundle["authorities"];
  designKnowledgePackRefs: RfpHldDesignModelCandidateInputBundle["designKnowledgePackRefs"];
  /** Approved DKP content, per-field whitelisted; empty array when none present. */
  designKnowledgePackContents: RfpHldDesignModelDraftingKnowledgeContent[];
  /** Sanitized approved HLD intake answers, per-field whitelisted. */
  hldIntakeAnswers: RfpHldDesignModelDraftingIntakeAnswers;
  assumptions: RfpHldDesignModelCandidateInputBundle["assumptions"];
  constraints: RfpHldDesignModelCandidateInputBundle["constraints"];
  warnings: RfpHldDesignModelCandidateInputBundle["warnings"];
  instructions: RfpHldDesignModelCandidateInputBundle["instructions"];
  /** Present only on a redraft pass; absent for normal initial drafting. */
  rebuild?: RfpHldDesignModelDraftingRebuildPayload;
}

/** Provider-neutral prompt/input payload for a later drafting executor. */
export interface RfpHldDesignModelDraftingRequest {
  system: string;
  user: string;
}

/** Deep, fresh, JSON-safe copy; never aliases the input. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Serialize a deterministic candidate-input bundle into a provider-neutral
 * { system, user } request. The `user` string is JSON.stringify of an explicitly
 * key-ordered whitelist of bundle fields - nothing else; when the bundle carries
 * a rebuild context, an explicit, whitelisted `rebuild` section is appended last.
 * Pure: no provider/AI/network/DB/file/env work; persists nothing. Throws only on
 * programmer misuse (wrong payloadKind on the supplied bundle).
 */
export function buildRfpHldDesignModelDraftingRequest(
  bundle: RfpHldDesignModelCandidateInputBundle
): RfpHldDesignModelDraftingRequest {
  if (
    bundle === null ||
    typeof bundle !== "object" ||
    bundle.payloadKind !== RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND
  ) {
    throw new Error(
      "bundle must be an rfp_hld_design_model_candidate_input bundle."
    );
  }
  const hldIntakeAnswers = bundle.hldIntakeAnswers;
  if (hldIntakeAnswers === undefined || hldIntakeAnswers === null) {
    throw new Error(
      "bundle must include sanitized approved HLD intake answers."
    );
  }

  // Explicit construction = stable key ordering and a hard whitelist. Any field
  // smuggled onto the bundle is structurally excluded.
  const payload: RfpHldDesignModelDraftingUserPayload = {
    payloadKind: bundle.payloadKind,
    targetPayloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: bundle.createdBy,
    createdAt: bundle.createdAt,
    sourceHldSourceBundleArtifactId: bundle.sourceHldSourceBundleArtifactId,
    sourceHldSourceBundleVersion: bundle.sourceHldSourceBundleVersion,
    sourceHldSourceBundlePayloadKind: bundle.sourceHldSourceBundlePayloadKind,
    sourceArtifactIds: cloneJson(bundle.sourceArtifactIds),
    coveredDomains: cloneJson(bundle.coveredDomains),
    excludedDomains: cloneJson(bundle.excludedDomains),
    authorities: cloneJson(bundle.authorities),
    designKnowledgePackRefs: cloneJson(bundle.designKnowledgePackRefs),
    // Explicit per-field mirror (not a wholesale clone): any field smuggled onto a
    // content block is structurally excluded, like the top-level and rebuild keys.
    designKnowledgePackContents: (bundle.designKnowledgePackContents ?? []).map(
      (content): RfpHldDesignModelDraftingKnowledgeContent => ({
        contentKind: content.contentKind,
        artifactId: content.artifactId,
        artifactType: content.artifactType,
        stageId: content.stageId,
        status: content.status,
        version: content.version,
        payloadKind: content.payloadKind,
        domain: content.domain,
        title: content.title,
        source: content.source,
        designPrinciples: content.designPrinciples.slice(),
        topologyGuidance: content.topologyGuidance.slice(),
        constraints: content.constraints.slice(),
        assumptions: content.assumptions.slice(),
        exclusions: content.exclusions.slice(),
        validationNotes: content.validationNotes.slice(),
        entryCount: content.entryCount,
        sectionCounts: { ...content.sectionCounts },
      })
    ),
    // Explicit per-field mirror: any field smuggled onto the answer section or an
    // individual answer is structurally excluded, like the other whitelist keys.
    hldIntakeAnswers: ((intake) => ({
      sourceHldIntakeArtifactId: intake.sourceHldIntakeArtifactId,
      sourceHldIntakeVersion: intake.sourceHldIntakeVersion,
      sourceMode: intake.sourceMode,
      answers: intake.answers.map(
        (answer): RfpHldDesignModelDraftingIntakeAnswer => ({
          fieldId: answer.fieldId,
          label: answer.label,
          status: answer.status,
          ...(answer.value !== undefined ? { value: answer.value } : {}),
          ...(answer.notes !== undefined ? { notes: answer.notes } : {}),
        })
      ),
      answerCount: intake.answerCount,
      statusCounts: { ...intake.statusCounts },
    }))(hldIntakeAnswers),
    assumptions: cloneJson(bundle.assumptions),
    constraints: cloneJson(bundle.constraints),
    warnings: cloneJson(bundle.warnings),
    instructions: cloneJson(bundle.instructions),
  };

  // Append the bounded rebuild section ONLY when the bundle carries a context.
  // Each field is mirrored explicitly, so any field smuggled onto the context is
  // structurally excluded; the section is always last for stable key ordering.
  const rebuildContext = bundle.rebuildContext;
  if (rebuildContext !== undefined && rebuildContext !== null) {
    payload.rebuild = {
      mode: "bounded_correction_pass",
      instruction: RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_INSTRUCTION,
      sourceHldSourceBundleArtifactId: rebuildContext.sourceHldSourceBundleArtifactId,
      rebuildRequestArtifactId: rebuildContext.rebuildRequestArtifactId,
      sourceModelArtifactId: rebuildContext.sourceModelArtifactId,
      sourceReviewArtifactId: rebuildContext.sourceReviewArtifactId,
      priorModelSummary: cloneJson(rebuildContext.priorModelSummary),
      reviewRecommendation: rebuildContext.reviewRecommendation,
      reviewFindingSummaries: cloneJson(rebuildContext.reviewFindingSummaries),
      engineerReason: rebuildContext.engineerReason,
      engineerInstructions: rebuildContext.engineerInstructions,
      limitations: cloneJson(rebuildContext.limitations),
    };
  }

  return {
    system: RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
  };
}

/**
 * Pure, deterministic RFP HLD design-model DRAFTING PROMPT serializer (Stage 6E-A-002).
 *
 * Serializes a deterministic {@link RfpHldDesignModelCandidateInputBundle} into a
 * provider-neutral prompt/input payload ({ system, user }) for a LATER drafting
 * executor. It is pure and contract-only: NO provider/AI/network call, NO DB/file
 * read, NO env access, NO persistence, NO route/UI work. It wires NO provider here.
 *
 * The serialized user payload is a strict WHITELIST of already-approved
 * source-bundle-derived candidate input. It carries NO raw document bodies,
 * extracted evidence, file/storage paths, sourceFileIds, compiledArtifactIds,
 * tenantId, prices, catalog lookups, SKU/config decisions, or smuggled extra
 * fields. It introduces no runtime AI authority: any future drafting is
 * candidate-only, subordinate to deterministic validation and human approval.
 *
 * Imports EXACTLY the candidate-input contract and the design-model kind - nothing
 * else.
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
  "Never emit final HLD documents, HTML, diagrams, Mermaid, draw.io/XML, SVG/XML,",
  "TP/proposal, or any customer-facing deliverable content.",
  "Never claim Cisco-certified, CVD-certified, BOMATIC-certified, or AI-certified",
  "authority.",
  "Respond with strict JSON only: no markdown, no code fences, no prose wrapper.",
  "The target top-level object must be exactly one rfp_hld_design_model payload.",
  "Deterministic validation and human engineer review remain the hard gates.",
].join("\n");

/**
 * The whitelisted user payload, built with explicit, stable key ordering. Mirrors
 * only fields already present on the candidate-input bundle.
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
  assumptions: RfpHldDesignModelCandidateInputBundle["assumptions"];
  constraints: RfpHldDesignModelCandidateInputBundle["constraints"];
  warnings: RfpHldDesignModelCandidateInputBundle["warnings"];
  instructions: RfpHldDesignModelCandidateInputBundle["instructions"];
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
 * key-ordered whitelist of bundle fields - nothing else. Pure: no provider/AI/
 * network/DB/file/env work; persists nothing. Throws only on programmer misuse
 * (wrong payloadKind on the supplied bundle).
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
    assumptions: cloneJson(bundle.assumptions),
    constraints: cloneJson(bundle.constraints),
    warnings: cloneJson(bundle.warnings),
    instructions: cloneJson(bundle.instructions),
  };

  return {
    system: RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
  };
}

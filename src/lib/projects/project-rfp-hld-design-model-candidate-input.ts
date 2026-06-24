/**
 * Pure, deterministic RFP HLD design-model candidate-input CONTRACT (Stage 6D-002).
 *
 * Builds the candidate input / prompt bundle a future drafting executor consumes
 * to draft a CANDIDATE `rfp_hld_design_model` from exactly ONE approved
 * `hld_source_bundle` artifact. It is contract-only: NO DB read/write, NO file
 * read, NO network/AI/provider call, NO artifact persistence, NO route/UI work.
 * The supplied artifact is validated and its already-approved source-bundle
 * contract is copied through a whitelist; NO upstream payload bodies (evidence,
 * requirements, compliance, configuration, raw documents, files, storage paths,
 * tables, document text) are ever loaded or carried.
 *
 * Imports EXACTLY canonical project types, the source-bundle and design-model
 * contracts, and (type-only) the rebuild candidate-input contract for the
 * optional rebuild context - nothing else. It introduces no runtime AI
 * authority: any future drafting is candidate-only, subordinate to deterministic
 * validation and human engineer approval.
 */
import type { ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
  type RfpHldSourceBundleAuthorities,
  type RfpHldSourceBundleDesignKnowledgePackReference,
  type RfpHldSourceBundleStatementEntry,
  type RfpHldSourceBundleFinding,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
// Type-only (erased at runtime): the base bundle exposes an optional rebuild
// context, whose shape and pure builder live in the rebuild candidate-input
// contract. No runtime dependency is introduced in this direction.
import type { RfpHldDesignModelRebuildDraftingContext } from "@/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input";

/** Stable discriminator for the candidate-input bundle. */
export const RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND =
  "rfp_hld_design_model_candidate_input" as const;

/** The only stage/type/status a draftable source bundle may carry. */
const SOURCE_BUNDLE_STAGE_ID = "hld_design_delta_review" as const;
const SOURCE_BUNDLE_ARTIFACT_TYPE = "hld_source_bundle" as const;

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** A covered/excluded design domain, derived from the source-bundle contract. */
type CandidateDomain = RfpHldSourceBundlePayload["coveredDomains"][number];

/**
 * The standing statement that frames every drafting run as candidate-only and
 * subordinate to deterministic validation plus human engineer approval.
 */
export const RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY =
  "This is candidate HLD design-model drafting only; output is an unapproved " +
  "draft subordinate to deterministic validation and human engineer approval.";

/** Deterministic forbidden-action statements carried into every bundle. */
export const RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN: readonly string[] = [
  "Do not reread or reopen raw RFP, PDF, DOCX, or XLSX source documents; rely " +
    "only on this approved source bundle.",
  "Do not emit a final HLD document, HTML output, rendered diagrams, or " +
    "draw.io files.",
  "Do not emit TP, proposal, or any customer-facing deliverable content.",
  "Do not make SKU, pricing, catalog, or configuration decisions; those " +
    "authorities live in approved upstream artifacts.",
  "Do not assert Cisco-certified, CVD-certified, BOMATIC-certified, or " +
    "AI-certified authority.",
  "Do not claim design approval authority; a human engineer must review and " +
    "approve any resulting model.",
];

/** Deterministic drafting instructions / prompt sections for the bundle. */
export interface RfpHldDesignModelCandidateDraftingInstructions {
  candidateOnly: string;
  /** The payload kind a downstream draft must target. */
  targetPayloadKind: typeof RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND;
  forbidden: string[];
}

/** The deterministic, serializable candidate-input bundle. */
export interface RfpHldDesignModelCandidateInputBundle {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  /** Identity of the one approved source bundle this draft builds on. */
  sourceHldSourceBundleArtifactId: string;
  sourceHldSourceBundleVersion: number;
  sourceHldSourceBundlePayloadKind: typeof RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND;
  /** Future model artifact source ids: exactly the approved source bundle id. */
  sourceArtifactIds: string[];
  coveredDomains: CandidateDomain[];
  excludedDomains: CandidateDomain[];
  /** Approved authority references, copied from the source-bundle contract. */
  authorities: RfpHldSourceBundleAuthorities;
  designKnowledgePackRefs: RfpHldSourceBundleDesignKnowledgePackReference[];
  assumptions: RfpHldSourceBundleStatementEntry[];
  constraints: RfpHldSourceBundleStatementEntry[];
  warnings: RfpHldSourceBundleFinding[];
  instructions: RfpHldDesignModelCandidateDraftingInstructions;
  /**
   * Optional bounded rebuild context, present ONLY on a redraft pass. When set,
   * the drafting prompt frames ONE bounded correction pass from this SAME
   * approved source bundle; it carries sanitized summaries and no new authority.
   * Absent for normal initial drafting. Built by
   * buildRfpHldDesignModelRebuildCandidateInput, never by the initial builder.
   */
  rebuildContext?: RfpHldDesignModelRebuildDraftingContext;
}

/** Reason a draftable source bundle was rejected. */
export type RfpHldDesignModelCandidateInputBlockedReason =
  | "wrong_project"
  | "wrong_stage"
  | "wrong_type"
  | "not_approved"
  | "source_artifact_ids_mismatch";

/** Input for {@link buildRfpHldDesignModelCandidateInput}. */
export interface BuildRfpHldDesignModelCandidateInputInput {
  /** The caller's project scope; the artifact must belong to it. */
  projectId: string;
  /** The one approved `hld_source_bundle` artifact to draft from. */
  artifact: ProjectArtifact;
  createdBy: string;
  /** ISO-8601 UTC instant stamped onto the bundle. */
  createdAt: string;
}

/** Discriminated result of {@link buildRfpHldDesignModelCandidateInput}. */
export type BuildRfpHldDesignModelCandidateInputResult =
  | { status: "ok"; bundle: RfpHldDesignModelCandidateInputBundle }
  | {
      status: "blocked";
      reason: RfpHldDesignModelCandidateInputBlockedReason;
    }
  | { status: "invalid_source_bundle_payload"; errors: string[] };

/** Deep, fresh, JSON-safe copy; never aliases the input. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** True when two id arrays are the same set (no dups, equal length). */
function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== a.length) return false;
  return b.every((id) => set.has(id));
}

/**
 * Build the deterministic candidate-input bundle from one supplied approved
 * `hld_source_bundle` artifact. Pure: validates the artifact against the
 * caller's project, the HLD design-delta stage, the source-bundle type, the
 * approved status, the source-bundle payload contract, and exact row/payload
 * source-id agreement; then copies covered/excluded domains, approved authority
 * and knowledge-pack references, and assumptions/constraints/warnings from the
 * source-bundle contract ONLY into fresh, non-aliased structures. Throws only on
 * programmer misuse (blank projectId/createdBy, non-ISO createdAt). Performs no
 * DB/file/network/AI work and persists nothing.
 */
export function buildRfpHldDesignModelCandidateInput(
  input: BuildRfpHldDesignModelCandidateInputInput
): BuildRfpHldDesignModelCandidateInputResult {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (typeof input.createdBy !== "string" || input.createdBy.trim() === "") {
    throw new Error("createdBy is required.");
  }
  if (typeof input.createdAt !== "string" || !ISO_UTC_RE.test(input.createdAt)) {
    throw new Error("createdAt must be an ISO-8601 UTC instant.");
  }
  if (input.artifact === null || typeof input.artifact !== "object") {
    throw new Error("artifact is required.");
  }

  const { artifact } = input;
  if (artifact.projectId !== input.projectId) {
    return { status: "blocked", reason: "wrong_project" };
  }
  if (artifact.stageId !== SOURCE_BUNDLE_STAGE_ID) {
    return { status: "blocked", reason: "wrong_stage" };
  }
  if (artifact.type !== SOURCE_BUNDLE_ARTIFACT_TYPE) {
    return { status: "blocked", reason: "wrong_type" };
  }
  if (artifact.status !== "approved") {
    return { status: "blocked", reason: "not_approved" };
  }

  const validation = validateRfpHldSourceBundlePayload(artifact.payload);
  if (!validation.valid) {
    return {
      status: "invalid_source_bundle_payload",
      errors: validation.errors.slice(),
    };
  }

  // Safe to read as the validated contract now that validation passed.
  const payload = artifact.payload as unknown as RfpHldSourceBundlePayload;

  // The artifact row must agree exactly with the payload's referenced ids.
  if (!sameIdSet(artifact.sourceArtifactIds, payload.sourceArtifactIds)) {
    return { status: "blocked", reason: "source_artifact_ids_mismatch" };
  }

  const bundle: RfpHldDesignModelCandidateInputBundle = {
    payloadKind: RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
    createdBy: input.createdBy.trim(),
    createdAt: input.createdAt,
    sourceHldSourceBundleArtifactId: artifact.id,
    sourceHldSourceBundleVersion: artifact.version,
    sourceHldSourceBundlePayloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    // Future model artifact builds on the source bundle ONLY, never its upstream
    // authority ids.
    sourceArtifactIds: [artifact.id],
    coveredDomains: cloneJson(payload.coveredDomains),
    excludedDomains: cloneJson(payload.excludedDomains),
    authorities: cloneJson(payload.authorities),
    designKnowledgePackRefs: cloneJson(payload.designKnowledgePackRefs),
    assumptions: cloneJson(payload.assumptions),
    constraints: cloneJson(payload.constraints),
    warnings: cloneJson(payload.warnings),
    instructions: {
      candidateOnly: RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
      forbidden: RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN.slice(),
    },
  };

  return { status: "ok", bundle };
}

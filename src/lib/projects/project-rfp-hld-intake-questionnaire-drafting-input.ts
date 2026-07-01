/**
 * Pure, transient RFP HLD intake-question DRAFTING INPUT contract (Stage 6H-0D).
 *
 * The bounded, deterministic bundle a LATER candidate-question drafting executor
 * receives. It carries ONLY already-approved, source-proven material an engineer
 * has authorized: the identity of who/when requested the draft, the approved
 * source artifact ids the questionnaire draws from, provenance source references
 * candidate questions may cite, the approved design-knowledge content blocks
 * (curated, engineer-approved guidance, per-field), and fixed candidate-only
 * instructions plus the forbidden-action list.
 *
 * It is transient input, never a persisted artifact: it holds NO engineer answers,
 * NO design/topology decisions, NO pricing/SKU/catalog/configuration decisions, NO
 * raw document text, NO provider prompt/completion/response, NO file/storage
 * handles, NO tenant identity, and NO validation/approval authority. Any future
 * drafting run is candidate-only and subordinate to deterministic validation
 * (Stage 6H-0B) plus human engineer approval.
 *
 * Pure and contract-only: NO DB/store, NO fs/path, NO route/UI, NO provider/AI/
 * network/env. It imports EXACTLY the approved design-knowledge content type - the
 * curated guidance shape the drafting run may read - and nothing else.
 */
import type { RfpHldApprovedDesignKnowledgeContent } from "@/lib/projects/project-rfp-hld-design-knowledge-content";

/** Stable discriminator for the transient candidate-question drafting input. */
export const RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND =
  "rfp_hld_intake_questionnaire_drafting_input" as const;

/** The target persisted payload a drafting run ultimately feeds (candidate-only). */
export const RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND =
  "rfp_hld_intake_questionnaire" as const;

/**
 * Fixed candidate-only framing carried on the drafting input. The drafting run may
 * propose CANDIDATE intake questions only; it is subordinate to deterministic
 * validation and human engineer approval and holds no runtime authority.
 */
export const RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY: string =
  "Propose CANDIDATE HLD intake questions only. The output is candidate-only and " +
  "unapproved, subordinate to deterministic validation and human engineer approval.";

/**
 * Fixed list of actions a candidate-question drafting run may NEVER take. Listing
 * them is instruction text, never emitted content; it mirrors the persisted
 * questionnaire contract's hard boundaries.
 */
export const RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN: readonly string[] = [
  "Do not answer any question or supply default/engineer answers.",
  "Do not make design, topology, scope, or final-authority decisions.",
  "Do not make pricing, SKU, catalog, or configuration decisions.",
  "Do not perform validation, approval, or certification.",
  "Do not emit HLD designs, diagrams, documents, TP/proposal, or export content.",
  "Do not emit artifact metadata, status, provider details, or raw source text.",
  "Do not claim Cisco, CVD, BOMATIC, or AI certified/final authority.",
];

/**
 * A minimal provenance reference a candidate question may cite. It proves the
 * approved source chain (artifact id + type + stage + status + version + payload
 * kind) without carrying any raw body, file path, storage handle, or authority
 * decision.
 */
export interface RfpHldIntakeQuestionnaireDraftingSourceRef {
  refId: string;
  artifactId: string;
  artifactType: string;
  stageId: string;
  status: "approved";
  version: number;
  payloadKind: string;
  label: string;
}

/**
 * A compact, source-proven block of approved project-artifact CONTEXT a candidate
 * question may lean on. It carries the approved source chain (artifact id + type +
 * stage + status + version) plus a short human-facing label, a bounded summary, and
 * a small set of capped excerpts derived ONLY from already-approved artifact payload
 * fields. It never carries a raw document dump, a file path, a storage handle, a
 * tenant id, a provider response, a pricing/catalog value, a priced BoQ figure, or a
 * SKU/configuration decision - configuration context, when present, is a bounded
 * description/count only, never turning SKU/catalog/config into AI authority.
 */
export interface RfpHldIntakeQuestionnaireApprovedSourceContext {
  contextKind: "approved_project_artifact_context";
  sourceRefId: string;
  artifactId: string;
  artifactType:
    | "evidence_package"
    | "requirements_baseline"
    | "compliance_matrix"
    | "configuration_expansion";
  stageId: string;
  status: "approved";
  version: number;
  payloadKind?: string;
  label: string;
  summary: string;
  excerpts: string[];
}

/** Fixed candidate-only instructions carried alongside the drafting material. */
export interface RfpHldIntakeQuestionnaireDraftingInstructions {
  candidateOnly: typeof RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY;
  targetPayloadKind: typeof RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND;
  forbidden: string[];
}

/**
 * The transient candidate-question drafting input bundle. Explicit whitelist of
 * approved, source-proven material only; it carries no answers, no design/pricing/
 * SKU/catalog/configuration decision, no raw text, and no provider/authority data.
 */
export interface RfpHldIntakeQuestionnaireDraftingInput {
  payloadKind: typeof RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceArtifactIds: string[];
  sourceRefs: RfpHldIntakeQuestionnaireDraftingSourceRef[];
  /**
   * Bounded, sanitized approved-artifact CONTEXT the candidate drafting run may lean
   * on, keyed by the source ref it elaborates. Summaries and capped excerpts only -
   * never a raw dump, path, handle, tenant id, provider data, or pricing/SKU/catalog/
   * configuration decision.
   */
  approvedSourceContexts: RfpHldIntakeQuestionnaireApprovedSourceContext[];
  designKnowledgePackContents: RfpHldApprovedDesignKnowledgeContent[];
  instructions: RfpHldIntakeQuestionnaireDraftingInstructions;
}

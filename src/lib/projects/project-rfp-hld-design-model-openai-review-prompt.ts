/**
 * Pure, deterministic RFP HLD design-model OpenAI ADVISORY quality-review PROMPT
 * serializer (Stage 6H-0H-A).
 *
 * Serializes the closed review-input bundle
 * ({@link RfpHldDesignModelOpenAiReviewInput}) into a provider-neutral
 * prompt/input payload ({ system, user }) for the OpenAI review adapter. It is
 * pure and contract-only: NO provider/AI/network call, NO DB/file read, NO env
 * access, NO persistence, NO route/UI work. It wires NO provider.
 *
 * The system instruction restricts the reviewer to raising CANDIDATE advisory
 * quality findings only and to emitting strict JSON shaped exactly
 * { "findings": [...] }. The user payload is a strict WHITELIST of the validated
 * candidate model and approved source-bundle content needed for quality review,
 * built with explicit, stable key ordering. It carries no raw document text, no
 * source file ids, no tenant identity, no pricing/SKU/catalog/configuration
 * decision, and no smuggled extra field.
 *
 * Imports EXACTLY the review-input contract from the executor boundary.
 */
import type { RfpHldDesignModelOpenAiReviewInput } from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";

/**
 * Fixed system instruction for the OpenAI review adapter. Frames every run as
 * candidate-only, advisory, source-bound, strict-JSON, and gated by deterministic
 * validation plus human engineer review.
 */
export const RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT: string = [
  "You raise CANDIDATE advisory HLD quality-review findings only. Your review is",
  "advisory and internal; it is NOT final design authority and never approves the",
  "design model.",
  "Work ONLY from the supplied review input (the candidate design model and its",
  "approved source bundle). Never invent source ids, domains, provenance, or facts.",
  'Respond with strict JSON only, shaped EXACTLY as { "findings": [ ... ] }: no',
  "markdown, no code fences, no prose wrapper, and no other top-level key.",
  "Each findings entry has severity (blocking|warning|suggestion), category, a short",
  "message, an optional recommendedAction, and optional sources (model|source_bundle).",
  "Never create pricing, SKU, catalog, or configuration decisions.",
  "Never create final HLD output, diagrams, documents, or exports.",
  "Never create approvals, artifact metadata/status, or design authority.",
  "Never output provider, request, or model details.",
  "Never claim Cisco, CVD, BOMATIC, or AI certified or final authority.",
  "Deterministic validation and human engineer review remain the hard gates.",
].join("\n");

/** The whitelisted candidate-model view carried into the review request. */
export interface RfpHldDesignModelOpenAiReviewModelUserPayload {
  artifactId: string;
  version: number;
  coveredDomains: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["coveredDomains"];
  excludedDomains: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["excludedDomains"];
  sourceReferences: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["sourceReferences"];
  assumptionRefs: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["assumptionRefs"];
  constraintRefs: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["constraintRefs"];
  designSections: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["designSections"];
  topology: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["topology"];
  diagramIntents: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["diagramIntents"];
  traceability: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["traceability"];
  validationFindings: RfpHldDesignModelOpenAiReviewInput["model"]["payload"]["validationFindings"];
}

/** The whitelisted approved source-bundle view carried into the review request. */
export interface RfpHldDesignModelOpenAiReviewSourceBundleUserPayload {
  artifactId: string;
  version: number;
  coveredDomains: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["coveredDomains"];
  excludedDomains: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["excludedDomains"];
  missingDomains: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["missingDomains"];
  assumptions: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["assumptions"];
  constraints: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["constraints"];
  warnings: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["warnings"];
  blockers: RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["blockers"];
  designKnowledgePackDomains: Array<{ domain: string; version: number }>;
  designKnowledgePackContents?: NonNullable<
    RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["designKnowledgePackContents"]
  >;
  hldIntakeAnswers?: NonNullable<
    RfpHldDesignModelOpenAiReviewInput["sourceBundle"]["payload"]["hldIntakeAnswers"]
  >;
}

/** The whitelisted user payload, built with explicit, stable key ordering. */
export interface RfpHldDesignModelOpenAiReviewUserPayload {
  reviewedBy: string;
  reviewedAt: string;
  model: RfpHldDesignModelOpenAiReviewModelUserPayload;
  sourceBundle: RfpHldDesignModelOpenAiReviewSourceBundleUserPayload;
}

/** Provider-neutral prompt/input payload for the OpenAI review adapter. */
export interface RfpHldDesignModelOpenAiReviewRequest {
  system: string;
  user: string;
}

/** Deep, fresh, JSON-safe copy; never aliases the input. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Serialize the review-input bundle into a provider-neutral { system, user }
 * request. The `user` string is JSON.stringify of an explicitly key-ordered
 * whitelist of the candidate model and approved source-bundle content - nothing
 * else. Approved DKP/intake content already present in the source-bundle payload
 * is mirrored when present, but no raw docs or source file ids are ever included.
 * Pure: no provider/AI/network/DB/file/env work; persists nothing.
 */
export function buildRfpHldDesignModelOpenAiReviewRequest(
  input: RfpHldDesignModelOpenAiReviewInput
): RfpHldDesignModelOpenAiReviewRequest {
  const model = input.model.payload;
  const bundle = input.sourceBundle.payload;

  const modelPayload: RfpHldDesignModelOpenAiReviewModelUserPayload = {
    artifactId: input.model.id,
    version: input.model.version,
    coveredDomains: cloneJson(model.coveredDomains),
    excludedDomains: cloneJson(model.excludedDomains),
    sourceReferences: cloneJson(model.sourceReferences),
    assumptionRefs: cloneJson(model.assumptionRefs),
    constraintRefs: cloneJson(model.constraintRefs),
    designSections: cloneJson(model.designSections),
    topology: cloneJson(model.topology),
    diagramIntents: cloneJson(model.diagramIntents),
    traceability: cloneJson(model.traceability),
    validationFindings: cloneJson(model.validationFindings),
  };

  const sourceBundlePayload: RfpHldDesignModelOpenAiReviewSourceBundleUserPayload = {
    artifactId: input.sourceBundle.id,
    version: input.sourceBundle.version,
    coveredDomains: cloneJson(bundle.coveredDomains),
    excludedDomains: cloneJson(bundle.excludedDomains),
    missingDomains: cloneJson(bundle.missingDomains),
    assumptions: cloneJson(bundle.assumptions),
    constraints: cloneJson(bundle.constraints),
    warnings: cloneJson(bundle.warnings),
    blockers: cloneJson(bundle.blockers),
    // Domain + version only; never the raw pack body or its source file ids.
    designKnowledgePackDomains: bundle.designKnowledgePackRefs.map((ref) => ({
      domain: ref.domain,
      version: ref.version,
    })),
    ...(bundle.designKnowledgePackContents !== undefined
      ? { designKnowledgePackContents: cloneJson(bundle.designKnowledgePackContents) }
      : {}),
    ...(bundle.hldIntakeAnswers !== undefined
      ? { hldIntakeAnswers: cloneJson(bundle.hldIntakeAnswers) }
      : {}),
  };

  const payload: RfpHldDesignModelOpenAiReviewUserPayload = {
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt,
    model: modelPayload,
    sourceBundle: sourceBundlePayload,
  };

  return {
    system: RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
  };
}

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
 * Imports only type contracts needed for the closed review input and the
 * whitelisted DKP/intake-answer projections.
 */
import type { RfpHldDesignModelOpenAiReviewInput } from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import type { RfpHldApprovedDesignKnowledgeContent } from "@/lib/projects/project-rfp-hld-design-knowledge-content";
import type { RfpHldSourceBundleIntakeAnswers } from "@/lib/projects/project-rfp-hld-source-bundle";

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

/** Plain (non-array) object view, or null. */
function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Canonical scalar keys of an approved design-knowledge content block, in order. */
const DKP_CONTENT_SCALAR_KEYS: readonly string[] = [
  "contentKind",
  "artifactId",
  "artifactType",
  "stageId",
  "status",
  "version",
  "payloadKind",
  "domain",
  "title",
  "source",
];

/** Canonical list-section keys of an approved design-knowledge content block. */
const DKP_CONTENT_SECTION_KEYS: readonly string[] = [
  "designPrinciples",
  "topologyGuidance",
  "constraints",
  "assumptions",
  "exclusions",
  "validationNotes",
];

/** Canonical intake status-count keys, in order. */
const INTAKE_STATUS_COUNT_KEYS: readonly string[] = [
  "answered",
  "unknown",
  "not_applicable",
];

/** Project only the six canonical section counts; drop any smuggled key. */
function projectSectionCounts(counts: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of DKP_CONTENT_SECTION_KEYS) {
    if (typeof counts[key] === "number") out[key] = counts[key] as number;
  }
  return out;
}

/**
 * Project one approved design-knowledge content block through an explicit
 * whitelist in canonical key order. Copies no extra key from the block; list
 * sections and section counts are re-projected, never whole-cloned.
 */
function projectDesignKnowledgeContent(
  content: RfpHldApprovedDesignKnowledgeContent
): RfpHldApprovedDesignKnowledgeContent {
  const src = content as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of DKP_CONTENT_SCALAR_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  for (const key of DKP_CONTENT_SECTION_KEYS) {
    if (Array.isArray(src[key])) out[key] = (src[key] as unknown[]).slice();
  }
  if (src.entryCount !== undefined) out.entryCount = src.entryCount;
  const counts = asObject(src.sectionCounts);
  if (counts) out.sectionCounts = projectSectionCounts(counts);
  return out as unknown as RfpHldApprovedDesignKnowledgeContent;
}

/** Project the whitelisted DKP content array; drop any extra key per block. */
function projectDesignKnowledgePackContents(
  contents: readonly RfpHldApprovedDesignKnowledgeContent[]
): RfpHldApprovedDesignKnowledgeContent[] {
  return contents.map(projectDesignKnowledgeContent);
}

/** Project one intake answer through its explicit whitelist; drop extras. */
function projectIntakeAnswer(answer: unknown): Record<string, unknown> {
  const a = asObject(answer) ?? {};
  const out: Record<string, unknown> = {};
  if (a.fieldId !== undefined) out.fieldId = a.fieldId;
  if (a.label !== undefined) out.label = a.label;
  if (a.status !== undefined) out.status = a.status;
  if (a.value !== undefined) out.value = a.value;
  if (a.notes !== undefined) out.notes = a.notes;
  return out;
}

/** Project only the three canonical intake status counts; drop any extra key. */
function projectStatusCounts(counts: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of INTAKE_STATUS_COUNT_KEYS) {
    if (typeof counts[key] === "number") out[key] = counts[key] as number;
  }
  return out;
}

/**
 * Project the sanitized HLD intake answers section through an explicit whitelist
 * in canonical key order. Copies no extra key from the section, its answer
 * objects, or its status counts; never whole-clones any of them.
 */
function projectHldIntakeAnswers(
  section: RfpHldSourceBundleIntakeAnswers
): RfpHldSourceBundleIntakeAnswers {
  const src = section as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (src.sourceHldIntakeArtifactId !== undefined) {
    out.sourceHldIntakeArtifactId = src.sourceHldIntakeArtifactId;
  }
  if (src.sourceHldIntakeVersion !== undefined) {
    out.sourceHldIntakeVersion = src.sourceHldIntakeVersion;
  }
  if (src.sourceMode !== undefined) out.sourceMode = src.sourceMode;
  if (Array.isArray(src.answers)) out.answers = (src.answers as unknown[]).map(projectIntakeAnswer);
  if (src.answerCount !== undefined) out.answerCount = src.answerCount;
  const counts = asObject(src.statusCounts);
  if (counts) out.statusCounts = projectStatusCounts(counts);
  return out as unknown as RfpHldSourceBundleIntakeAnswers;
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
      ? {
          designKnowledgePackContents: projectDesignKnowledgePackContents(
            bundle.designKnowledgePackContents
          ),
        }
      : {}),
    ...(bundle.hldIntakeAnswers !== undefined
      ? { hldIntakeAnswers: projectHldIntakeAnswers(bundle.hldIntakeAnswers) }
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

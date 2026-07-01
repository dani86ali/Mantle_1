/**
 * Provider-neutral RFP HLD design-model OpenAI ADVISORY quality-review executor
 * BOUNDARY (Stage 6H-0H-A).
 *
 * The typed seam between a closed, deterministic review-input bundle (the
 * candidate `hld_design_model` plus its approved `hld_source_bundle`, with the
 * ids/versions/timestamps needed to stamp the review artifact) and an INJECTED
 * review executor that proposes CANDIDATE advisory quality findings. It reviews
 * nothing itself, makes no provider/network call, reads no DB/store/file/raw
 * source document, touches no route or UI, and persists nothing.
 *
 * Whatever the executor resolves with is CANDIDATE-ONLY and UNTRUSTED. The
 * boundary expects the raw provider output to hold exactly one top-level key,
 * `findings`, parses each finding through a narrow fail-closed shape, and
 * deterministically wraps them into a full `rfp_hld_design_model_review` payload:
 * fixed source references and ids for the model and bundle only, a reviewer of
 * type `ai_advisory`, a recommendation derived from the findings (blocking ->
 * rebuild_recommended with a bounded single-attempt redraft directive, otherwise
 * proceed_to_engineer_review). It then HARD-GATES the drafted payload with the
 * Stage 6E-B-001 fail-closed validator BEFORE returning. On any failure it
 * returns deterministic errors and NEVER echoes the raw provider output.
 *
 * OpenAI review is a mandatory internal advisory gate, not final design
 * authority. This boundary asserts no design, pricing, SKU, catalog,
 * configuration, or AI authority; deterministic validators and human engineer
 * approval remain the hard gates.
 */
import type { RfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import type { RfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewFinding,
  type RfpHldDesignModelReviewFindingCategory,
  type RfpHldDesignModelReviewFindingSeverity,
  type RfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewRecommendation,
} from "@/lib/projects/project-rfp-hld-design-model-review";

/** Fixed source-reference ids for the reviewed model and its source bundle. */
export const OPENAI_REVIEW_MODEL_REF_ID = "ref-model";
export const OPENAI_REVIEW_BUNDLE_REF_ID = "ref-bundle";

/** Bounded, validator-safe single-attempt redraft directive for blocking findings. */
const REBUILD_SUMMARY =
  "Redraft the design model from the approved source bundle to resolve the listed review findings.";
const REBUILD_INSTRUCTIONS =
  "Use the same approved source bundle. Fix only the listed review findings. " +
  "Do not add facts, products, quantities, costs, output files, or authority decisions.";

/** Closed candidate finding shape; any other key/shape is a deterministic reject. */
const CANDIDATE_FINDING_KEYS: ReadonlySet<string> = new Set([
  "severity",
  "category",
  "message",
  "recommendedAction",
  "sources",
]);

const CANDIDATE_SEVERITIES: ReadonlySet<string> = new Set([
  "blocking",
  "warning",
  "suggestion",
]);

const CANDIDATE_CATEGORIES: ReadonlySet<string> = new Set([
  "source_mismatch",
  "unsupported_domain",
  "missing_assumption",
  "topology_risk",
  "scope_gap",
  "unclear_narrative",
  "validation_gap",
  "other",
]);

const CANDIDATE_SOURCE_TARGETS: ReadonlySet<string> = new Set(["model", "source_bundle"]);

/** The candidate model input: identity/version plus its validated payload. */
export interface RfpHldDesignModelOpenAiReviewModelInput {
  id: string;
  version: number;
  payload: RfpHldDesignModelPayload;
}

/** The approved source-bundle input: identity/version plus its validated payload. */
export interface RfpHldDesignModelOpenAiReviewSourceBundleInput {
  id: string;
  version: number;
  payload: RfpHldSourceBundlePayload;
}

/**
 * The closed, deterministic review-input bundle. Everything the review needs,
 * derived from the candidate model and its approved source bundle plus the
 * ids/versions/timestamp used to stamp the review artifact. No raw docs, no file
 * ids, no tenant identity.
 */
export interface RfpHldDesignModelOpenAiReviewInput {
  model: RfpHldDesignModelOpenAiReviewModelInput;
  sourceBundle: RfpHldDesignModelOpenAiReviewSourceBundleInput;
  reviewedBy: string;
  reviewedAt: string;
}

/** Everything the injected executor receives: exactly the review-input bundle. */
export interface RfpHldDesignModelOpenAiReviewExecutorInput {
  reviewInput: RfpHldDesignModelOpenAiReviewInput;
}

/**
 * The injected review dependency. This module never imports, constructs, or names
 * a real implementation. Its resolved value is UNKNOWN candidate provider output,
 * expected to hold exactly one top-level key, `findings`; the boundary never
 * trusts it beyond that expectation.
 */
export type RfpHldDesignModelOpenAiReviewExecutor = (
  input: RfpHldDesignModelOpenAiReviewExecutorInput
) => Promise<unknown>;

/** Input for {@link reviewRfpHldDesignModelOpenAiCandidate}. */
export interface ReviewRfpHldDesignModelOpenAiCandidateInput {
  reviewInput: RfpHldDesignModelOpenAiReviewInput;
  /**
   * The injected executor, or null/absent when none is configured. A null/absent
   * executor yields a safe unavailable result and the input is never inspected.
   */
  executor?: RfpHldDesignModelOpenAiReviewExecutor | null;
}

/** Discriminated result of {@link reviewRfpHldDesignModelOpenAiCandidate}. */
export type RfpHldDesignModelOpenAiReviewResult =
  | { status: "unavailable" }
  | { status: "review_failed"; error: "hld_quality_review_failed" }
  | { status: "invalid_candidate_output"; errors: string[] }
  | { status: "reviewed"; review: RfpHldDesignModelReviewPayload };

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Pull the single `findings` array out of the raw provider output. Fail-closed:
 * the output must be a plain object whose ONLY top-level key is `findings`, whose
 * value is an array. Any other shape (non-object, missing key, extra keys such as
 * a raw provider response, an AI-supplied recommendation, or a pricing/SKU/
 * catalog/config decision) is a deterministic reject that never echoes the body.
 */
function extractCandidateFindings(
  raw: unknown
): { ok: true; findings: unknown[] } | { ok: false; errors: string[] } {
  const o = asObject(raw);
  if (!o) {
    return { ok: false, errors: ["provider output: must be an object"] };
  }
  const keys = Object.keys(o);
  if (keys.length !== 1 || keys[0] !== "findings") {
    return {
      ok: false,
      errors: ['provider output: must contain exactly the top-level key "findings"'],
    };
  }
  if (!Array.isArray(o.findings)) {
    return { ok: false, errors: ["provider output: findings must be an array"] };
  }
  return { ok: true, findings: o.findings };
}

/**
 * Parse one untrusted candidate finding into a validator-safe finding. Narrow and
 * fail-closed: only the closed candidate keys are allowed, severity/category must
 * be in their unions, message must be a nonblank string, recommendedAction is an
 * optional nonblank string, and the optional `sources` list may only carry
 * "model"/"source_bundle" tokens which are converted to the fixed reference ids.
 * Deep content/length limits are enforced later by the review-payload validator.
 */
function parseCandidateFinding(
  raw: unknown,
  index: number,
  seq: number
): { finding: RfpHldDesignModelReviewFinding } | { errors: string[] } {
  const label = `findings[${index}]`;
  const o = asObject(raw);
  if (!o) return { errors: [`${label}: must be an object`] };

  const errors: string[] = [];
  for (const k of Object.keys(o)) {
    if (!CANDIDATE_FINDING_KEYS.has(k)) errors.push(`${label}: unexpected key "${k}"`);
  }

  if (!(typeof o.severity === "string" && CANDIDATE_SEVERITIES.has(o.severity))) {
    errors.push(`${label}: invalid severity`);
  }
  if (!(typeof o.category === "string" && CANDIDATE_CATEGORIES.has(o.category))) {
    errors.push(`${label}: invalid category`);
  }
  if (!isNonBlank(o.message)) errors.push(`${label}: blank message`);
  if ("recommendedAction" in o && !isNonBlank(o.recommendedAction)) {
    errors.push(`${label}: blank recommendedAction`);
  }

  const refs: string[] = [];
  if ("sources" in o) {
    if (!Array.isArray(o.sources)) {
      errors.push(`${label}: sources must be an array`);
    } else {
      for (const target of o.sources as unknown[]) {
        if (!(typeof target === "string" && CANDIDATE_SOURCE_TARGETS.has(target))) {
          errors.push(`${label}: invalid source target`);
          continue;
        }
        const refId =
          target === "model" ? OPENAI_REVIEW_MODEL_REF_ID : OPENAI_REVIEW_BUNDLE_REF_ID;
        if (!refs.includes(refId)) refs.push(refId);
      }
    }
  }
  // Default to referencing both the model and its source bundle when no explicit,
  // valid source targets are supplied (validator requires a non-empty list).
  if (refs.length === 0) {
    refs.push(OPENAI_REVIEW_MODEL_REF_ID, OPENAI_REVIEW_BUNDLE_REF_ID);
  }

  if (errors.length > 0) return { errors };

  const finding: RfpHldDesignModelReviewFinding = {
    id: `of-${seq}`,
    severity: o.severity as RfpHldDesignModelReviewFindingSeverity,
    category: o.category as RfpHldDesignModelReviewFindingCategory,
    message: (o.message as string).trim(),
    sourceReferenceIds: refs,
    ...("recommendedAction" in o
      ? { recommendedAction: (o.recommendedAction as string).trim() }
      : {}),
  };
  return { finding };
}

/**
 * Invoke the injected executor with exactly the review-input bundle, then
 * deterministically wrap and validate its candidate findings into a full advisory
 * `rfp_hld_design_model_review` payload.
 *
 * - No executor supplied -> `unavailable`, and the input is never inspected.
 * - Executor throws -> `review_failed` with a fixed generic error; thrown details
 *   are never exposed.
 * - Raw output not exactly `{ findings: [...] }`, a finding fails the narrow
 *   candidate shape, or the wrapped payload fails the Stage 6E-B-001 validator ->
 *   `invalid_candidate_output` with deterministic errors only; the raw provider
 *   output is never echoed.
 * - Otherwise -> `reviewed` with the fully wrapped, validated advisory review.
 */
export async function reviewRfpHldDesignModelOpenAiCandidate(
  input: ReviewRfpHldDesignModelOpenAiCandidateInput
): Promise<RfpHldDesignModelOpenAiReviewResult> {
  const executor = input.executor;
  if (executor === null || executor === undefined) {
    return { status: "unavailable" };
  }

  let raw: unknown;
  try {
    raw = await executor({ reviewInput: input.reviewInput });
  } catch {
    return { status: "review_failed", error: "hld_quality_review_failed" };
  }

  const extracted = extractCandidateFindings(raw);
  if (!extracted.ok) {
    return { status: "invalid_candidate_output", errors: extracted.errors };
  }

  const findings: RfpHldDesignModelReviewFinding[] = [];
  const errors: string[] = [];
  extracted.findings.forEach((candidate, i) => {
    const parsed = parseCandidateFinding(candidate, i, i + 1);
    if ("errors" in parsed) errors.push(...parsed.errors);
    else findings.push(parsed.finding);
  });
  if (errors.length > 0) {
    return { status: "invalid_candidate_output", errors };
  }

  const { model, sourceBundle, reviewedBy, reviewedAt } = input.reviewInput;
  const hasBlocking = findings.some((f) => f.severity === "blocking");
  const recommendation: RfpHldDesignModelReviewRecommendation = hasBlocking
    ? "rebuild_recommended"
    : "proceed_to_engineer_review";

  const review: RfpHldDesignModelReviewPayload = {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [model.id, sourceBundle.id],
    sourceHldDesignModelArtifactId: model.id,
    sourceHldSourceBundleArtifactId: sourceBundle.id,
    reviewedAt,
    reviewer: { type: "ai_advisory", id: reviewedBy },
    sourceReferences: [
      { id: OPENAI_REVIEW_MODEL_REF_ID, artifactId: model.id },
      { id: OPENAI_REVIEW_BUNDLE_REF_ID, artifactId: sourceBundle.id },
    ],
    findings,
    recommendation,
    ...(hasBlocking
      ? {
          boundedRebuildInstructions: {
            summary: REBUILD_SUMMARY,
            instructions: REBUILD_INSTRUCTIONS,
            maxAttempts: 1,
          },
        }
      : {}),
  };

  // HARD GATE: the drafted advisory payload must validate before returning; the
  // raw provider output is never echoed in the deterministic errors.
  const validation = validateRfpHldDesignModelReviewPayload(review);
  if (!validation.valid) {
    return { status: "invalid_candidate_output", errors: validation.errors.slice() };
  }

  return { status: "reviewed", review };
}

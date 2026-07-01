/**
 * Provider-neutral RFP HLD intake-question candidate-drafting executor BOUNDARY
 * (Stage 6H-0D).
 *
 * The typed seam between the transient Stage 6H-0D drafting-input bundle
 * (src/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input.ts) and a
 * FUTURE injected drafting executor that proposes CANDIDATE HLD intake questions.
 * It drafts nothing itself, makes no provider/network call, reads no DB/store/
 * file/raw source document, touches no route or UI, and persists nothing.
 *
 * The boundary carries exactly ONE drafting input through to the executor - the
 * transient drafting-input bundle - and treats whatever the executor resolves with
 * as CANDIDATE-ONLY and UNTRUSTED. It expects the raw provider output to hold
 * exactly one top-level key, `questions`, and deterministically wraps those into a
 * full rfp_hld_intake_questionnaire payload: this boundary alone stamps the
 * embedded validation self-assessment (status passed, zero findings) and then runs
 * the Stage 6H-0B fail-closed validator. On any validation failure it returns
 * deterministic errors and NEVER echoes the raw provider output. It asserts no
 * design, pricing, SKU, catalog, configuration, or AI authority.
 *
 * The configured factory is a safe null seam: this stage makes NO live OpenAI env,
 * package, or model decision. It imports EXACTLY the drafting-input type and the
 * persisted questionnaire contract - never a provider SDK - and reads no env.
 */
import type { RfpHldIntakeQuestionnaireDraftingInput } from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnairePayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";

/**
 * Everything the injected executor receives: exactly the transient drafting-input
 * bundle, carried through unchanged. No other drafting input is ever added here.
 */
export interface RfpHldIntakeQuestionnaireDraftingExecutorInput {
  draftingInput: RfpHldIntakeQuestionnaireDraftingInput;
}

/**
 * The injected drafting dependency. This module never imports, constructs, or
 * names a real implementation; a future seam wires one in. Its resolved value is
 * an UNKNOWN candidate provider output, expected to hold exactly one top-level
 * key, `questions`; the boundary never trusts it beyond that expectation.
 */
export type RfpHldIntakeQuestionnaireDraftingExecutor = (
  input: RfpHldIntakeQuestionnaireDraftingExecutorInput
) => Promise<unknown>;

/** Input for {@link draftRfpHldIntakeQuestionnaireCandidate}. */
export interface DraftRfpHldIntakeQuestionnaireCandidateInput {
  /** The transient Stage 6H-0D drafting-input bundle to draft from. */
  draftingInput: RfpHldIntakeQuestionnaireDraftingInput;
  /**
   * The injected executor, or null/absent when none is configured. A null/absent
   * executor yields a safe unavailable result and the input is never inspected.
   */
  executor?: RfpHldIntakeQuestionnaireDraftingExecutor | null;
}

/** Discriminated result of {@link draftRfpHldIntakeQuestionnaireCandidate}. */
export type RfpHldIntakeQuestionnaireDraftingResult =
  | { status: "unavailable" }
  | { status: "drafting_failed"; error: "questionnaire_drafting_failed" }
  | { status: "invalid_candidate_output"; errors: string[] }
  | { status: "drafted"; questionnaire: RfpHldIntakeQuestionnairePayload };

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Pull the single `questions` value out of the raw provider output. Fail-closed:
 * the output must be a plain object whose ONLY top-level key is `questions`; any
 * other shape (non-object, missing key, or extra keys such as answers, a raw
 * provider response, an AI-supplied validation, or a pricing/SKU/catalog/config
 * decision) is a deterministic rejection that never echoes the output body.
 */
function extractCandidateQuestions(
  raw: unknown
): { ok: true; questions: unknown } | { ok: false; errors: string[] } {
  const o = asObject(raw);
  if (!o) {
    return { ok: false, errors: ["provider output: must be an object"] };
  }
  const keys = Object.keys(o);
  if (keys.length !== 1 || keys[0] !== "questions") {
    return {
      ok: false,
      errors: ['provider output: must contain exactly the top-level key "questions"'],
    };
  }
  return { ok: true, questions: o.questions };
}

/**
 * Invoke the injected executor with exactly the Stage 6H-0D drafting-input bundle
 * as its only drafting input, then deterministically wrap and validate its
 * candidate questions.
 *
 * - No executor supplied -> `unavailable`, and the drafting input is never read.
 * - Executor throws -> `drafting_failed` with a fixed generic error; thrown
 *   details are never exposed.
 * - Raw output not exactly `{ questions }`, or the wrapped payload fails the
 *   Stage 6H-0B validator -> `invalid_candidate_output` with deterministic errors
 *   only; the raw provider output is never echoed.
 * - Otherwise -> `drafted` with the fully wrapped, validated questionnaire.
 *
 * This boundary alone stamps the embedded validation self-assessment. It performs
 * no pricing/SKU/catalog/configuration decision, no persistence, no DB/store/file
 * access, no raw source reread, no route/UI work, and no provider/network call.
 */
export async function draftRfpHldIntakeQuestionnaireCandidate(
  input: DraftRfpHldIntakeQuestionnaireCandidateInput
): Promise<RfpHldIntakeQuestionnaireDraftingResult> {
  const executor = input.executor;
  if (executor === null || executor === undefined) {
    return { status: "unavailable" };
  }

  let raw: unknown;
  try {
    raw = await executor({ draftingInput: input.draftingInput });
  } catch {
    return { status: "drafting_failed", error: "questionnaire_drafting_failed" };
  }

  const extracted = extractCandidateQuestions(raw);
  if (!extracted.ok) {
    return { status: "invalid_candidate_output", errors: extracted.errors };
  }

  const draftingInput = input.draftingInput;
  const candidate: Record<string, unknown> = {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
    createdBy: draftingInput.createdBy,
    createdAt: draftingInput.createdAt,
    sourceArtifactIds: draftingInput.sourceArtifactIds.slice(),
    questions: extracted.questions,
    validation: {
      status: "passed",
      checkedAt: draftingInput.createdAt,
      findingCount: 0,
      findings: [],
    },
  };

  const check = validateRfpHldIntakeQuestionnairePayload(candidate);
  if (!check.valid) {
    return { status: "invalid_candidate_output", errors: check.errors };
  }

  return {
    status: "drafted",
    questionnaire: candidate as unknown as RfpHldIntakeQuestionnairePayload,
  };
}

/**
 * The configured drafting executor for this stage: intentionally always null.
 *
 * Stage 6H-0D deliberately makes NO live OpenAI env, package, or model decision:
 * there is no provider wiring seam here yet. This function reads no environment,
 * constructs no adapter, and returns null so callers treat HLD intake-question
 * candidate drafting as unavailable until a later explicit env/package/config
 * decision wires a real executor in.
 */
export function getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor(): null {
  return null;
}

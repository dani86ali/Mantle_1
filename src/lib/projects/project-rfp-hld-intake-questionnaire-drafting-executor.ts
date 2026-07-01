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
 * The configured factory is the single environment-reading wiring seam: it reads
 * ONLY the approved OpenAI env vars and wires the fetch-based Responses client into
 * the OpenAI adapter factory when OPENAI_API_KEY is nonblank, else returns null. It
 * imports no provider SDK and makes no network call while constructing; the
 * drafting/validation core below still reads no env and makes no provider call.
 */
import type { RfpHldIntakeQuestionnaireDraftingInput } from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnairePayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";
import { createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor } from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-openai";
import { createOpenAiResponsesClient } from "@/lib/projects/project-rfp-openai-responses-client";

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
 * other shape is a deterministic rejection that never echoes the output body.
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
 * This boundary alone stamps the embedded validation self-assessment and performs
 * no persistence, DB/store/file access, raw reread, route/UI, or provider call.
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
    // Copy the approved catalog by explicit per-field whitelist; never alias input.
    sourceRefs: draftingInput.sourceRefs.map((ref) => ({
      refId: ref.refId,
      artifactId: ref.artifactId,
      artifactType: ref.artifactType,
      stageId: ref.stageId,
      status: ref.status,
      version: ref.version,
      payloadKind: ref.payloadKind,
      label: ref.label,
    })),
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

/** Default OpenAI model when no scoped override is configured. */
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

/** A scoped max-output override; positive integers only, else undefined. */
function parsePositiveIntOverride(raw: string | undefined): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * The configured drafting executor, or null while OPENAI_API_KEY is missing or
 * blank. Single env-reading wiring seam: reads ONLY OPENAI_API_KEY, the scoped
 * model override, and the scoped max-output override. When the key is nonblank it
 * constructs the fetch-based Responses client and wires it into the OpenAI adapter
 * factory (model override applied only when nonblank/trimmed, max-output only when
 * it parses to a positive integer, else the defaults stand). It never invokes the
 * executor or makes a network call while constructing. Callers treat null as "HLD
 * intake-question candidate drafting unavailable".
 */
export function getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor(): RfpHldIntakeQuestionnaireDraftingExecutor | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null;

  const modelOverride =
    process.env.BOMATIC_RFP_HLD_INTAKE_QUESTIONNAIRE_OPENAI_MODEL;
  const model =
    typeof modelOverride === "string" && modelOverride.trim() !== ""
      ? modelOverride.trim()
      : DEFAULT_OPENAI_MODEL;
  const maxOutputTokens = parsePositiveIntOverride(
    process.env.BOMATIC_RFP_HLD_INTAKE_QUESTIONNAIRE_OPENAI_MAX_OUTPUT_TOKENS
  );

  const client = createOpenAiResponsesClient({ apiKey: apiKey.trim() });
  return createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
    model,
    client,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  });
}

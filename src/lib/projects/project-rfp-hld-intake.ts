/**
 * Deterministic RFP HLD intake artifact creation service (Stage 6.2a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Persists ONE reviewable `hld_intake` artifact (status `needs_review`) on the
 * existing `hld_design_delta_review` stage from either a manual engineer override
 * or an SE-reviewed `hld_intake_questionnaire`. This is HLD readiness FOUNDATION,
 * not HLD generation: later HLD work consumes structured answers, never raw RFP
 * documents.
 *
 * AUTHORITY BOUNDARY: manual_override intake records a required human reason and
 * no source artifacts; questionnaire_assisted intake records the exact source
 * questionnaire artifact id and SE review audit block. This service runs no AI and
 * makes no SKU/pricing/catalog/validation/configuration/design decision: it only
 * trims, validates the closed contracts, and writes. It imports project/artifact
 * stores, the questionnaire contract, and canonical project types - no
 * file/evidence store, no fs/path, no pricing/SKU/catalog/config authority, no
 * AI/provider, no route or UI module.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnaireAnswerType,
  type RfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnaireSourceRef,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/** Stable operator intake field ids; the order here is the canonical answer order. */
export type RfpHldIntakeFieldId =
  | "existing_network_context"
  | "target_topology_intent"
  | "site_room_context"
  | "resiliency_expectations"
  | "wan_lan_boundaries"
  | "rack_power_assumptions"
  | "implementation_constraints"
  | "exclusions"
  | "diagram_notes";

/** A catalog field: its stable id and the canonical label persisted with answers. */
export interface RfpHldIntakeField {
  fieldId: RfpHldIntakeFieldId;
  label: string;
}

/**
 * The fixed local intake field catalog. Labels are persisted from HERE, never from
 * caller input, so the artifact carries canonical wording regardless of the request.
 */
export const RFP_HLD_INTAKE_FIELDS: readonly RfpHldIntakeField[] = [
  { fieldId: "existing_network_context", label: "Existing network context" },
  { fieldId: "target_topology_intent", label: "Target topology intent" },
  { fieldId: "site_room_context", label: "Site and room context" },
  { fieldId: "resiliency_expectations", label: "Resiliency expectations" },
  { fieldId: "wan_lan_boundaries", label: "WAN/LAN boundaries" },
  { fieldId: "rack_power_assumptions", label: "Rack and power assumptions" },
  { fieldId: "implementation_constraints", label: "Implementation constraints" },
  { fieldId: "exclusions", label: "Exclusions" },
  { fieldId: "diagram_notes", label: "Diagram notes" },
];

const FIELD_IDS: ReadonlySet<string> = new Set(
  RFP_HLD_INTAKE_FIELDS.map((field) => field.fieldId)
);

/**
 * How the intake answers were sourced. `manual_override` records engineer-entered
 * answers with a required human reason; `questionnaire_assisted` records answers
 * derived from a validated source questionnaire plus SE-reviewed question
 * decisions.
 */
export type RfpHldIntakeSourceMode = "questionnaire_assisted" | "manual_override";

/** Allowed answer dispositions for one intake field. */
export type RfpHldIntakeAnswerStatus = "answered" | "unknown" | "not_applicable";

/** Caller-supplied answer; `label` is ignored in favor of the catalog label. */
export interface RfpHldIntakeAnswerInput {
  fieldId: string;
  status: RfpHldIntakeAnswerStatus;
  value?: string;
  notes?: string;
  label?: string;
}

/**
 * Normalized, persisted answer. `value` is retained only when status=answered.
 * `fieldId` is a catalog field id for manual_override intake, or the reviewed
 * questionnaire question id for questionnaire_assisted intake (hence `string`).
 */
export interface RfpHldIntakeAnswer {
  fieldId: string;
  label: string;
  status: RfpHldIntakeAnswerStatus;
  value?: string;
  notes?: string;
}

/** Allowed SE review dispositions for one source questionnaire question. */
export type RfpHldIntakeReviewAction =
  | "accepted"
  | "edited"
  | "added"
  | "removed"
  | "waived";

/**
 * One SE-reviewed question decision (request input). Active actions
 * (accepted/edited/added) require a unique positive `order`; non-added actions
 * must carry a `sourceQuestionId` from the source questionnaire; `waived`
 * requires a nonblank `waiverReason`.
 */
export interface RfpHldIntakeReviewedQuestionInput {
  questionId: string;
  action: RfpHldIntakeReviewAction;
  sourceQuestionId?: string;
  order?: number;
  questionText: string;
  whyAsked: string;
  answerType: RfpHldIntakeQuestionnaireAnswerType;
  required: boolean;
  sourceRefIds: string[];
  allowedOptions?: string[];
  waiverReason?: string;
}

/** One engineer answer (request input) keyed by the reviewed question id. */
export interface RfpHldIntakeQuestionAnswerInput {
  questionId: string;
  status: RfpHldIntakeAnswerStatus;
  value?: string;
  notes?: string;
}

/** Normalized, persisted reviewed-question record (audit provenance only). */
export interface RfpHldIntakeReviewedQuestion {
  questionId: string;
  action: RfpHldIntakeReviewAction;
  sourceQuestionId?: string;
  order?: number;
  questionText: string;
  whyAsked: string;
  answerType: RfpHldIntakeQuestionnaireAnswerType;
  required: boolean;
  sourceRefIds: string[];
  allowedOptions?: string[];
  waiverReason?: string;
}

/** Per-action tally of the reviewed question set. */
export interface RfpHldIntakeQuestionnaireReviewCounts {
  accepted: number;
  edited: number;
  added: number;
  removed: number;
  waived: number;
  active: number;
}

/** Persisted audit block recording the SE review of the source questionnaire. */
export interface RfpHldIntakeQuestionnaireReview {
  sourceQuestionnaireArtifactId: string;
  sourceQuestionnaireVersion: number;
  questionnairePayloadKind: string;
  reviewedQuestions: RfpHldIntakeReviewedQuestion[];
  /** A copy of the source questionnaire's approved source-ref catalog. */
  sourceRefs: RfpHldIntakeQuestionnaireSourceRef[];
  counts: RfpHldIntakeQuestionnaireReviewCounts;
}

/** Per-status answer tally carried on the payload and the result summary. */
export interface RfpHldIntakeStatusCounts {
  answered: number;
  unknown: number;
  not_applicable: number;
}

/** Stable discriminator for the persisted `hld_intake` payload. */
export const RFP_HLD_INTAKE_PAYLOAD_KIND = "rfp_hld_intake" as const;

type RfpHldIntakePayloadBase = {
  payloadKind: typeof RFP_HLD_INTAKE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  answers: RfpHldIntakeAnswer[];
  answerCount: number;
  statusCounts: RfpHldIntakeStatusCounts;
};

/** Manual override intake source contract. */
export type RfpHldIntakeManualOverridePayload = RfpHldIntakePayloadBase & {
  sourceMode: "manual_override";
  manualOverrideReason: string;
  sourceQuestionnaireArtifactId?: never;
};

/** Questionnaire-assisted intake source contract (Stage 6H-0E-B). */
export type RfpHldIntakeQuestionnaireAssistedPayload = RfpHldIntakePayloadBase & {
  sourceMode: "questionnaire_assisted";
  sourceQuestionnaireArtifactId: string;
  questionnaireReview: RfpHldIntakeQuestionnaireReview;
  manualOverrideReason?: never;
};

/**
 * The persisted `hld_intake` payload (full answers live here, not in the result).
 * Exported for type-only consumers (inspection/approval); it is an object type
 * alias (not an interface) so it stays assignable to Record<string, unknown> for
 * the artifact store's payload parameter.
 */
export type RfpHldIntakePayload =
  | RfpHldIntakeManualOverridePayload
  | RfpHldIntakeQuestionnaireAssistedPayload;

/** Input for {@link createRfpHldIntakeDraft}. */
export interface CreateRfpHldIntakeDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  answers: readonly RfpHldIntakeAnswerInput[];
  /**
   * Required human reason for the manual override intake path. This sub-stage
   * only produces manual_override intake; the reason is trimmed and must be
   * nonblank. Questionnaire-assisted creation arrives in Stage 6H-0E-B.
   */
  manualOverrideReason: string;
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Input for {@link createRfpHldIntakeFromQuestionnaireDraft}. */
export interface CreateRfpHldIntakeFromQuestionnaireDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** The exact source `hld_intake_questionnaire` artifact under review. */
  sourceQuestionnaireArtifactId: string;
  /** SE review decisions over the source questions (candidate review input). */
  reviewedQuestions: readonly RfpHldIntakeReviewedQuestionInput[];
  /** Engineer answers, one per active reviewed question. */
  answers: readonly RfpHldIntakeQuestionAnswerInput[];
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpHldIntakeProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied (empty) source arrays, no payload. */
export interface RfpHldIntakeArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary: provenance and counts only, never the full answer values. */
export interface RfpHldIntakePayloadSummary {
  payloadKind: typeof RFP_HLD_INTAKE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceMode: RfpHldIntakeSourceMode;
  /** Present only for questionnaire_assisted intake. */
  sourceQuestionnaireArtifactId?: string;
  answerCount: number;
  statusCounts: RfpHldIntakeStatusCounts;
  fieldIds: string[];
}

/** Discriminated result of {@link createRfpHldIntakeDraft}. */
export type CreateRfpHldIntakeDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeProjectSummary }
  | {
      status: "ok";
      artifact: RfpHldIntakeArtifactSummary;
      payloadSummary: RfpHldIntakePayloadSummary;
    };

/** Discriminated result of {@link createRfpHldIntakeFromQuestionnaireDraft}. */
export type CreateRfpHldIntakeFromQuestionnaireDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeProjectSummary }
  /** The named source questionnaire artifact does not exist for this project. */
  | { status: "source_not_found" }
  /** Wrong type/stage, or a source status outside needs_review/approved. */
  | { status: "source_not_usable" }
  /** The source questionnaire payload fails the questionnaire contract. */
  | { status: "invalid_source_payload" }
  | {
      status: "ok";
      artifact: RfpHldIntakeArtifactSummary;
      payloadSummary: RfpHldIntakePayloadSummary;
    };

/**
 * A known request-derived validation failure. The HLD intake route maps this (and
 * only this) to HTTP 400; unexpected errors (e.g. a store failure) bubble to a
 * controlled 500. Use {@link isRfpHldIntakeValidationError} to detect it without a
 * cross-module instanceof hazard.
 */
export class RfpHldIntakeValidationError extends Error {
  readonly isRfpHldIntakeValidationError = true as const;
  constructor(message: string) {
    super(message);
    this.name = "RfpHldIntakeValidationError";
  }
}

/** Predicate for the request-derived validation error (instanceof-safe). */
export function isRfpHldIntakeValidationError(
  error: unknown
): error is RfpHldIntakeValidationError {
  return (
    error instanceof RfpHldIntakeValidationError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { isRfpHldIntakeValidationError?: unknown })
        .isRfpHldIntakeValidationError === true)
  );
}

function fail(message: string): never {
  throw new RfpHldIntakeValidationError(message);
}

/** Trim a value to a string, or "" when it is not a string. */
function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate and normalize the answer set against the local catalog: require every
 * catalog field exactly once, rejecting missing, duplicate, or unknown field ids.
 * Throws before any store call on a malformed set.
 */
function normalizeAnswers(rawAnswers: unknown): RfpHldIntakeAnswer[] {
  if (!Array.isArray(rawAnswers)) {
    fail("HLD intake answers must be an array.");
  }
  const byFieldId = new Map<string, Record<string, unknown>>();
  for (const raw of rawAnswers) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      fail("Each HLD intake answer must be an object.");
    }
    const record = raw as Record<string, unknown>;
    const fieldId = record.fieldId;
    if (typeof fieldId !== "string" || !FIELD_IDS.has(fieldId)) {
      fail(`Unknown HLD intake field id: ${String(fieldId)}.`);
    }
    if (byFieldId.has(fieldId)) {
      fail(`Duplicate HLD intake answer for field id: ${fieldId}.`);
    }
    byFieldId.set(fieldId, record);
  }
  return RFP_HLD_INTAKE_FIELDS.map((field) => {
    const record = byFieldId.get(field.fieldId);
    if (record === undefined) {
      fail(`Missing HLD intake answer for field id: ${field.fieldId}.`);
    }
    return normalizeAnswer(field, record);
  });
}

/** Normalize one answer: enforce status, trim value/notes, persist the catalog label. */
function normalizeAnswer(
  field: RfpHldIntakeField,
  record: Record<string, unknown>
): RfpHldIntakeAnswer {
  const status = record.status;
  if (status !== "answered" && status !== "unknown" && status !== "not_applicable") {
    fail(`Invalid HLD intake answer status for field id: ${field.fieldId}.`);
  }
  // Canonical label from the local catalog; the caller-supplied label is ignored.
  const answer: RfpHldIntakeAnswer = {
    fieldId: field.fieldId,
    label: field.label,
    status,
  };
  if (status === "answered") {
    const value = asTrimmed(record.value);
    if (value === "") {
      fail(`Answered HLD intake field requires a value: ${field.fieldId}.`);
    }
    answer.value = value;
  }
  // unknown / not_applicable drop any value; notes are optional and retained when nonblank.
  const notes = asTrimmed(record.notes);
  if (notes !== "") {
    answer.notes = notes;
  }
  return answer;
}

/** Tally answers by status. */
function countStatuses(answers: readonly RfpHldIntakeAnswer[]): RfpHldIntakeStatusCounts {
  const counts: RfpHldIntakeStatusCounts = { answered: 0, unknown: 0, not_applicable: 0 };
  for (const answer of answers) {
    counts[answer.status]++;
  }
  return counts;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpHldIntakeProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(artifact: ProjectArtifact): RfpHldIntakeArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Project the payload to a lean summary: counts and field ids, never answer values. */
function toPayloadSummary(payload: RfpHldIntakePayload): RfpHldIntakePayloadSummary {
  return {
    payloadKind: payload.payloadKind,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    sourceMode: payload.sourceMode,
    ...(payload.sourceMode === "questionnaire_assisted"
      ? { sourceQuestionnaireArtifactId: payload.sourceQuestionnaireArtifactId }
      : {}),
    answerCount: payload.answerCount,
    statusCounts: { ...payload.statusCounts },
    fieldIds: payload.answers.map((answer) => answer.fieldId),
  };
}

/**
 * Create ONE `needs_review` `hld_intake` artifact on `hld_design_delta_review` from
 * validated engineer intake answers. Blank identifiers and malformed answer sets are
 * rejected BEFORE any store call. The project is verified within its tenant
 * (not_found / wrong_mode, lean summary that never leaks tenantId) before the single
 * write. The created artifact carries empty source arrays (engineer-authored context).
 * Returns lean summaries only; the full answer values stay in the persisted payload.
 */
export async function createRfpHldIntakeDraft(
  input: CreateRfpHldIntakeDraftInput
): Promise<CreateRfpHldIntakeDraftResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  if (projectId === "") fail("HLD intake requires a projectId.");
  if (createdBy === "") fail("HLD intake requires a createdBy.");

  // Manual override intake requires an explicit, nonblank human reason. Validated
  // before any store call, alongside the other request-derived scalar checks.
  const manualOverrideReason = asTrimmed(input.manualOverrideReason);
  if (manualOverrideReason === "") {
    fail("HLD intake manual override requires a manualOverrideReason.");
  }

  // Validate the catalog answer set before touching any store.
  const answers = normalizeAnswers(input.answers);

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload: RfpHldIntakePayload = {
    payloadKind: RFP_HLD_INTAKE_PAYLOAD_KIND,
    createdBy,
    createdAt,
    sourceMode: "manual_override",
    manualOverrideReason,
    answers,
    answerCount: answers.length,
    statusCounts: countStatuses(answers),
  };

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
    status: "needs_review",
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}

// ---------------------------------------------------------------------------
// Questionnaire-assisted intake (Stage 6H-0E-B)
// ---------------------------------------------------------------------------

const HLD_INTAKE_QUESTIONNAIRE_TYPE: ProjectArtifactType =
  "hld_intake_questionnaire";
const HLD_INTAKE_STAGE: ProjectStageId = "hld_design_delta_review";
/** A source questionnaire is usable input only in these reviewable statuses. */
const USABLE_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  "needs_review",
  "approved",
]);

const REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  "accepted",
  "edited",
  "added",
  "removed",
  "waived",
]);
/** accepted/edited/added produce an active question that requires an answer. */
const ACTIVE_REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  "accepted",
  "edited",
  "added",
]);
const QUESTIONNAIRE_ANSWER_TYPES: ReadonlySet<string> = new Set([
  "free_text",
  "single_select",
  "multi_select",
  "boolean",
  "number",
]);
const SELECT_ANSWER_TYPES: ReadonlySet<string> = new Set([
  "single_select",
  "multi_select",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) &&
    record[key] !== undefined;
}

/** Validate a required array of unique nonblank trimmed strings. */
function normalizeStringArray(
  raw: unknown,
  label: string,
  allowEmpty: boolean
): string[] {
  if (!Array.isArray(raw)) fail(`${label} must be an array.`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const trimmed = asTrimmed(item);
    if (trimmed === "") fail(`${label} entries must be nonblank strings.`);
    if (seen.has(trimmed)) fail(`${label} entries must be unique.`);
    seen.add(trimmed);
    out.push(trimmed);
  }
  if (!allowEmpty && out.length === 0) fail(`${label} must not be empty.`);
  return out;
}

/**
 * Deterministically validate and normalize the SE review decisions against the
 * source question id set. Throws (via {@link fail}) before any write on any
 * malformed decision, duplicate/unknown/missing source id, or coverage gap.
 */
function normalizeReviewedQuestions(
  raw: unknown,
  sourceQuestions: ReadonlyMap<string, ReadonlySet<string>>,
  catalogRefIds: ReadonlySet<string>
): {
  reviewed: RfpHldIntakeReviewedQuestion[];
  counts: RfpHldIntakeQuestionnaireReviewCounts;
} {
  if (!Array.isArray(raw)) fail("reviewedQuestions must be an array.");
  if (raw.length === 0) fail("reviewedQuestions must not be empty.");

  const seenQuestionIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const activeOrders = new Set<number>();
  const counts: RfpHldIntakeQuestionnaireReviewCounts = {
    accepted: 0,
    edited: 0,
    added: 0,
    removed: 0,
    waived: 0,
    active: 0,
  };
  const reviewed: RfpHldIntakeReviewedQuestion[] = [];

  for (const rawItem of raw) {
    if (!isPlainObject(rawItem)) {
      fail("Each reviewed question must be an object.");
    }
    const record = rawItem;

    const questionId = asTrimmed(record.questionId);
    if (questionId === "") fail("Reviewed question requires a questionId.");
    if (seenQuestionIds.has(questionId)) {
      fail(`Duplicate reviewed questionId: ${questionId}.`);
    }
    seenQuestionIds.add(questionId);

    const action = record.action;
    if (typeof action !== "string" || !REVIEW_ACTIONS.has(action)) {
      fail(`Invalid review action for question: ${questionId}.`);
    }
    const reviewAction = action as RfpHldIntakeReviewAction;

    const questionText = asTrimmed(record.questionText);
    if (questionText === "") {
      fail(`Reviewed question requires questionText: ${questionId}.`);
    }
    const whyAsked = asTrimmed(record.whyAsked);
    if (whyAsked === "") {
      fail(`Reviewed question requires whyAsked: ${questionId}.`);
    }

    const answerType = record.answerType;
    if (
      typeof answerType !== "string" ||
      !QUESTIONNAIRE_ANSWER_TYPES.has(answerType)
    ) {
      fail(`Invalid answerType for reviewed question: ${questionId}.`);
    }
    const required = record.required;
    if (typeof required !== "boolean") {
      fail(`Reviewed question requires a boolean required: ${questionId}.`);
    }

    const isAdded = reviewAction === "added";
    let sourceQuestionId: string | undefined;
    if (isAdded) {
      if (hasOwn(record, "sourceQuestionId")) {
        fail(`Added reviewed question must not carry a sourceQuestionId: ${questionId}.`);
      }
    } else {
      sourceQuestionId = asTrimmed(record.sourceQuestionId);
      if (sourceQuestionId === "") {
        fail(`Reviewed question requires a sourceQuestionId: ${questionId}.`);
      }
      if (!sourceQuestions.has(sourceQuestionId)) {
        fail(`Unknown sourceQuestionId: ${sourceQuestionId}.`);
      }
      if (seenSourceIds.has(sourceQuestionId)) {
        fail(`Duplicate sourceQuestionId review: ${sourceQuestionId}.`);
      }
      seenSourceIds.add(sourceQuestionId);
    }

    // Non-added questions require nonempty provenance; added may be empty.
    const sourceRefIds = normalizeStringArray(
      record.sourceRefIds,
      `Reviewed question ${questionId} sourceRefIds`,
      isAdded
    );

    // Provenance guard: non-added questions must preserve the EXACT source
    // provenance id set (blocks browser tampering); added questions may cite
    // nothing, but any supplied ref must resolve to the source catalog.
    if (isAdded) {
      for (const rid of sourceRefIds) {
        if (!catalogRefIds.has(rid)) {
          fail(`Added reviewed question ${questionId} cites an unknown sourceRefId: ${rid}.`);
        }
      }
    } else {
      const expected = sourceQuestions.get(sourceQuestionId as string);
      const matches =
        expected !== undefined &&
        sourceRefIds.length === expected.size &&
        sourceRefIds.every((rid) => expected.has(rid));
      if (!matches) {
        fail(`Reviewed question ${questionId} sourceRefIds must match the source question provenance.`);
      }
    }

    const isSelect = SELECT_ANSWER_TYPES.has(answerType);
    let allowedOptions: string[] | undefined;
    if (isSelect) {
      allowedOptions = normalizeStringArray(
        record.allowedOptions,
        `Reviewed question ${questionId} allowedOptions`,
        false
      );
    } else if (hasOwn(record, "allowedOptions")) {
      fail(`allowedOptions is only valid for select answer types: ${questionId}.`);
    }

    const isActive = ACTIVE_REVIEW_ACTIONS.has(reviewAction);
    let order: number | undefined;
    let waiverReason: string | undefined;
    if (isActive) {
      const rawOrder = record.order;
      if (
        typeof rawOrder !== "number" ||
        !Number.isInteger(rawOrder) ||
        rawOrder < 1
      ) {
        fail(`Active reviewed question requires a positive integer order: ${questionId}.`);
      }
      if (activeOrders.has(rawOrder)) {
        fail(`Duplicate reviewed question order: ${rawOrder}.`);
      }
      activeOrders.add(rawOrder);
      order = rawOrder;
      if (hasOwn(record, "waiverReason")) {
        fail(`Only waived questions may carry a waiverReason: ${questionId}.`);
      }
    } else {
      if (hasOwn(record, "order")) {
        fail(`Removed/waived questions must not carry an order: ${questionId}.`);
      }
      if (reviewAction === "waived") {
        waiverReason = asTrimmed(record.waiverReason);
        if (waiverReason === "") {
          fail(`Waived question requires a waiverReason: ${questionId}.`);
        }
      } else if (hasOwn(record, "waiverReason")) {
        fail(`Only waived questions may carry a waiverReason: ${questionId}.`);
      }
    }

    counts[reviewAction] += 1;
    if (isActive) counts.active += 1;

    reviewed.push({
      questionId,
      action: reviewAction,
      ...(sourceQuestionId !== undefined ? { sourceQuestionId } : {}),
      ...(order !== undefined ? { order } : {}),
      questionText,
      whyAsked,
      answerType: answerType as RfpHldIntakeQuestionnaireAnswerType,
      required,
      sourceRefIds,
      ...(allowedOptions !== undefined ? { allowedOptions } : {}),
      ...(waiverReason !== undefined ? { waiverReason } : {}),
    });
  }

  // Every original source question must be represented exactly once.
  if (seenSourceIds.size !== sourceQuestions.size) {
    fail("Every source question must be reviewed exactly once.");
  }
  if (counts.active === 0) {
    fail("Questionnaire-assisted HLD intake requires at least one active reviewed question.");
  }

  return { reviewed, counts };
}

/**
 * Validate and normalize the engineer answers: exactly one per active reviewed
 * question, keyed by the reviewed question id, and no answer for a removed/waived
 * question. Persisted answers reuse the catalog answer shape (`fieldId` = the
 * reviewed question id, `label` = the reviewed question text).
 */
function normalizeQuestionnaireAnswers(
  raw: unknown,
  activeQuestions: readonly RfpHldIntakeReviewedQuestion[]
): RfpHldIntakeAnswer[] {
  if (!Array.isArray(raw)) fail("answers must be an array.");
  const activeById = new Map(activeQuestions.map((q) => [q.questionId, q]));
  const byQuestionId = new Map<string, Record<string, unknown>>();

  for (const rawItem of raw) {
    if (!isPlainObject(rawItem)) fail("Each answer must be an object.");
    const record = rawItem;
    const questionId = asTrimmed(record.questionId);
    if (questionId === "") fail("Answer requires a questionId.");
    if (!activeById.has(questionId)) {
      fail(`Answer for an unknown or inactive question: ${questionId}.`);
    }
    if (byQuestionId.has(questionId)) {
      fail(`Duplicate answer for question: ${questionId}.`);
    }
    byQuestionId.set(questionId, record);
  }

  return activeQuestions.map((question) => {
    const record = byQuestionId.get(question.questionId);
    if (record === undefined) {
      fail(`Missing answer for active question: ${question.questionId}.`);
    }
    return normalizeQuestionAnswer(question, record);
  });
}

/** Normalize one questionnaire answer; drops values for unknown/not_applicable. */
function normalizeQuestionAnswer(
  question: RfpHldIntakeReviewedQuestion,
  record: Record<string, unknown>
): RfpHldIntakeAnswer {
  const status = record.status;
  if (status !== "answered" && status !== "unknown" && status !== "not_applicable") {
    fail(`Invalid answer status for question: ${question.questionId}.`);
  }
  const answer: RfpHldIntakeAnswer = {
    fieldId: question.questionId,
    label: question.questionText,
    status,
  };
  if (status === "answered") {
    const value = asTrimmed(record.value);
    if (value === "") {
      fail(`Answered question requires a value: ${question.questionId}.`);
    }
    answer.value = value;
  }
  const notes = asTrimmed(record.notes);
  if (notes !== "") answer.notes = notes;
  return answer;
}

/**
 * Create ONE `needs_review` `hld_intake` artifact from a validated source
 * `hld_intake_questionnaire`, SE-reviewed question decisions, and engineer
 * answers. The source questionnaire is CANDIDATE review input, not authority: the
 * created intake is still `needs_review` and only becomes readiness input
 * authority when the existing HLD intake approval route approves it. The service
 * stamps `sourceMode: "questionnaire_assisted"` itself; a caller can never supply
 * it. Gates in order: project existence/rfp mode, exact source artifact
 * existence, source type/stage/status, source payload validity; then it validates
 * the review decisions and answers deterministically BEFORE the single write. The
 * created artifact carries sourceArtifactIds exactly `[sourceQuestionnaireArtifactId]`.
 */
export async function createRfpHldIntakeFromQuestionnaireDraft(
  input: CreateRfpHldIntakeFromQuestionnaireDraftInput
): Promise<CreateRfpHldIntakeFromQuestionnaireDraftResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  const sourceQuestionnaireArtifactId = asTrimmed(
    input.sourceQuestionnaireArtifactId
  );
  if (projectId === "") fail("HLD intake requires a projectId.");
  if (createdBy === "") fail("HLD intake requires a createdBy.");
  if (sourceQuestionnaireArtifactId === "") {
    fail("Questionnaire-assisted HLD intake requires a sourceQuestionnaireArtifactId.");
  }

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const source = await getProjectArtifactById(
    input.tenantId,
    projectId,
    sourceQuestionnaireArtifactId
  );
  if (source === null) return { status: "source_not_found" };
  if (
    source.type !== HLD_INTAKE_QUESTIONNAIRE_TYPE ||
    source.stageId !== HLD_INTAKE_STAGE ||
    !USABLE_SOURCE_STATUSES.has(source.status)
  ) {
    return { status: "source_not_usable" };
  }
  if (!validateRfpHldIntakeQuestionnairePayload(source.payload).valid) {
    return { status: "invalid_source_payload" };
  }

  const sourcePayload = source.payload as unknown as RfpHldIntakeQuestionnairePayload;
  // The source questionnaire's questions and sourceRefs are the ONLY provenance
  // catalog: each source question maps to its exact source-ref id set, and every
  // reviewed ref must resolve to the approved catalog.
  const sourceQuestions = new Map<string, ReadonlySet<string>>(
    sourcePayload.questions.map((question) => [
      question.questionId,
      new Set(question.sourceRefIds),
    ])
  );
  const catalogRefIds = new Set(sourcePayload.sourceRefs.map((ref) => ref.refId));

  // Request-derived validation (throws RfpHldIntakeValidationError -> 400).
  const { reviewed, counts } = normalizeReviewedQuestions(
    input.reviewedQuestions,
    sourceQuestions,
    catalogRefIds
  );
  const activeQuestions = reviewed
    .filter((question) => ACTIVE_REVIEW_ACTIONS.has(question.action))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const answers = normalizeQuestionnaireAnswers(input.answers, activeQuestions);

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload: RfpHldIntakeQuestionnaireAssistedPayload = {
    payloadKind: RFP_HLD_INTAKE_PAYLOAD_KIND,
    createdBy,
    createdAt,
    sourceMode: "questionnaire_assisted",
    sourceQuestionnaireArtifactId,
    questionnaireReview: {
      sourceQuestionnaireArtifactId,
      sourceQuestionnaireVersion: source.version,
      questionnairePayloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
      reviewedQuestions: reviewed,
      // Persist a copy of the approved catalog by explicit per-field whitelist.
      sourceRefs: sourcePayload.sourceRefs.map((ref) => ({
        refId: ref.refId,
        artifactId: ref.artifactId,
        artifactType: ref.artifactType,
        stageId: ref.stageId,
        status: ref.status,
        version: ref.version,
        payloadKind: ref.payloadKind,
        label: ref.label,
      })),
      counts,
    },
    answers,
    answerCount: answers.length,
    statusCounts: countStatuses(answers),
  };

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
    status: "needs_review",
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [sourceQuestionnaireArtifactId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}

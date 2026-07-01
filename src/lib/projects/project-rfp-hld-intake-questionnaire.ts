/**
 * Pure, deterministic RFP HLD intake-questionnaire CONTRACT (Stage 6H-0B).
 * Source of truth: the MVP canonical project state and active HLD agentic
 * authority-chain roadmap (Stage 6 HLD readiness).
 *
 * Persisted shape + fail-closed validator for the `hld_intake_questionnaire`
 * artifact: a CANDIDATE / review-only set of design-intake questions an engineer
 * reviews before answering the approved `hld_intake`. It carries ONLY the
 * questions to ask (text, rationale, answer type, provenance references) - never
 * engineer answers, default design decisions, or any SKU/pricing/catalog/
 * configuration decision, raw source text, provider prompt/completion/response,
 * certification or final-authority claim, or rendered/customer-facing output. The
 * questionnaire feeds `hld_intake` through a single staleness edge; answering and
 * approval are a later stage (6H-0E).
 *
 * Contract-only: no DB/store, no fs/path, no route, no React, no AI/provider, no
 * catalog/pricing/SKU/config service. It imports EXACTLY the canonical HLD
 * design-domain definitions/type - nothing else - and makes no runtime authority
 * decision. Domains reuse the canonical HLD design-domain vocabulary so the whole
 * HLD chain speaks one domain language.
 */
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";

/** Stable discriminator for the persisted `hld_intake_questionnaire` payload. */
export const RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND =
  "rfp_hld_intake_questionnaire" as const;

/** Allowed answer shapes a candidate question may request. */
export type RfpHldIntakeQuestionnaireAnswerType =
  | "free_text"
  | "single_select"
  | "multi_select"
  | "boolean"
  | "number";

/** Deterministic status carried by the embedded self-assessment. */
export type RfpHldIntakeQuestionnaireValidationStatus = "passed" | "failed";

/** Severity buckets for embedded validation findings. */
export type RfpHldIntakeQuestionnaireFindingSeverity =
  | "info"
  | "warning"
  | "blocker";

/** One candidate design-intake question (review-only; never an answer). */
export interface RfpHldIntakeQuestionnaireQuestion {
  questionId: string;
  /** Positive integer presentation order; unique across the questionnaire. */
  order: number;
  domain: RfpHldDesignDomain;
  questionText: string;
  whyAsked: string;
  answerType: RfpHldIntakeQuestionnaireAnswerType;
  required: boolean;
  sourceRefIds: string[];
  /** Only for single_select / multi_select; forbidden for other answer types. */
  allowedOptions?: string[];
  /** Optional approved-input references this question depends on. */
  requiredInputIds?: string[];
}

/**
 * A closed provenance reference persisted in the questionnaire catalog. It proves
 * the approved source chain (artifact id + type + stage + status + version + payload
 * kind) without carrying any raw body, file path, storage handle, or authority
 * decision. Shape-compatible with the transient drafting-input source refs.
 */
export interface RfpHldIntakeQuestionnaireSourceRef {
  refId: string;
  artifactId: string;
  artifactType: string;
  stageId: string;
  status: "approved";
  version: number;
  payloadKind: string;
  label: string;
}

/** A structured embedded validation finding (no raw/provider/authority content). */
export interface RfpHldIntakeQuestionnaireFinding {
  id: string;
  code: string;
  message: string;
  severity: RfpHldIntakeQuestionnaireFindingSeverity;
}

/** Embedded deterministic self-assessment of the candidate questionnaire. */
export interface RfpHldIntakeQuestionnaireValidationSummary {
  status: RfpHldIntakeQuestionnaireValidationStatus;
  checkedAt: string;
  findingCount: number;
  findings: RfpHldIntakeQuestionnaireFinding[];
}

/** The persisted `hld_intake_questionnaire` payload (candidate / review only). */
export interface RfpHldIntakeQuestionnairePayload {
  payloadKind: typeof RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceArtifactIds: string[];
  /** Closed catalog of approved source refs every question sourceRefId resolves to. */
  sourceRefs: RfpHldIntakeQuestionnaireSourceRef[];
  questions: RfpHldIntakeQuestionnaireQuestion[];
  validation: RfpHldIntakeQuestionnaireValidationSummary;
}

/** Structured outcome of {@link validateRfpHldIntakeQuestionnairePayload}. */
export interface RfpHldIntakeQuestionnaireValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

const ANSWER_TYPES: ReadonlySet<string> = new Set([
  "free_text", "single_select", "multi_select", "boolean", "number",
]);

const SELECT_ANSWER_TYPES: ReadonlySet<string> = new Set([
  "single_select", "multi_select",
]);

const FINDING_SEVERITIES: ReadonlySet<string> = new Set([
  "info", "warning", "blocker",
]);

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const TOP_LEVEL_KEYS: readonly string[] = [
  "payloadKind", "createdBy", "createdAt", "sourceArtifactIds", "sourceRefs",
  "questions", "validation",
];
const SOURCE_REF_KEYS: readonly string[] = [
  "refId", "artifactId", "artifactType", "stageId", "status", "version",
  "payloadKind", "label",
];
const SOURCE_REF_STRING_KEYS: readonly string[] = [
  "refId", "artifactId", "artifactType", "stageId", "payloadKind", "label",
];
const QUESTION_REQUIRED: readonly string[] = [
  "questionId", "order", "domain", "questionText", "whyAsked", "answerType",
  "required", "sourceRefIds",
];
const QUESTION_OPTIONAL: readonly string[] = ["allowedOptions", "requiredInputIds"];
const VALIDATION_KEYS: readonly string[] = [
  "status", "checkedAt", "findingCount", "findings",
];
const FINDING_KEYS: readonly string[] = ["id", "code", "message", "severity"];

/**
 * Authority / provider / raw-source leakage keys that may NEVER appear anywhere in
 * a candidate questionnaire (scanned recursively, EXACT key match so legitimate
 * keys such as `answerType` are unaffected). The questionnaire holds QUESTIONS
 * only: no answers, no design/pricing/SKU/catalog/configuration decisions, no
 * provider prompt/completion/reasoning, and no file/storage handles.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "answers", "answer", "engineerAnswer", "engineerAnswers", "answerValue",
  "defaultDecision", "defaultDesign", "defaultDesignDecision",
  "pricing", "price", "unitPrice", "totalPrice",
  "sku", "acceptedSku", "replacementSku", "skuReplacement",
  "catalogDecision", "catalogLookup", "configurationDecision",
  "providerResponse", "rawResponse", "providerPrompt", "prompt",
  "completion", "providerCompletion", "reasoning", "hiddenReasoning",
  "chainOfThought", "rawText", "documentText", "filePath", "storagePath",
  "storageKey",
]);

/**
 * Rendered-output / certification / final-deliverable markers that may NEVER
 * appear in any string VALUE (scanned recursively). Keeps the candidate clear of
 * draw.io / HTML / SVG / XML / Mermaid output, technical-proposal / export-package
 * deliverable text, and any Cisco/CVD/BOMATIC/AI certification or final-authority
 * claim.
 */
const FORBIDDEN_VALUE_RE =
  /```|graph TD|flowchart|sequenceDiagram|<mxfile|<html|<body|<svg|<\?xml|technical proposal|export package|final authority|\b(?:cisco|cvd|bomatic|ai)[-\s]?certif/i;

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

function isIsoUtc(v: unknown): v is string {
  return typeof v === "string" && ISO_UTC_RE.test(v) && Number.isFinite(Date.parse(v));
}

function hasDups(arr: readonly string[]): boolean {
  return new Set(arr).size !== arr.length;
}

/** Reject unexpected and missing keys against an exact allowed set. */
function checkKeys(
  errors: string[], label: string, obj: Record<string, unknown>,
  required: readonly string[], optional: readonly string[] = []
): void {
  for (const k of Object.keys(obj)) {
    if (!required.includes(k) && !optional.includes(k)) {
      errors.push(`${label}: unexpected key "${k}"`);
    }
  }
  for (const k of required) {
    if (!(k in obj)) errors.push(`${label}: missing key "${k}"`);
  }
}

/** Recursively reject any forbidden authority/provider/raw key (exact match). */
function scanForbiddenKeys(errors: string[], label: string, value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanForbiddenKeys(errors, `${label}[${i}]`, item));
  } else {
    const o = asObject(value);
    if (o) {
      for (const k of Object.keys(o)) {
        if (FORBIDDEN_KEYS.has(k)) errors.push(`${label}: forbidden key "${k}"`);
        else scanForbiddenKeys(errors, `${label}.${k}`, o[k]);
      }
    }
  }
}

/** Recursively reject any string value carrying rendered/cert/final-output content. */
function scanForbiddenStrings(errors: string[], label: string, value: unknown): void {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE_RE.test(value)) {
      errors.push(`${label}: forbidden authority/output content`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanForbiddenStrings(errors, `${label}[${i}]`, item));
  } else {
    const o = asObject(value);
    if (o) {
      for (const [k, v] of Object.entries(o)) {
        scanForbiddenStrings(errors, `${label}.${k}`, v);
      }
    }
  }
}

/** Validate an array of unique nonblank strings, optionally requiring nonempty. */
function validateStringArray(
  errors: string[], label: string, raw: unknown, requireNonEmpty: boolean
): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  if (requireNonEmpty && raw.length === 0) errors.push(`${label}: must not be empty`);
  const seen = new Set<string>();
  raw.forEach((v, i) => {
    if (!isNonBlank(v)) { errors.push(`${label}[${i}]: must be a nonblank string`); return; }
    if (seen.has(v)) errors.push(`${label}: duplicate "${v}"`);
    seen.add(v);
  });
}

function validateQuestion(
  errors: string[], label: string, raw: unknown
): { questionId: string | null; order: number | null } {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return { questionId: null, order: null };
  }
  checkKeys(errors, label, o, QUESTION_REQUIRED, QUESTION_OPTIONAL);

  if (!isNonBlank(o.questionId)) errors.push(`${label}: blank questionId`);
  const orderOk = isPositiveInteger(o.order);
  if (!orderOk) errors.push(`${label}: order must be a positive integer`);
  if (typeof o.domain !== "string" || !KNOWN_DOMAINS.has(o.domain)) {
    errors.push(`${label}: invalid domain`);
  }
  if (!isNonBlank(o.questionText)) errors.push(`${label}: blank questionText`);
  if (!isNonBlank(o.whyAsked)) errors.push(`${label}: blank whyAsked`);
  const answerType = o.answerType;
  if (typeof answerType !== "string" || !ANSWER_TYPES.has(answerType)) {
    errors.push(`${label}: invalid answerType`);
  }
  if (typeof o.required !== "boolean") errors.push(`${label}: required must be a boolean`);

  validateStringArray(errors, `${label}.sourceRefIds`, o.sourceRefIds, true);

  // allowedOptions: required & nonempty for select types; forbidden otherwise.
  const isSelect = typeof answerType === "string" && SELECT_ANSWER_TYPES.has(answerType);
  if (isSelect) {
    if (!("allowedOptions" in o)) {
      errors.push(`${label}: allowedOptions is required for select answer types`);
    } else {
      validateStringArray(errors, `${label}.allowedOptions`, o.allowedOptions, true);
    }
  } else if ("allowedOptions" in o) {
    errors.push(`${label}: allowedOptions is only valid for select answer types`);
  }

  if ("requiredInputIds" in o) {
    validateStringArray(errors, `${label}.requiredInputIds`, o.requiredInputIds, true);
  }

  return {
    questionId: isNonBlank(o.questionId) ? o.questionId : null,
    order: orderOk ? (o.order as number) : null,
  };
}

/** Validate one closed source ref; returns its refId/artifactId when nonblank. */
function validateSourceRef(
  errors: string[], label: string, raw: unknown
): { refId: string | null; artifactId: string | null } {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return { refId: null, artifactId: null };
  }
  checkKeys(errors, label, o, SOURCE_REF_KEYS);
  for (const f of SOURCE_REF_STRING_KEYS) {
    if (!isNonBlank(o[f])) errors.push(`${label}: blank ${f}`);
  }
  if (o.status !== "approved") errors.push(`${label}: status must be "approved"`);
  if (!isPositiveInteger(o.version)) {
    errors.push(`${label}: version must be a positive integer`);
  }
  return {
    refId: isNonBlank(o.refId) ? o.refId : null,
    artifactId: isNonBlank(o.artifactId) ? o.artifactId : null,
  };
}

function validateFinding(errors: string[], label: string, raw: unknown): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, FINDING_KEYS);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.code)) errors.push(`${label}: blank code`);
  if (!isNonBlank(o.message)) errors.push(`${label}: blank message`);
  if (typeof o.severity !== "string" || !FINDING_SEVERITIES.has(o.severity)) {
    errors.push(`${label}: invalid severity`);
  }
  return isNonBlank(o.id) ? o.id : null;
}

function validateValidationSummary(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return; }
  checkKeys(errors, label, o, VALIDATION_KEYS);
  if (o.status !== "passed" && o.status !== "failed") errors.push(`${label}: invalid status`);
  if (!isIsoUtc(o.checkedAt)) errors.push(`${label}: checkedAt is not ISO UTC`);

  let findingsLen = -1;
  const findingIds: string[] = [];
  if (!Array.isArray(o.findings)) {
    errors.push(`${label}.findings: must be an array`);
  } else {
    findingsLen = o.findings.length;
    o.findings.forEach((f, i) => {
      const id = validateFinding(errors, `${label}.findings[${i}]`, f);
      if (id !== null) findingIds.push(id);
    });
    if (hasDups(findingIds)) errors.push(`${label}.findings: duplicate id`);
  }

  if (
    typeof o.findingCount !== "number" ||
    !Number.isInteger(o.findingCount) ||
    o.findingCount < 0
  ) {
    errors.push(`${label}: findingCount must be a non-negative integer`);
  } else if (findingsLen >= 0 && o.findingCount !== findingsLen) {
    errors.push(`${label}: findingCount does not match findings length`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a persisted `hld_intake_questionnaire` payload. Fail-closed and
 * closed-shape: unexpected keys at every level are errors, and authority/provider/
 * raw/final-output/certification leakage is rejected recursively BEFORE structural
 * checks. Returns the full list of violations; an empty list means valid. Performs
 * NO catalog/pricing/SKU/configuration/design decision - it only checks the
 * candidate question contract.
 */
export function validateRfpHldIntakeQuestionnairePayload(
  payload: unknown
): RfpHldIntakeQuestionnaireValidationResult {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  scanForbiddenKeys(errors, "payload", payload);
  scanForbiddenStrings(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_KEYS);
  if (root.payloadKind !== RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");

  validateStringArray(errors, "sourceArtifactIds", root.sourceArtifactIds, true);

  const sourceArtifactIdSet = new Set<string>(
    Array.isArray(root.sourceArtifactIds)
      ? root.sourceArtifactIds.filter((v): v is string => isNonBlank(v))
      : []
  );

  // Closed source-ref catalog: nonempty, unique refId, approved-only, and the
  // provenance anchor every question sourceRefId must resolve to.
  const refIds = new Set<string>();
  const refArtifactIds = new Set<string>();
  if (!Array.isArray(root.sourceRefs)) {
    errors.push("sourceRefs: must be an array");
  } else if (root.sourceRefs.length === 0) {
    errors.push("sourceRefs: must not be empty");
  } else {
    const seenRefIds: string[] = [];
    root.sourceRefs.forEach((r, i) => {
      const res = validateSourceRef(errors, `sourceRefs[${i}]`, r);
      if (res.refId !== null) {
        seenRefIds.push(res.refId);
        refIds.add(res.refId);
      }
      if (res.artifactId !== null) refArtifactIds.add(res.artifactId);
    });
    if (hasDups(seenRefIds)) errors.push("sourceRefs: duplicate refId");
  }

  // sourceArtifactIds and sourceRefs artifact ids must cover each other exactly.
  for (const aid of Array.from(refArtifactIds)) {
    if (!sourceArtifactIdSet.has(aid)) {
      errors.push(`sourceRefs: artifactId "${aid}" is not in sourceArtifactIds`);
    }
  }
  for (const aid of Array.from(sourceArtifactIdSet)) {
    if (!refArtifactIds.has(aid)) {
      errors.push(`sourceArtifactIds: "${aid}" has no matching sourceRef`);
    }
  }

  if (!Array.isArray(root.questions)) {
    errors.push("questions: must be an array");
  } else if (root.questions.length === 0) {
    errors.push("questions: must not be empty");
  } else {
    const questionIds: string[] = [];
    const orders: number[] = [];
    root.questions.forEach((q, i) => {
      const res = validateQuestion(errors, `questions[${i}]`, q);
      if (res.questionId !== null) questionIds.push(res.questionId);
      if (res.order !== null) orders.push(res.order);
      const qo = asObject(q);
      if (qo && Array.isArray(qo.sourceRefIds)) {
        qo.sourceRefIds.forEach((rid, j) => {
          if (isNonBlank(rid) && !refIds.has(rid)) {
            errors.push(
              `questions[${i}].sourceRefIds[${j}]: unknown sourceRef "${rid}"`
            );
          }
        });
      }
    });
    if (hasDups(questionIds)) errors.push("questions: duplicate questionId");
    if (new Set(orders).size !== orders.length) errors.push("questions: duplicate order");
  }

  validateValidationSummary(errors, "validation", root.validation);

  return { valid: errors.length === 0, errors };
}

/** Convenience boolean predicate over {@link validateRfpHldIntakeQuestionnairePayload}. */
export function isValidRfpHldIntakeQuestionnairePayload(payload: unknown): boolean {
  return validateRfpHldIntakeQuestionnairePayload(payload).valid;
}

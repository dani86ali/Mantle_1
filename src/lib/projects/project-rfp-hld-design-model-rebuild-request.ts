/**
 * Pure, deterministic RFP HLD design-model REBUILD REQUEST contract (Stage 6E-B).
 *
 * Persisted shape + fail-closed validator for the `hld_design_model_rebuild_request`
 * Project artifact: a bounded engineer request to redraft a candidate
 * `hld_design_model` after its advisory `hld_design_model_review`. It is request
 * METADATA only - it is NOT design authority, never approves or executes a
 * rebuild, and carries no SKU/pricing/catalog/configuration/AI/provider authority.
 * This module defines and validates the payload SHAPE only; it adds no service,
 * route, rebuild loop, or provider/model call.
 *
 * The request may only point at two approved Project artifact ids (the source
 * model and its source review) and carry a bounded reason + instructions. The
 * validator rejects raw-document / source-file leakage, final-output / deliverable
 * markers, certification claims, provider/model/prompt fields, and any text that
 * authorizes new scope, SKU selection, pricing, catalog/configuration decisions,
 * hardware sizing, or invented topology facts. Safety phrasing that NEGATES scope
 * expansion ("do not add scope", "stay within approved source artifacts") is
 * allowed.
 */

export const RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND =
  "rfp_hld_design_model_rebuild_request" as const;

/** The single active lifecycle value carried in the payload itself. */
export type RfpHldDesignModelRebuildRequestStatus = "active";

/** Who originated the request: a human engineer, or the OpenAI advisory gate. */
export type RfpHldDesignModelRebuildRequestSource = "engineer" | "openai_advisory";

/**
 * The redo phase this OpenAI-forced request belongs to. `initial_openai_gate` is
 * the bounded, at-most-one initial redo (Stage 6H-0H-C). `se_directed_openai_gate`
 * is a future SE-directed phase - the contract carries closed room for it now, but
 * no service creates one yet.
 */
export type RfpHldDesignModelRebuildRequestRedoPhase =
  | "initial_openai_gate"
  | "se_directed_openai_gate";

/**
 * The persisted bounded rebuild-request payload. Closed at every object level.
 *
 * The optional redo-policy metadata records a CLOSED OpenAI-forced redo policy:
 * either all of it is present (requestSource "openai_advisory") or none of it is
 * (a historical or engineer request). It is provenance/budget METADATA only - it
 * carries no provider/model/prompt/pricing/catalog/configuration authority.
 */
export interface RfpHldDesignModelRebuildRequestPayload {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND;
  sourceArtifactIds: string[];
  sourceHldDesignModelArtifactId: string;
  sourceReviewArtifactId: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  instructions: string;
  status: RfpHldDesignModelRebuildRequestStatus;
  requestSource?: RfpHldDesignModelRebuildRequestSource;
  redoPhase?: RfpHldDesignModelRebuildRequestRedoPhase;
  redoAttempt?: number;
  maxRedoAttempts?: 1 | 2;
  sourceHldSourceBundleArtifactId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REASON_MAX = 600;
const INSTRUCTIONS_MAX = 1200;

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const TOP_LEVEL_REQUIRED: readonly string[] = [
  "payloadKind",
  "sourceArtifactIds",
  "sourceHldDesignModelArtifactId",
  "sourceReviewArtifactId",
  "requestedBy",
  "requestedAt",
  "reason",
  "instructions",
  "status",
];

/** Optional OpenAI-forced redo-policy metadata (all-or-nothing; see validator). */
const TOP_LEVEL_OPTIONAL: readonly string[] = [
  "requestSource",
  "redoPhase",
  "redoAttempt",
  "maxRedoAttempts",
  "sourceHldSourceBundleArtifactId",
];

const REQUEST_SOURCES: ReadonlySet<string> = new Set(["engineer", "openai_advisory"]);
const REDO_PHASES: ReadonlySet<string> = new Set([
  "initial_openai_gate",
  "se_directed_openai_gate",
]);

/** The four redo-policy fields required together for an openai_advisory request. */
const REDO_POLICY_KEYS: readonly string[] = [
  "redoPhase",
  "redoAttempt",
  "maxRedoAttempts",
  "sourceHldSourceBundleArtifactId",
];

/**
 * Object keys that must never appear anywhere: raw-document / source-file
 * leakage, pricing / catalog / configuration authority, and provider / model /
 * prompt / raw-response fields. Exact-key match so legitimate ids are not tripped.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  // raw documents / source-file leakage
  "rawText", "documentText", "evidenceText", "sourceFileId", "sourceFileIds",
  "filePath", "storagePath", "pageText", "extractedText", "tableRows",
  "rowNumber", "sourceRowNumber",
  // pricing / catalog / configuration authority
  "sku", "acceptedSku", "replacementSku", "unitPrice", "totalPrice",
  "pricing", "price", "catalogDecision", "configurationDecision", "quantityChange",
  // provider / model / prompt authority
  "provider", "model", "modelId", "prompt", "systemPrompt", "rawResponse",
  "response", "completion", "temperature", "maxTokens",
]);

/**
 * Generated-output, proposal/export, and certification markers forbidden in any
 * string value. Precise enough not to reject the allowed payloadKind literal.
 */
const FORBIDDEN_CONTENT_RE = new RegExp(
  [
    "```", "<html", "<body", "<svg", "<mxfile", "<\\?xml",
    "graph TD", "flowchart", "sequenceDiagram", "draw\\.io", "mermaid",
    "final hld", "technical proposal", "tp/proposal", "proposal", "export package",
    "cisco-certified", "cvd-certified", "bomatic-certified", "ai-certified",
    "cisco validated design certified",
  ].join("|"),
  "i"
);

/**
 * Authority/scope markers forbidden inside reason/instructions. A bounded request
 * may not introduce SKU, pricing, catalog, configuration, hardware sizing,
 * invented topology facts, diagrams/markup, exports, or certification claims.
 * The bare word "scope" is handled separately (negation-aware) so that safety
 * phrasing is allowed.
 */
const AUTHORITY_FORBIDDEN_RE = new RegExp(
  [
    "\\bskus?\\b", "pricing", "\\bpriced?\\b", "\\bprices\\b", "catalog",
    "config", "\\bsizing\\b", "hardware", "topology", "\\binvent",
    "deliverable", "diagram", "\\bsvg\\b", "\\bxml\\b", "\\bhtml\\b",
    "\\bexport\\b", "certif", "draw\\.io", "mermaid",
  ].join("|"),
  "i"
);

/** Affirmative scope-expansion phrasing (e.g. "add scope", "new scope"). */
const SCOPE_EXPANSION_RE =
  /\b(add|adds|adding|new|additional|extra|expand|expands|expanding|expanded|introduce|introduces|introducing|increase|increases|increasing|widen|broaden|more)\b[\s\w,]{0,40}?\bscope\b/i;

/** Negation/safety phrasing around scope (e.g. "do not add scope", "within scope"). */
const SCOPE_NEGATION_RE =
  /\b(no|not|never|without|avoid|avoids|avoiding|don'?t|do not|does not|doesn'?t|cannot|can'?t|stay within|within|must not|may not|should not)\b[\s\w,]{0,40}?\bscope\b/i;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isIsoUtc(v: unknown): v is string {
  return typeof v === "string" && ISO_UTC_RE.test(v) && Number.isFinite(Date.parse(v));
}

/** Recursively reject forbidden object keys anywhere in the payload. */
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

/** Recursively reject forbidden string content (generated output, proposal, certs). */
function scanForbiddenContent(errors: string[], label: string, value: unknown): void {
  if (typeof value === "string") {
    if (FORBIDDEN_CONTENT_RE.test(value)) {
      errors.push(`${label}: contains forbidden generated-output or claim content`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanForbiddenContent(errors, `${label}[${i}]`, item));
  } else {
    const o = asObject(value);
    if (o) {
      for (const [k, v] of Object.entries(o)) {
        scanForbiddenContent(errors, `${label}.${k}`, v);
      }
    }
  }
}

/** True if the text authorizes new scope (affirmative expansion, not negated). */
function authorizesNewScope(text: string): boolean {
  return SCOPE_EXPANSION_RE.test(text) && !SCOPE_NEGATION_RE.test(text);
}

/**
 * Validate the optional OpenAI-forced redo-policy metadata as a CLOSED unit.
 * Historical/engineer requests carry none of it; an openai_advisory request must
 * carry all four redo-policy fields with phase-consistent attempt budgets.
 */
function validateRedoPolicy(errors: string[], root: Record<string, unknown>): void {
  const hasSource = "requestSource" in root && root.requestSource !== undefined;
  const source = root.requestSource;
  const presentPolicy = REDO_POLICY_KEYS.filter(
    (k) => k in root && root[k] !== undefined
  );

  if (hasSource && !REQUEST_SOURCES.has(source as string)) {
    errors.push("payload: invalid requestSource");
  }

  if (source === "engineer") {
    if (presentPolicy.length > 0) {
      errors.push("payload: requestSource engineer must not carry redo-policy fields");
    }
    return;
  }

  if (source !== "openai_advisory") {
    // Historical or unset: no redo-policy fields are allowed to appear alone.
    if (presentPolicy.length > 0) {
      errors.push("payload: redo-policy fields require requestSource openai_advisory");
    }
    return;
  }

  // requestSource === "openai_advisory": all four redo-policy fields are required.
  if (presentPolicy.length !== REDO_POLICY_KEYS.length) {
    errors.push("payload: requestSource openai_advisory requires all redo-policy fields");
  }

  const phase = root.redoPhase;
  const validPhase = typeof phase === "string" && REDO_PHASES.has(phase);
  if (!validPhase) errors.push("payload: invalid redoPhase");

  const maxAttempts = root.maxRedoAttempts;
  const validMax = maxAttempts === 1 || maxAttempts === 2;
  if (!validMax) errors.push("payload: maxRedoAttempts must be 1 or 2");

  const attempt = root.redoAttempt;
  const validAttempt = typeof attempt === "number" && Number.isInteger(attempt);
  if (!validAttempt) errors.push("payload: redoAttempt must be an integer");

  if (validAttempt && validMax && (attempt < 1 || attempt > (maxAttempts as number))) {
    errors.push("payload: redoAttempt out of range for maxRedoAttempts");
  }

  if (validPhase && phase === "initial_openai_gate") {
    if (maxAttempts !== 1) errors.push("payload: initial_openai_gate requires maxRedoAttempts 1");
    if (attempt !== 1) errors.push("payload: initial_openai_gate requires redoAttempt 1");
  }
  if (validPhase && phase === "se_directed_openai_gate") {
    if (maxAttempts !== 2) errors.push("payload: se_directed_openai_gate requires maxRedoAttempts 2");
    if (!(attempt === 1 || attempt === 2)) {
      errors.push("payload: se_directed_openai_gate requires redoAttempt 1 or 2");
    }
  }

  if (!isNonBlank(root.sourceHldSourceBundleArtifactId)) {
    errors.push("payload: blank sourceHldSourceBundleArtifactId");
  }
}

function validateBoundedText(
  errors: string[], field: string, value: unknown, max: number
): void {
  if (!isNonBlank(value)) {
    errors.push(`${field}: must be a non-empty string`);
    return;
  }
  const text = value as string;
  if (text.length > max) errors.push(`${field}: exceeds ${max} chars`);
  if (AUTHORITY_FORBIDDEN_RE.test(text)) {
    errors.push(`${field}: introduces forbidden authority/scope/output content`);
  }
  if (authorizesNewScope(text)) {
    errors.push(`${field}: authorizes new scope`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateRfpHldDesignModelRebuildRequestPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  // Defense-in-depth scans over the raw payload, before shape checks.
  scanForbiddenKeys(errors, "payload", payload);
  scanForbiddenContent(errors, "payload", payload);

  // Closed top-level shape: no unexpected keys, all required keys present.
  for (const k of Object.keys(root)) {
    if (!TOP_LEVEL_REQUIRED.includes(k) && !TOP_LEVEL_OPTIONAL.includes(k)) {
      errors.push(`payload: unexpected key "${k}"`);
    }
  }
  for (const k of TOP_LEVEL_REQUIRED) {
    if (!(k in root)) errors.push(`payload: missing key "${k}"`);
  }

  if (root.payloadKind !== RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }

  const modelId = isNonBlank(root.sourceHldDesignModelArtifactId)
    ? (root.sourceHldDesignModelArtifactId as string)
    : null;
  const reviewId = isNonBlank(root.sourceReviewArtifactId)
    ? (root.sourceReviewArtifactId as string)
    : null;
  if (modelId === null) errors.push("payload: blank sourceHldDesignModelArtifactId");
  if (reviewId === null) errors.push("payload: blank sourceReviewArtifactId");
  if (modelId !== null && reviewId !== null && modelId === reviewId) {
    errors.push("payload: model and review artifact ids must be distinct");
  }

  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (modelId !== null && reviewId !== null) {
    const ids = root.sourceArtifactIds as unknown[];
    if (ids.length !== 2 || ids[0] !== modelId || ids[1] !== reviewId) {
      errors.push(
        "sourceArtifactIds: must be exactly [sourceHldDesignModelArtifactId, sourceReviewArtifactId]"
      );
    }
  }

  if (!isNonBlank(root.requestedBy)) errors.push("payload: blank requestedBy");
  if (!isIsoUtc(root.requestedAt)) errors.push("payload: requestedAt is not ISO UTC");

  validateBoundedText(errors, "reason", root.reason, REASON_MAX);
  validateBoundedText(errors, "instructions", root.instructions, INSTRUCTIONS_MAX);

  if (root.status !== "active") errors.push("payload: status must be active");

  validateRedoPolicy(errors, root);

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDesignModelRebuildRequestPayload(payload: unknown): boolean {
  return validateRfpHldDesignModelRebuildRequestPayload(payload).valid;
}

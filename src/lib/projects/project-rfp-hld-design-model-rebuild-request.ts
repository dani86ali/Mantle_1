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

/** The persisted bounded rebuild-request payload. Closed at every object level. */
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
    if (!TOP_LEVEL_REQUIRED.includes(k)) errors.push(`payload: unexpected key "${k}"`);
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

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDesignModelRebuildRequestPayload(payload: unknown): boolean {
  return validateRfpHldDesignModelRebuildRequestPayload(payload).valid;
}

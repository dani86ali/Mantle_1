/**
 * Pure, deterministic RFP HLD design-model REVIEW contract (Stage 6E-B-001).
 *
 * Persisted shape + fail-closed validator for the advisory
 * `hld_design_model_review` Project artifact. The review is quality metadata
 * about a candidate `hld_design_model`, checked against its approved
 * `hld_source_bundle`. It is advisory only: it is NOT final design authority,
 * never approves the model on its own, and always precedes the human engineer
 * gate. This module defines and validates the payload SHAPE only - it adds no
 * review service, route, UI, approval-gate, rebuild, provider, or final-output
 * behavior, and carries no SKU/pricing/catalog/configuration/AI authority.
 */
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";

export const RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND =
  "rfp_hld_design_model_review" as const;

/** Who produced the advisory review. No provider/model/prompt authority here. */
export type RfpHldDesignModelReviewReviewerType =
  | "deterministic"
  | "ai_advisory"
  | "engineer";

/** Advisory finding severity. `blocking` forces a non-proceed recommendation. */
export type RfpHldDesignModelReviewFindingSeverity =
  | "blocking"
  | "warning"
  | "suggestion";

/** Closed set of advisory finding categories. */
export type RfpHldDesignModelReviewFindingCategory =
  | "source_mismatch"
  | "unsupported_domain"
  | "missing_assumption"
  | "topology_risk"
  | "scope_gap"
  | "unclear_narrative"
  | "validation_gap"
  | "other";

/** Closed set of advisory recommendations to the engineer gate. */
export type RfpHldDesignModelReviewRecommendation =
  | "proceed_to_engineer_review"
  | "rebuild_recommended"
  | "reject_required";

/**
 * A pointer into the reviewed model / source-bundle artifacts. Carries ids and
 * coarse location only - never raw document text, file paths, or snippets.
 */
export interface RfpHldDesignModelReviewSourceReference {
  id: string;
  artifactId: string;
  domain?: RfpHldDesignDomain;
  sectionId?: string;
}

/** One advisory quality finding raised against the candidate model. */
export interface RfpHldDesignModelReviewFinding {
  id: string;
  severity: RfpHldDesignModelReviewFindingSeverity;
  category: RfpHldDesignModelReviewFindingCategory;
  message: string;
  sourceReferenceIds: string[];
  recommendedAction?: string;
}

/**
 * A bounded, single-attempt redraft directive. Tightly scoped: it may only ask
 * for a corrected redraft from the SAME approved inputs and must not introduce
 * new scope, SKU, pricing, catalog, configuration, hardware sizing, invented
 * topology facts, final documents/diagrams, exports, or certification claims.
 */
export interface RfpHldDesignModelReviewBoundedRebuildInstructions {
  summary: string;
  instructions: string;
  maxAttempts?: number;
}

/** Who reviewed. At least `type`; no provider/model/prompt/raw-response fields. */
export interface RfpHldDesignModelReviewReviewer {
  type: RfpHldDesignModelReviewReviewerType;
  id?: string;
  label?: string;
}

/** The persisted advisory review payload. Closed at every object level. */
export interface RfpHldDesignModelReviewPayload {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND;
  sourceArtifactIds: string[];
  sourceHldDesignModelArtifactId: string;
  sourceHldSourceBundleArtifactId: string;
  reviewedAt: string;
  reviewer: RfpHldDesignModelReviewReviewer;
  sourceReferences: RfpHldDesignModelReviewSourceReference[];
  findings: RfpHldDesignModelReviewFinding[];
  recommendation: RfpHldDesignModelReviewRecommendation;
  boundedRebuildInstructions?: RfpHldDesignModelReviewBoundedRebuildInstructions;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MESSAGE_MAX = 600;
const RECOMMENDED_ACTION_MAX = 400;
const SUMMARY_MAX = 300;
const INSTRUCTIONS_MAX = 1200;

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

const REVIEWER_TYPES: ReadonlySet<string> = new Set([
  "deterministic", "ai_advisory", "engineer",
]);

const FINDING_SEVERITIES: ReadonlySet<string> = new Set([
  "blocking", "warning", "suggestion",
]);

const FINDING_CATEGORIES: ReadonlySet<string> = new Set([
  "source_mismatch", "unsupported_domain", "missing_assumption", "topology_risk",
  "scope_gap", "unclear_narrative", "validation_gap", "other",
]);

const RECOMMENDATIONS: ReadonlySet<string> = new Set([
  "proceed_to_engineer_review", "rebuild_recommended", "reject_required",
]);

/**
 * Object keys that must never appear anywhere: raw-document / source-file
 * leakage and pricing / catalog / configuration authority. Exact-key match so
 * legitimate ids (sourceArtifactIds, sourceReferenceIds) are never tripped.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  // raw documents / source-file leakage
  "rawText", "documentText", "evidenceText", "sourceFileId", "sourceFileIds",
  "filePath", "storagePath", "pageText", "extractedText", "tableRows",
  "rowNumber", "sourceRowNumber",
  // pricing / catalog / configuration authority
  "sku", "acceptedSku", "replacementSku", "unitPrice", "totalPrice",
  "pricing", "price", "catalogDecision", "configurationDecision", "quantityChange",
]);

/**
 * Generated-output, proposal/export, and certification markers forbidden in any
 * string value. Precise enough not to reject the allowed payloadKind / union
 * literals (none of which contain these substrings).
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
 * Extra authority/scope markers forbidden specifically inside bounded rebuild
 * summary/instructions: a redraft directive may not introduce new scope, SKU,
 * pricing, catalog, configuration, hardware sizing, invented topology facts,
 * diagrams/markup, exports, deliverables, or certification claims.
 */
const REBUILD_FORBIDDEN_RE = new RegExp(
  [
    "\\bskus?\\b", "pricing", "\\bpriced?\\b", "\\bprices\\b", "catalog",
    "config", "\\bsizing\\b", "hardware", "\\bscope\\b", "topology",
    "\\binvent", "deliverable", "diagram", "\\bsvg\\b", "\\bxml\\b",
    "\\bhtml\\b", "\\bexport\\b", "certif",
  ].join("|"),
  "i"
);

const TOP_LEVEL_REQUIRED: readonly string[] = [
  "payloadKind", "sourceArtifactIds", "sourceHldDesignModelArtifactId",
  "sourceHldSourceBundleArtifactId", "reviewedAt", "reviewer",
  "sourceReferences", "findings", "recommendation",
];
const TOP_LEVEL_OPTIONAL: readonly string[] = ["boundedRebuildInstructions"];

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

function hasDups(arr: string[]): boolean {
  return new Set(arr).size !== arr.length;
}

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

function validateReviewer(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return; }
  checkKeys(errors, label, o, ["type"], ["id", "label"]);
  if (!REVIEWER_TYPES.has(o.type as string)) errors.push(`${label}: invalid type`);
  if ("id" in o && !isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if ("label" in o && !isNonBlank(o.label)) errors.push(`${label}: blank label`);
}

function validateSourceReference(
  errors: string[], label: string, raw: unknown, allowedArtifactIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "artifactId"], ["domain", "sectionId"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.artifactId)) {
    errors.push(`${label}: blank artifactId`);
  } else if (!allowedArtifactIds.has(o.artifactId as string)) {
    errors.push(`${label}: artifactId must be the model or source-bundle artifact id`);
  }
  if ("domain" in o && !(typeof o.domain === "string" && KNOWN_DOMAINS.has(o.domain))) {
    errors.push(`${label}: invalid domain`);
  }
  if ("sectionId" in o && !isNonBlank(o.sectionId)) errors.push(`${label}: blank sectionId`);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

function validateRefIdList(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  const arr = raw as unknown[];
  if (arr.length === 0) errors.push(`${label}: must not be empty`);
  const seen = new Set<string>();
  arr.forEach((id, i) => {
    if (!isNonBlank(id)) { errors.push(`${label}[${i}]: blank`); return; }
    const s = id as string;
    if (seen.has(s)) errors.push(`${label}: duplicate "${s}"`);
    seen.add(s);
    if (!validRefIds.has(s)) errors.push(`${label}[${i}]: "${s}" not in sourceReferences`);
  });
}

/** Returns the finding id (or null) and whether its severity is `blocking`. */
function validateFinding(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): { id: string | null; blocking: boolean } {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return { id: null, blocking: false }; }
  checkKeys(
    errors, label, o,
    ["id", "severity", "category", "message", "sourceReferenceIds"],
    ["recommendedAction"]
  );
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  const blocking = o.severity === "blocking";
  if (!(typeof o.severity === "string" && FINDING_SEVERITIES.has(o.severity))) {
    errors.push(`${label}: invalid severity`);
  }
  if (!(typeof o.category === "string" && FINDING_CATEGORIES.has(o.category))) {
    errors.push(`${label}: invalid category`);
  }
  if (!isNonBlank(o.message)) {
    errors.push(`${label}: blank message`);
  } else if ((o.message as string).length > MESSAGE_MAX) {
    errors.push(`${label}: message exceeds ${MESSAGE_MAX} chars`);
  }
  if ("recommendedAction" in o) {
    if (!isNonBlank(o.recommendedAction)) {
      errors.push(`${label}: blank recommendedAction`);
    } else if ((o.recommendedAction as string).length > RECOMMENDED_ACTION_MAX) {
      errors.push(`${label}: recommendedAction exceeds ${RECOMMENDED_ACTION_MAX} chars`);
    }
  }
  validateRefIdList(errors, `${label}.sourceReferenceIds`, o.sourceReferenceIds, validRefIds);
  return { id: isNonBlank(o.id) ? (o.id as string) : null, blocking };
}

function validateBoundedRebuild(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return; }
  checkKeys(errors, label, o, ["summary", "instructions"], ["maxAttempts"]);
  if (!isNonBlank(o.summary)) {
    errors.push(`${label}: blank summary`);
  } else if ((o.summary as string).length > SUMMARY_MAX) {
    errors.push(`${label}: summary exceeds ${SUMMARY_MAX} chars`);
  }
  if (!isNonBlank(o.instructions)) {
    errors.push(`${label}: blank instructions`);
  } else if ((o.instructions as string).length > INSTRUCTIONS_MAX) {
    errors.push(`${label}: instructions exceeds ${INSTRUCTIONS_MAX} chars`);
  }
  for (const field of ["summary", "instructions"] as const) {
    if (typeof o[field] === "string" && REBUILD_FORBIDDEN_RE.test(o[field] as string)) {
      errors.push(`${label}.${field}: introduces forbidden new authority/scope/output`);
    }
  }
  if ("maxAttempts" in o) {
    if (!(typeof o.maxAttempts === "number" && Number.isInteger(o.maxAttempts) && o.maxAttempts === 1)) {
      errors.push(`${label}: maxAttempts must be the integer 1 for this stage`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateRfpHldDesignModelReviewPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  // Defense-in-depth scans over the raw payload, before shape checks.
  scanForbiddenKeys(errors, "payload", payload);
  scanForbiddenContent(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_REQUIRED, TOP_LEVEL_OPTIONAL);

  if (root.payloadKind !== RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }

  const modelId = isNonBlank(root.sourceHldDesignModelArtifactId)
    ? (root.sourceHldDesignModelArtifactId as string)
    : null;
  const bundleId = isNonBlank(root.sourceHldSourceBundleArtifactId)
    ? (root.sourceHldSourceBundleArtifactId as string)
    : null;
  if (modelId === null) errors.push("payload: blank sourceHldDesignModelArtifactId");
  if (bundleId === null) errors.push("payload: blank sourceHldSourceBundleArtifactId");
  if (modelId !== null && bundleId !== null && modelId === bundleId) {
    errors.push("payload: model and source-bundle artifact ids must be distinct");
  }

  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (modelId !== null && bundleId !== null) {
    const ids = root.sourceArtifactIds as unknown[];
    if (ids.length !== 2 || ids[0] !== modelId || ids[1] !== bundleId) {
      errors.push(
        "sourceArtifactIds: must be exactly [sourceHldDesignModelArtifactId, sourceHldSourceBundleArtifactId]"
      );
    }
  }

  if (!isIsoUtc(root.reviewedAt)) errors.push("payload: reviewedAt is not ISO UTC");

  validateReviewer(errors, "reviewer", root.reviewer);

  const allowedArtifactIds = new Set<string>();
  if (modelId !== null) allowedArtifactIds.add(modelId);
  if (bundleId !== null) allowedArtifactIds.add(bundleId);

  const sourceRefIdSet = new Set<string>();
  if (!Array.isArray(root.sourceReferences)) {
    errors.push("sourceReferences: must be an array");
  } else {
    const ids: string[] = [];
    (root.sourceReferences as unknown[]).forEach((ref, i) => {
      const id = validateSourceReference(
        errors, `sourceReferences[${i}]`, ref, allowedArtifactIds
      );
      if (id !== null) { ids.push(id); sourceRefIdSet.add(id); }
    });
    if (hasDups(ids)) errors.push("sourceReferences: duplicate ids");
  }

  let hasBlocking = false;
  if (!Array.isArray(root.findings)) {
    errors.push("findings: must be an array");
  } else {
    const ids: string[] = [];
    (root.findings as unknown[]).forEach((f, i) => {
      const { id, blocking } = validateFinding(errors, `findings[${i}]`, f, sourceRefIdSet);
      if (id !== null) ids.push(id);
      if (blocking) hasBlocking = true;
    });
    if (hasDups(ids)) errors.push("findings: duplicate ids");
  }

  const recommendation = root.recommendation;
  const validRec = typeof recommendation === "string" && RECOMMENDATIONS.has(recommendation);
  if (!validRec) errors.push("payload: invalid recommendation");

  const hasRebuild =
    "boundedRebuildInstructions" in root && root.boundedRebuildInstructions !== undefined;

  if (validRec) {
    if (recommendation === "proceed_to_engineer_review") {
      if (hasBlocking) {
        errors.push("recommendation: proceed_to_engineer_review not allowed with blocking findings");
      }
      if (hasRebuild) {
        errors.push("recommendation: proceed_to_engineer_review must not include boundedRebuildInstructions");
      }
    } else if (recommendation === "rebuild_recommended") {
      if (!hasRebuild) {
        errors.push("recommendation: rebuild_recommended requires boundedRebuildInstructions");
      }
    }
    // reject_required: boundedRebuildInstructions is optional.
  }

  if (hasRebuild) {
    validateBoundedRebuild(errors, "boundedRebuildInstructions", root.boundedRebuildInstructions);
  }

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDesignModelReviewPayload(payload: unknown): boolean {
  return validateRfpHldDesignModelReviewPayload(payload).valid;
}

/**
 * Pure, deterministic RFP HLD DIAGRAM DRAFT contract (Stage 6G-A-001).
 *
 * Persisted shape + fail-closed validator for the internal, reviewable
 * `hld_diagram` artifact's `rfp_hld_diagram_draft` payload. The diagram draft is
 * a structured, deterministic projection of an approved `hld_design_model`
 * topology for engineer review. It is NOT a final HLD document, HTML, draw.io/XML,
 * Mermaid/SVG, technical proposal, export, or customer deliverable, and it carries
 * NO SKU/pricing/catalog/configuration/provider/AI authority. Source references
 * are coarse artifact pointers only; they never carry raw evidence/document text,
 * file/storage paths, provider text, or any catalog/pricing decision.
 *
 * This module is self-contained (no imports) so the closed contract cannot drift
 * with upstream modules, and is ASCII-only.
 */

export const RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND = "rfp_hld_diagram_draft" as const;

/** Supported diagram projections for this slice. Topology only. */
export type RfpHldDiagramDraftDiagramType = "topology";

/** Coarse upstream artifact a diagram source reference may point at. */
export type RfpHldDiagramSourceArtifactType =
  | "hld_design_model"
  | "hld_source_bundle"
  | "hld_design_model_review";

/**
 * A coarse pointer to one of the three approved upstream artifacts. It may carry
 * a logical sourcePath and a short label, but never raw evidence/document text,
 * a file/storage path, provider text, or any pricing/SKU/catalog/config value.
 */
export interface RfpHldDiagramSourceReference {
  id: string;
  artifactId: string;
  artifactType: RfpHldDiagramSourceArtifactType;
  sourcePath?: string;
  label?: string;
}

export interface RfpHldDiagramNode {
  id: string;
  label: string;
  nodeType: string;
  domain?: string;
  zoneId?: string;
  sourceRefIds: string[];
}

export interface RfpHldDiagramLink {
  id: string;
  label?: string;
  fromNodeId: string;
  toNodeId: string;
  linkType: string;
  sourceRefIds: string[];
}

export interface RfpHldDiagramZone {
  id: string;
  label: string;
  nodeIds: string[];
  sourceRefIds: string[];
}

/** Advisory severities a draft may carry. A valid draft never carries a blocker. */
export type RfpHldDiagramDraftFindingSeverity = "warning" | "suggestion" | "info";

export interface RfpHldDiagramDraftValidationFinding {
  id: string;
  severity: RfpHldDiagramDraftFindingSeverity;
  code: string;
  message: string;
  sourceRefIds: string[];
}

export interface RfpHldDiagramDraftPayload {
  payloadKind: typeof RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND;
  createdAt: string;
  createdBy: string;
  sourceArtifactIds: string[];
  sourceHldDesignModelArtifactId: string;
  sourceHldSourceBundleArtifactId: string;
  sourceReviewArtifactId: string;
  sourceModelVersion: number;
  diagramType: RfpHldDiagramDraftDiagramType;
  title: string;
  nodes: RfpHldDiagramNode[];
  links: RfpHldDiagramLink[];
  zones: RfpHldDiagramZone[];
  sourceReferences: RfpHldDiagramSourceReference[];
  validationFindings: RfpHldDiagramDraftValidationFinding[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_DIAGRAM_TYPES: ReadonlySet<string> = new Set(["topology"]);

const ALLOWED_SOURCE_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  "hld_design_model",
  "hld_source_bundle",
  "hld_design_model_review",
]);

/** Severities a finding may declare. `blocker`/`blocking` is known but rejected. */
const KNOWN_FINDING_SEVERITIES: ReadonlySet<string> = new Set([
  "warning",
  "suggestion",
  "info",
  "blocker",
  "blocking",
]);

const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set(["blocker", "blocking"]);

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Keys that must never appear anywhere in a diagram draft: pricing/SKU/catalog/
 * configuration authority, raw document/source-file/storage references, and
 * provider/AI output. (`sourcePath` is an allowed coarse pointer and is NOT here.)
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "sku", "acceptedSku", "replacementSku", "skuSubstitution",
  "unitPrice", "totalPrice", "pricing", "price",
  "quantityChange", "catalogDecision", "configurationDecision",
  "rawText", "documentText", "evidenceText", "sourceText", "rawEvidence",
  "fileBytes", "sourceBytes", "filePath", "sourceFilePath", "storagePath",
  "providerText", "providerResponse", "aiResponse", "llmResponse",
  "prompt", "completion",
]);

/**
 * Strings that resemble a generated final output, diagram markup, or a
 * certification claim. A diagram draft is internal structured data, never markup.
 */
const GENERATED_OUTPUT_RE =
  /```|<html|<body|<svg|<mxfile|<\?xml|graph TD|flowchart|sequenceDiagram|mermaid|draw\.io|technical proposal|tp\/proposal|export package|final hld|customer deliverable|cisco-certified|cvd-certified|bomatic-certified|ai-certified/i;

const TOP_LEVEL_REQUIRED: readonly string[] = [
  "payloadKind", "createdAt", "createdBy", "sourceArtifactIds",
  "sourceHldDesignModelArtifactId", "sourceHldSourceBundleArtifactId",
  "sourceReviewArtifactId", "sourceModelVersion", "diagramType", "title",
  "nodes", "links", "zones", "sourceReferences", "validationFindings",
];

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isVersion(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
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

function scanGeneratedStrings(errors: string[], label: string, value: unknown): void {
  if (typeof value === "string") {
    if (GENERATED_OUTPUT_RE.test(value)) errors.push(`${label}: looks like generated output`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanGeneratedStrings(errors, `${label}[${i}]`, item));
  } else {
    const o = asObject(value);
    if (o) {
      for (const [k, v] of Object.entries(o)) {
        scanGeneratedStrings(errors, `${label}.${k}`, v);
      }
    }
  }
}

/** Validate a sourceRefIds array against the diagram's source-reference id set. */
function validateSourceRefIds(
  errors: string[], label: string, raw: unknown,
  validIds: ReadonlySet<string>, allowEmpty: boolean
): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  if (!allowEmpty && (raw as unknown[]).length === 0) {
    errors.push(`${label}: must not be empty`);
  }
  (raw as unknown[]).forEach((id, i) => {
    if (!isNonBlank(id)) errors.push(`${label}[${i}]: blank sourceRefId`);
    else if (!validIds.has(id as string)) {
      errors.push(`${label}[${i}]: "${id}" not in sourceReferences`);
    }
  });
}

/**
 * Validate one coarse source reference. The artifactId must be one of the three
 * approved upstream ids and the artifactType must match that exact id's role.
 */
function validateSourceReference(
  errors: string[], label: string, raw: unknown,
  approved: { model: string | null; bundle: string | null; review: string | null }
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "artifactId", "artifactType"], ["sourcePath", "label"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if ("sourcePath" in o && !isNonBlank(o.sourcePath)) errors.push(`${label}: blank sourcePath`);
  if ("label" in o && !isNonBlank(o.label)) errors.push(`${label}: blank label`);

  const artifactId = isNonBlank(o.artifactId) ? (o.artifactId as string) : null;
  const artifactType = o.artifactType;
  if (artifactId === null) {
    errors.push(`${label}: blank artifactId`);
  } else if (
    artifactId !== approved.model &&
    artifactId !== approved.bundle &&
    artifactId !== approved.review
  ) {
    errors.push(`${label}: artifactId is not one of the approved model/bundle/review ids`);
  }
  if (typeof artifactType !== "string" || !ALLOWED_SOURCE_ARTIFACT_TYPES.has(artifactType)) {
    errors.push(`${label}: invalid artifactType`);
  } else if (artifactId !== null) {
    const expected =
      artifactId === approved.model ? "hld_design_model"
      : artifactId === approved.bundle ? "hld_source_bundle"
      : artifactId === approved.review ? "hld_design_model_review"
      : null;
    if (expected !== null && artifactType !== expected) {
      errors.push(`${label}: artifactType "${artifactType}" does not match its artifactId role`);
    }
  }
  return isNonBlank(o.id) ? (o.id as string) : null;
}

/** Validate one node. Returns its id (or null) plus a declared zoneId, if any. */
function validateNode(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): { id: string | null; zoneId: string | null } {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return { id: null, zoneId: null }; }
  checkKeys(errors, label, o, ["id", "label", "nodeType", "sourceRefIds"], ["domain", "zoneId"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if (!isNonBlank(o.nodeType)) errors.push(`${label}: blank nodeType`);
  if ("domain" in o && !isNonBlank(o.domain)) errors.push(`${label}: blank domain`);
  let zoneId: string | null = null;
  if ("zoneId" in o) {
    if (!isNonBlank(o.zoneId)) errors.push(`${label}: blank zoneId`);
    else zoneId = o.zoneId as string;
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, false);
  return { id: isNonBlank(o.id) ? (o.id as string) : null, zoneId };
}

function validateLink(
  errors: string[], label: string, raw: unknown,
  nodeIds: ReadonlySet<string>, validRefIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "fromNodeId", "toNodeId", "linkType", "sourceRefIds"], ["label"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if ("label" in o && !isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if (!isNonBlank(o.linkType)) errors.push(`${label}: blank linkType`);
  if (!isNonBlank(o.fromNodeId)) errors.push(`${label}: blank fromNodeId`);
  else if (!nodeIds.has(o.fromNodeId as string)) errors.push(`${label}: fromNodeId not in nodes`);
  if (!isNonBlank(o.toNodeId)) errors.push(`${label}: blank toNodeId`);
  else if (!nodeIds.has(o.toNodeId as string)) errors.push(`${label}: toNodeId not in nodes`);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, false);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

function validateZone(
  errors: string[], label: string, raw: unknown,
  nodeIds: ReadonlySet<string>, validRefIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "label", "nodeIds", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if (!Array.isArray(o.nodeIds)) {
    errors.push(`${label}.nodeIds: must be an array`);
  } else {
    const nids = o.nodeIds as unknown[];
    if (nids.length === 0) errors.push(`${label}.nodeIds: must not be empty`);
    const seen = new Set<string>();
    nids.forEach((nid, i) => {
      if (!isNonBlank(nid)) {
        errors.push(`${label}.nodeIds[${i}]: blank`);
      } else {
        if (seen.has(nid as string)) errors.push(`${label}.nodeIds: duplicate "${nid}"`);
        seen.add(nid as string);
        if (!nodeIds.has(nid as string)) errors.push(`${label}.nodeIds[${i}]: not in nodes`);
      }
    });
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, false);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

function validateFinding(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "severity", "code", "message", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.code)) errors.push(`${label}: blank code`);
  if (!isNonBlank(o.message)) errors.push(`${label}: blank message`);
  const sev = o.severity;
  if (typeof sev !== "string" || !KNOWN_FINDING_SEVERITIES.has(sev)) {
    errors.push(`${label}: invalid severity`);
  } else if (BLOCKING_SEVERITIES.has(sev)) {
    errors.push(`${label}: blocking finding not allowed in a valid persisted diagram draft`);
  }
  // Findings need not carry a sourceRefId, but any they declare must resolve.
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, true);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fail-closed validator for a persisted `rfp_hld_diagram_draft` payload. Returns
 * `{ valid, errors }`; deterministic and ASCII-only. A draft is valid only when
 * the closed contract holds end to end: exact kind, the three ordered source ids,
 * a positive integer model version, a known diagram type, at least one node,
 * unique ids, every link/zone reference resolving to a node, every node/link/zone
 * carrying at least one resolving sourceRefId, every source reference pointing at
 * one of the three approved artifacts with a matching type, and no
 * pricing/SKU/catalog/config/raw/provider key or generated-output string anywhere.
 */
export function validateRfpHldDiagramDraftPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  scanForbiddenKeys(errors, "payload", payload);
  scanGeneratedStrings(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_REQUIRED);

  if (root.payloadKind !== RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");
  if (!isVersion(root.sourceModelVersion)) errors.push("payload: invalid sourceModelVersion");
  if (typeof root.diagramType !== "string" || !KNOWN_DIAGRAM_TYPES.has(root.diagramType)) {
    errors.push("payload: unknown diagramType");
  }
  if (!isNonBlank(root.title)) errors.push("payload: blank title");

  const modelId = isNonBlank(root.sourceHldDesignModelArtifactId)
    ? (root.sourceHldDesignModelArtifactId as string) : null;
  const bundleId = isNonBlank(root.sourceHldSourceBundleArtifactId)
    ? (root.sourceHldSourceBundleArtifactId as string) : null;
  const reviewId = isNonBlank(root.sourceReviewArtifactId)
    ? (root.sourceReviewArtifactId as string) : null;
  if (modelId === null) errors.push("payload: blank sourceHldDesignModelArtifactId");
  if (bundleId === null) errors.push("payload: blank sourceHldSourceBundleArtifactId");
  if (reviewId === null) errors.push("payload: blank sourceReviewArtifactId");
  if (modelId !== null && bundleId !== null && modelId === bundleId) {
    errors.push("payload: sourceHldDesignModelArtifactId equals sourceHldSourceBundleArtifactId");
  }
  if (modelId !== null && reviewId !== null && modelId === reviewId) {
    errors.push("payload: sourceHldDesignModelArtifactId equals sourceReviewArtifactId");
  }
  if (bundleId !== null && reviewId !== null && bundleId === reviewId) {
    errors.push("payload: sourceHldSourceBundleArtifactId equals sourceReviewArtifactId");
  }

  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (modelId !== null && bundleId !== null && reviewId !== null) {
    const ids = root.sourceArtifactIds as unknown[];
    if (ids.length !== 3 || ids[0] !== modelId || ids[1] !== bundleId || ids[2] !== reviewId) {
      errors.push(
        "sourceArtifactIds: must be exactly [sourceHldDesignModelArtifactId, sourceHldSourceBundleArtifactId, sourceReviewArtifactId]"
      );
    }
  }

  const approved = { model: modelId, bundle: bundleId, review: reviewId };
  const refIdSet = new Set<string>();
  if (!Array.isArray(root.sourceReferences)) {
    errors.push("sourceReferences: must be an array");
  } else {
    const ids: string[] = [];
    (root.sourceReferences as unknown[]).forEach((ref, i) => {
      const id = validateSourceReference(errors, `sourceReferences[${i}]`, ref, approved);
      if (id !== null) { ids.push(id); refIdSet.add(id); }
    });
    if (hasDups(ids)) errors.push("sourceReferences: duplicate ids");
  }

  const nodeIdSet = new Set<string>();
  const declaredZoneIds: Array<{ label: string; zoneId: string }> = [];
  if (!Array.isArray(root.nodes)) {
    errors.push("nodes: must be an array");
  } else {
    const ids: string[] = [];
    if ((root.nodes as unknown[]).length === 0) errors.push("nodes: must not be empty");
    (root.nodes as unknown[]).forEach((n, i) => {
      const { id, zoneId } = validateNode(errors, `nodes[${i}]`, n, refIdSet);
      if (id !== null) { ids.push(id); nodeIdSet.add(id); }
      if (zoneId !== null) declaredZoneIds.push({ label: `nodes[${i}]`, zoneId });
    });
    if (hasDups(ids)) errors.push("nodes: duplicate ids");
  }

  const zoneIdSet = new Set<string>();
  if (!Array.isArray(root.zones)) {
    errors.push("zones: must be an array");
  } else {
    const ids: string[] = [];
    (root.zones as unknown[]).forEach((z, i) => {
      const id = validateZone(errors, `zones[${i}]`, z, nodeIdSet, refIdSet);
      if (id !== null) { ids.push(id); zoneIdSet.add(id); }
    });
    if (hasDups(ids)) errors.push("zones: duplicate ids");
  }

  for (const { label, zoneId } of declaredZoneIds) {
    if (!zoneIdSet.has(zoneId)) errors.push(`${label}: zoneId not in zones`);
  }

  if (!Array.isArray(root.links)) {
    errors.push("links: must be an array");
  } else {
    const ids: string[] = [];
    (root.links as unknown[]).forEach((l, i) => {
      const id = validateLink(errors, `links[${i}]`, l, nodeIdSet, refIdSet);
      if (id !== null) ids.push(id);
    });
    if (hasDups(ids)) errors.push("links: duplicate ids");
  }

  if (!Array.isArray(root.validationFindings)) {
    errors.push("validationFindings: must be an array");
  } else {
    const ids: string[] = [];
    (root.validationFindings as unknown[]).forEach((f, i) => {
      const id = validateFinding(errors, `validationFindings[${i}]`, f, refIdSet);
      if (id !== null) ids.push(id);
    });
    if (hasDups(ids)) errors.push("validationFindings: duplicate ids");
  }

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDiagramDraftPayload(payload: unknown): boolean {
  return validateRfpHldDiagramDraftPayload(payload).valid;
}

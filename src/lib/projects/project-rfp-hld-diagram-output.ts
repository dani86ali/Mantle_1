/**
 * Pure, deterministic RFP HLD diagram-output CONTRACT (Stage 6I-A).
 * Source of truth: the MVP canonical project state and the corrected HLD
 * authority-chain roadmap (Stage 6 HLD readiness / diagram output contracts).
 *
 * Persisted shape + fail-closed validator for the internal `hld_diagram_output`
 * artifact: a reviewable, structured layout/output model derived from a single
 * approved `hld_diagram`, a bridge toward LATER draw.io-compatible generation. It
 * stores zones/nodes/links geometry and advisory findings ONLY. It is NOT draw.io
 * XML, SVG, Mermaid, HTML, a rendered output, a download/upload, a final HLD
 * document, customer authority, or design authority; it carries no pricing, SKU,
 * catalog, or configuration decision, no raw source/document text, no provider
 * prompt/completion/response, and no certification or final-authority claim.
 *
 * Contract-only: no DB/store, no fs/path, no route, no React, no AI/provider, no
 * catalog/pricing/SKU/config service. It is SELF-CONTAINED with NO imports and
 * makes no runtime authority decision. Provenance is coarse and single-source:
 * every element references the one approved `hld_diagram` it was derived from.
 */

/** Stable discriminator for the persisted `hld_diagram_output` payload. */
export const RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND =
  "rfp_hld_diagram_output" as const;

/**
 * The only accepted output format token. It names a draw.io-COMPATIBLE layout
 * model version; it does NOT imply any stored/rendered XML or downloaded output.
 */
export const RFP_HLD_DIAGRAM_OUTPUT_FORMAT = "drawio_compatible_v1" as const;

/** Advisory-only finding severities. Blocking/blocker/error are rejected. */
export type RfpHldDiagramOutputFindingSeverity = "warning" | "suggestion" | "info";

/** Rectangular geometry for a node or zone (finite, bounded coordinates). */
export interface RfpHldDiagramOutputGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A logical grouping region on the canvas (e.g. a network zone). */
export interface RfpHldDiagramOutputZone {
  id: string;
  label: string;
  geometry: RfpHldDiagramOutputGeometry;
  /** Coarse provenance: resolves only to the source hld_diagram artifact id. */
  sourceRefIds: string[];
}

/** A placed topology node with geometry. */
export interface RfpHldDiagramOutputNode {
  id: string;
  label: string;
  /** Optional zone this node belongs to; must resolve to a declared zone id. */
  zoneId?: string;
  geometry: RfpHldDiagramOutputGeometry;
  sourceRefIds: string[];
}

/** A directed/undirected link between two declared nodes. */
export interface RfpHldDiagramOutputLink {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  sourceRefIds: string[];
}

/** An advisory-only finding about the output model (never blocking). */
export interface RfpHldDiagramOutputFinding {
  id: string;
  code: string;
  message: string;
  severity: RfpHldDiagramOutputFindingSeverity;
  /** May be empty; any declared id must resolve to the source hld_diagram id. */
  sourceRefIds: string[];
}

/** Canvas bounds for the output model. */
export interface RfpHldDiagramOutputCanvas {
  width: number;
  height: number;
  gridSize?: number;
}

/** The persisted `hld_diagram_output` payload (internal layout model only). */
export interface RfpHldDiagramOutputPayload {
  payloadKind: typeof RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND;
  createdAt: string;
  createdBy: string;
  /** Exactly [sourceHldDiagramArtifactId]. */
  sourceArtifactIds: string[];
  /** The single approved hld_diagram this output was derived from. */
  sourceHldDiagramArtifactId: string;
  /** Positive-integer version of the source hld_diagram. */
  sourceDiagramVersion: number;
  outputFormat: typeof RFP_HLD_DIAGRAM_OUTPUT_FORMAT;
  diagramType: "topology";
  title: string;
  canvas: RfpHldDiagramOutputCanvas;
  zones: RfpHldDiagramOutputZone[];
  nodes: RfpHldDiagramOutputNode[];
  links: RfpHldDiagramOutputLink[];
  validationFindings: RfpHldDiagramOutputFinding[];
}

/** Discriminated result of {@link validateRfpHldDiagramOutputPayload}. */
export type RfpHldDiagramOutputValidationResult =
  | { ok: true; value: RfpHldDiagramOutputPayload }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Conservative absolute bound for any coordinate/dimension. */
const MAX_COORD = 20000;

const FINDING_SEVERITIES: ReadonlySet<string> = new Set([
  "warning",
  "suggestion",
  "info",
]);

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const TOP_LEVEL_KEYS: readonly string[] = [
  "payloadKind",
  "createdAt",
  "createdBy",
  "sourceArtifactIds",
  "sourceHldDiagramArtifactId",
  "sourceDiagramVersion",
  "outputFormat",
  "diagramType",
  "title",
  "canvas",
  "zones",
  "nodes",
  "links",
  "validationFindings",
];
const CANVAS_REQUIRED: readonly string[] = ["width", "height"];
const CANVAS_OPTIONAL: readonly string[] = ["gridSize"];
const GEOMETRY_KEYS: readonly string[] = ["x", "y", "width", "height"];
const ZONE_KEYS: readonly string[] = ["id", "label", "geometry", "sourceRefIds"];
const NODE_REQUIRED: readonly string[] = [
  "id",
  "label",
  "geometry",
  "sourceRefIds",
];
const NODE_OPTIONAL: readonly string[] = ["zoneId"];
const LINK_REQUIRED: readonly string[] = [
  "id",
  "sourceNodeId",
  "targetNodeId",
  "sourceRefIds",
];
const LINK_OPTIONAL: readonly string[] = ["label"];
const FINDING_KEYS: readonly string[] = [
  "id",
  "code",
  "message",
  "severity",
  "sourceRefIds",
];

/**
 * Authority / provider / raw-source / rendered-output leakage keys that may NEVER
 * appear anywhere in the payload (scanned recursively, EXACT key match so
 * legitimate keys such as `outputFormat` or `sourceRefIds` are unaffected). This
 * artifact holds a structured layout model ONLY - no pricing/SKU/catalog/config
 * decision, no raw document/source-file/storage handle, no provider
 * prompt/completion/reasoning, and no stored/rendered/exported output.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  // pricing / SKU / catalog / configuration authority
  "pricing",
  "price",
  "unitPrice",
  "totalPrice",
  "sku",
  "acceptedSku",
  "replacementSku",
  "skuReplacement",
  "catalog",
  "catalogDecision",
  "catalogLookup",
  "configuration",
  "configurationDecision",
  // raw document / source-file / storage
  "rawText",
  "documentText",
  "sourceText",
  "sourceFile",
  "filePath",
  "storagePath",
  "storageKey",
  // provider / model / AI / prompt / completion / raw response
  "provider",
  "model",
  "ai",
  "prompt",
  "providerPrompt",
  "completion",
  "providerCompletion",
  "providerResponse",
  "rawResponse",
  "reasoning",
  "hiddenReasoning",
  "chainOfThought",
  // stored / rendered output, download/upload, final HLD/document/export
  "xml",
  "drawioXml",
  "mxfile",
  "svg",
  "html",
  "mermaid",
  "outputBytes",
  "bytes",
  "downloadUrl",
  "downloadPath",
  "uploadUrl",
  "uploadPath",
  "finalHld",
  "finalDocument",
  "document",
  "export",
  "exportPackage",
]);

/**
 * Rendered-markup / final-deliverable / certification markers that may NEVER
 * appear in any string VALUE (scanned recursively). Keeps the model clear of
 * draw.io / HTML / SVG / XML / Mermaid markup, technical-proposal / export
 * deliverable text, final-HLD/customer-deliverable claims, and any
 * Cisco/CVD/BOMATIC/AI certification or final-authority claim.
 */
const FORBIDDEN_VALUE_RE =
  /```|graph TD|flowchart|sequenceDiagram|<mxfile|<html|<body|<svg|<\?xml|technical proposal|export package|final hld|final authority|customer deliverable|\b(?:cisco|cvd|bomatic|ai)[-\s]?certif/i;

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isTrimmedNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.trim() === v;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

function isBoundedNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;
}

function isBoundedPositive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_COORD;
}

function isIsoUtc(v: unknown): v is string {
  return typeof v === "string" && ISO_UTC_RE.test(v) && Number.isFinite(Date.parse(v));
}

/** Reject unexpected and missing keys against an exact allowed set. */
function checkKeys(
  errors: string[],
  label: string,
  obj: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
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

/** Recursively reject any forbidden authority/provider/raw/output key (exact match). */
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

/** Validate a geometry object; finite, bounded coordinates and positive size. */
function validateGeometry(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return;
  }
  checkKeys(errors, label, o, GEOMETRY_KEYS);
  if (!isBoundedNumber(o.x)) errors.push(`${label}.x: must be a finite bounded number`);
  if (!isBoundedNumber(o.y)) errors.push(`${label}.y: must be a finite bounded number`);
  if (!isBoundedPositive(o.width)) {
    errors.push(`${label}.width: must be a finite bounded positive number`);
  }
  if (!isBoundedPositive(o.height)) {
    errors.push(`${label}.height: must be a finite bounded positive number`);
  }
}

/**
 * Validate an element's `sourceRefIds`: an array of nonblank strings resolving
 * ONLY to the coarse source hld_diagram id. When `requireNonEmpty`, it must have
 * at least one entry (nodes/links/zones); findings may be empty.
 */
function validateSourceRefIds(
  errors: string[],
  label: string,
  raw: unknown,
  sourceId: string | null,
  requireNonEmpty: boolean
): void {
  if (!Array.isArray(raw)) {
    errors.push(`${label}: must be an array`);
    return;
  }
  if (requireNonEmpty && raw.length === 0) {
    errors.push(`${label}: must not be empty`);
  }
  raw.forEach((v, i) => {
    if (!isNonBlank(v)) {
      errors.push(`${label}[${i}]: must be a nonblank string`);
      return;
    }
    if (sourceId !== null && v !== sourceId) {
      errors.push(`${label}[${i}]: must resolve to the source hld_diagram id`);
    }
  });
}

function validateZone(
  errors: string[],
  label: string,
  raw: unknown,
  sourceId: string | null
): string | null {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return null;
  }
  checkKeys(errors, label, o, ZONE_KEYS);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  validateGeometry(errors, `${label}.geometry`, o.geometry);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, sourceId, true);
  return isNonBlank(o.id) ? o.id : null;
}

function validateNode(
  errors: string[],
  label: string,
  raw: unknown,
  sourceId: string | null,
  zoneIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return null;
  }
  checkKeys(errors, label, o, NODE_REQUIRED, NODE_OPTIONAL);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  validateGeometry(errors, `${label}.geometry`, o.geometry);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, sourceId, true);
  if ("zoneId" in o) {
    if (!isNonBlank(o.zoneId)) {
      errors.push(`${label}: zoneId must be a nonblank string`);
    } else if (!zoneIds.has(o.zoneId)) {
      errors.push(`${label}: zoneId "${o.zoneId}" does not resolve to a declared zone`);
    }
  }
  return isNonBlank(o.id) ? o.id : null;
}

function validateLink(
  errors: string[],
  label: string,
  raw: unknown,
  sourceId: string | null,
  nodeIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return null;
  }
  checkKeys(errors, label, o, LINK_REQUIRED, LINK_OPTIONAL);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.sourceNodeId)) {
    errors.push(`${label}: blank sourceNodeId`);
  } else if (!nodeIds.has(o.sourceNodeId)) {
    errors.push(`${label}: sourceNodeId "${o.sourceNodeId}" does not resolve to a declared node`);
  }
  if (!isNonBlank(o.targetNodeId)) {
    errors.push(`${label}: blank targetNodeId`);
  } else if (!nodeIds.has(o.targetNodeId)) {
    errors.push(`${label}: targetNodeId "${o.targetNodeId}" does not resolve to a declared node`);
  }
  if ("label" in o && !isNonBlank(o.label)) {
    errors.push(`${label}: label must be a nonblank string when present`);
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, sourceId, true);
  return isNonBlank(o.id) ? o.id : null;
}

function validateFinding(
  errors: string[],
  label: string,
  raw: unknown,
  sourceId: string | null
): string | null {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return null;
  }
  checkKeys(errors, label, o, FINDING_KEYS);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.code)) errors.push(`${label}: blank code`);
  if (!isNonBlank(o.message)) errors.push(`${label}: blank message`);
  if (typeof o.severity !== "string" || !FINDING_SEVERITIES.has(o.severity)) {
    errors.push(`${label}: severity must be advisory (warning, suggestion, info)`);
  }
  // Findings may be empty, but any declared id must resolve to the source id.
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, sourceId, false);
  return isNonBlank(o.id) ? o.id : null;
}

function validateCanvas(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) {
    errors.push(`${label}: must be an object`);
    return;
  }
  checkKeys(errors, label, o, CANVAS_REQUIRED, CANVAS_OPTIONAL);
  if (!isBoundedPositive(o.width)) {
    errors.push(`${label}.width: must be a finite bounded positive number`);
  }
  if (!isBoundedPositive(o.height)) {
    errors.push(`${label}.height: must be a finite bounded positive number`);
  }
  if ("gridSize" in o && !isBoundedPositive(o.gridSize)) {
    errors.push(`${label}.gridSize: must be a finite bounded positive number when present`);
  }
}

/** Validate an array of element ids for duplicates. */
function pushDupError(errors: string[], label: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) errors.push(`${label}: duplicate id`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a persisted `hld_diagram_output` payload. Fail-closed and closed-shape:
 * unexpected keys at every level are errors, and authority/provider/raw/rendered-
 * output/certification leakage is rejected recursively BEFORE structural checks.
 * Returns a discriminated result; performs NO catalog/pricing/SKU/configuration/
 * design decision - it only checks the internal layout/output contract.
 */
export function validateRfpHldDiagramOutputPayload(
  payload: unknown
): RfpHldDiagramOutputValidationResult {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { ok: false, errors: ["payload: must be an object"] };

  scanForbiddenKeys(errors, "payload", payload);
  scanForbiddenStrings(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_KEYS);

  if (root.payloadKind !== RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");

  // Coarse single-source provenance.
  const sourceId = isTrimmedNonBlank(root.sourceHldDiagramArtifactId)
    ? root.sourceHldDiagramArtifactId
    : null;
  if (sourceId === null) {
    errors.push("payload: sourceHldDiagramArtifactId must be a non-empty trimmed string");
  }
  if (!isPositiveInteger(root.sourceDiagramVersion)) {
    errors.push("payload: sourceDiagramVersion must be a positive integer");
  }
  // sourceArtifactIds must be exactly [sourceHldDiagramArtifactId].
  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (
    sourceId === null ||
    root.sourceArtifactIds.length !== 1 ||
    root.sourceArtifactIds[0] !== sourceId
  ) {
    errors.push("sourceArtifactIds: must be exactly [sourceHldDiagramArtifactId]");
  }

  if (root.outputFormat !== RFP_HLD_DIAGRAM_OUTPUT_FORMAT) {
    errors.push("payload: wrong outputFormat");
  }
  if (root.diagramType !== "topology") errors.push("payload: diagramType must be topology");
  if (!isNonBlank(root.title)) errors.push("payload: blank title");

  validateCanvas(errors, "canvas", root.canvas);

  // Zones first: their ids are the resolution set for node.zoneId.
  const zoneIds: string[] = [];
  if (!Array.isArray(root.zones)) {
    errors.push("zones: must be an array");
  } else {
    root.zones.forEach((z, i) => {
      const id = validateZone(errors, `zones[${i}]`, z, sourceId);
      if (id !== null) zoneIds.push(id);
    });
    pushDupError(errors, "zones", zoneIds);
  }
  const zoneIdSet = new Set<string>(zoneIds);

  // Nodes: ids are the resolution set for link endpoints.
  const nodeIds: string[] = [];
  if (!Array.isArray(root.nodes)) {
    errors.push("nodes: must be an array");
  } else {
    if (root.nodes.length === 0) errors.push("nodes: must not be empty");
    root.nodes.forEach((n, i) => {
      const id = validateNode(errors, `nodes[${i}]`, n, sourceId, zoneIdSet);
      if (id !== null) nodeIds.push(id);
    });
    pushDupError(errors, "nodes", nodeIds);
  }
  const nodeIdSet = new Set<string>(nodeIds);

  const linkIds: string[] = [];
  if (!Array.isArray(root.links)) {
    errors.push("links: must be an array");
  } else {
    root.links.forEach((l, i) => {
      const id = validateLink(errors, `links[${i}]`, l, sourceId, nodeIdSet);
      if (id !== null) linkIds.push(id);
    });
    pushDupError(errors, "links", linkIds);
  }

  const findingIds: string[] = [];
  if (!Array.isArray(root.validationFindings)) {
    errors.push("validationFindings: must be an array");
  } else {
    root.validationFindings.forEach((f, i) => {
      const id = validateFinding(errors, `validationFindings[${i}]`, f, sourceId);
      if (id !== null) findingIds.push(id);
    });
    pushDupError(errors, "validationFindings", findingIds);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: root as unknown as RfpHldDiagramOutputPayload };
}

/** Convenience boolean predicate over {@link validateRfpHldDiagramOutputPayload}. */
export function isValidRfpHldDiagramOutputPayload(payload: unknown): boolean {
  return validateRfpHldDiagramOutputPayload(payload).ok;
}

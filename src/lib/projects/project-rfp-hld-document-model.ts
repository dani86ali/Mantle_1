/**
 * Pure, deterministic RFP HLD DOCUMENT MODEL contract (Stage 6H-A-001).
 *
 * Persisted shape + fail-closed validator for the internal, reviewable
 * `hld_document_model` artifact's `rfp_hld_document_model` payload. The document
 * model is a structured, deterministic spine of an approved `hld_design_model`
 * and its approved `hld_diagram`, compiled over the approved `hld_source_bundle`,
 * for engineer review BEFORE any final HLD document is rendered. It is NOT the
 * final rendered/reviewable `hld_document`, HTML, PDF, DOCX, draw.io/XML,
 * Mermaid/SVG, technical proposal, export, or customer deliverable, and it carries
 * NO SKU/pricing/catalog/configuration/provider/AI authority.
 *
 * Provenance is COARSE: the only referenceable source ids are the three approved
 * upstream artifact ids (source bundle, design model, diagram). Every nested
 * `sourceRefIds` entry resolves only to those coarse ids - never to raw
 * evidence/document text, file/storage paths, provider text, or any
 * catalog/pricing/SKU/config value. There is deliberately NO top-level
 * `sourceReferences` field. Summary/trace/diagram-reference shapes carry no
 * `domain` field, so the only domain authority is coveredDomains/excludedDomains
 * and the contract stays closed.
 *
 * This module is self-contained (no imports) so the closed contract cannot drift
 * with upstream modules, and is ASCII-only.
 */

export const RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND = "rfp_hld_document_model" as const;

/** Diagram projections a document-model reference may point at. Topology only. */
export type RfpHldDocumentModelDiagramType = "topology";

/** Advisory severities a draft may carry. A valid draft never carries a blocker. */
export type RfpHldDocumentModelFindingSeverity = "warning" | "suggestion" | "info";

/** A concise structured text entry traced to coarse upstream artifact ids. */
export interface RfpHldDocumentModelTextEntry {
  id: string;
  text: string;
  sourceRefIds: string[];
}

/** A titled summary section: concise structured text items, all coarsely traced. */
export interface RfpHldDocumentModelSummarySection {
  id: string;
  title: string;
  items: RfpHldDocumentModelTextEntry[];
  sourceRefIds: string[];
}

/**
 * A coarse trace summary - a labelled COUNT of upstream references (e.g. how many
 * compliance/BoQ refs an approved source summary carried). It is a count only and
 * carries NO SKU/pricing/catalog/config authority.
 */
export interface RfpHldDocumentModelTraceSummary {
  id: string;
  label: string;
  referencedCount: number;
  sourceRefIds: string[];
}

/**
 * A structured reference to the approved `hld_diagram` artifact. It points at the
 * diagram by id and type only; it never carries rendered markup, SVG, Mermaid,
 * draw.io/XML, HTML, or any diagram body dump.
 */
export interface RfpHldDocumentModelDiagramReference {
  id: string;
  diagramArtifactId: string;
  diagramTitle: string;
  diagramType: RfpHldDocumentModelDiagramType;
  sourceRefIds: string[];
}

export interface RfpHldDocumentModelValidationFinding {
  id: string;
  severity: RfpHldDocumentModelFindingSeverity;
  code: string;
  message: string;
  sourceRefIds: string[];
}

export interface RfpHldDocumentModelPayload {
  payloadKind: typeof RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND;
  createdAt: string;
  createdBy: string;
  sourceArtifactIds: string[];
  sourceHldSourceBundleArtifactId: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldDiagramArtifactId: string;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
  title: string;
  documentPurpose: string;
  coveredDomains: string[];
  excludedDomains: string[];
  assumptions: RfpHldDocumentModelTextEntry[];
  designSummary: RfpHldDocumentModelSummarySection[];
  topologySummary: RfpHldDocumentModelSummarySection[];
  siteOrScopeSummary: RfpHldDocumentModelSummarySection[];
  implementationNotes: RfpHldDocumentModelTextEntry[];
  dependencies: RfpHldDocumentModelTextEntry[];
  risksAndCaveats: RfpHldDocumentModelTextEntry[];
  complianceTraceSummary: RfpHldDocumentModelTraceSummary[];
  boqTraceSummary: RfpHldDocumentModelTraceSummary[];
  diagramReferences: RfpHldDocumentModelDiagramReference[];
  validationFindings: RfpHldDocumentModelValidationFinding[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const KNOWN_DIAGRAM_REFERENCE_TYPES: ReadonlySet<string> = new Set(["topology"]);

/** Severities a finding may declare. `blocker`/`blocking` is known but rejected. */
const KNOWN_FINDING_SEVERITIES: ReadonlySet<string> = new Set([
  "warning",
  "suggestion",
  "info",
  "blocker",
  "blocking",
]);

const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set(["blocker", "blocking"]);

/**
 * Keys that must never appear anywhere: pricing/SKU/catalog/configuration
 * authority, raw document/source-file/storage references, and provider/AI output.
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
 * certification claim. A document model is internal structured data, never markup.
 */
const GENERATED_OUTPUT_RE =
  /```|<html|<body|<svg|<mxfile|<\?xml|graph TD|flowchart|sequenceDiagram|mermaid|draw\.io|technical proposal|tp\/proposal|export package|final hld|customer deliverable|cisco-certified|cvd-certified|bomatic-certified|ai-certified/i;

const TOP_LEVEL_REQUIRED: readonly string[] = [
  "payloadKind", "createdAt", "createdBy", "sourceArtifactIds",
  "sourceHldSourceBundleArtifactId", "sourceHldDesignModelArtifactId",
  "sourceHldDiagramArtifactId", "sourceModelVersion", "sourceDiagramVersion",
  "title", "documentPurpose", "coveredDomains", "excludedDomains",
  "assumptions", "designSummary", "topologySummary", "siteOrScopeSummary",
  "implementationNotes", "dependencies", "risksAndCaveats",
  "complianceTraceSummary", "boqTraceSummary", "diagramReferences",
  "validationFindings",
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

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
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

/**
 * Validate a sourceRefIds array against the set of coarse upstream artifact ids
 * (source bundle, design model, diagram). Findings may carry none; content
 * entries must carry at least one.
 */
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
      errors.push(`${label}[${i}]: "${id}" is not one of the coarse source artifact ids`);
    }
  });
}

// ---------------------------------------------------------------------------
// Entry validators (each returns the entry id, or null when unusable)
// ---------------------------------------------------------------------------

function validateDomainArray(errors: string[], label: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return []; }
  const out: string[] = [];
  (raw as unknown[]).forEach((d, i) => {
    if (!isNonBlank(d)) { errors.push(`${label}[${i}]: must be a nonblank string`); return; }
    out.push(d as string);
  });
  if (hasDups(out)) errors.push(`${label}: duplicate domain`);
  return out;
}

function validateTextEntry(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "text", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.text)) errors.push(`${label}: blank text`);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, false);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

function validateSummarySection(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "title", "items", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.title)) errors.push(`${label}: blank title`);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, false);
  if (!Array.isArray(o.items)) {
    errors.push(`${label}.items: must be an array`);
  } else {
    const ids: string[] = [];
    (o.items as unknown[]).forEach((it, i) => {
      const id = validateTextEntry(errors, `${label}.items[${i}]`, it, validRefIds);
      if (id !== null) ids.push(id);
    });
    if (hasDups(ids)) errors.push(`${label}.items: duplicate ids`);
  }
  return isNonBlank(o.id) ? (o.id as string) : null;
}

function validateTraceSummary(
  errors: string[], label: string, raw: unknown, validRefIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "label", "referencedCount", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if (!isNonNegInt(o.referencedCount)) {
    errors.push(`${label}: referencedCount must be a non-negative integer`);
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, false);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

function validateDiagramReference(
  errors: string[], label: string, raw: unknown,
  validRefIds: ReadonlySet<string>, diagramId: string | null
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "diagramArtifactId", "diagramTitle", "diagramType", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.diagramTitle)) errors.push(`${label}: blank diagramTitle`);
  if (typeof o.diagramType !== "string" || !KNOWN_DIAGRAM_REFERENCE_TYPES.has(o.diagramType)) {
    errors.push(`${label}: unknown diagramType`);
  }
  if (!isNonBlank(o.diagramArtifactId)) {
    errors.push(`${label}: blank diagramArtifactId`);
  } else if (diagramId !== null && o.diagramArtifactId !== diagramId) {
    errors.push(`${label}: diagramArtifactId must equal sourceHldDiagramArtifactId`);
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
    errors.push(`${label}: blocking finding not allowed in a valid persisted document model`);
  }
  // Findings need not carry a sourceRefId, but any they declare must resolve.
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validRefIds, true);
  return isNonBlank(o.id) ? (o.id as string) : null;
}

/** Drive a per-item validator across an array, flagging non-array and duplicate ids. */
function validateEntryArray(
  errors: string[], label: string, raw: unknown,
  validateItem: (e: string[], l: string, r: unknown) => string | null,
  requireNonEmpty: boolean
): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  if (requireNonEmpty && (raw as unknown[]).length === 0) {
    errors.push(`${label}: must not be empty`);
  }
  const ids: string[] = [];
  (raw as unknown[]).forEach((item, i) => {
    const id = validateItem(errors, `${label}[${i}]`, item);
    if (id !== null) ids.push(id);
  });
  if (hasDups(ids)) errors.push(`${label}: duplicate ids`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fail-closed validator for a persisted `rfp_hld_document_model` payload. Returns
 * `{ valid, errors }`; deterministic and ASCII-only. A model is valid only when
 * the closed contract holds end to end: exact kind, ISO-UTC createdAt and nonblank
 * createdBy, three nonblank distinct source ids whose ordered list is exactly
 * [bundle, model, diagram], positive integer model/diagram versions, nonblank
 * title and documentPurpose, nonblank/unique non-overlapping covered/excluded
 * domains, every content entry carrying a resolving coarse sourceRefId, at least
 * one diagramReference pointing at sourceHldDiagramArtifactId, only advisory
 * findings, and no pricing/SKU/catalog/config/raw/provider key or
 * generated-output string anywhere.
 */
export function validateRfpHldDocumentModelPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  scanForbiddenKeys(errors, "payload", payload);
  scanGeneratedStrings(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_REQUIRED);

  if (root.payloadKind !== RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");
  if (!isVersion(root.sourceModelVersion)) errors.push("payload: invalid sourceModelVersion");
  if (!isVersion(root.sourceDiagramVersion)) errors.push("payload: invalid sourceDiagramVersion");
  if (!isNonBlank(root.title)) errors.push("payload: blank title");
  if (!isNonBlank(root.documentPurpose)) errors.push("payload: blank documentPurpose");

  const bundleId = isNonBlank(root.sourceHldSourceBundleArtifactId)
    ? (root.sourceHldSourceBundleArtifactId as string) : null;
  const modelId = isNonBlank(root.sourceHldDesignModelArtifactId)
    ? (root.sourceHldDesignModelArtifactId as string) : null;
  const diagramId = isNonBlank(root.sourceHldDiagramArtifactId)
    ? (root.sourceHldDiagramArtifactId as string) : null;
  if (bundleId === null) errors.push("payload: blank sourceHldSourceBundleArtifactId");
  if (modelId === null) errors.push("payload: blank sourceHldDesignModelArtifactId");
  if (diagramId === null) errors.push("payload: blank sourceHldDiagramArtifactId");
  if (bundleId !== null && modelId !== null && bundleId === modelId) {
    errors.push("payload: sourceHldSourceBundleArtifactId equals sourceHldDesignModelArtifactId");
  }
  if (bundleId !== null && diagramId !== null && bundleId === diagramId) {
    errors.push("payload: sourceHldSourceBundleArtifactId equals sourceHldDiagramArtifactId");
  }
  if (modelId !== null && diagramId !== null && modelId === diagramId) {
    errors.push("payload: sourceHldDesignModelArtifactId equals sourceHldDiagramArtifactId");
  }

  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (bundleId !== null && modelId !== null && diagramId !== null) {
    const ids = root.sourceArtifactIds as unknown[];
    if (ids.length !== 3 || ids[0] !== bundleId || ids[1] !== modelId || ids[2] !== diagramId) {
      errors.push(
        "sourceArtifactIds: must be exactly [sourceHldSourceBundleArtifactId, sourceHldDesignModelArtifactId, sourceHldDiagramArtifactId]"
      );
    }
  }

  // Coarse provenance: every nested sourceRefId must resolve to one of the three
  // approved upstream artifact ids. There is no top-level sourceReferences field.
  const validRefIds = new Set<string>();
  if (bundleId !== null) validRefIds.add(bundleId);
  if (modelId !== null) validRefIds.add(modelId);
  if (diagramId !== null) validRefIds.add(diagramId);

  const coveredDomains = validateDomainArray(errors, "coveredDomains", root.coveredDomains);
  const excludedDomains = validateDomainArray(errors, "excludedDomains", root.excludedDomains);
  const excludedSet = new Set(excludedDomains);
  if (coveredDomains.some((d) => excludedSet.has(d))) {
    errors.push("domains: coveredDomains overlaps excludedDomains");
  }

  const textEntry = (e: string[], l: string, r: unknown) => validateTextEntry(e, l, r, validRefIds);
  const summary = (e: string[], l: string, r: unknown) => validateSummarySection(e, l, r, validRefIds);
  const trace = (e: string[], l: string, r: unknown) => validateTraceSummary(e, l, r, validRefIds);
  const finding = (e: string[], l: string, r: unknown) => validateFinding(e, l, r, validRefIds);
  const diagramRef = (e: string[], l: string, r: unknown) =>
    validateDiagramReference(e, l, r, validRefIds, diagramId);

  validateEntryArray(errors, "assumptions", root.assumptions, textEntry, false);
  validateEntryArray(errors, "designSummary", root.designSummary, summary, false);
  validateEntryArray(errors, "topologySummary", root.topologySummary, summary, false);
  validateEntryArray(errors, "siteOrScopeSummary", root.siteOrScopeSummary, summary, false);
  validateEntryArray(errors, "implementationNotes", root.implementationNotes, textEntry, false);
  validateEntryArray(errors, "dependencies", root.dependencies, textEntry, false);
  validateEntryArray(errors, "risksAndCaveats", root.risksAndCaveats, textEntry, false);
  validateEntryArray(errors, "complianceTraceSummary", root.complianceTraceSummary, trace, false);
  validateEntryArray(errors, "boqTraceSummary", root.boqTraceSummary, trace, false);
  validateEntryArray(errors, "diagramReferences", root.diagramReferences, diagramRef, true);
  validateEntryArray(errors, "validationFindings", root.validationFindings, finding, false);

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDocumentModelPayload(payload: unknown): boolean {
  return validateRfpHldDocumentModelPayload(payload).valid;
}

/**
 * Pure, deterministic RFP HLD DOCUMENT contract (Stage 6H-0I-A).
 *
 * Persisted shape + fail-closed validator for the FINAL rendered/reviewable
 * `hld_document` artifact's `rfp_hld_document` payload. This lane records a SE
 * MANUAL draw.io upload: an engineer-authored final HLD topology drawing plus its
 * source-chain proof, supersession record, and audit metadata. It is distinct from
 * the internal, structured `hld_document_model`. The uploaded draw.io XML is the
 * only rendered body the payload carries, and it lives ONLY in the dedicated
 * `drawioXml` field.
 *
 * The artifact becomes runtime/customer HLD authority ONLY through the normal human
 * approval record (see `finalAuthority.effectiveWhenArtifactStatus`). The payload
 * itself carries NO provider/prompt/AI authority, NO raw file/storage reads, and NO
 * SKU/pricing/catalog/configuration authority; and it never claims any Cisco/CVD/
 * BOMATIC/AI certification. Claude output remains candidate-only; OpenAI advisory
 * review is an internal gate, never final authority.
 *
 * Source ids are COARSE artifact pointers: exactly the four approved upstream ids
 * [source bundle, design model, diagram, document model]. This module is
 * self-contained (no imports) so the closed contract cannot drift with upstream
 * modules, and is ASCII-only.
 */

export const RFP_HLD_DOCUMENT_PAYLOAD_KIND = "rfp_hld_document" as const;

/** The only supported authoring mode for this slice: a SE manual draw.io upload. */
export const RFP_HLD_DOCUMENT_SOURCE_MODE = "manual_drawio_upload" as const;

/** The only recognised final-authority kind: a SE manual draw.io upload. */
export const RFP_HLD_DOCUMENT_AUTHORITY_KIND = "se_manual_drawio_upload" as const;

/** Authority takes effect only once the artifact itself is human-approved. */
export const RFP_HLD_DOCUMENT_AUTHORITY_STATUS = "approved" as const;

/**
 * Manual final-authority declaration. It is a promise about WHEN the upload
 * becomes authority (on approval), not the authority itself. The nested object is
 * closed: only these two keys, each pinned to its single legal value.
 */
export interface RfpHldDocumentFinalAuthority {
  authorityKind: typeof RFP_HLD_DOCUMENT_AUTHORITY_KIND;
  effectiveWhenArtifactStatus: typeof RFP_HLD_DOCUMENT_AUTHORITY_STATUS;
}

export interface RfpHldDocumentPayload {
  payloadKind: typeof RFP_HLD_DOCUMENT_PAYLOAD_KIND;
  sourceMode: typeof RFP_HLD_DOCUMENT_SOURCE_MODE;
  createdAt: string;
  createdBy: string;
  title: string;
  uploadedFileName: string;
  /** The uploaded draw.io XML body - the ONLY field allowed to carry markup. */
  drawioXml: string;
  sourceArtifactIds: string[];
  sourceHldSourceBundleArtifactId: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldDiagramArtifactId: string;
  sourceHldDocumentModelArtifactId: string;
  sourceBundleVersion: number;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
  sourceDocumentModelVersion: number;
  finalAuthority: RfpHldDocumentFinalAuthority;
  /**
   * Audit record of the artifacts this manual upload supersedes. It MUST include
   * at least the source diagram and document-model ids, and may only reference the
   * four coarse source ids.
   */
  supersedesArtifactIds: string[];
  /** Optional short SE audit note. Never markup; never authority. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Keep the uploaded body bounded and deterministic. */
const MAX_DRAWIO_XML_LENGTH = 500_000;

/** A draw.io export filename. No path separators; a .drawio/.xml extension. */
const DRAWIO_FILE_NAME_RE = /^[^\\/\r\n\t]+\.(?:drawio|xml)$/i;

const TOP_LEVEL_REQUIRED: readonly string[] = [
  "payloadKind", "sourceMode", "createdAt", "createdBy", "title",
  "uploadedFileName", "drawioXml", "sourceArtifactIds",
  "sourceHldSourceBundleArtifactId", "sourceHldDesignModelArtifactId",
  "sourceHldDiagramArtifactId", "sourceHldDocumentModelArtifactId",
  "sourceBundleVersion", "sourceModelVersion", "sourceDiagramVersion",
  "sourceDocumentModelVersion", "finalAuthority", "supersedesArtifactIds",
];

const TOP_LEVEL_OPTIONAL: readonly string[] = ["note"];

const FINAL_AUTHORITY_REQUIRED: readonly string[] = [
  "authorityKind", "effectiveWhenArtifactStatus",
];

/**
 * Keys that must never appear anywhere: pricing/SKU/catalog/configuration
 * authority, raw document/source-file/storage references, and provider/AI/prompt
 * output. `drawioXml` is NOT forbidden - it is the one permitted markup field.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "sku", "acceptedSku", "replacementSku", "skuSubstitution",
  "unitPrice", "totalPrice", "pricing", "price",
  "quantityChange", "catalogDecision", "configurationDecision",
  "rawText", "documentText", "evidenceText", "sourceText", "rawEvidence",
  "fileBytes", "sourceBytes", "filePath", "sourceFilePath", "storagePath",
  "fileId", "sourceFileId", "sourceFileIds", "storageRef", "objectKey",
  "providerText", "providerResponse", "aiResponse", "llmResponse",
  "modelName", "prompt", "completion", "systemPrompt",
]);

/**
 * Non-`drawioXml` strings must never carry markup, code fences, diagram DSLs, a
 * javascript: URL, or a certification claim. The draw.io body is scanned
 * separately by the XML checker.
 */
const MARKUP_OR_CERT_RE =
  /```|<\s*[a-zA-Z!/?]|mermaid|graph TD|flowchart|sequenceDiagram|javascript:|data:text\/html|certified/i;

/** Unsafe XML constructs a draw.io upload must never contain. */
const UNSAFE_XML_RE =
  /<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?|<\s*script\b|javascript:|data:text\/html|\son[a-z]+\s*=/i;

/** A raw or custom entity reference (anything but the five XML built-ins / numerics). */
const BAD_ENTITY_RE = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

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

/**
 * Scan every string EXCEPT the dedicated `drawioXml` field for markup, code
 * fences, diagram DSLs, or certification claims. Error strings carry only labels
 * and never the offending value, so no payload body leaks.
 */
function scanMarkupStrings(errors: string[], label: string, value: unknown): void {
  if (typeof value === "string") {
    if (MARKUP_OR_CERT_RE.test(value)) errors.push(`${label}: disallowed markup or certification claim`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanMarkupStrings(errors, `${label}[${i}]`, item));
  } else {
    const o = asObject(value);
    if (o) {
      for (const [k, v] of Object.entries(o)) {
        if (k === "drawioXml") continue;
        scanMarkupStrings(errors, `${label}.${k}`, v);
      }
    }
  }
}

/**
 * Fail-closed draw.io XML checker. Returns true only when the value is a bounded,
 * well-formed, single-root `<mxfile>` document free of unsafe constructs. It never
 * echoes the body: on any failure it only pushes a static message under `label`.
 */
function checkDrawioXml(errors: string[], label: string, value: unknown): void {
  if (typeof value !== "string") { errors.push(`${label}: must be a string`); return; }
  const xml = value.trim();
  if (xml === "") { errors.push(`${label}: must not be blank`); return; }
  if (value.length > MAX_DRAWIO_XML_LENGTH) { errors.push(`${label}: exceeds maximum size`); return; }
  if (UNSAFE_XML_RE.test(xml)) { errors.push(`${label}: contains an unsafe XML construct`); return; }
  if (BAD_ENTITY_RE.test(xml)) { errors.push(`${label}: contains a disallowed entity reference`); return; }
  // Non-draw.io XML: the root element must be <mxfile ...> ... </mxfile>.
  if (!/^<mxfile[\s>]/.test(xml) || !/<\/mxfile>$/.test(xml)) {
    errors.push(`${label}: is not a draw.io mxfile document`);
    return;
  }
  if (!isWellFormedXml(xml)) errors.push(`${label}: is not well-formed XML`);
}

/**
 * Minimal, deterministic well-formedness check: balanced, properly quoted,
 * single-root tags with no stray angle brackets. Sufficient to reject malformed
 * uploads without a parser dependency. Comments/PIs/CDATA/doctype are already
 * rejected by {@link UNSAFE_XML_RE} before this runs.
 */
function isWellFormedXml(xml: string): boolean {
  const tag = /<(\/?)([A-Za-z_][\w.\-:]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  const attrs = /^(?:\s+[A-Za-z_:][\w.\-:]*\s*=\s*"[^"<>]*"|\s+[A-Za-z_:][\w.\-:]*\s*=\s*'[^'<>]*')*\s*$/;
  const stack: string[] = [];
  let lastIndex = 0;
  let rootsClosed = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(xml)) !== null) {
    const between = xml.slice(lastIndex, match.index);
    if (between.includes("<") || between.includes(">")) return false;
    lastIndex = tag.lastIndex;
    const [, closing, name, attrString, selfClose] = match;
    if (!attrs.test(attrString)) return false;
    if (closing === "/") {
      if (selfClose === "/") return false;
      if (stack.pop() !== name) return false;
      if (stack.length === 0) rootsClosed += 1;
    } else {
      if (stack.length === 0 && rootsClosed > 0) return false; // second root
      if (selfClose === "/") {
        if (stack.length === 0) rootsClosed += 1;
      } else {
        stack.push(name);
      }
    }
  }
  const trailing = xml.slice(lastIndex);
  if (trailing.includes("<") || trailing.includes(">")) return false;
  return stack.length === 0 && rootsClosed === 1;
}

function validateFinalAuthority(errors: string[], raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push("finalAuthority: must be an object"); return; }
  checkKeys(errors, "finalAuthority", o, FINAL_AUTHORITY_REQUIRED);
  if (o.authorityKind !== RFP_HLD_DOCUMENT_AUTHORITY_KIND) {
    errors.push("finalAuthority: authorityKind must be se_manual_drawio_upload");
  }
  if (o.effectiveWhenArtifactStatus !== RFP_HLD_DOCUMENT_AUTHORITY_STATUS) {
    errors.push("finalAuthority: effectiveWhenArtifactStatus must be approved");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fail-closed validator for a persisted `rfp_hld_document` payload. Returns
 * `{ valid, errors }`; deterministic and ASCII-only, and NEVER echoes the drawio
 * body or raw payload body in any error string. A payload is valid only when the
 * closed contract holds end to end: exact kind/mode, ISO-UTC createdAt, nonblank
 * createdBy/title, a draw.io uploadedFileName, a bounded well-formed single-root
 * `<mxfile>` drawioXml with no unsafe construct, four nonblank distinct source ids
 * whose ordered list is exactly [bundle, model, diagram, documentModel], positive
 * integer versions for all four, a closed finalAuthority pinned to a manual upload
 * effective on approval, a supersedesArtifactIds set drawn from the four source ids
 * that includes at least the diagram and document-model ids, no markup outside
 * drawioXml, and no pricing/SKU/catalog/config/raw/provider/prompt key or
 * certification claim anywhere.
 */
export function validateRfpHldDocumentPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  scanForbiddenKeys(errors, "payload", payload);
  scanMarkupStrings(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_REQUIRED, TOP_LEVEL_OPTIONAL);

  if (root.payloadKind !== RFP_HLD_DOCUMENT_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }
  if (root.sourceMode !== RFP_HLD_DOCUMENT_SOURCE_MODE) {
    errors.push("payload: wrong sourceMode");
  }
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isNonBlank(root.title)) errors.push("payload: blank title");
  if (typeof root.uploadedFileName !== "string" || !DRAWIO_FILE_NAME_RE.test(root.uploadedFileName)) {
    errors.push("payload: uploadedFileName is not a draw.io file name");
  }
  if ("note" in root && !isNonBlank(root.note)) {
    errors.push("payload: note, when present, must be a nonblank string");
  }

  checkDrawioXml(errors, "drawioXml", root.drawioXml);

  if (!isVersion(root.sourceBundleVersion)) errors.push("payload: invalid sourceBundleVersion");
  if (!isVersion(root.sourceModelVersion)) errors.push("payload: invalid sourceModelVersion");
  if (!isVersion(root.sourceDiagramVersion)) errors.push("payload: invalid sourceDiagramVersion");
  if (!isVersion(root.sourceDocumentModelVersion)) errors.push("payload: invalid sourceDocumentModelVersion");

  const bundleId = isNonBlank(root.sourceHldSourceBundleArtifactId)
    ? (root.sourceHldSourceBundleArtifactId as string) : null;
  const modelId = isNonBlank(root.sourceHldDesignModelArtifactId)
    ? (root.sourceHldDesignModelArtifactId as string) : null;
  const diagramId = isNonBlank(root.sourceHldDiagramArtifactId)
    ? (root.sourceHldDiagramArtifactId as string) : null;
  const documentModelId = isNonBlank(root.sourceHldDocumentModelArtifactId)
    ? (root.sourceHldDocumentModelArtifactId as string) : null;
  if (bundleId === null) errors.push("payload: blank sourceHldSourceBundleArtifactId");
  if (modelId === null) errors.push("payload: blank sourceHldDesignModelArtifactId");
  if (diagramId === null) errors.push("payload: blank sourceHldDiagramArtifactId");
  if (documentModelId === null) errors.push("payload: blank sourceHldDocumentModelArtifactId");

  const idList = [bundleId, modelId, diagramId, documentModelId];
  const allIdsPresent = idList.every((id): id is string => id !== null);
  if (allIdsPresent && hasDups(idList as string[])) {
    errors.push("payload: source ids must be four distinct ids");
  }

  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (allIdsPresent) {
    const ids = root.sourceArtifactIds as unknown[];
    if (
      ids.length !== 4 ||
      ids[0] !== bundleId || ids[1] !== modelId ||
      ids[2] !== diagramId || ids[3] !== documentModelId
    ) {
      errors.push(
        "sourceArtifactIds: must be exactly [bundle, model, diagram, documentModel]"
      );
    }
  }

  validateFinalAuthority(errors, root.finalAuthority);

  if (!Array.isArray(root.supersedesArtifactIds)) {
    errors.push("supersedesArtifactIds: must be an array");
  } else {
    const supersedes = root.supersedesArtifactIds as unknown[];
    const validSet = new Set<string>(idList.filter((id): id is string => id !== null));
    const seen: string[] = [];
    supersedes.forEach((id, i) => {
      if (!isNonBlank(id)) { errors.push(`supersedesArtifactIds[${i}]: blank id`); return; }
      if (!validSet.has(id as string)) {
        errors.push(`supersedesArtifactIds[${i}]: not one of the four source ids`);
        return;
      }
      seen.push(id as string);
    });
    if (hasDups(seen)) errors.push("supersedesArtifactIds: duplicate id");
    if (diagramId !== null && !seen.includes(diagramId)) {
      errors.push("supersedesArtifactIds: must include the source diagram id");
    }
    if (documentModelId !== null && !seen.includes(documentModelId)) {
      errors.push("supersedesArtifactIds: must include the source document model id");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDocumentPayload(payload: unknown): boolean {
  return validateRfpHldDocumentPayload(payload).valid;
}

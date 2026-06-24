/**
 * Pure, deterministic RFP HLD design-model CONTRACT (Stage 6C-002a).
 * Persisted shape + fail-closed validator for the `rfp_hld_design_model` artifact.
 * Carries no SKU/pricing/catalog/config/AI authority.
 */
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import { RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-source-bundle";

export const RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND = "rfp_hld_design_model" as const;

export type RfpHldDesignModelSourceReferenceKind =
  | "source_bundle"
  | "authority"
  | "knowledge_pack"
  | "assumption"
  | "constraint"
  | "domain_rationale"
  | "hld_intake_rationale";

export interface RfpHldDesignModelSourceReference {
  id: string;
  kind: RfpHldDesignModelSourceReferenceKind;
  artifactId?: string;
  domain?: RfpHldDesignDomain;
  label?: string;
}

export interface RfpHldDesignModelRefId {
  refId: string;
}

export interface RfpHldDesignModelDecision {
  id: string;
  label: string;
  sourceRefIds: string[];
}

export interface RfpHldDesignModelDesignSection {
  id: string;
  domain: RfpHldDesignDomain;
  title: string;
  sourceRefIds: string[];
  decisions: RfpHldDesignModelDecision[];
}

export interface RfpHldDesignModelNode {
  id: string;
  label: string;
  nodeType: string;
  domain?: RfpHldDesignDomain;
  sourceRefIds: string[];
}

export interface RfpHldDesignModelLink {
  id: string;
  label: string;
  fromNodeId: string;
  toNodeId: string;
  linkType: string;
  sourceRefIds: string[];
}

export interface RfpHldDesignModelZone {
  id: string;
  label: string;
  domain?: RfpHldDesignDomain;
  nodeIds: string[];
  sourceRefIds: string[];
}

export interface RfpHldDesignModelTopology {
  nodes: RfpHldDesignModelNode[];
  links: RfpHldDesignModelLink[];
  zones: RfpHldDesignModelZone[];
}

export interface RfpHldDesignModelDiagramIntent {
  id: string;
  title: string;
  intentType: string;
  sourceRefIds: string[];
}

export interface RfpHldDesignModelTraceability {
  requirementRefs: RfpHldDesignModelRefId[];
  complianceRefs: RfpHldDesignModelRefId[];
  configurationRefs: RfpHldDesignModelRefId[];
  sourceBundleRefs: RfpHldDesignModelRefId[];
}

export type RfpHldDesignModelFindingSeverity = "blocker" | "warning" | "suggestion" | "info";

export interface RfpHldDesignModelValidationFinding {
  id: string;
  severity: RfpHldDesignModelFindingSeverity;
  code: string;
  message: string;
  sourceRefIds: string[];
}

export interface RfpHldDesignModelEngineerReview {
  status: string;
  requiredActions: string[];
}

export interface RfpHldDesignModelPayload {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceArtifactIds: string[];
  sourceHldSourceBundleArtifactId: string;
  sourceBundleVersion: number;
  sourceBundlePayloadKind: string;
  coveredDomains: RfpHldDesignDomain[];
  excludedDomains: RfpHldDesignDomain[];
  sourceReferences: RfpHldDesignModelSourceReference[];
  assumptionRefs: RfpHldDesignModelRefId[];
  constraintRefs: RfpHldDesignModelRefId[];
  designSections: RfpHldDesignModelDesignSection[];
  topology: RfpHldDesignModelTopology;
  diagramIntents: RfpHldDesignModelDiagramIntent[];
  traceability: RfpHldDesignModelTraceability;
  validationFindings: RfpHldDesignModelValidationFinding[];
  engineerReview?: RfpHldDesignModelEngineerReview;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const SOURCE_REFERENCE_KINDS: ReadonlySet<string> = new Set([
  "source_bundle", "authority", "knowledge_pack", "assumption",
  "constraint", "domain_rationale", "hld_intake_rationale",
]);

const VALID_FINDING_SEVERITIES: ReadonlySet<string> = new Set([
  "blocker", "warning", "suggestion", "info",
]);

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "sku", "acceptedSku", "replacementSku", "skuSubstitution",
  "unitPrice", "totalPrice", "pricing", "price",
  "quantityChange", "catalogDecision", "configurationDecision",
]);

const GENERATED_OUTPUT_RE = /```|graph TD|flowchart|sequenceDiagram|<mxfile|<html|<body|<svg|<\?xml/i;

const TOP_LEVEL_REQUIRED: readonly string[] = [
  "payloadKind", "createdBy", "createdAt", "sourceArtifactIds",
  "sourceHldSourceBundleArtifactId", "sourceBundleVersion", "sourceBundlePayloadKind",
  "coveredDomains", "excludedDomains", "sourceReferences", "assumptionRefs",
  "constraintRefs", "designSections", "topology", "diagramIntents",
  "traceability", "validationFindings",
];
const TOP_LEVEL_OPTIONAL: readonly string[] = ["engineerReview"];

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

function validateDomainArray(errors: string[], label: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return []; }
  const out: string[] = [];
  for (const d of raw) {
    if (typeof d !== "string" || !KNOWN_DOMAINS.has(d)) {
      errors.push(`${label}: invalid domain "${d}"`);
      continue;
    }
    out.push(d);
  }
  if (hasDups(out)) errors.push(`${label}: duplicate domain`);
  return out;
}

function validateSourceReference(errors: string[], label: string, raw: unknown): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "kind"], ["artifactId", "domain", "label"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!SOURCE_REFERENCE_KINDS.has(o.kind as string)) errors.push(`${label}: invalid kind`);
  if ("artifactId" in o && !isNonBlank(o.artifactId)) errors.push(`${label}: blank artifactId`);
  if ("domain" in o && !(typeof o.domain === "string" && KNOWN_DOMAINS.has(o.domain))) {
    errors.push(`${label}: invalid domain`);
  }
  if ("label" in o && !isNonBlank(o.label)) errors.push(`${label}: blank label`);
  return isNonBlank(o.id) ? o.id : null;
}

function validateRefIdArray(
  errors: string[], label: string, raw: unknown, validIds: ReadonlySet<string>
): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  (raw as unknown[]).forEach((item, i) => {
    const o = asObject(item);
    if (!o) { errors.push(`${label}[${i}]: must be an object`); return; }
    checkKeys(errors, `${label}[${i}]`, o, ["refId"]);
    if (!isNonBlank(o.refId)) errors.push(`${label}[${i}]: blank refId`);
    else if (!validIds.has(o.refId as string)) {
      errors.push(`${label}[${i}]: refId "${o.refId}" not in sourceReferences`);
    }
  });
}

function validateSourceRefIds(
  errors: string[], label: string, raw: unknown, validIds: ReadonlySet<string>
): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  if ((raw as unknown[]).length === 0) errors.push(`${label}: must not be empty`);
  (raw as unknown[]).forEach((id, i) => {
    if (!isNonBlank(id)) errors.push(`${label}[${i}]: blank sourceRefId`);
    else if (!validIds.has(id as string)) {
      errors.push(`${label}[${i}]: "${id}" not in sourceReferences`);
    }
  });
}

function validateDecision(
  errors: string[], label: string, raw: unknown, validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "label", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  return isNonBlank(o.id) ? o.id : null;
}

function validateDesignSection(
  errors: string[], label: string, raw: unknown,
  coveredSet: ReadonlySet<string>, excludedSet: ReadonlySet<string>,
  validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "domain", "title", "sourceRefIds", "decisions"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.title)) errors.push(`${label}: blank title`);
  const dom = o.domain;
  if (typeof dom !== "string" || !KNOWN_DOMAINS.has(dom)) {
    errors.push(`${label}: invalid domain`);
  } else if (!coveredSet.has(dom)) {
    errors.push(`${label}: domain not in coveredDomains`);
  } else if (excludedSet.has(dom)) {
    errors.push(`${label}: domain is in excludedDomains`);
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  const decisionIds: string[] = [];
  if (!Array.isArray(o.decisions)) {
    errors.push(`${label}.decisions: must be an array`);
  } else {
    (o.decisions as unknown[]).forEach((d, i) => {
      const id = validateDecision(errors, `${label}.decisions[${i}]`, d, validIds);
      if (id !== null) decisionIds.push(id);
    });
    if (hasDups(decisionIds)) errors.push(`${label}.decisions: duplicate ids`);
  }
  return isNonBlank(o.id) ? o.id : null;
}

function validateTopologyNode(
  errors: string[], label: string, raw: unknown, validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "label", "nodeType", "sourceRefIds"], ["domain"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if (!isNonBlank(o.nodeType)) errors.push(`${label}: blank nodeType`);
  if ("domain" in o && !(typeof o.domain === "string" && KNOWN_DOMAINS.has(o.domain))) {
    errors.push(`${label}: invalid domain`);
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  return isNonBlank(o.id) ? o.id : null;
}

function validateTopologyLink(
  errors: string[], label: string, raw: unknown,
  nodeIds: ReadonlySet<string>, validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "label", "fromNodeId", "toNodeId", "linkType", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if (!isNonBlank(o.linkType)) errors.push(`${label}: blank linkType`);
  if (!isNonBlank(o.fromNodeId)) errors.push(`${label}: blank fromNodeId`);
  else if (!nodeIds.has(o.fromNodeId as string)) errors.push(`${label}: fromNodeId not in topology.nodes`);
  if (!isNonBlank(o.toNodeId)) errors.push(`${label}: blank toNodeId`);
  else if (!nodeIds.has(o.toNodeId as string)) errors.push(`${label}: toNodeId not in topology.nodes`);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  return isNonBlank(o.id) ? o.id : null;
}

function validateTopologyZone(
  errors: string[], label: string, raw: unknown,
  nodeIds: ReadonlySet<string>, validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "label", "nodeIds", "sourceRefIds"], ["domain"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  if ("domain" in o && !(typeof o.domain === "string" && KNOWN_DOMAINS.has(o.domain))) {
    errors.push(`${label}: invalid domain`);
  }
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
        if (!nodeIds.has(nid as string)) errors.push(`${label}.nodeIds[${i}]: not in topology.nodes`);
      }
    });
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  return isNonBlank(o.id) ? o.id : null;
}

function validateDiagramIntent(
  errors: string[], label: string, raw: unknown, validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "title", "intentType", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.title)) errors.push(`${label}: blank title`);
  if (!isNonBlank(o.intentType)) errors.push(`${label}: blank intentType`);
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  return isNonBlank(o.id) ? o.id : null;
}

function validateValidationFinding(
  errors: string[], label: string, raw: unknown, validIds: ReadonlySet<string>
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, ["id", "severity", "code", "message", "sourceRefIds"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.code)) errors.push(`${label}: blank code`);
  if (!isNonBlank(o.message)) errors.push(`${label}: blank message`);
  if (!VALID_FINDING_SEVERITIES.has(o.severity as string)) {
    errors.push(`${label}: invalid severity`);
  } else if (o.severity === "blocker") {
    errors.push(`${label}: blocker finding not allowed in a valid persisted model`);
  }
  validateSourceRefIds(errors, `${label}.sourceRefIds`, o.sourceRefIds, validIds);
  return isNonBlank(o.id) ? o.id : null;
}

function validateEngineerReview(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return; }
  checkKeys(errors, label, o, ["status", "requiredActions"]);
  if (!isNonBlank(o.status)) errors.push(`${label}: blank status`);
  if (!Array.isArray(o.requiredActions)) {
    errors.push(`${label}.requiredActions: must be an array`);
  } else {
    (o.requiredActions as unknown[]).forEach((a, i) => {
      if (!isNonBlank(a)) errors.push(`${label}.requiredActions[${i}]: must be a nonblank string`);
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateRfpHldDesignModelPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  scanForbiddenKeys(errors, "payload", payload);
  scanGeneratedStrings(errors, "payload", payload);

  checkKeys(errors, "payload", root, TOP_LEVEL_REQUIRED, TOP_LEVEL_OPTIONAL);

  if (root.payloadKind !== RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND) {
    errors.push("payload: wrong payloadKind");
  }
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");
  if (!isNonBlank(root.sourceHldSourceBundleArtifactId)) {
    errors.push("payload: blank sourceHldSourceBundleArtifactId");
  }
  if (!isVersion(root.sourceBundleVersion)) errors.push("payload: invalid sourceBundleVersion");
  if (root.sourceBundlePayloadKind !== RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND) {
    errors.push(`payload: sourceBundlePayloadKind must be "${RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND}"`);
  }

  const bundleId = isNonBlank(root.sourceHldSourceBundleArtifactId)
    ? (root.sourceHldSourceBundleArtifactId as string)
    : null;
  if (!Array.isArray(root.sourceArtifactIds)) {
    errors.push("sourceArtifactIds: must be an array");
  } else if (bundleId !== null) {
    const ids = root.sourceArtifactIds as unknown[];
    if (ids.length !== 1 || ids[0] !== bundleId) {
      errors.push("sourceArtifactIds: must be exactly [sourceHldSourceBundleArtifactId]");
    }
  }

  const coveredDomains = validateDomainArray(errors, "coveredDomains", root.coveredDomains);
  const excludedDomains = validateDomainArray(errors, "excludedDomains", root.excludedDomains);
  const coveredSet = new Set(coveredDomains);
  const excludedSet = new Set(excludedDomains);
  if (coveredDomains.some((d) => excludedSet.has(d))) errors.push("domains: covered overlaps excluded");

  const sourceRefIdSet = new Set<string>();
  if (!Array.isArray(root.sourceReferences)) {
    errors.push("sourceReferences: must be an array");
  } else {
    const ids: string[] = [];
    (root.sourceReferences as unknown[]).forEach((ref, i) => {
      const id = validateSourceReference(errors, `sourceReferences[${i}]`, ref);
      if (id !== null) { ids.push(id); sourceRefIdSet.add(id); }
    });
    if (hasDups(ids)) errors.push("sourceReferences: duplicate ids");
  }

  validateRefIdArray(errors, "assumptionRefs", root.assumptionRefs, sourceRefIdSet);
  validateRefIdArray(errors, "constraintRefs", root.constraintRefs, sourceRefIdSet);

  const sectionIds: string[] = [];
  if (!Array.isArray(root.designSections)) {
    errors.push("designSections: must be an array");
  } else {
    (root.designSections as unknown[]).forEach((sec, i) => {
      const id = validateDesignSection(
        errors, `designSections[${i}]`, sec, coveredSet, excludedSet, sourceRefIdSet
      );
      if (id !== null) sectionIds.push(id);
    });
    if (hasDups(sectionIds)) errors.push("designSections: duplicate ids");
  }

  const nodeIdSet = new Set<string>();
  const topo = asObject(root.topology);
  if (!topo) {
    errors.push("topology: must be an object");
  } else {
    checkKeys(errors, "topology", topo, ["nodes", "links", "zones"]);
    if (!Array.isArray(topo.nodes)) {
      errors.push("topology.nodes: must be an array");
    } else {
      const ids: string[] = [];
      (topo.nodes as unknown[]).forEach((n, i) => {
        const id = validateTopologyNode(errors, `topology.nodes[${i}]`, n, sourceRefIdSet);
        if (id !== null) { ids.push(id); nodeIdSet.add(id); }
      });
      if (hasDups(ids)) errors.push("topology.nodes: duplicate ids");
    }
    if (!Array.isArray(topo.links)) {
      errors.push("topology.links: must be an array");
    } else {
      const ids: string[] = [];
      (topo.links as unknown[]).forEach((l, i) => {
        const id = validateTopologyLink(errors, `topology.links[${i}]`, l, nodeIdSet, sourceRefIdSet);
        if (id !== null) ids.push(id);
      });
      if (hasDups(ids)) errors.push("topology.links: duplicate ids");
    }
    if (!Array.isArray(topo.zones)) {
      errors.push("topology.zones: must be an array");
    } else {
      const ids: string[] = [];
      (topo.zones as unknown[]).forEach((z, i) => {
        const id = validateTopologyZone(errors, `topology.zones[${i}]`, z, nodeIdSet, sourceRefIdSet);
        if (id !== null) ids.push(id);
      });
      if (hasDups(ids)) errors.push("topology.zones: duplicate ids");
    }
  }

  const diagramIds: string[] = [];
  if (!Array.isArray(root.diagramIntents)) {
    errors.push("diagramIntents: must be an array");
  } else {
    (root.diagramIntents as unknown[]).forEach((d, i) => {
      const id = validateDiagramIntent(errors, `diagramIntents[${i}]`, d, sourceRefIdSet);
      if (id !== null) diagramIds.push(id);
    });
    if (hasDups(diagramIds)) errors.push("diagramIntents: duplicate ids");
  }

  const traceability = asObject(root.traceability);
  if (!traceability) {
    errors.push("traceability: must be an object");
  } else {
    checkKeys(errors, "traceability", traceability, [
      "requirementRefs", "complianceRefs", "configurationRefs", "sourceBundleRefs",
    ]);
    validateRefIdArray(errors, "traceability.requirementRefs", traceability.requirementRefs, sourceRefIdSet);
    validateRefIdArray(errors, "traceability.complianceRefs", traceability.complianceRefs, sourceRefIdSet);
    validateRefIdArray(errors, "traceability.configurationRefs", traceability.configurationRefs, sourceRefIdSet);
    validateRefIdArray(errors, "traceability.sourceBundleRefs", traceability.sourceBundleRefs, sourceRefIdSet);
  }

  const findingIds: string[] = [];
  if (!Array.isArray(root.validationFindings)) {
    errors.push("validationFindings: must be an array");
  } else {
    (root.validationFindings as unknown[]).forEach((f, i) => {
      const id = validateValidationFinding(errors, `validationFindings[${i}]`, f, sourceRefIdSet);
      if (id !== null) findingIds.push(id);
    });
    if (hasDups(findingIds)) errors.push("validationFindings: duplicate ids");
  }

  if ("engineerReview" in root && root.engineerReview !== undefined) {
    validateEngineerReview(errors, "engineerReview", root.engineerReview);
  }

  return { valid: errors.length === 0, errors };
}

export function isValidRfpHldDesignModelPayload(payload: unknown): boolean {
  return validateRfpHldDesignModelPayload(payload).valid;
}

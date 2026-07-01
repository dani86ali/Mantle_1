/**
 * Pure, provider-neutral approved design-knowledge CONTENT selection (Stage 6H-0C).
 *
 * Compacts an approved `design_knowledge_pack` artifact into a bounded,
 * source-proven content block that HLD prompt/input envelopes may carry alongside
 * the bare `design_knowledge_pack` references. The content is the human-authored,
 * already-approved curated guidance (source `manual_operator_entry`) - never raw
 * document text, provider output, or any pricing/SKU/catalog/configuration decision.
 *
 * Pure and deterministic: NO DB/store, NO fs/path, NO route/UI, NO provider/AI/
 * network/env, NO raw document parsing. Imports EXACTLY canonical project types and
 * the HLD design-domain readiness contract. It selects and validates only; it
 * asserts no design authority and grants no approval.
 */
import type { ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";

/** Stable discriminator for a compact approved design-knowledge content block. */
export const RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND =
  "rfp_hld_approved_design_knowledge_content" as const;

/**
 * The only `source` an approved content block may echo. Locally re-declared (not
 * imported) so this pure helper needs no dependency on the DB-coupled knowledge-
 * pack service; it mirrors that module's manual-operator-entry source literal.
 */
export const RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE =
  "manual_operator_entry" as const;

const PACK_ARTIFACT_TYPE = "design_knowledge_pack" as const;
const PACK_STAGE_ID = "hld_design_delta_review" as const;

/** Canonical list-section ids, in persisted order (mirrors the pack catalog). */
export type RfpHldApprovedDesignKnowledgeContentSectionId =
  | "designPrinciples"
  | "topologyGuidance"
  | "constraints"
  | "assumptions"
  | "exclusions"
  | "validationNotes";

/** Per-section entry tally carried on the content block. */
export type RfpHldApprovedDesignKnowledgeContentSectionCounts = Record<
  RfpHldApprovedDesignKnowledgeContentSectionId,
  number
>;

const CONTENT_SECTION_IDS: readonly RfpHldApprovedDesignKnowledgeContentSectionId[] =
  ["designPrinciples", "topologyGuidance", "constraints", "assumptions", "exclusions", "validationNotes"];

/** A compact, source-proven approved design-knowledge content block. */
export interface RfpHldApprovedDesignKnowledgeContent {
  contentKind: typeof RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND;
  artifactId: string;
  artifactType: typeof PACK_ARTIFACT_TYPE;
  stageId: typeof PACK_STAGE_ID;
  status: "approved";
  version: number;
  payloadKind: typeof RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND;
  domain: RfpHldDesignDomain;
  title: string;
  /** Present only when the approved pack carries the manual-operator source. */
  source?: typeof RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE;
  designPrinciples: string[];
  topologyGuidance: string[];
  constraints: string[];
  assumptions: string[];
  exclusions: string[];
  validationNotes: string[];
  entryCount: number;
  sectionCounts: RfpHldApprovedDesignKnowledgeContentSectionCounts;
}

/** Minimal proof binding a content block to its knowledge-pack reference. */
export interface RfpHldApprovedDesignKnowledgeContentIdentity {
  artifactId: string;
  version: number;
  payloadKind: string;
  domain: string;
}

/** Discriminated result of {@link selectRfpHldApprovedDesignKnowledgeContent}. */
export type SelectRfpHldApprovedDesignKnowledgeContentResult =
  | { status: "ok"; content: RfpHldApprovedDesignKnowledgeContent }
  | { status: "invalid"; errors: string[] };

/** Outcome of {@link validateRfpHldApprovedDesignKnowledgeContentObject}. */
export interface RfpHldApprovedDesignKnowledgeContentObjectCheck {
  errors: string[];
  identity: RfpHldApprovedDesignKnowledgeContentIdentity | null;
}

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

const CONTENT_REQUIRED_KEYS: readonly string[] = [
  "contentKind", "artifactId", "artifactType", "stageId", "status", "version",
  "payloadKind", "domain", "title", "designPrinciples", "topologyGuidance",
  "constraints", "assumptions", "exclusions", "validationNotes", "entryCount",
  "sectionCounts",
];

const FORBIDDEN_CONTENT_RE =
  /```|<mxfile|<html|<body|<svg|<\?xml|technical proposal|export package|final authority|provider response|raw response|hidden reasoning|chain[-\s]?of[-\s]?thought|pricing decision|sku replacement|catalog lookup|configuration decision|\b(?:cisco|cvd|bomatic|ai)[-\s]?certif/i;

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}
function isVersion(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}
function isKnownDomain(v: unknown): v is RfpHldDesignDomain {
  return typeof v === "string" && KNOWN_DOMAINS.has(v);
}
function hasForbiddenContent(v: string): boolean {
  return FORBIDDEN_CONTENT_RE.test(v);
}

/** Reject unexpected and missing keys against an exact allowed set. */
function checkKeys(
  errors: string[], label: string, obj: Record<string, unknown>,
  required: readonly string[], optional: readonly string[] = []
): void {
  for (const k of Object.keys(obj)) {
    if (!required.includes(k) && !optional.includes(k)) errors.push(`${label}: unexpected key "${k}"`);
  }
  for (const k of required) {
    if (!(k in obj)) errors.push(`${label}: missing key "${k}"`);
  }
}

/** Trim + drop blank entries; fail closed on a non-array or non-string entry. */
function normalizeSectionStrict(errors: string[], label: string, raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return []; }
  const out: string[] = [];
  raw.forEach((entry, i) => {
    if (typeof entry !== "string") { errors.push(`${label}[${i}]: must be a string`); return; }
    const t = entry.trim();
    if (t !== "" && hasForbiddenContent(t)) {
      errors.push(`${label}[${i}]: forbidden authority/provider/output content`);
      return;
    }
    if (t !== "") out.push(t);
  });
  return out;
}

/** Length of a validated content section, or null when the section is malformed. */
function contentSectionLength(errors: string[], label: string, raw: unknown): number | null {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return null; }
  raw.forEach((entry, i) => {
    if (typeof entry !== "string" || entry.trim() === "") errors.push(`${label}[${i}]: must be a nonblank string`);
    else if (hasForbiddenContent(entry)) errors.push(`${label}[${i}]: forbidden authority/provider/output content`);
  });
  return raw.length;
}

/**
 * Compact one approved `design_knowledge_pack` artifact into a source-proven
 * content block. Fail-closed: requires the approved design-delta stage, the pack
 * type/payload kind, a known domain, a nonblank title, well-formed list sections,
 * and at least one nonblank entry; trims strings and drops blank entries. Copies
 * NO arbitrary payload keys, file/storage paths, raw text, or authority claims.
 */
export function selectRfpHldApprovedDesignKnowledgeContent(
  artifact: ProjectArtifact
): SelectRfpHldApprovedDesignKnowledgeContentResult {
  const errors: string[] = [];
  if (artifact === null || typeof artifact !== "object") {
    return { status: "invalid", errors: ["artifact: must be an object"] };
  }
  if (artifact.type !== PACK_ARTIFACT_TYPE) errors.push("artifact: wrong type");
  if (artifact.stageId !== PACK_STAGE_ID) errors.push("artifact: wrong stage");
  if (artifact.status !== "approved") errors.push("artifact: not approved");
  if (!isVersion(artifact.version)) errors.push("artifact: bad version");
  if (!isNonBlank(artifact.id)) errors.push("artifact: blank id");

  const payload = asObject(artifact.payload);
  if (!payload) return { status: "invalid", errors: [...errors, "payload: must be an object"] };

  if (payload.payloadKind !== RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND) errors.push("payload: wrong payloadKind");
  const domain = isKnownDomain(payload.domain) ? payload.domain : null;
  if (domain === null) errors.push("payload: invalid domain");
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title === "") errors.push("payload: blank title");
  else if (hasForbiddenContent(title)) errors.push("payload: title contains forbidden authority/provider/output content");

  let source: typeof RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE | undefined;
  if (payload.source !== undefined) {
    if (payload.source === RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE) {
      source = RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE;
    } else errors.push("payload: unexpected source");
  }

  const sections = {} as Record<RfpHldApprovedDesignKnowledgeContentSectionId, string[]>;
  const sectionCounts = {} as RfpHldApprovedDesignKnowledgeContentSectionCounts;
  let entryCount = 0;
  for (const id of CONTENT_SECTION_IDS) {
    const normalized = normalizeSectionStrict(errors, `payload.${id}`, payload[id]);
    sections[id] = normalized;
    sectionCounts[id] = normalized.length;
    entryCount += normalized.length;
  }
  if (entryCount === 0) errors.push("payload: empty content");

  if (errors.length > 0 || domain === null) return { status: "invalid", errors };

  return {
    status: "ok",
    content: {
      contentKind: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
      artifactId: artifact.id,
      artifactType: PACK_ARTIFACT_TYPE,
      stageId: PACK_STAGE_ID,
      status: "approved",
      version: artifact.version,
      payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
      domain,
      title,
      ...(source !== undefined ? { source } : {}),
      designPrinciples: sections.designPrinciples,
      topologyGuidance: sections.topologyGuidance,
      constraints: sections.constraints,
      assumptions: sections.assumptions,
      exclusions: sections.exclusions,
      validationNotes: sections.validationNotes,
      entryCount,
      sectionCounts,
    },
  };
}

/**
 * Validate a compact content block's closed shape (source-chain proof, canonical
 * sections, self-consistent counts) and return its bijection identity. Empty error
 * list => valid. Fail-closed on unexpected keys, wrong proof, malformed sections,
 * mismatched counts, or empty content.
 */
export function validateRfpHldApprovedDesignKnowledgeContentObject(
  label: string,
  raw: unknown
): RfpHldApprovedDesignKnowledgeContentObjectCheck {
  const errors: string[] = [];
  const o = asObject(raw);
  if (!o) return { errors: [`${label}: must be an object`], identity: null };

  checkKeys(errors, label, o, CONTENT_REQUIRED_KEYS, ["source"]);
  if (o.contentKind !== RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND) errors.push(`${label}: wrong contentKind`);
  const artifactId = isNonBlank(o.artifactId) ? o.artifactId : null;
  if (artifactId === null) errors.push(`${label}: blank artifactId`);
  if (o.artifactType !== PACK_ARTIFACT_TYPE) errors.push(`${label}: wrong artifactType`);
  if (o.stageId !== PACK_STAGE_ID) errors.push(`${label}: wrong stageId`);
  if (o.status !== "approved") errors.push(`${label}: content is not approved`);
  const version = isVersion(o.version) ? o.version : null;
  if (version === null) errors.push(`${label}: bad version`);
  const payloadKind =
    o.payloadKind === RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND ? RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND : null;
  if (payloadKind === null) errors.push(`${label}: wrong payloadKind`);
  const domain = isKnownDomain(o.domain) ? o.domain : null;
  if (domain === null) errors.push(`${label}: invalid domain`);
  if ("source" in o && o.source !== RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE) {
    errors.push(`${label}: unexpected source`);
  }
  if (!isNonBlank(o.title)) errors.push(`${label}: blank title`);
  else if (hasForbiddenContent(o.title)) errors.push(`${label}: title contains forbidden authority/provider/output content`);

  const counts = asObject(o.sectionCounts);
  if (!counts) errors.push(`${label}.sectionCounts: must be an object`);
  else checkKeys(errors, `${label}.sectionCounts`, counts, CONTENT_SECTION_IDS);

  let sum = 0;
  let sumOk = true;
  for (const id of CONTENT_SECTION_IDS) {
    const len = contentSectionLength(errors, `${label}.${id}`, o[id]);
    if (len === null) { sumOk = false; continue; }
    sum += len;
    if (counts && counts[id] !== len) errors.push(`${label}.sectionCounts.${id}: does not match section length`);
  }
  if (typeof o.entryCount !== "number" || !Number.isInteger(o.entryCount) || o.entryCount < 0) {
    errors.push(`${label}: bad entryCount`);
  } else if (o.entryCount < 1) {
    errors.push(`${label}: empty content`);
  } else if (sumOk && o.entryCount !== sum) {
    errors.push(`${label}: entryCount does not match section totals`);
  }

  const identity =
    artifactId !== null && version !== null && payloadKind !== null && domain !== null
      ? { artifactId, version, payloadKind, domain }
      : null;
  return { errors, identity };
}

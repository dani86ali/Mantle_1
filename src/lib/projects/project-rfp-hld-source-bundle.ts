/**
 * Deterministic RFP HLD source-bundle CONTRACT (Stage 6B-001).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * This is the persisted shape + pure validation of the `hld_source_bundle`
 * artifact: the structured authority package that future HLD work consumes AFTER
 * HLD readiness is approved. It compiles ONLY references to already-approved
 * Project artifacts (evidence package, requirements baseline, compliance matrix,
 * configuration authority, HLD intake, HLD readiness snapshot) plus approved
 * design knowledge packs per covered domain. It carries NO SKU/pricing/catalog/
 * topology/scope/design authority and asserts no Cisco/CVD/AI certification.
 *
 * Contract-only: no assembler, no store, no fs/path, no route, no React, no AI,
 * no catalog/pricing/config service. It imports EXACTLY canonical project types
 * and the existing HLD design-domain definitions/types/constants - nothing else.
 */
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import type { ProjectArtifactType, ProjectStageId } from "@/types/project";

/** Stable discriminator for the persisted `hld_source_bundle` payload. */
export const RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND = "rfp_hld_source_bundle" as const;

/** Local literal (not an import) of the no-BoQ / service-only exception marker. */
export const RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER =
  "rfp_no_boq_service_only_exception" as const;

/** Local literal of the approved HLD readiness snapshot payload kind. */
export const RFP_HLD_SOURCE_BUNDLE_READINESS_SNAPSHOT_PAYLOAD_KIND =
  "rfp_hld_readiness_snapshot" as const;

/** Finding severity buckets carried by the bundle. */
export type RfpHldSourceBundleFindingSeverity = "info" | "warning" | "blocker";

/** A reference to one already-approved upstream authority artifact (no payload body). */
export interface RfpHldSourceBundleAuthorityReference {
  artifactId: string;
  artifactType: ProjectArtifactType;
  stageId: ProjectStageId;
  status: "approved";
  version: number;
  /** Present only for references whose reviewed payload carries a kind marker. */
  payloadKind?: string;
}

/**
 * Configuration authority reference. Either a real reviewed
 * `configuration_expansion` (which intentionally carries NO payloadKind) or the
 * approved no-BoQ / service-only exception (which MUST carry the marker).
 */
export interface RfpHldSourceBundleConfigurationAuthority {
  artifactId: string;
  artifactType: "configuration_expansion";
  stageId: "configuration_expansion_review";
  status: "approved";
  version: number;
  sourceKind: "configuration_expansion" | "no_boq_service_only_exception";
  payloadKind?: string;
}

/** Approved design knowledge-pack reference for one covered design domain. */
export interface RfpHldSourceBundleDesignKnowledgePackReference {
  artifactId: string;
  artifactType: "design_knowledge_pack";
  stageId: "hld_design_delta_review";
  status: "approved";
  version: number;
  payloadKind: typeof RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND;
  domain: RfpHldDesignDomain;
}

/** A structured assumption/constraint entry (never a raw markdown blob). */
export interface RfpHldSourceBundleStatementEntry {
  id: string;
  statement: string;
  sourceArtifactId?: string;
  sourceDomain?: RfpHldDesignDomain;
}

/** A structured finding routed into the warnings or blockers bucket. */
export interface RfpHldSourceBundleFinding {
  id: string;
  code: string;
  message: string;
  severity: RfpHldSourceBundleFindingSeverity;
}

/** Embedded deterministic validation outcome (must be `passed` to persist). */
export interface RfpHldSourceBundleValidation {
  status: "passed" | "failed";
  checkedAt: string;
}

/** Provenance lineage of the compiled bundle. */
export interface RfpHldSourceBundleLineage {
  compiledFromReadinessSnapshotArtifactId: string;
  compiledArtifactIds: string[];
}

/** The set of required upstream authority references. */
export interface RfpHldSourceBundleAuthorities {
  evidencePackage: RfpHldSourceBundleAuthorityReference;
  requirementsBaseline: RfpHldSourceBundleAuthorityReference;
  complianceMatrix: RfpHldSourceBundleAuthorityReference;
  configurationAuthority: RfpHldSourceBundleConfigurationAuthority;
  hldIntake: RfpHldSourceBundleAuthorityReference;
  hldReadinessSnapshot: RfpHldSourceBundleAuthorityReference;
}

/** The persisted `hld_source_bundle` payload. */
export interface RfpHldSourceBundlePayload {
  payloadKind: typeof RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceArtifactIds: string[];
  lineage: RfpHldSourceBundleLineage;
  authorities: RfpHldSourceBundleAuthorities;
  designKnowledgePackRefs: RfpHldSourceBundleDesignKnowledgePackReference[];
  coveredDomains: RfpHldDesignDomain[];
  missingDomains: RfpHldDesignDomain[];
  excludedDomains: RfpHldDesignDomain[];
  assumptions: RfpHldSourceBundleStatementEntry[];
  constraints: RfpHldSourceBundleStatementEntry[];
  warnings: RfpHldSourceBundleFinding[];
  blockers: RfpHldSourceBundleFinding[];
  validation: RfpHldSourceBundleValidation;
}

/** Structured outcome of {@link validateRfpHldSourceBundlePayload}. */
export interface RfpHldSourceBundleValidationResult {
  valid: boolean;
  errors: string[];
}

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const TOP_LEVEL_KEYS: readonly string[] = [
  "payloadKind", "createdBy", "createdAt", "sourceArtifactIds", "lineage",
  "authorities", "designKnowledgePackRefs", "coveredDomains", "missingDomains",
  "excludedDomains", "assumptions", "constraints", "warnings", "blockers",
  "validation",
];

const AUTHORITY_KEYS: readonly string[] = [
  "evidencePackage", "requirementsBaseline", "complianceMatrix",
  "configurationAuthority", "hldIntake", "hldReadinessSnapshot",
];

interface AuthoritySpec {
  artifactType: ProjectArtifactType;
  stageId: ProjectStageId;
  requirePayloadKind?: string;
}

const REQUIRED_AUTHORITY_SPECS: Record<
  "evidencePackage" | "requirementsBaseline" | "complianceMatrix" | "hldIntake" | "hldReadinessSnapshot",
  AuthoritySpec
> = {
  evidencePackage: { artifactType: "evidence_package", stageId: "intake_package_review" },
  requirementsBaseline: { artifactType: "requirements_baseline", stageId: "requirements_baseline_review" },
  complianceMatrix: { artifactType: "compliance_matrix", stageId: "compliance_matrix_review" },
  hldIntake: { artifactType: "hld_intake", stageId: "hld_design_delta_review" },
  hldReadinessSnapshot: {
    artifactType: "hld_readiness_snapshot",
    stageId: "hld_design_delta_review",
    requirePayloadKind: RFP_HLD_SOURCE_BUNDLE_READINESS_SNAPSHOT_PAYLOAD_KIND,
  },
};

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

/** Reject unexpected and missing keys against an exact allowed set (optional keys excepted). */
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

const REF_REQUIRED: readonly string[] = ["artifactId", "artifactType", "stageId", "status", "version"];

function validateAuthorityRef(
  errors: string[], label: string, raw: unknown, spec: AuthoritySpec
): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, REF_REQUIRED, ["payloadKind"]);
  if (!isNonBlank(o.artifactId)) errors.push(`${label}: blank artifactId`);
  if (o.artifactType !== spec.artifactType) errors.push(`${label}: wrong artifactType`);
  if (o.stageId !== spec.stageId) errors.push(`${label}: wrong stageId`);
  if (o.status !== "approved") errors.push(`${label}: reference is not approved`);
  if (!isVersion(o.version)) errors.push(`${label}: bad version`);
  if (spec.requirePayloadKind !== undefined && o.payloadKind !== spec.requirePayloadKind) {
    errors.push(`${label}: wrong payloadKind`);
  }
  return isNonBlank(o.artifactId) ? o.artifactId : null;
}

function validateConfigAuthority(errors: string[], label: string, raw: unknown): string | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, [...REF_REQUIRED, "sourceKind"], ["payloadKind"]);
  if (!isNonBlank(o.artifactId)) errors.push(`${label}: blank artifactId`);
  if (o.artifactType !== "configuration_expansion") errors.push(`${label}: wrong artifactType`);
  if (o.stageId !== "configuration_expansion_review") errors.push(`${label}: wrong stageId`);
  if (o.status !== "approved") errors.push(`${label}: reference is not approved`);
  if (!isVersion(o.version)) errors.push(`${label}: bad version`);
  if (o.sourceKind === "no_boq_service_only_exception") {
    if (o.payloadKind !== RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER) {
      errors.push(`${label}: no-BoQ exception missing "${RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER}" marker`);
    }
  } else if (o.sourceKind !== "configuration_expansion") {
    errors.push(`${label}: bad sourceKind`);
  }
  return isNonBlank(o.artifactId) ? o.artifactId : null;
}

const PACK_REQUIRED: readonly string[] = [...REF_REQUIRED, "payloadKind", "domain"];

function validatePackRef(
  errors: string[], label: string, raw: unknown
): { id: string | null; domain: string | null } {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return { id: null, domain: null }; }
  checkKeys(errors, label, o, PACK_REQUIRED);
  if (!isNonBlank(o.artifactId)) errors.push(`${label}: blank artifactId`);
  if (o.artifactType !== "design_knowledge_pack") errors.push(`${label}: wrong artifactType`);
  if (o.stageId !== "hld_design_delta_review") errors.push(`${label}: wrong stageId`);
  if (o.status !== "approved") errors.push(`${label}: reference is not approved`);
  if (!isVersion(o.version)) errors.push(`${label}: bad version`);
  if (o.payloadKind !== RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND) errors.push(`${label}: wrong payloadKind`);
  const domainOk = typeof o.domain === "string" && KNOWN_DOMAINS.has(o.domain);
  if (!domainOk) errors.push(`${label}: invalid domain`);
  return {
    id: isNonBlank(o.artifactId) ? o.artifactId : null,
    domain: domainOk ? (o.domain as string) : null,
  };
}

function validateEntry(errors: string[], label: string, raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return; }
  checkKeys(errors, label, o, ["id", "statement"], ["sourceArtifactId", "sourceDomain"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.statement)) errors.push(`${label}: blank statement`);
  if ("sourceArtifactId" in o && !isNonBlank(o.sourceArtifactId)) {
    errors.push(`${label}: blank sourceArtifactId`);
  }
  if ("sourceDomain" in o && !(typeof o.sourceDomain === "string" && KNOWN_DOMAINS.has(o.sourceDomain))) {
    errors.push(`${label}: invalid sourceDomain`);
  }
}

function validateFinding(
  errors: string[], label: string, raw: unknown, expected: RfpHldSourceBundleFindingSeverity
): void {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return; }
  checkKeys(errors, label, o, ["id", "code", "message", "severity"]);
  if (!isNonBlank(o.id)) errors.push(`${label}: blank id`);
  if (!isNonBlank(o.code)) errors.push(`${label}: blank code`);
  if (!isNonBlank(o.message)) errors.push(`${label}: blank message`);
  if (o.severity !== "info" && o.severity !== "warning" && o.severity !== "blocker") {
    errors.push(`${label}: bad finding severity`);
  } else if (o.severity !== expected) {
    errors.push(`${label}: severity must be "${expected}"`);
  }
}

function validateDomainArray(errors: string[], label: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return []; }
  const out: string[] = [];
  for (const d of raw) {
    if (typeof d !== "string" || !KNOWN_DOMAINS.has(d)) { errors.push(`${label}: invalid domain`); continue; }
    out.push(d);
  }
  if (new Set(out).size !== out.length) errors.push(`${label}: duplicate domain`);
  return out;
}

function sameIdSet(errors: string[], label: string, raw: unknown, expected: readonly string[]): void {
  if (!Array.isArray(raw)) { errors.push(`${label}: must be an array`); return; }
  for (const id of raw) {
    if (!isNonBlank(id)) { errors.push(`${label}: blank id`); return; }
  }
  const got = raw as string[];
  if (got.length !== expected.length || new Set(got).size !== got.length) {
    errors.push(`${label}: does not exactly match referenced source ids`);
    return;
  }
  const want = new Set(expected);
  if (got.some((id) => !want.has(id))) errors.push(`${label}: does not exactly match referenced source ids`);
}

/**
 * Validate a persisted `hld_source_bundle` payload. Fail-closed: returns the full
 * list of structural/contract violations. Empty list => valid. The bundle is a
 * reference compilation only; this performs NO catalog/pricing/design decision.
 */
export function validateRfpHldSourceBundlePayload(
  payload: unknown
): RfpHldSourceBundleValidationResult {
  const errors: string[] = [];
  const root = asObject(payload);
  if (!root) return { valid: false, errors: ["payload: must be an object"] };

  checkKeys(errors, "payload", root, TOP_LEVEL_KEYS);
  if (root.payloadKind !== RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND) errors.push("payload: wrong payloadKind");
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");

  const referencedIds: string[] = [];
  let readinessSnapshotArtifactId: string | null = null;

  const authorities = asObject(root.authorities);
  if (!authorities) {
    errors.push("authorities: must be an object");
  } else {
    checkKeys(errors, "authorities", authorities, AUTHORITY_KEYS);
    for (const key of Object.keys(REQUIRED_AUTHORITY_SPECS) as (keyof typeof REQUIRED_AUTHORITY_SPECS)[]) {
      const id = validateAuthorityRef(errors, `authorities.${key}`, authorities[key], REQUIRED_AUTHORITY_SPECS[key]);
      if (id !== null) referencedIds.push(id);
      if (key === "hldReadinessSnapshot") readinessSnapshotArtifactId = id;
    }
    const configId = validateConfigAuthority(errors, "authorities.configurationAuthority", authorities.configurationAuthority);
    if (configId !== null) referencedIds.push(configId);
  }

  const packDomains: string[] = [];
  if (!Array.isArray(root.designKnowledgePackRefs)) {
    errors.push("designKnowledgePackRefs: must be an array");
  } else {
    root.designKnowledgePackRefs.forEach((ref, i) => {
      const { id, domain } = validatePackRef(errors, `designKnowledgePackRefs[${i}]`, ref);
      if (id !== null) referencedIds.push(id);
      if (domain !== null) packDomains.push(domain);
    });
    if (new Set(packDomains).size !== packDomains.length) {
      errors.push("designKnowledgePackRefs: duplicate domain reference");
    }
  }

  // Globally unique referenced artifact ids across all authorities + packs.
  if (new Set(referencedIds).size !== referencedIds.length) {
    errors.push("references: duplicate referenced artifact ids");
  }
  const uniqueReferencedIds = Array.from(new Set(referencedIds));

  const covered = validateDomainArray(errors, "coveredDomains", root.coveredDomains);
  const missing = validateDomainArray(errors, "missingDomains", root.missingDomains);
  const excluded = validateDomainArray(errors, "excludedDomains", root.excludedDomains);

  // Pairwise disjoint domain buckets.
  const coveredSet = new Set(covered);
  const missingSet = new Set(missing);
  const excludedSet = new Set(excluded);
  if (covered.some((d) => missingSet.has(d) || excludedSet.has(d))) errors.push("domains: covered overlaps missing/excluded");
  if (missing.some((d) => excludedSet.has(d))) errors.push("domains: missing overlaps excluded");

  // Exact covered <-> pack coverage (bijection).
  const packDomainSet = new Set(packDomains);
  if (covered.some((d) => !packDomainSet.has(d))) errors.push("coverage: a covered domain has no knowledge pack");
  if (packDomains.some((d) => !coveredSet.has(d))) errors.push("coverage: a knowledge pack domain is not covered");

  if (missing.length > 0) errors.push("missingDomains: must be empty");

  for (const [key, arr] of [["assumptions", root.assumptions], ["constraints", root.constraints]] as const) {
    if (!Array.isArray(arr)) { errors.push(`${key}: must be an array`); continue; }
    arr.forEach((e, i) => validateEntry(errors, `${key}[${i}]`, e));
  }

  if (!Array.isArray(root.warnings)) {
    errors.push("warnings: must be an array");
  } else {
    root.warnings.forEach((f, i) => validateFinding(errors, `warnings[${i}]`, f, "warning"));
  }
  if (!Array.isArray(root.blockers)) {
    errors.push("blockers: must be an array");
  } else {
    root.blockers.forEach((f, i) => validateFinding(errors, `blockers[${i}]`, f, "blocker"));
    if (root.blockers.length > 0) errors.push("blockers: must be empty");
  }

  const validation = asObject(root.validation);
  if (!validation) {
    errors.push("validation: must be an object");
  } else {
    checkKeys(errors, "validation", validation, ["status", "checkedAt"]);
    if (validation.status !== "passed") errors.push("validation: embedded validation did not pass");
    if (!isIsoUtc(validation.checkedAt)) errors.push("validation: checkedAt is not ISO UTC");
  }

  const lineage = asObject(root.lineage);
  if (!lineage) {
    errors.push("lineage: must be an object");
  } else {
    checkKeys(errors, "lineage", lineage, ["compiledFromReadinessSnapshotArtifactId", "compiledArtifactIds"]);
    if (!isNonBlank(lineage.compiledFromReadinessSnapshotArtifactId)) {
      errors.push("lineage: blank compiledFromReadinessSnapshotArtifactId");
    } else if (
      readinessSnapshotArtifactId !== null &&
      lineage.compiledFromReadinessSnapshotArtifactId !== readinessSnapshotArtifactId
    ) {
      errors.push("lineage: compiledFromReadinessSnapshotArtifactId does not match the approved readiness snapshot");
    }
    sameIdSet(errors, "lineage.compiledArtifactIds", lineage.compiledArtifactIds, uniqueReferencedIds);
  }

  sameIdSet(errors, "sourceArtifactIds", root.sourceArtifactIds, uniqueReferencedIds);

  return { valid: errors.length === 0, errors };
}

/** Convenience boolean predicate over {@link validateRfpHldSourceBundlePayload}. */
export function isValidRfpHldSourceBundlePayload(payload: unknown): boolean {
  return validateRfpHldSourceBundlePayload(payload).valid;
}

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
 * no catalog/pricing/config service. It imports canonical project types plus the
 * pure HLD design-domain/content contracts - nothing else.
 */
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import {
  validateRfpHldApprovedDesignKnowledgeContentObject,
  type RfpHldApprovedDesignKnowledgeContent,
  type RfpHldApprovedDesignKnowledgeContentIdentity,
} from "@/lib/projects/project-rfp-hld-design-knowledge-content";
import type { ProjectArtifactType, ProjectStageId } from "@/types/project";

/**
 * Re-export the approved design-knowledge content shape so downstream HLD
 * candidate-input / prompt contracts consume it from this bundle contract without
 * importing the pure content helper directly.
 */
export type { RfpHldApprovedDesignKnowledgeContent };

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

/**
 * Closed source provenance of the approved HLD intake, carried for audit only.
 * The approved hld_intake is bundle authority; the source questionnaire is
 * provenance and never becomes a bundle authority reference.
 */
export type RfpHldSourceBundleIntakeSource =
  | { sourceMode: "manual_override"; manualOverrideReason: string }
  | { sourceMode: "questionnaire_assisted"; sourceQuestionnaireArtifactId: string };

/** Allowed disposition of one sanitized approved HLD intake answer. */
export type RfpHldSourceBundleIntakeAnswerStatus =
  | "answered"
  | "unknown"
  | "not_applicable";

/**
 * One sanitized approved HLD intake answer carried into the bundle. Only the
 * engineer-approved field id, canonical label, disposition, and (for answered
 * fields) the value plus optional notes are surfaced - never source question
 * text beyond the label, reviewed-question audit, source file ids, or raw docs.
 */
export interface RfpHldSourceBundleIntakeAnswer {
  fieldId: string;
  label: string;
  status: RfpHldSourceBundleIntakeAnswerStatus;
  value?: string;
  notes?: string;
}

/**
 * Sanitized approved HLD intake answers carried on the bundle for downstream
 * (candidate-only) HLD drafting. The approved hld_intake stays the authority; this
 * is a closed projection of its answers plus provenance/counts. Optional for
 * historical bundle compatibility; validated closed when present and cross-checked
 * against the approved hldIntake authority reference and hldIntakeSource provenance.
 */
export interface RfpHldSourceBundleIntakeAnswers {
  sourceHldIntakeArtifactId: string;
  sourceHldIntakeVersion: number;
  sourceMode: "manual_override" | "questionnaire_assisted";
  answers: RfpHldSourceBundleIntakeAnswer[];
  answerCount: number;
  statusCounts: { answered: number; unknown: number; not_applicable: number };
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
  /**
   * Optional compact approved design-knowledge content, one block per covered
   * design domain, each carrying source-chain proof back to an approved
   * design_knowledge_pack. Optional for backward compatibility with historical
   * bundles; when present it is fully validated and bijective with
   * designKnowledgePackRefs. Newly assembled bundles always include it.
   */
  designKnowledgePackContents?: RfpHldApprovedDesignKnowledgeContent[];
  /**
   * Corrected approved-HLD-intake source provenance (audit only). Optional for
   * historical bundle compatibility; validated closed when present. Newly
   * assembled bundles always populate it from current readiness. The source
   * questionnaire stays provenance - it is NOT added to sourceArtifactIds or
   * lineage.compiledArtifactIds.
   */
  hldIntakeSource?: RfpHldSourceBundleIntakeSource;
  /**
   * Sanitized approved HLD intake answers. Optional for historical bundle
   * compatibility; validated closed when present and cross-checked against the
   * approved hldIntake authority reference and hldIntakeSource provenance. Newly
   * assembled bundles always populate it. Carries only whitelisted answer fields -
   * no reviewed-question audit, source question text beyond the label, source file
   * ids, tenant/project ids, or pricing/SKU/catalog/configuration decisions.
   */
  hldIntakeAnswers?: RfpHldSourceBundleIntakeAnswers;
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

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
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
): { id: string | null; domain: string | null; version: number | null } {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return { id: null, domain: null, version: null }; }
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
    version: isVersion(o.version) ? o.version : null,
  };
}

/**
 * Validate the optional `designKnowledgePackContents`: each block is a closed,
 * source-proven content shape (via the pure content helper), blocks are unique by
 * artifact id, and the set bijects with the knowledge-pack references on artifact
 * id, version, payload kind, and domain. Fail-closed; never drops content silently.
 */
function validateDesignKnowledgePackContents(
  errors: string[],
  raw: unknown,
  refIdentities: readonly RfpHldApprovedDesignKnowledgeContentIdentity[]
): void {
  if (!Array.isArray(raw)) {
    errors.push("designKnowledgePackContents: must be an array");
    return;
  }
  const identities: (RfpHldApprovedDesignKnowledgeContentIdentity | null)[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const { errors: itemErrors, identity } = validateRfpHldApprovedDesignKnowledgeContentObject(
      `designKnowledgePackContents[${i}]`,
      item
    );
    for (const e of itemErrors) errors.push(e);
    identities.push(identity);
    if (identity !== null) {
      if (seen.has(identity.artifactId)) {
        errors.push(`designKnowledgePackContents[${i}]: duplicate content block`);
      }
      seen.add(identity.artifactId);
    }
  });

  const refById = new Map<string, RfpHldApprovedDesignKnowledgeContentIdentity>();
  for (const ref of refIdentities) refById.set(ref.artifactId, ref);
  const matched = new Set<string>();
  for (const identity of identities) {
    if (identity === null) continue;
    const ref = refById.get(identity.artifactId);
    if (ref === undefined) {
      errors.push(`designKnowledgePackContents: content ${identity.artifactId} has no matching knowledge pack reference`);
      continue;
    }
    if (ref.version !== identity.version || ref.payloadKind !== identity.payloadKind || ref.domain !== identity.domain) {
      errors.push(`designKnowledgePackContents: content ${identity.artifactId} does not match its knowledge pack reference`);
    }
    matched.add(identity.artifactId);
  }
  for (const ref of refIdentities) {
    if (!matched.has(ref.artifactId)) {
      errors.push(`designKnowledgePackContents: knowledge pack reference ${ref.artifactId} has no approved content block`);
    }
  }
}

/**
 * Validate the optional closed `hldIntakeSource` provenance object. manual_override
 * requires a nonblank manualOverrideReason and forbids a questionnaire id;
 * questionnaire_assisted requires a nonblank sourceQuestionnaireArtifactId and
 * forbids a manual override reason. The closed key set enforces the "forbids"
 * rules; this adds the nonblank checks. Fail-closed.
 */
function validateIntakeSource(errors: string[], raw: unknown): void {
  const o = asObject(raw);
  if (!o) { errors.push("hldIntakeSource: must be an object"); return; }
  if (o.sourceMode === "manual_override") {
    checkKeys(errors, "hldIntakeSource", o, ["sourceMode", "manualOverrideReason"]);
    if (!isNonBlank(o.manualOverrideReason)) errors.push("hldIntakeSource: blank manualOverrideReason");
  } else if (o.sourceMode === "questionnaire_assisted") {
    checkKeys(errors, "hldIntakeSource", o, ["sourceMode", "sourceQuestionnaireArtifactId"]);
    if (!isNonBlank(o.sourceQuestionnaireArtifactId)) {
      errors.push("hldIntakeSource: blank sourceQuestionnaireArtifactId");
    }
  } else {
    errors.push("hldIntakeSource: invalid sourceMode");
  }
}

const INTAKE_ANSWER_REQUIRED: readonly string[] = ["fieldId", "label", "status"];
const INTAKE_ANSWERS_KEYS: readonly string[] = [
  "sourceHldIntakeArtifactId", "sourceHldIntakeVersion", "sourceMode",
  "answers", "answerCount", "statusCounts",
];
const STATUS_COUNT_KEYS: readonly string[] = ["answered", "unknown", "not_applicable"];

/**
 * Validate one sanitized approved HLD intake answer. Fail-closed on a closed key
 * set: nonblank fieldId/label, status in {answered,unknown,not_applicable},
 * answered requires a nonblank value, unknown/not_applicable must not carry a
 * value, optional notes must be nonblank. Returns the status for tallying, or null.
 */
function validateIntakeAnswer(
  errors: string[], label: string, raw: unknown
): RfpHldSourceBundleIntakeAnswerStatus | null {
  const o = asObject(raw);
  if (!o) { errors.push(`${label}: must be an object`); return null; }
  checkKeys(errors, label, o, INTAKE_ANSWER_REQUIRED, ["value", "notes"]);
  if (!isNonBlank(o.fieldId)) errors.push(`${label}: blank fieldId`);
  if (!isNonBlank(o.label)) errors.push(`${label}: blank label`);
  let status: RfpHldSourceBundleIntakeAnswerStatus | null = null;
  if (o.status === "answered" || o.status === "unknown" || o.status === "not_applicable") {
    status = o.status;
  } else {
    errors.push(`${label}: invalid status`);
  }
  if (status === "answered") {
    if (!isNonBlank(o.value)) errors.push(`${label}: answered requires a nonblank value`);
  } else if ("value" in o) {
    errors.push(`${label}: only an answered field may carry a value`);
  }
  if ("notes" in o && !isNonBlank(o.notes)) errors.push(`${label}: blank notes`);
  return status;
}

/**
 * Validate the optional closed `hldIntakeAnswers` section: closed key set, nonblank
 * provenance id matching the approved hldIntake authority reference (id + version),
 * sourceMode matching the hldIntakeSource provenance (when present), a closed answer
 * array (no duplicate fieldIds), and answer/status counts that agree with the
 * answers. Fail-closed; never drops answers silently.
 */
function validateIntakeAnswers(
  errors: string[],
  raw: unknown,
  hldIntakeRef: { artifactId: string; version: number } | null,
  intakeSourceMode: string | null
): void {
  const o = asObject(raw);
  if (!o) { errors.push("hldIntakeAnswers: must be an object"); return; }
  checkKeys(errors, "hldIntakeAnswers", o, INTAKE_ANSWERS_KEYS);

  if (!isNonBlank(o.sourceHldIntakeArtifactId)) {
    errors.push("hldIntakeAnswers: blank sourceHldIntakeArtifactId");
  } else if (hldIntakeRef !== null && o.sourceHldIntakeArtifactId !== hldIntakeRef.artifactId) {
    errors.push("hldIntakeAnswers: sourceHldIntakeArtifactId does not match the approved hld_intake authority");
  }
  if (!isVersion(o.sourceHldIntakeVersion)) {
    errors.push("hldIntakeAnswers: bad sourceHldIntakeVersion");
  } else if (hldIntakeRef !== null && o.sourceHldIntakeVersion !== hldIntakeRef.version) {
    errors.push("hldIntakeAnswers: sourceHldIntakeVersion does not match the approved hld_intake authority");
  }
  if (o.sourceMode !== "manual_override" && o.sourceMode !== "questionnaire_assisted") {
    errors.push("hldIntakeAnswers: invalid sourceMode");
  } else if (intakeSourceMode !== null && o.sourceMode !== intakeSourceMode) {
    errors.push("hldIntakeAnswers: sourceMode does not match the approved hld_intake provenance");
  }

  const counts = { answered: 0, unknown: 0, not_applicable: 0 };
  if (!Array.isArray(o.answers)) {
    errors.push("hldIntakeAnswers.answers: must be an array");
  } else {
    const seen = new Set<string>();
    o.answers.forEach((ans, i) => {
      const status = validateIntakeAnswer(errors, `hldIntakeAnswers.answers[${i}]`, ans);
      if (status !== null) counts[status] += 1;
      const fieldId = asObject(ans)?.fieldId;
      if (typeof fieldId === "string" && fieldId.trim() !== "") {
        if (seen.has(fieldId)) errors.push(`hldIntakeAnswers.answers[${i}]: duplicate fieldId`);
        seen.add(fieldId);
      }
    });
    if (isCount(o.answerCount) && o.answerCount !== o.answers.length) {
      errors.push("hldIntakeAnswers: answerCount does not match answers length");
    }
  }
  if (!isCount(o.answerCount)) errors.push("hldIntakeAnswers: bad answerCount");

  const sc = asObject(o.statusCounts);
  if (!sc) {
    errors.push("hldIntakeAnswers.statusCounts: must be an object");
  } else {
    checkKeys(errors, "hldIntakeAnswers.statusCounts", sc, STATUS_COUNT_KEYS);
    for (const k of STATUS_COUNT_KEYS as readonly ("answered" | "unknown" | "not_applicable")[]) {
      if (!isCount(sc[k])) {
        errors.push(`hldIntakeAnswers.statusCounts: bad ${k}`);
      } else if (Array.isArray(o.answers) && sc[k] !== counts[k]) {
        errors.push(`hldIntakeAnswers.statusCounts: ${k} does not match answers`);
      }
    }
  }
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

  checkKeys(errors, "payload", root, TOP_LEVEL_KEYS, [
    "designKnowledgePackContents",
    "hldIntakeSource",
    "hldIntakeAnswers",
  ]);
  if (root.payloadKind !== RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND) errors.push("payload: wrong payloadKind");
  if (!isNonBlank(root.createdBy)) errors.push("payload: blank createdBy");
  if (!isIsoUtc(root.createdAt)) errors.push("payload: createdAt is not ISO UTC");

  const referencedIds: string[] = [];
  let readinessSnapshotArtifactId: string | null = null;
  let hldIntakeRef: { artifactId: string; version: number } | null = null;

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

    const hldIntake = asObject(authorities.hldIntake);
    if (hldIntake && isNonBlank(hldIntake.artifactId) && isVersion(hldIntake.version)) {
      hldIntakeRef = { artifactId: hldIntake.artifactId, version: hldIntake.version };
    }
  }

  const packDomains: string[] = [];
  const packRefIdentities: RfpHldApprovedDesignKnowledgeContentIdentity[] = [];
  if (!Array.isArray(root.designKnowledgePackRefs)) {
    errors.push("designKnowledgePackRefs: must be an array");
  } else {
    root.designKnowledgePackRefs.forEach((ref, i) => {
      const { id, domain, version } = validatePackRef(errors, `designKnowledgePackRefs[${i}]`, ref);
      if (id !== null) referencedIds.push(id);
      if (domain !== null) packDomains.push(domain);
      if (id !== null && domain !== null && version !== null) {
        packRefIdentities.push({
          artifactId: id,
          version,
          payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
          domain,
        });
      }
    });
    if (new Set(packDomains).size !== packDomains.length) {
      errors.push("designKnowledgePackRefs: duplicate domain reference");
    }
  }

  // Optional approved DKP content: closed-shape + bijective with the pack refs.
  if ("designKnowledgePackContents" in root && root.designKnowledgePackContents !== undefined) {
    validateDesignKnowledgePackContents(errors, root.designKnowledgePackContents, packRefIdentities);
  }

  // Optional approved-HLD-intake source provenance: closed-shape when present.
  if ("hldIntakeSource" in root && root.hldIntakeSource !== undefined) {
    validateIntakeSource(errors, root.hldIntakeSource);
  }

  // Optional sanitized approved-HLD-intake answers: closed-shape when present,
  // cross-checked against the approved hldIntake authority + intake provenance.
  if ("hldIntakeAnswers" in root && root.hldIntakeAnswers !== undefined) {
    const intakeSourceObj = asObject(root.hldIntakeSource);
    const intakeSourceMode =
      intakeSourceObj && typeof intakeSourceObj.sourceMode === "string"
        ? intakeSourceObj.sourceMode
        : null;
    validateIntakeAnswers(errors, root.hldIntakeAnswers, hldIntakeRef, intakeSourceMode);
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

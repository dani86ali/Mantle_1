/**
 * Shared read-only priced-BoQ review WORKSPACE core: load ONE `priced_boq` artifact
 * and project a lean, serializable line-pricing review view for the workspace UI.
 * Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 9, 10, 11A).
 * Canonical shapes: src/types/project.ts. The priced-line shape is MIRRORED from
 * src/lib/projects/priced-boq.ts without importing it (pure pricing math is forbidden
 * here), so every projected shape is defined locally.
 *
 * This is the lane-agnostic core behind the Quick BoM and RFP BoQ priced-BoQ review
 * step. RFP priced_boq artifacts are produced by the SAME deterministic pricing core as
 * Quick BoM, so they share this identical read-only projection - only the mode gate
 * differs per lane. It is a pure read model. It verifies the Project (not_found /
 * wrong_mode against the caller-supplied `expectedMode`) and the exact priced_boq
 * artifact (priced_boq_not_found / artifact_not_priced_boq / priced_boq_not_reviewable /
 * invalid_priced_boq_payload) within the input tenant, then ALLOWLIST-projects the
 * stored payload into review lines. It never prices, never reads a catalog/GPL/fixture,
 * never persists, never creates an approval, and imports no artifact-write helper,
 * approval store, pricing-creation service, pure pricing math, fixture/catalog/GPL
 * reader, config expansion, export, runner, AI, catalog, engine, coordinator, or
 * adapter. It exposes only the fields an engineer needs to review line pricing before
 * approval: no full payload, no originalCells, no unitListPriceSarBySku (the source
 * price map), no workbook path, no sheet name, no export path, and no
 * replacement/substitution fields. The pricing-authority and configuration-authority
 * traces are allowlisted field-by-field (the pricing-authority workbook path and sheet
 * name are dropped; configuration authority carries no pricing fields or paths). Every
 * array/object in the result is copied, so the projection never aliases the stored
 * artifact payload. Counts are counted in TypeScript from the projected line statuses,
 * never inferred by an LLM.
 *
 * The ONLY mode-specific behavior is the `project.mode !== expectedMode` gate, so each
 * lane (Quick BoM, RFP BoQ) keeps its own surface while sharing this deterministic core.
 * The result status names (priced_boq_not_found, artifact_not_priced_boq, etc.) are kept
 * verbatim for the existing route API contract even though the core is now generic.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import type {
  PricingMode,
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStageId,
  SkuResolutionStatus,
} from "@/types/project";

/** Input for {@link loadProjectBoqPricedBoqReviewWorkspaceCore}. */
export interface LoadProjectBoqPricedBoqReviewWorkspaceInput {
  tenantId: string;
  projectId: string;
  /** The exact persisted priced_boq artifact to project. */
  artifactId: string;
  /** The project mode this lane is allowed to operate on; others get wrong_mode. */
  expectedMode: ProjectMode;
}

/** Per-line pricing outcome, mirrored from priced-boq.ts (not imported). */
export type ProjectBoqPricedReviewLineStatus =
  | "priced"
  | "missing_decision"
  | "not_accepted"
  | "missing_price";

/** Lean project summary for the review header; tenant-scoped projection. */
export interface ProjectBoqPricedBoqReviewWorkspaceProject {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: ProjectPricingConfig;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface ProjectBoqPricedBoqReviewWorkspaceArtifact {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Allowlisted SAR totals over the priced rows. */
export interface ProjectBoqPricedBoqReviewTotals {
  currency: string;
  lineCount: number;
  subtotalListPriceSar: number;
  subtotalSellPriceSar: number;
  vatAmountSar: number;
  totalIncVatSar: number;
}

/** Allowlisted priced-BoQ roll-up counts plus SAR totals (no per-line detail). */
export interface ProjectBoqPricedBoqReviewPricingSummary {
  inputLineCount: number;
  pricedLineCount: number;
  unpricedLineCount: number;
  missingDecisionCount: number;
  notAcceptedCount: number;
  missingPriceCount: number;
  totals: ProjectBoqPricedBoqReviewTotals;
}

/**
 * Safe pricing-authority provenance summary. The workbook path and sheet name are
 * excluded by never reading them; boundary flags are allowlisted by key.
 */
export interface ProjectBoqPricedBoqReviewPricingAuthoritySummary {
  profileId?: string;
  scope?: string;
  approvalRecordId?: string;
  activeSource?: string;
  activeSourceFixtureId?: string;
  activeSourceStatus?: string;
  currency?: string;
  pricedSkuCount?: number;
  missingPriceSkuCount?: number;
  boundary?: Record<string, boolean>;
}

/**
 * Safe configuration-authority provenance summary. No pricing fields and no paths are
 * read; disposition counts are allowlisted by key.
 */
export interface ProjectBoqPricedBoqReviewConfigurationAuthoritySummary {
  scope?: string;
  approvalRecordId?: string;
  rulePackId?: string;
  rulePackVersion?: string;
  rulePackStatus?: string;
  rulePackSourceScope?: string;
  dispositionSummary?: Record<string, number>;
  runtimeAi?: boolean;
  replacementAuthority?: boolean;
  skuSubstitutionAuthority?: boolean;
  unknownRelationshipsDeferred?: boolean;
  attachesOpticsUnderSwitches?: boolean;
}

/** Lean payload summary: provenance + config + counts/totals + safe authority traces. */
export interface ProjectBoqPricedBoqReviewWorkspacePayload {
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  pricingConfig: ProjectPricingConfig;
  lineCount: number;
  pricingSummary: ProjectBoqPricedBoqReviewPricingSummary;
  pricingAuthority?: ProjectBoqPricedBoqReviewPricingAuthoritySummary;
  configurationAuthority?: ProjectBoqPricedBoqReviewConfigurationAuthoritySummary;
}

/** Deterministic review-state counts, counted from the projected line statuses. */
export interface ProjectBoqPricedBoqReviewWorkspaceCounts {
  totalLineCount: number;
  pricedLineCount: number;
  unpricedLineCount: number;
  missingPriceCount: number;
  warningCount: number;
}

/** Allowlisted per-line SAR amounts; present only on priced lines. */
export interface ProjectBoqPricedBoqReviewLineAmounts {
  currency: string;
  quantity: number;
  unitListPriceSar: number;
  extendedListPriceSar: number;
  unitSellPriceSar: number;
  extendedSellPriceSar: number;
  pricingMode: PricingMode;
  ratePercent: number;
  vatRatePercent: number;
  vatAmountSar: number;
  totalIncVatSar: number;
}

/** One priced (or retained-unpriced) BoQ line, projected for review. */
export interface ProjectBoqPricedBoqReviewLine {
  sourceFileId: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  parentLineNumber?: string;
  originalSku: string;
  acceptedSku?: string;
  description: string;
  quantity: number;
  status: ProjectBoqPricedReviewLineStatus;
  decisionStatus?: SkuResolutionStatus;
  warning?: string;
  amounts?: ProjectBoqPricedBoqReviewLineAmounts;
}

/** The lean, serializable priced-BoQ line-review projection returned on `ok`. */
export interface ProjectBoqPricedBoqReviewWorkspace {
  project: ProjectBoqPricedBoqReviewWorkspaceProject;
  artifact: ProjectBoqPricedBoqReviewWorkspaceArtifact;
  payloadSummary: ProjectBoqPricedBoqReviewWorkspacePayload;
  reviewSummary: ProjectBoqPricedBoqReviewWorkspaceCounts;
  lines: ProjectBoqPricedBoqReviewLine[];
}

/** Discriminated result of {@link loadProjectBoqPricedBoqReviewWorkspaceCore}. */
export type LoadProjectBoqPricedBoqReviewWorkspaceResult =
  | { status: "not_found" }
  | { status: "wrong_mode" }
  | { status: "priced_boq_not_found" }
  | { status: "artifact_not_priced_boq" }
  | { status: "priced_boq_not_reviewable" }
  | { status: "invalid_priced_boq_payload" }
  | { status: "ok"; review: ProjectBoqPricedBoqReviewWorkspace };

/** Validated payload after parsing; lines and summaries are already projected. */
interface ParsedPricedBoqPayload {
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  pricingConfig: ProjectPricingConfig;
  lineCount: number;
  pricingSummary: ProjectBoqPricedBoqReviewPricingSummary;
  pricingAuthority?: ProjectBoqPricedBoqReviewPricingAuthoritySummary;
  configurationAuthority?: ProjectBoqPricedBoqReviewConfigurationAuthoritySummary;
  lines: ProjectBoqPricedBoqReviewLine[];
}

const LINE_STATUSES: ReadonlySet<string> = new Set([
  "priced",
  "missing_decision",
  "not_accepted",
  "missing_price",
]);
const DECISION_STATUSES: ReadonlySet<string> = new Set([
  "needs_review",
  "accepted",
  "rejected",
  "unresolved",
]);
const PRICING_MODES: ReadonlySet<string> = new Set(["margin", "markup"]);
/** Known pricing-authority boundary flags; any other (canary) key is dropped. */
const BOUNDARY_FLAG_KEYS: readonly string[] = [
  "deterministicPricingAuthority",
  "demoFixtureAuthority",
  "currentLocalGplSarCsvTemporarilyApproved",
  "activeRuntimeSourceReadsExternalGplCsv",
  "productionCiscoPricingAuthority",
  "broadCiscoGeneralPricingAuthority",
  "runtimeAiPricing",
  "runtimeCatalogLookup",
  "configurationAuthority",
  "replacementAuthority",
  "skuSubstitutionAuthority",
  "silentSkuSubstitution",
  "missingPricesReported",
];
/** Known configuration-authority disposition counts; any other key is dropped. */
const DISPOSITION_COUNT_KEYS: readonly string[] = [
  "expandByApprovedRulePackCount",
  "preserveKnownRulePackChildCount",
  "preserveStandaloneCustomerLineCount",
  "deferUnknownRelationshipCount",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Copy only allowlisted boolean flags by key; drops any non-boolean canary value. */
function pickBooleanFlags(raw: unknown, keys: readonly string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!isPlainObject(raw)) return out;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Copy only allowlisted numeric fields by key; drops any non-number canary value. */
function pickNumberFields(raw: unknown, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isPlainObject(raw)) return out;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

/** Validate + copy the SAR pricing config; null if not the expected shape. */
function toPricingConfig(raw: unknown): ProjectPricingConfig | null {
  if (!isPlainObject(raw)) return null;
  const { currency, mode, ratePercent, vatRatePercent, roundingDecimals } = raw;
  if (currency !== "SAR") return null;
  if (mode !== "margin" && mode !== "markup") return null;
  if (
    typeof ratePercent !== "number" ||
    typeof vatRatePercent !== "number" ||
    typeof roundingDecimals !== "number"
  ) {
    return null;
  }
  return { currency, mode, ratePercent, vatRatePercent, roundingDecimals };
}

/** Allowlist + copy the SAR totals object; null if malformed. */
function toTotals(raw: unknown): ProjectBoqPricedBoqReviewTotals | null {
  if (!isPlainObject(raw)) return null;
  const {
    currency,
    lineCount,
    subtotalListPriceSar,
    subtotalSellPriceSar,
    vatAmountSar,
    totalIncVatSar,
  } = raw;
  if (
    typeof currency !== "string" ||
    typeof lineCount !== "number" ||
    typeof subtotalListPriceSar !== "number" ||
    typeof subtotalSellPriceSar !== "number" ||
    typeof vatAmountSar !== "number" ||
    typeof totalIncVatSar !== "number"
  ) {
    return null;
  }
  return {
    currency,
    lineCount,
    subtotalListPriceSar,
    subtotalSellPriceSar,
    vatAmountSar,
    totalIncVatSar,
  };
}

/** Allowlist + copy the priced-BoQ roll-up summary (counts + totals); null if malformed. */
function toPricingSummary(raw: unknown): ProjectBoqPricedBoqReviewPricingSummary | null {
  if (!isPlainObject(raw)) return null;
  const {
    inputLineCount,
    pricedLineCount,
    unpricedLineCount,
    missingDecisionCount,
    notAcceptedCount,
    missingPriceCount,
    totals,
  } = raw;
  if (
    typeof inputLineCount !== "number" ||
    typeof pricedLineCount !== "number" ||
    typeof unpricedLineCount !== "number" ||
    typeof missingDecisionCount !== "number" ||
    typeof notAcceptedCount !== "number" ||
    typeof missingPriceCount !== "number"
  ) {
    return null;
  }
  const safeTotals = toTotals(totals);
  if (safeTotals === null) return null;
  return {
    inputLineCount,
    pricedLineCount,
    unpricedLineCount,
    missingDecisionCount,
    notAcceptedCount,
    missingPriceCount,
    totals: safeTotals,
  };
}

/** Allowlist + copy the per-line SAR amounts; undefined if absent or malformed. */
function toAmounts(raw: unknown): ProjectBoqPricedBoqReviewLineAmounts | undefined {
  if (!isPlainObject(raw)) return undefined;
  const {
    currency,
    quantity,
    unitListPriceSar,
    extendedListPriceSar,
    unitSellPriceSar,
    extendedSellPriceSar,
    pricingMode,
    ratePercent,
    vatRatePercent,
    vatAmountSar,
    totalIncVatSar,
  } = raw;
  if (
    typeof currency !== "string" ||
    typeof quantity !== "number" ||
    typeof unitListPriceSar !== "number" ||
    typeof extendedListPriceSar !== "number" ||
    typeof unitSellPriceSar !== "number" ||
    typeof extendedSellPriceSar !== "number" ||
    typeof pricingMode !== "string" ||
    !PRICING_MODES.has(pricingMode) ||
    typeof ratePercent !== "number" ||
    typeof vatRatePercent !== "number" ||
    typeof vatAmountSar !== "number" ||
    typeof totalIncVatSar !== "number"
  ) {
    return undefined;
  }
  return {
    currency,
    quantity,
    unitListPriceSar,
    extendedListPriceSar,
    unitSellPriceSar,
    extendedSellPriceSar,
    pricingMode: pricingMode as PricingMode,
    ratePercent,
    vatRatePercent,
    vatAmountSar,
    totalIncVatSar,
  };
}

/**
 * Project one raw priced line to the allowed review fields, or null if its required
 * structural fields are malformed. Built field-by-field (never via spread) so
 * originalCells, sourceFormat, sourceSheetName, and any extra payload keys cannot ride
 * along.
 */
function toReviewLine(raw: unknown): ProjectBoqPricedBoqReviewLine | null {
  if (!isPlainObject(raw)) return null;
  const {
    sourceFileId,
    sourceRowNumber,
    originalLineNumber,
    parentLineNumber,
    originalSku,
    acceptedSku,
    description,
    quantity,
    status,
    decisionStatus,
    warning,
    amounts,
  } = raw;
  if (
    typeof sourceFileId !== "string" ||
    typeof sourceRowNumber !== "number" ||
    typeof originalLineNumber !== "string" ||
    typeof originalSku !== "string" ||
    typeof description !== "string" ||
    typeof quantity !== "number" ||
    typeof status !== "string" ||
    !LINE_STATUSES.has(status)
  ) {
    return null;
  }
  const safeAmounts = toAmounts(amounts);
  return {
    sourceFileId,
    sourceRowNumber,
    originalLineNumber,
    ...(typeof parentLineNumber === "string" ? { parentLineNumber } : {}),
    originalSku,
    ...(typeof acceptedSku === "string" ? { acceptedSku } : {}),
    description,
    quantity,
    status: status as ProjectBoqPricedReviewLineStatus,
    ...(typeof decisionStatus === "string" && DECISION_STATUSES.has(decisionStatus)
      ? { decisionStatus: decisionStatus as SkuResolutionStatus }
      : {}),
    ...(typeof warning === "string" ? { warning } : {}),
    ...(safeAmounts !== undefined ? { amounts: safeAmounts } : {}),
  };
}

/**
 * Allowlist the pricing-authority trace into a safe provenance summary. The workbook
 * path and sheet name are excluded by never reading them; boundary flags are copied by
 * key. Returns undefined when no trace object is present.
 */
function toPricingAuthoritySafe(
  raw: unknown
): ProjectBoqPricedBoqReviewPricingAuthoritySummary | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: ProjectBoqPricedBoqReviewPricingAuthoritySummary = {};
  if (typeof raw.profileId === "string") out.profileId = raw.profileId;
  if (typeof raw.scope === "string") out.scope = raw.scope;
  if (typeof raw.approvalRecordId === "string") out.approvalRecordId = raw.approvalRecordId;
  if (typeof raw.activeSource === "string") out.activeSource = raw.activeSource;
  if (typeof raw.activeSourceFixtureId === "string") out.activeSourceFixtureId = raw.activeSourceFixtureId;
  if (typeof raw.activeSourceStatus === "string") out.activeSourceStatus = raw.activeSourceStatus;
  if (typeof raw.currency === "string") out.currency = raw.currency;
  if (typeof raw.pricedSkuCount === "number") out.pricedSkuCount = raw.pricedSkuCount;
  if (typeof raw.missingPriceSkuCount === "number") out.missingPriceSkuCount = raw.missingPriceSkuCount;
  out.boundary = pickBooleanFlags(raw.boundary, BOUNDARY_FLAG_KEYS);
  return out;
}

/**
 * Allowlist the configuration-authority trace into a safe provenance summary. No
 * pricing fields and no paths are read; disposition counts are copied by key. Returns
 * undefined when no trace object is present.
 */
function toConfigurationAuthoritySafe(
  raw: unknown
): ProjectBoqPricedBoqReviewConfigurationAuthoritySummary | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: ProjectBoqPricedBoqReviewConfigurationAuthoritySummary = {};
  if (typeof raw.scope === "string") out.scope = raw.scope;
  if (typeof raw.approvalRecordId === "string") out.approvalRecordId = raw.approvalRecordId;
  if (typeof raw.rulePackId === "string") out.rulePackId = raw.rulePackId;
  if (typeof raw.rulePackVersion === "string") out.rulePackVersion = raw.rulePackVersion;
  if (typeof raw.rulePackStatus === "string") out.rulePackStatus = raw.rulePackStatus;
  if (typeof raw.rulePackSourceScope === "string") out.rulePackSourceScope = raw.rulePackSourceScope;
  out.dispositionSummary = pickNumberFields(raw.dispositionSummary, DISPOSITION_COUNT_KEYS);
  if (typeof raw.runtimeAi === "boolean") out.runtimeAi = raw.runtimeAi;
  if (typeof raw.replacementAuthority === "boolean") out.replacementAuthority = raw.replacementAuthority;
  if (typeof raw.skuSubstitutionAuthority === "boolean") out.skuSubstitutionAuthority = raw.skuSubstitutionAuthority;
  if (typeof raw.unknownRelationshipsDeferred === "boolean") {
    out.unknownRelationshipsDeferred = raw.unknownRelationshipsDeferred;
  }
  if (typeof raw.attachesOpticsUnderSwitches === "boolean") {
    out.attachesOpticsUnderSwitches = raw.attachesOpticsUnderSwitches;
  }
  return out;
}

/**
 * Validate and allowlist-project a stored `priced_boq` payload. Requires the source
 * provenance ids/versions, the copied sourceFileIds, a valid SAR pricingConfig, a
 * roll-up summary (counts + totals), and a lines array; each line is projected
 * field-by-field. Returns null when anything is structurally wrong. Copies every
 * array/object so the projection never aliases the stored payload. The source price
 * map (unitListPriceSarBySku) is never read.
 */
function parsePricedBoqPayload(
  payload: Record<string, unknown>
): ParsedPricedBoqPayload | null {
  const {
    sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    sourceFileIds,
    pricingConfig,
    lineCount,
    summary,
    lines,
    pricingAuthority,
    configurationAuthority,
  } = payload;
  if (
    typeof sourceConfigurationExpansionArtifactId !== "string" ||
    typeof sourceConfigurationExpansionArtifactVersion !== "number" ||
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    typeof sourceSkuResolutionArtifactId !== "string" ||
    typeof sourceSkuResolutionArtifactVersion !== "number" ||
    !isStringArray(sourceFileIds) ||
    !Array.isArray(lines)
  ) {
    return null;
  }
  const safeConfig = toPricingConfig(pricingConfig);
  if (safeConfig === null) return null;
  const safeSummary = toPricingSummary(summary);
  if (safeSummary === null) return null;

  const projectedLines: ProjectBoqPricedBoqReviewLine[] = [];
  for (const rawLine of lines) {
    const line = toReviewLine(rawLine);
    if (line === null) return null;
    projectedLines.push(line);
  }

  const safePricingAuthority = toPricingAuthoritySafe(pricingAuthority);
  const safeConfigurationAuthority = toConfigurationAuthoritySafe(configurationAuthority);
  return {
    sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...sourceFileIds],
    pricingConfig: safeConfig,
    lineCount: typeof lineCount === "number" ? lineCount : projectedLines.length,
    pricingSummary: safeSummary,
    ...(safePricingAuthority !== undefined ? { pricingAuthority: safePricingAuthority } : {}),
    ...(safeConfigurationAuthority !== undefined
      ? { configurationAuthority: safeConfigurationAuthority }
      : {}),
    lines: projectedLines,
  };
}

/** Lean project header; tenantId and pricingConfig are copied, never aliased. */
function toProjectSummary(project: Project): ProjectBoqPricedBoqReviewWorkspaceProject {
  return {
    id: project.id,
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined
      ? { pricingConfig: { ...project.pricingConfig } }
      : {}),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(artifact: ProjectArtifact): ProjectBoqPricedBoqReviewWorkspaceArtifact {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Lean payload summary: provenance + config + counts/totals + safe authority traces. */
function toPayloadSummary(
  payload: ParsedPricedBoqPayload
): ProjectBoqPricedBoqReviewWorkspacePayload {
  return {
    sourceConfigurationExpansionArtifactId: payload.sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion: payload.sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: payload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: payload.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    pricingConfig: { ...payload.pricingConfig },
    lineCount: payload.lineCount,
    pricingSummary: {
      ...payload.pricingSummary,
      totals: { ...payload.pricingSummary.totals },
    },
    ...(payload.pricingAuthority !== undefined
      ? {
          pricingAuthority: {
            ...payload.pricingAuthority,
            ...(payload.pricingAuthority.boundary !== undefined
              ? { boundary: { ...payload.pricingAuthority.boundary } }
              : {}),
          },
        }
      : {}),
    ...(payload.configurationAuthority !== undefined
      ? {
          configurationAuthority: {
            ...payload.configurationAuthority,
            ...(payload.configurationAuthority.dispositionSummary !== undefined
              ? { dispositionSummary: { ...payload.configurationAuthority.dispositionSummary } }
              : {}),
          },
        }
      : {}),
  };
}

/** Count review-state totals deterministically from the projected line statuses. */
function toReviewCounts(
  lines: readonly ProjectBoqPricedBoqReviewLine[]
): ProjectBoqPricedBoqReviewWorkspaceCounts {
  let pricedLineCount = 0;
  let missingPriceCount = 0;
  let warningCount = 0;
  for (const line of lines) {
    if (line.status === "priced") pricedLineCount++;
    if (line.status === "missing_price") missingPriceCount++;
    if (line.warning !== undefined) warningCount++;
  }
  return {
    totalLineCount: lines.length,
    pricedLineCount,
    unpricedLineCount: lines.length - pricedLineCount,
    missingPriceCount,
    warningCount,
  };
}

/**
 * Load the read-only priced-BoQ line-review projection for one `priced_boq` artifact,
 * tenant-scoped on every store call. The Project mode is gated against the
 * caller-supplied `expectedMode` so each lane (Quick BoM, RFP BoQ) keeps its own surface
 * while sharing this deterministic core. Returns `not_found` when the Project is missing,
 * `wrong_mode` when its mode is not `expectedMode`, `priced_boq_not_found` when the
 * artifact is absent, `artifact_not_priced_boq` when it is the wrong type,
 * `priced_boq_not_reviewable` when its status is not needs_review,
 * `invalid_priced_boq_payload` when the payload is not the expected priced BoQ shape,
 * else `ok` with a lean, serializable review object. Never prices, never persists, and
 * never exposes the full payload, originalCells, the source price map, workbook paths,
 * sheet names, export paths, or replacement/substitution fields.
 */
export async function loadProjectBoqPricedBoqReviewWorkspaceCore(
  input: LoadProjectBoqPricedBoqReviewWorkspaceInput
): Promise<LoadProjectBoqPricedBoqReviewWorkspaceResult> {
  const { tenantId, projectId, artifactId, expectedMode } = input;

  // Read-only review loader: archived Projects stay inspectable (QBM-LOG-006).
  const project = await getProjectById(tenantId, projectId, { includeArchived: true });
  if (project === null) return { status: "not_found" };
  if (project.mode !== expectedMode) return { status: "wrong_mode" };

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "priced_boq_not_found" };
  if (artifact.type !== "priced_boq") return { status: "artifact_not_priced_boq" };
  if (artifact.status !== "needs_review") return { status: "priced_boq_not_reviewable" };

  const payload = parsePricedBoqPayload(artifact.payload);
  if (payload === null) return { status: "invalid_priced_boq_payload" };

  return {
    status: "ok",
    review: {
      project: toProjectSummary(project),
      artifact: toArtifactSummary(artifact),
      payloadSummary: toPayloadSummary(payload),
      reviewSummary: toReviewCounts(payload.lines),
      lines: payload.lines,
    },
  };
}

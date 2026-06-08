/**
 * Narrow Project-domain service: persist a priced BoQ as a new `priced_boq`
 * artifact for the `boq_pricing_review` stage (Section 19 task 8j).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8, 9, 10, 14, 15).
 *
 * Quick BoM pricing runs on the accepted expanded BoM only. This service COMPOSES the
 * artifact repository (read exactly one approved `configuration_expansion` artifact,
 * persist one new version) and the pure priced-expanded-BoQ helper. Pricing consumes
 * the accepted `configuration_expansion` artifact's acceptedLines as the input
 * authority; it does NOT read `normalized_boq` or `sku_resolution` directly and never
 * reintroduces sku_resolution decisions as the pricing authority. It does NO catalog
 * lookup, SKU replacement, rule-pack loading, rule-pack approval, USD-to-SAR
 * conversion, pricing approval, stage-status update, staleness propagation, or export
 * work, and imports no engines, schema, AI, Mantle export, or API/UI code. Pricing
 * helper errors bubble unchanged with no artifact created. It never mutates its inputs
 * or the source artifact. The artifact is created `needs_review`.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  buildPricedExpandedBoqDraft,
  type ExplicitSarUnitPrice,
  type PricedBoqDraft,
  type PricedBoqDraftLine,
  type PricedBoqDraftSummary,
} from "@/lib/projects/priced-boq";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";
import type { ProjectArtifact, ProjectPricingConfig } from "@/types/project";

// Exact guard messages; consumers may assert on these verbatim.
const MISSING_EXPANSION_MESSAGE = "Configuration expansion artifact not found.";
const WRONG_EXPANSION_TYPE_MESSAGE = "Artifact is not a configuration_expansion artifact.";
const INVALID_EXPANSION_PAYLOAD_MESSAGE = "Configuration expansion artifact payload is invalid.";
// Distinct gates: this proves Project approval of the source artifact version
// (section 16); RULE_PACK_NOT_APPROVED proves rule authority (section 11A).
const EXPANSION_NOT_APPROVED_MESSAGE = "Configuration expansion artifact must be approved before pricing.";
const RULE_PACK_NOT_APPROVED_MESSAGE = "Configuration expansion artifact requires an approved rule pack.";

/**
 * Lean configuration authority trace copied from an approved `configuration_expansion`
 * artifact payload into `PricedBoqArtifactPayload` as provenance. Structurally
 * compatible with `ConfigurationAuthorityTrace` in config-expansion-types. This
 * module defines it independently so priced_boq provenance does not couple to the
 * config-expansion module family. Configuration authority only - no pricing fields.
 */
export interface ConfigurationAuthorityTrace {
  scope: "honeywell_mvp_demo_only";
  approvalRecordId: string;
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: "approved";
  rulePackSourceScope: string;
  dispositionSummary: {
    expandByApprovedRulePackCount: number;
    preserveKnownRulePackChildCount: number;
    preserveStandaloneCustomerLineCount: number;
    deferUnknownRelationshipCount: number;
  };
  runtimeAi: false;
  replacementAuthority: false;
  skuSubstitutionAuthority: false;
  unknownRelationshipsDeferred: true;
  attachesOpticsUnderSwitches: false;
}

/**
 * Lean pricing authority trace embedded in `PricedBoqArtifactPayload` as provenance.
 * Built by the caller (project-quick-bom-pricing) from the approved Honeywell demo
 * pricing authority profile and passed in; this module never imports that profile.
 */
export interface PricingAuthorityTrace {
  profileId: "honeywell-mvp-demo-pricing-authority-profile";
  scope: "honeywell_mvp_demo_only";
  approvalRecordId: string;
  activeSource: "committed_honeywell_demo_pricing_fixture";
  activeSourceFixtureId: string;
  activeSourceStatus: "approved_demo_fixture";
  activeSourceWorkbookPath: string;
  activeSourceSheetName: string;
  currency: "SAR";
  pricedSkuCount: number;
  missingPriceSkuCount: number;
  boundary: {
    deterministicPricingAuthority: true;
    demoFixtureAuthority: true;
    currentLocalGplSarCsvTemporarilyApproved: true;
    activeRuntimeSourceReadsExternalGplCsv: false;
    productionCiscoPricingAuthority: false;
    broadCiscoGeneralPricingAuthority: false;
    runtimeAiPricing: false;
    runtimeCatalogLookup: false;
    configurationAuthority: false;
    replacementAuthority: false;
    skuSubstitutionAuthority: false;
    silentSkuSubstitution: false;
    missingPricesReported: true;
  };
}

/**
 * JSONB payload stored on the `priced_boq` artifact. A type alias (not an interface)
 * so it carries an implicit index signature assignable to the repository payload.
 */
export type PricedBoqArtifactPayload = {
  // The accepted configuration_expansion artifact this priced expanded BoM was
  // produced from (pricing's input authority; section 11A, section 19 task 8j).
  // Required: the single producer (createPricedBoqArtifact) always populates both,
  // and Mantle export consumes the accepted priced expanded BoM shape explicitly.
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  /** Upstream provenance copied from the configuration_expansion payload. */
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  pricingConfig: ProjectPricingConfig;
  /** Only the SAR prices applied to priced lines, keyed by orderable SKU. */
  unitListPriceSarBySku: Record<string, ExplicitSarUnitPrice>;
  lineCount: number;
  lines: PricedBoqDraftLine[];
  summary: PricedBoqDraftSummary;
  /** Copied pricing authority trace from the caller; present only when supplied. */
  pricingAuthority?: PricingAuthorityTrace;
  /**
   * Copied configuration authority trace from the approved source
   * `configuration_expansion` artifact payload; present only when the source carried
   * one. Configuration authority only - no pricing fields.
   */
  configurationAuthority?: ConfigurationAuthorityTrace;
};

/** Input for {@link createPricedBoqArtifact}. */
export interface CreatePricedBoqArtifactInput {
  tenantId: string;
  projectId: string;
  configurationExpansionArtifactId: string;
  pricingConfig: ProjectPricingConfig;
  /** Explicit SAR unit price per orderable SKU. NOT catalog listPrice. */
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>;
  /** Optional pricing authority trace to persist as provenance. */
  pricingAuthority?: PricingAuthorityTrace;
}

/** The created artifact, the source configuration_expansion artifact, the payload, and the draft. */
export interface CreatePricedBoqArtifactResult {
  artifact: ProjectArtifact;
  configurationExpansionArtifact: ProjectArtifact;
  payload: PricedBoqArtifactPayload;
  draft: PricedBoqDraft;
}

/** Read-only inputs for {@link buildPricedBoqArtifactPayload}. */
export interface BuildPricedBoqArtifactPayloadInput {
  configurationExpansionArtifact: ProjectArtifact;
  /** Upstream provenance echoed from the configuration_expansion payload. */
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  pricingConfig: ProjectPricingConfig;
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>;
  draft: PricedBoqDraft;
  /** Optional pricing authority trace to persist as provenance. */
  pricingAuthority?: PricingAuthorityTrace;
  /**
   * Optional configuration authority trace copied from the approved
   * configuration_expansion source artifact payload; never built here.
   */
  configurationAuthority?: ConfigurationAuthorityTrace;
}

/** A fresh copy of only the SAR price entries applied to priced lines. */
function usedSarPrices(
  draft: PricedBoqDraft,
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>
): Record<string, ExplicitSarUnitPrice> {
  const used: Record<string, ExplicitSarUnitPrice> = {};
  for (const line of draft.lines) {
    if (line.status !== "priced" || line.acceptedSku === undefined) continue;
    if (used[line.acceptedSku] === undefined) {
      used[line.acceptedSku] = { ...unitListPriceSarBySku[line.acceptedSku] };
    }
  }
  return used;
}

/** A fresh draft line, with fresh originalCells and a fresh amounts object when present. */
function copyDraftLine(line: PricedBoqDraftLine): PricedBoqDraftLine {
  return {
    ...line,
    originalCells: { ...line.originalCells },
    ...(line.amounts !== undefined ? { amounts: { ...line.amounts } } : {}),
  };
}

/**
 * Build the `priced_boq` payload. Pure: copies the config, the SAR prices actually
 * used, every draft line (fresh originalCells/amounts), and the summary totals, and
 * copies the configuration_expansion artifact's source file ids; the configuration
 * expansion id/version come from the artifact, and the normalized/sku provenance is
 * echoed from the configuration_expansion payload.
 */
export function buildPricedBoqArtifactPayload(
  input: BuildPricedBoqArtifactPayloadInput
): PricedBoqArtifactPayload {
  const { configurationExpansionArtifact, pricingConfig, draft } = input;
  return {
    sourceConfigurationExpansionArtifactId: configurationExpansionArtifact.id,
    sourceConfigurationExpansionArtifactVersion: configurationExpansionArtifact.version,
    sourceNormalizedBoqArtifactId: input.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: input.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: input.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: input.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...configurationExpansionArtifact.sourceFileIds],
    pricingConfig: { ...pricingConfig },
    unitListPriceSarBySku: usedSarPrices(draft, input.unitListPriceSarBySku),
    lineCount: draft.lines.length,
    lines: draft.lines.map(copyDraftLine),
    summary: { ...draft.summary, totals: { ...draft.summary.totals } },
    ...(input.pricingAuthority !== undefined
      ? {
          pricingAuthority: {
            ...input.pricingAuthority,
            boundary: { ...input.pricingAuthority.boundary },
          },
        }
      : {}),
    ...(input.configurationAuthority !== undefined
      ? {
          configurationAuthority: copyConfigurationAuthorityTrace(input.configurationAuthority),
        }
      : {}),
  };
}

/** The configuration_expansion payload fields this service consumes. */
interface ParsedConfigurationExpansionPayload {
  acceptedLines: ConfigurationExpansionDraftLine[];
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  rulePackStatus: string;
  configurationAuthority?: ConfigurationAuthorityTrace;
}

/** Guard: true iff v is a valid ConfigurationAuthorityTrace object. */
function isConfigurationAuthorityTrace(v: unknown): v is ConfigurationAuthorityTrace {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const t = v as Record<string, unknown>;
  const dispositionSummary = t.dispositionSummary as Record<string, unknown> | undefined;
  return (
    t.scope === "honeywell_mvp_demo_only" &&
    typeof t.approvalRecordId === "string" &&
    typeof t.rulePackId === "string" &&
    typeof t.rulePackVersion === "string" &&
    t.rulePackStatus === "approved" &&
    typeof t.rulePackSourceScope === "string" &&
    typeof dispositionSummary === "object" &&
    dispositionSummary !== null &&
    !Array.isArray(dispositionSummary) &&
    typeof dispositionSummary.expandByApprovedRulePackCount === "number" &&
    typeof dispositionSummary.preserveKnownRulePackChildCount === "number" &&
    typeof dispositionSummary.preserveStandaloneCustomerLineCount === "number" &&
    typeof dispositionSummary.deferUnknownRelationshipCount === "number" &&
    t.runtimeAi === false &&
    t.replacementAuthority === false &&
    t.skuSubstitutionAuthority === false &&
    t.unknownRelationshipsDeferred === true &&
    t.attachesOpticsUnderSwitches === false
  );
}

/** Copy only the approved configuration-authority trace fields; never spread extras. */
function copyConfigurationAuthorityTrace(
  trace: ConfigurationAuthorityTrace
): ConfigurationAuthorityTrace {
  return {
    scope: trace.scope,
    approvalRecordId: trace.approvalRecordId,
    rulePackId: trace.rulePackId,
    rulePackVersion: trace.rulePackVersion,
    rulePackStatus: trace.rulePackStatus,
    rulePackSourceScope: trace.rulePackSourceScope,
    dispositionSummary: {
      expandByApprovedRulePackCount: trace.dispositionSummary.expandByApprovedRulePackCount,
      preserveKnownRulePackChildCount: trace.dispositionSummary.preserveKnownRulePackChildCount,
      preserveStandaloneCustomerLineCount: trace.dispositionSummary.preserveStandaloneCustomerLineCount,
      deferUnknownRelationshipCount: trace.dispositionSummary.deferUnknownRelationshipCount,
    },
    runtimeAi: trace.runtimeAi,
    replacementAuthority: trace.replacementAuthority,
    skuSubstitutionAuthority: trace.skuSubstitutionAuthority,
    unknownRelationshipsDeferred: trace.unknownRelationshipsDeferred,
    attachesOpticsUnderSwitches: trace.attachesOpticsUnderSwitches,
  };
}

/** Validate and narrow a `configuration_expansion` payload, throwing the exact message otherwise. */
function parseConfigurationExpansionPayload(
  payload: Record<string, unknown>
): ParsedConfigurationExpansionPayload {
  const {
    acceptedLines,
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    rulePackStatus,
    configurationAuthority,
  } = payload;
  if (
    !Array.isArray(acceptedLines) ||
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    typeof sourceSkuResolutionArtifactId !== "string" ||
    typeof sourceSkuResolutionArtifactVersion !== "number" ||
    typeof rulePackStatus !== "string"
  ) {
    throw new Error(INVALID_EXPANSION_PAYLOAD_MESSAGE);
  }
  if (configurationAuthority !== undefined && !isConfigurationAuthorityTrace(configurationAuthority)) {
    throw new Error(INVALID_EXPANSION_PAYLOAD_MESSAGE);
  }
  return {
    acceptedLines: acceptedLines as ConfigurationExpansionDraftLine[],
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    rulePackStatus,
    ...(configurationAuthority !== undefined
      ? { configurationAuthority: copyConfigurationAuthorityTrace(configurationAuthority) }
      : {}),
  };
}

/**
 * Persist a priced BoQ as a new `priced_boq` artifact version: load exactly one
 * `configuration_expansion` artifact (exact missing/wrong-type/invalid-payload
 * messages), require it to be approved in the canonical Project model
 * (`status === "approved"`, section 16) AND require its rule pack to be approved
 * (section 11A) - two distinct gates - then price its acceptedLines only (bubbling
 * pricing helper errors unchanged, before any artifact exists), and create exactly
 * one `needs_review` artifact whose single source artifact is the
 * configuration_expansion artifact. No mutation.
 */
export async function createPricedBoqArtifact(
  input: CreatePricedBoqArtifactInput
): Promise<CreatePricedBoqArtifactResult> {
  const { tenantId, projectId, pricingConfig, unitListPriceSarBySku } = input;

  const configurationExpansionArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    input.configurationExpansionArtifactId
  );
  if (!configurationExpansionArtifact) throw new Error(MISSING_EXPANSION_MESSAGE);
  if (configurationExpansionArtifact.type !== "configuration_expansion") {
    throw new Error(WRONG_EXPANSION_TYPE_MESSAGE);
  }
  // Project-approval gate: the source artifact version must be approved before pricing.
  // Separate from the rule-pack gate below (rule authority, not Project approval).
  if (configurationExpansionArtifact.status !== "approved") {
    throw new Error(EXPANSION_NOT_APPROVED_MESSAGE);
  }
  const parsed = parseConfigurationExpansionPayload(configurationExpansionArtifact.payload);
  if (parsed.rulePackStatus !== "approved") throw new Error(RULE_PACK_NOT_APPROVED_MESSAGE);

  const draft = buildPricedExpandedBoqDraft({
    acceptedLines: parsed.acceptedLines,
    pricingConfig,
    unitListPriceSarBySku,
  });
  const payload = buildPricedBoqArtifactPayload({
    configurationExpansionArtifact,
    sourceNormalizedBoqArtifactId: parsed.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: parsed.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: parsed.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: parsed.sourceSkuResolutionArtifactVersion,
    pricingConfig,
    unitListPriceSarBySku,
    draft,
    pricingAuthority: input.pricingAuthority,
    configurationAuthority: parsed.configurationAuthority,
  });
  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "needs_review",
    payload,
    sourceFileIds: [...payload.sourceFileIds],
    sourceArtifactIds: [configurationExpansionArtifact.id],
  });

  return { artifact, configurationExpansionArtifact, payload, draft };
}

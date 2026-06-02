/**
 * Quick BoM configuration-expansion contract types.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 11, section 11A). Canonical Project unions: src/types/project.ts
 * (section 14, 15). Companion stage/artifact ids: `configuration_expansion_review`
 * and `configuration_expansion`.
 *
 * This is a TYPE-ONLY contract module. It declares two things:
 *  1. the structured configuration-expansion RULE PACK (parent SKU rules, their
 *     child lines, and the evidence citations that back them), and
 *  2. the `configuration_expansion` ARTIFACT payload produced by the
 *     Configuration Expansion Review stage from one `normalized_boq` and one
 *     `sku_resolution` artifact plus one rule-pack version.
 *
 * It is intentionally SELF-CONTAINED with no imports: no DB / artifact store, no
 * API/UI, no engines, no AI, no pricing, no catalog lookup. Configuration
 * authority is kept strictly separate from pricing authority (section 11A.1), so
 * there are NO price/cost/discount/margin/markup/VAT/currency/sell/amount fields
 * anywhere in this module. Runtime expansion is built later as deterministic
 * rule-pack evaluation; this module only locks the shapes.
 */

/**
 * Lifecycle of a rule pack. A candidate pack is inert: no rule is active runtime
 * behavior until human pre-sales approval flips the pack to `approved`. A pack a
 * reviewer turns down is `rejected`. (section 11A, section 11A.5)
 */
export type ConfigExpansionRulePackStatus = "candidate" | "approved" | "rejected";

/**
 * The role a child line plays under its parent, as observed in the authoritative
 * configured estimate / Cisco ordering guidance. These mirror the categories used
 * by the committed candidate rule pack; the final required-vs-optional call is a
 * human-review decision and is not encoded as authority here. (section 11A.4)
 */
export type ConfigExpansionRelationshipType =
  | "service_or_support"
  | "subscription"
  | "default_selected"
  | "included_zero_price"
  | "standalone";

/** How a child line's quantity derives from its parent's quantity. (section 11A.4) */
export type ConfigExpansionQuantityRule =
  | "same_as_parent"
  | "fixed"
  | "fixed_per_parent";

/**
 * A traceability citation backing a parent rule or child line: which authoritative
 * source, and where inside it. Every auto-added expansion line must carry at least
 * one of these. (section 11A.4)
 */
export interface ConfigExpansionEvidenceCitation {
  sourceType:
    | "ccw_export"
    | "ordering_guide"
    | "datasheet"
    | "install_guide"
    | "subscription_datasheet"
    | "gpl";
  sourcePath: string;
  /** Worksheet name, for CCW citations. */
  sheetName?: string;
  /** 1-based worksheet row (CCW) or CSV row (GPL). */
  lineNumber?: number;
  /** 1-based page, for PDF citations. */
  pageNumber?: number;
  evidenceNote: string;
}

/**
 * One configuration-expansion child line a rule contributes under a parent SKU.
 * It carries its provenance (`sourceRuleId`) and evidence, plus its own approval
 * gate - a candidate child line is inert until `approved`. No pricing fields:
 * what to add is configuration authority; pricing is resolved separately at
 * runtime. (section 11A.1, section 11A.4)
 */
export interface ConfigExpansionChildRule {
  sku: string;
  description: string;
  relationshipType: ConfigExpansionRelationshipType;
  quantityRule: ConfigExpansionQuantityRule;
  /** True for an included, zero-price child component bundled with the parent. */
  includedItem: boolean;
  /** Id of the parent rule this child belongs to. Required for traceability. */
  sourceRuleId: string;
  /** Authoritative evidence backing this child line; at least one citation. */
  evidence: ConfigExpansionEvidenceCitation[];
  /** Human pre-sales approval gate; candidate child lines are not yet active. */
  approvalRequired: boolean;
  approved: boolean;
  /** Service/subscription term in months, when the child is term-based. */
  termMonths?: number;
  /** Fixed quantity, or the per-parent multiplier for `fixed`/`fixed_per_parent`. */
  quantityValue?: number;
}

/**
 * One parent SKU's expansion rule: the catalog/customer SKU plus the child lines
 * that belong with it. A `standalone` parent (e.g. an optic) contributes no child
 * lines. Carries its own evidence and approval gate. (section 11A.2, section 11A.4)
 */
export interface ConfigExpansionParentRule {
  ruleId: string;
  parentSku: string;
  parentDescription: string;
  /** Authoritative evidence backing this parent rule; at least one citation. */
  evidence: ConfigExpansionEvidenceCitation[];
  childLines: ConfigExpansionChildRule[];
  /** Set for standalone parents that contribute no child lines. */
  relationshipType?: "standalone";
  approvalRequired: boolean;
  approved: boolean;
}

/**
 * A versioned configuration-expansion rule pack. Only an `approved` pack may drive
 * runtime expansion; a `candidate` pack is inert. Configuration authority only -
 * pricing is never encoded here. (section 11A.1, section 11A.5)
 */
export interface ConfigExpansionRulePack {
  rulePackId: string;
  name: string;
  version: string;
  status: ConfigExpansionRulePackStatus;
  approvalRequired: boolean;
  /** Scope label for the pack, e.g. the Honeywell first scope. (section 11A.2) */
  sourceScope: string;
  /** Authoritative sources the pack was authored from. */
  createdFromEvidence?: {
    sourceType: ConfigExpansionEvidenceCitation["sourceType"];
    sourcePath: string;
    title?: string;
  }[];
  parentRules: ConfigExpansionParentRule[];
}

/**
 * One line in a configuration-expansion draft / accepted expanded BoM. Preserved
 * customer lines (`origin: "customer"`) and auto-added expansion lines
 * (`origin: "expansion"`) share this shape; an expansion line nests under the
 * customer line it expands via `parentLineNumber`. Auto-added lines carry their
 * `sourceRuleId` and evidence for traceability, and an approval gate where options
 * exist. No pricing fields. (section 11A.3, section 11A.4)
 */
export interface ConfigurationExpansionDraftLine {
  /** Whether this is a preserved customer line or an auto-added expansion line. */
  origin: "customer" | "expansion";
  sku: string;
  description: string;
  quantity: number;
  /** Customer line number this line belongs/nests under, when applicable. */
  parentLineNumber?: string;
  /** Role under the parent, for expansion lines. */
  relationshipType?: ConfigExpansionRelationshipType;
  quantityRule?: ConfigExpansionQuantityRule;
  /** True for an included zero-price child component. */
  includedItem?: boolean;
  /** Rule that produced an auto-added line. (traceability; section 11A.4) */
  sourceRuleId?: string;
  /** Evidence backing an auto-added line. */
  evidence?: ConfigExpansionEvidenceCitation[];
  /**
   * Engineer review is required where options exist (e.g. 3-year vs 5-year
   * support/license); a preselected default stays unaccepted until reviewed.
   * (section 11A.4)
   */
  approvalRequired?: boolean;
  approved?: boolean;
}

/** Roll-up counts for a configuration-expansion draft. No monetary totals. */
export interface ConfigurationExpansionDraftSummary {
  /** Preserved customer lines. */
  customerLineCount: number;
  /** Auto-added expansion lines. */
  addedLineCount: number;
  /** Total lines in the draft (customer + added). */
  totalLineCount: number;
  /** Added lines that still require engineer review before acceptance. */
  requiresReviewCount: number;
  /** Added lines that are included zero-price child components. */
  includedItemCount: number;
}

/**
 * JSONB payload of a `configuration_expansion` artifact: the reviewed/accepted
 * expanded BoM plus its provenance. Sourced from exactly one `normalized_boq` and
 * one `sku_resolution` artifact, and from one rule-pack version. Declared as a type
 * alias (not an interface) so it carries an implicit index signature and stays
 * assignable to the artifact repository's Record<string, unknown> payload, matching
 * the sku-resolution and priced-boq payloads. No pricing fields. (section 3,
 * section 11A.3, section 15)
 */
export type ConfigurationExpansionArtifactPayload = {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  /** Copied provenance: source files behind the upstream artifacts. */
  sourceFileIds: string[];
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: ConfigExpansionRulePackStatus;
  lineCount: number;
  lines: ConfigurationExpansionDraftLine[];
  summary: ConfigurationExpansionDraftSummary;
};

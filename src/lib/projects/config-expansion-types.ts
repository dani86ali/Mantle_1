/**
 * Quick BoM configuration-expansion contract types.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 11, section 11A). Canonical Project unions: src/types/project.ts
 * (section 14, 15). Companion stage/artifact ids: `configuration_expansion_review`
 * and `configuration_expansion`.
 *
 * This is a TYPE-ONLY contract module. It declares three things:
 *  1. the structured configuration-expansion RULE PACK (parent SKU rules, their
 *     child lines, and the evidence citations that back them),
 *  2. the `configuration_expansion` ARTIFACT payload produced by the
 *     Configuration Expansion Review stage from one `normalized_boq` and one
 *     `sku_resolution` artifact plus one rule-pack version, and
 *  3. forward-compatible ADVANCED rule-model contracts (advanced quantity model,
 *     duplicate policy, option/term groups, evidence scope, and separate
 *     replacement candidates). These advanced contracts are TYPE CONTRACTS ONLY:
 *     no runtime evaluation reads them until later, deliberate runtime support is
 *     implemented; declaring a shape here does not imply the engine honors it.
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

/* ------------------------------------------------------------------------- *
 * ADVANCED rule-model contracts (TYPE CONTRACT ONLY).
 *
 * The shapes below are forward-compatible model extensions recorded after the
 * Honeywell rule approval review (docs/config-expansion/RULE_MODEL_GAP_REPORT.md).
 * They are TYPE CONTRACTS ONLY: no runtime evaluation reads them yet. The
 * deterministic builder (src/lib/projects/config-expansion.ts) still evaluates the
 * v1 `ConfigExpansionQuantityRule` union above and nothing here, so an advanced
 * rule can never be silently mis-evaluated as a v1 rule. Runtime support is a
 * later, deliberate prompt; declaring a shape here does NOT imply the engine
 * honors it.
 *
 * Pricing authority stays strictly separate from configuration authority
 * (section 11A.1): there are NO price/cost/discount/margin/markup/VAT/currency/
 * sell/amount fields on any of these contracts, exactly as in the v1 model.
 * ------------------------------------------------------------------------- */

/**
 * Advanced, forward-compatible quantity model. Deliberately a SEPARATE union from
 * the runtime v1 `ConfigExpansionQuantityRule`: the v1 evaluator never reads this,
 * so adding a variant here cannot silently change how an existing pack evaluates.
 * TYPE CONTRACT ONLY until runtime support is implemented; no pricing fields.
 *  - `same_as_related_sku_total`: quantity tracks the total quantity of a related
 *    SKU (e.g. a wireless license tracking the CW9178I-CFG access-point total),
 *    scoped across the project, the parent segment, or a related-SKU group.
 *  - `selected_option_count`: quantity derives from how many options in an option
 *    group were selected (e.g. power cords following the selected AC PSU count).
 * Note the `scope` values here (`project`, ...) differ from the duplicate policy's
 * (`project_sku`, ...) on purpose.
 */
export type ConfigExpansionQuantityModel =
  | { type: "same_as_parent" }
  | { type: "fixed"; value: number }
  | { type: "fixed_per_parent"; value: number }
  | {
      type: "same_as_related_sku_total";
      relatedSku: string;
      scope: "project" | "parent_segment" | "related_sku_group";
    }
  | {
      type: "selected_option_count";
      optionGroupId: string;
      relationshipFilter?: ConfigExpansionRelationshipType[];
    };

/**
 * Evidence scope for a value or selection: was it merely observed once in a quote
 * (`quote_observed`), is it reusable configuration logic from an ordering guide
 * (`reusable_logic`), or does it still need more evidence before reuse
 * (`needs_more_evidence`). Keeps a value seen once in a CCW from being promoted
 * into a universal rule. TYPE CONTRACT ONLY until runtime support is implemented.
 */
export type ConfigExpansionEvidenceScope =
  | "quote_observed"
  | "reusable_logic"
  | "needs_more_evidence";

/**
 * Duplicate-detection policy for a line: at what `scope` a duplicate is judged, how
 * two lines `match`, and how an existing quantity satisfies a required one. Lets
 * de-duplication span more than a single parent segment (e.g. a per-project
 * subscription unique by `project_sku`). TYPE CONTRACT ONLY until runtime support
 * is implemented; no pricing fields.
 */
export interface ConfigExpansionDuplicatePolicy {
  scope: "parent_segment" | "project_sku" | "related_sku_group";
  match: "sku" | "sku_and_parent" | "sku_and_option_group";
  quantitySatisfaction:
    | "existing_satisfies_required"
    | "always_add_missing_delta"
    | "always_review";
}

/**
 * An option group: a default selection plus engineer-review alternatives (e.g.
 * secondary PSU, network modules, mounting accessories, SSD-none, stack kits).
 * `defaultOptionSku` may be preselected, but `engineerReviewRequired` keeps it
 * from being auto-accepted where options exist. TYPE CONTRACT ONLY until runtime
 * support is implemented; no pricing fields.
 */
export interface ConfigExpansionOptionGroup {
  optionGroupId: string;
  label: string;
  selectionMode: "single_select" | "multi_select";
  defaultOptionSku?: string;
  required: boolean;
  engineerReviewRequired: boolean;
  optionSkus: string[];
  notes?: string;
}

/**
 * A term option group: a 3-year (36-month) default with longer-term alternatives
 * (e.g. 5Y/7Y -> 60/84 months), chosen at engineer review rather than frozen from
 * a CCW. `defaultTermMonths` is fixed to 36 by contract; `allowedTermMonths` lists
 * the offered terms in months. TYPE CONTRACT ONLY until runtime support is
 * implemented; no pricing fields.
 */
export interface ConfigExpansionTermOptionGroup {
  termGroupId: string;
  defaultTermMonths: 36;
  allowedTermMonths: readonly number[];
  engineerReviewRequired: boolean;
  optionSkus: string[];
  notes?: string;
}

/**
 * A historical-to-current SKU replacement CANDIDATE, modeled SEPARATELY from
 * configuration expansion. This is a review model only and DOES NOT authorize any
 * silent runtime SKU replacement: a replacement is a different decision from
 * expansion and must be approved on its own (`approvalRequired`/`approved`). Until
 * approved, nothing substitutes `historicalSku` with `currentSkus` at runtime, and
 * even once approved a replacement is never applied silently here. Carries its own
 * `evidence` (required) and `evidenceScope`. TYPE CONTRACT ONLY until runtime
 * support is implemented; no pricing fields.
 */
export interface ConfigExpansionReplacementCandidate {
  historicalSku: string;
  currentSkus: string[];
  evidence: ConfigExpansionEvidenceCitation[];
  evidenceScope: ConfigExpansionEvidenceScope;
  approvalRequired: boolean;
  approved: boolean;
  notes?: string;
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
  /**
   * Advanced, forward-compatible model fields (TYPE CONTRACT ONLY; the v1 runtime
   * evaluator in config-expansion.ts ignores them until later runtime support).
   * `quantityModel` does NOT replace the required v1 `quantityRule` above; it is an
   * additive forward contract a future evaluator may read. No pricing fields.
   */
  quantityModel?: ConfigExpansionQuantityModel;
  /** Duplicate-detection policy for this line (scope/match/satisfaction). */
  duplicatePolicy?: ConfigExpansionDuplicatePolicy;
  /** Id of the option group this line belongs to, when it is an option. */
  optionGroupId?: string;
  /** Id of the term option group this line belongs to, when it is term-coupled. */
  termGroupId?: string;
  /** Whether this line's value is quote-observed, reusable logic, or needs more evidence. */
  evidenceScope?: ConfigExpansionEvidenceScope;
  /** Free-text engineer review note; not authority. */
  reviewNotes?: string;
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
  /**
   * Advanced, forward-compatible model fields (TYPE CONTRACT ONLY until runtime
   * support lands). No pricing fields.
   */
  evidenceScope?: ConfigExpansionEvidenceScope;
  /** Free-text engineer review note; not authority. */
  reviewNotes?: string;
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
  /**
   * Advanced, forward-compatible rule-pack tables (TYPE CONTRACT ONLY until runtime
   * support lands). Packs that omit them stay valid, so current candidate/approved
   * packs remain compatible. `replacementCandidates` are a SEPARATE review model
   * and do NOT authorize silent runtime SKU replacement. No pricing fields.
   */
  optionGroups?: ConfigExpansionOptionGroup[];
  termOptionGroups?: ConfigExpansionTermOptionGroup[];
  replacementCandidates?: ConfigExpansionReplacementCandidate[];
}

/**
 * SKU-resolution disposition copied onto a PRESERVED customer draft line. Declared
 * here as a local literal union (mirroring SkuResolutionStatus in src/types/project.ts)
 * so this contract module stays import-free and self-contained. Deterministic
 * provenance only - NOT pricing or orderability authority: only an "accepted" line
 * with a nonblank acceptedSku is orderable and eligible for expansion. On a preserved
 * customer line this is never "rejected" (a rejected row is an explicit exclusion and
 * is never carried into the draft) and is ABSENT on a row that had no decision at all.
 */
export type ConfigurationExpansionSkuResolutionStatus =
  | "needs_review"
  | "accepted"
  | "rejected"
  | "unresolved"
  | "manual"
  | "out_of_scope";

/**
 * One line in a configuration-expansion draft / accepted expanded BoM. Preserved
 * customer lines (`origin: "customer"`) and auto-added expansion lines
 * (`origin: "expansion"`) share this shape. Every line carries a within-draft
 * `lineId`; an expansion line nests under the customer line it expands via
 * `parentLineId` (and, for readability, the parent's `parentLineNumber`). A
 * preserved customer line keeps its source identity (file/sheet/row, original
 * line number, original and human-accepted SKU, original cells) so the draft
 * traces back to the uploaded BoQ. Auto-added lines carry their `sourceRuleId`
 * and evidence for traceability, and an approval gate because engineer review is
 * still required. No pricing fields. (section 11A.3, section 11A.4)
 */
export interface ConfigurationExpansionDraftLine {
  /** Stable within-draft identity; expansion lines reference it as parentLineId. */
  lineId: string;
  /** Whether this is a preserved customer line or an auto-added expansion line. */
  origin: "customer" | "expansion";
  sku: string;
  description: string;
  quantity: number;
  /** Source file behind a preserved customer line. */
  sourceFileId?: string;
  /** Source worksheet behind a preserved customer line. */
  sourceSheetName?: string;
  /** 1-based source row behind a preserved customer line. */
  sourceRowNumber?: number;
  /** Customer line number as it appeared in the uploaded BoQ. */
  originalLineNumber?: string;
  /** The customer line's own SKU (customer evidence), for a preserved line. */
  originalSku?: string;
  /** Human-accepted SKU for a preserved customer line, when one was accepted. */
  acceptedSku?: string;
  /**
   * SKU-resolution disposition of a preserved customer line, when it had a decision.
   * Deterministic provenance only (NOT pricing/orderability authority): only an
   * "accepted" status WITH a nonblank acceptedSku is orderable and expands. Absent on
   * expansion lines, on customer rows with no decision, and never "rejected" (rejected
   * rows are excluded from the draft). (section 11A.3)
   */
  skuResolutionStatus?: ConfigurationExpansionSkuResolutionStatus;
  /** Verbatim source cells preserved from the customer line. */
  originalCells?: Record<string, string>;
  /** `lineId` of the customer line an expansion line nests under. */
  parentLineId?: string;
  /** Customer line number an expansion line nests under, when applicable. */
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
  /*
   * Additive, backward-compatible roll-ups that make non-preserved and non-orderable
   * customer rows explicit, so no unsupported / manual / excluded row is silently
   * dropped. Optional on the contract for backward compatibility; the deterministic
   * builder always populates them. `customerLineCount` above stays the count of
   * PRESERVED customer lines, so existing accepted-only consumers are unchanged.
   */
  /** Total input customer rows seen, including rejected and no-decision rows. */
  inputCustomerLineCount?: number;
  /** Preserved customer lines that are accepted with a nonblank acceptedSku (orderable). */
  acceptedCustomerLineCount?: number;
  /** Preserved customer lines that are NOT orderable (preserved minus accepted-with-SKU). */
  nonAcceptedCustomerLineCount?: number;
  /** Preserved customer lines explicitly classified manual (non-Cisco / manual commercial). */
  manualCustomerLineCount?: number;
  /** Preserved customer lines explicitly classified out_of_scope. */
  outOfScopeCustomerLineCount?: number;
  /** Rejected customer rows: explicit exclusions, counted but NOT preserved as draft lines. */
  rejectedCustomerLineCount?: number;
  /** Preserved customer lines still unresolved. */
  unresolvedCustomerLineCount?: number;
  /** Preserved customer lines still needs_review. */
  needsReviewCustomerLineCount?: number;
  /** Preserved accepted customer lines with a blank/missing acceptedSku (not orderable). */
  acceptedWithoutSkuCustomerLineCount?: number;
  /** Preserved customer lines that had no SKU-resolution decision at all. */
  noDecisionCustomerLineCount?: number;
}

/**
 * Roll-up counts for a REVIEWED configuration-expansion result: how many customer
 * lines were preserved and how many expansion lines an engineer accepted or
 * rejected. Structurally matches the engineer-review helper's summary
 * (src/lib/projects/config-expansion-review.ts), so a review result drops straight
 * into the persisted artifact payload while this contract module stays
 * self-contained. No monetary totals. (section 11A.3, section 11A.4)
 */
export interface ConfigurationExpansionReviewSummary {
  /** Preserved customer lines. */
  customerLineCount: number;
  /** Expansion lines accepted into the expanded BoM. */
  acceptedExpansionLineCount: number;
  /** Expansion lines rejected and excluded from the expanded BoM. */
  rejectedExpansionLineCount: number;
  /** Total accepted lines (customer + accepted expansion). */
  totalAcceptedLineCount: number;
  /** Expansion lines that received an explicit decision (accepted + rejected). */
  reviewedExpansionLineCount: number;
}

/**
 * JSONB payload of a `configuration_expansion` artifact: the reviewed/accepted
 * expanded BoM plus its provenance and audit trail. Sourced from exactly one
 * `normalized_boq` and one `sku_resolution` artifact, and from one rule-pack
 * version. `acceptedLines` is the accepted expanded BoM in customer-then-children
 * order (its length is `lineCount`); `rejectedLines` keeps the excluded expansion
 * lines, in original draft order, for review/audit traceability; `summary` is the
 * engineer-review roll-up; `reviewedBy`/`reviewedAt` are present only when the
 * reviewer supplied them. Declared as a type alias (not an interface) so it carries
 * an implicit index signature and stays assignable to the artifact repository's
 * Record<string, unknown> payload, matching the sku-resolution and priced-boq
 * payloads. No pricing fields. (section 3, section 11A.3, section 15)
 */
export type ConfigurationExpansionArtifactPayload = {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  /**
   * Optional provenance of the `configuration_expansion` DRAFT artifact this
   * reviewed artifact was produced from, present only when the reviewed artifact
   * was created by reviewing a persisted draft (the explicit per-line review path).
   * Absent on a reviewed artifact built without a source draft. Does NOT mark the
   * artifact as a draft: the draft discriminator is `payloadKind`, which a reviewed
   * payload never carries, so this field never affects approvability.
   */
  sourceConfigurationExpansionDraftArtifactId?: string;
  /** Version of the source configuration_expansion DRAFT artifact, paired with its id. */
  sourceConfigurationExpansionDraftArtifactVersion?: number;
  /** Copied provenance: source files behind the upstream artifacts. */
  sourceFileIds: string[];
  rulePackId: string;
  rulePackVersion: string;
  /** Always "approved": only an approved-rule-pack expansion may be persisted. (section 11A.1, 11A.5) */
  rulePackStatus: "approved";
  /** Accepted-line count; equals acceptedLines.length. */
  lineCount: number;
  /** Accepted expanded BoM, in customer-then-children order. */
  acceptedLines: ConfigurationExpansionDraftLine[];
  /** Rejected expansion lines, in original draft order, kept for audit. */
  rejectedLines: ConfigurationExpansionDraftLine[];
  summary: ConfigurationExpansionReviewSummary;
  /** Reviewer identity, present only when supplied. */
  reviewedBy?: string;
  /** Review timestamp, present only when supplied. */
  reviewedAt?: string;
  /**
   * Lean configuration-authority trace inherited from the source DRAFT artifact.
   * Present only when the reviewed artifact was produced from a DRAFT that carried
   * the trace (Prompt 117/118). Configuration authority only: no pricing, catalog,
   * sell, discount, margin, markup, VAT, currency, or amount fields. Does not
   * authorize pricing, production Cisco authority, replacement, substitution, or
   * runtime AI. (Prompt 118)
   */
  configurationAuthority?: ConfigurationAuthorityTrace;
};

/**
 * Lean configuration-authority trace embedded in a DRAFT artifact payload.
 * Records which approved configuration authority profile governed draft creation
 * and a disposition summary for the accepted SKUs that seeded the draft.
 * Configuration authority only - no pricing fields. (section 11A.1, Prompt 117)
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
 * JSONB payload of a DRAFT `configuration_expansion` artifact: the deterministic
 * configuration-expansion draft built from one APPROVED `sku_resolution` artifact
 * (and its `normalized_boq` source) plus one APPROVED rule-pack version, BEFORE any
 * per-line engineer review. The `payloadKind` discriminator
 * "configuration_expansion_draft" marks it as an unreviewed draft so the generic
 * exact-artifact approval path refuses it: a draft is NOT the reviewed/accepted
 * expanded BoM that {@link ConfigurationExpansionArtifactPayload} carries (that
 * payload has no `payloadKind` marker and stays approvable). The reviewed artifact
 * is produced only by the explicit per-line configuration-expansion review. `lines`
 * is the full draft in customer-then-children order (its length is `lineCount`);
 * auto-added expansion lines stay `approvalRequired`/unapproved. Declared as a type
 * alias (not an interface) so it carries an implicit index signature and stays
 * assignable to the artifact repository's Record<string, unknown> payload, matching
 * the reviewed/sku-resolution/priced-boq payloads. No pricing fields.
 * (section 3, section 11A.3, section 14, section 15)
 */
export type ConfigurationExpansionDraftArtifactPayload = {
  /** Draft discriminator; absent on a reviewed/accepted configuration_expansion payload. */
  payloadKind: "configuration_expansion_draft";
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  /** Copied provenance: source files behind the upstream artifacts, first-seen union. */
  sourceFileIds: string[];
  rulePackId: string;
  rulePackVersion: string;
  /** Always "approved": only an approved-rule-pack expansion may be drafted. (section 11A.1, 11A.5) */
  rulePackStatus: "approved";
  /** Scope label of the approved rule pack the draft was built from. (section 11A.2) */
  rulePackSourceScope: string;
  /** Total draft-line count; equals lines.length. */
  lineCount: number;
  /** Full configuration-expansion draft, in customer-then-children order. */
  lines: ConfigurationExpansionDraftLine[];
  summary: ConfigurationExpansionDraftSummary;
  /**
   * Lean configuration-authority trace recording which approved profile governed
   * draft creation. Present when the service wired a Honeywell MVP config authority
   * profile at draft time. Configuration authority only; no pricing fields.
   * (Prompt 117)
   */
  configurationAuthority?: ConfigurationAuthorityTrace;
};

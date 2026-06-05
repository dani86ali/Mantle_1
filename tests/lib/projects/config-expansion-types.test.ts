import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type {
  ConfigExpansionRulePackStatus,
  ConfigExpansionRelationshipType,
  ConfigExpansionQuantityRule,
  ConfigExpansionEvidenceCitation,
  ConfigExpansionChildRule,
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
  ConfigurationExpansionDraftLine,
  ConfigurationExpansionDraftSummary,
  ConfigurationExpansionReviewSummary,
  ConfigurationExpansionArtifactPayload,
  ConfigExpansionQuantityModel,
  ConfigExpansionDuplicatePolicy,
  ConfigExpansionOptionGroup,
  ConfigExpansionTermOptionGroup,
  ConfigExpansionEvidenceScope,
  ConfigExpansionReplacementCandidate,
} from "@/lib/projects/config-expansion-types";

/**
 * Contract test for the configuration-expansion type module (Prompt 34).
 *
 * The module is a TYPE-ONLY contract: there is no runtime expansion code yet.
 * These tests therefore lean on compile-time `satisfies` checks (validated by
 * `tsc --noEmit`) plus a few runtime assertions over representative constants, and
 * they read the module source from disk to prove it stays decoupled from DB,
 * API/UI, engines, AI, pricing, catalog, and artifact-store modules.
 */

const MODULE_PATH = join(
  process.cwd(),
  "src/lib/projects/config-expansion-types.ts"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/config-expansion-types.test.ts"
);

// Pricing must be absent from every payload key. Key-only check, mirroring the
// Prompt 33 rule-pack test: the relationshipType VALUE "included_zero_price" is
// intentionally allowed because it never appears as an object key.
const FORBIDDEN_KEY_TOKENS = [
  "price",
  "cost",
  "discount",
  "margin",
  "markup",
  "vat",
  "currency",
  "msrp",
  "sell",
  "amount",
];

// --- Compile-time shape checks (verified by tsc) ----------------------------

const RULE_PACK_STATUS = "approved" satisfies ConfigExpansionRulePackStatus;
const RELATIONSHIP_TYPE = "default_selected" satisfies ConfigExpansionRelationshipType;
const QUANTITY_RULE = "fixed_per_parent" satisfies ConfigExpansionQuantityRule;

const CITATION = {
  sourceType: "ccw_export",
  sourcePath: "C:/Pre-Sales/Benchmarck_Files/Estimate_NB167337237YA.xlsx",
  sheetName: "EstimateDetails_NB167337237YA",
  lineNumber: 3,
  evidenceNote: "CCW Line Number 1.0.1; Item Name CON-ROB-CW9178IC; Quantity 12.",
} satisfies ConfigExpansionEvidenceCitation;

const CHILD_RULE = {
  sku: "CON-ROB-CW9178IC",
  description: "RMA UPGRADE 8X5XNBD Cisco Wireless 9178I",
  relationshipType: "service_or_support",
  quantityRule: "same_as_parent",
  includedItem: false,
  sourceRuleId: "honeywell-cw9178i-cfg",
  evidence: [CITATION],
  approvalRequired: true,
  approved: false,
  termMonths: 12,
} satisfies ConfigExpansionChildRule;

const PARENT_RULE = {
  ruleId: "honeywell-cw9178i-cfg",
  parentSku: "CW9178I-CFG",
  parentDescription: "Cisco Wireless 9178I(W7,4 radio,3 band 4x4,UWB), Global",
  evidence: [CITATION],
  childLines: [CHILD_RULE],
  approvalRequired: true,
  approved: false,
} satisfies ConfigExpansionParentRule;

const RULE_PACK = {
  rulePackId: "honeywell-candidate-rules",
  name: "Honeywell candidate rules",
  version: "0.1.0-candidate",
  status: "candidate",
  approvalRequired: true,
  sourceScope: "honeywell_current_ccw_2026_06_02",
  parentRules: [PARENT_RULE],
} satisfies ConfigExpansionRulePack;

const DRAFT_LINE: ConfigurationExpansionDraftLine = {
  lineId: "line-1-x1",
  origin: "expansion",
  sku: "PWR-C1-1100WAC-P",
  description: "1100W AC 80+ platinum Config 1 Power Supply",
  quantity: 7,
  parentLineId: "line-1",
  parentLineNumber: "3",
  relationshipType: "included_zero_price",
  quantityRule: "same_as_parent",
  includedItem: true,
  sourceRuleId: "honeywell-c9300x-48hx-a",
  evidence: [CITATION],
  approvalRequired: true,
  approved: false,
};

// The configuration-expansion DRAFT summary still backs the draft helper
// (src/lib/projects/config-expansion.ts); keep it covered as a representative shape.
const DRAFT_SUMMARY = {
  customerLineCount: 1,
  addedLineCount: 1,
  totalLineCount: 2,
  requiresReviewCount: 1,
  includedItemCount: 1,
} satisfies ConfigurationExpansionDraftSummary;

// The persisted artifact carries the REVIEW summary (accepted/rejected), not the draft one.
const REVIEW_SUMMARY = {
  customerLineCount: 1,
  acceptedExpansionLineCount: 1,
  rejectedExpansionLineCount: 0,
  totalAcceptedLineCount: 2,
  reviewedExpansionLineCount: 1,
} satisfies ConfigurationExpansionReviewSummary;

const PAYLOAD = {
  sourceNormalizedBoqArtifactId: "nbq-1",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "sku-1",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  rulePackId: "honeywell-candidate-rules",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  lineCount: 2,
  acceptedLines: [
    {
      lineId: "line-1",
      origin: "customer",
      sku: "C9300X-48HX-A",
      description: "Catalyst 9300 48-port mGig UPoE+, Network Advantage",
      quantity: 7,
      sourceFileId: "file-1",
      sourceRowNumber: 13,
      originalLineNumber: "3",
      originalSku: "C9300X-48HX-A",
      acceptedSku: "C9300X-48HX-A",
      originalCells: { "#": "3", "Part Number": "C9300X-48HX-A" },
    },
    DRAFT_LINE,
  ],
  rejectedLines: [],
  summary: REVIEW_SUMMARY,
} satisfies ConfigurationExpansionArtifactPayload;

// Required-field proof: omitting sourceRuleId and evidence from a child rule must
// be a type error. If those fields were ever made optional, the directive below
// would become unused and `tsc` would fail - which is exactly the guard we want.
// @ts-expect-error - sourceRuleId and evidence are required on a child rule
const _CHILD_MISSING_PROVENANCE: ConfigExpansionChildRule = { sku: "X", description: "Y", relationshipType: "subscription", quantityRule: "fixed", includedItem: false, approvalRequired: true, approved: false };

// --- Advanced rule-model contracts (Prompt 49, type-contract-only) ----------
// These prove the forward-compatible shapes compile. They assert nothing about
// runtime behavior: no runtime evaluator reads these advanced fields yet.

// All five advanced quantity-model variants compile, including the related-SKU
// total and the selected-option-count derivations the gap report calls for.
const QUANTITY_MODELS = [
  { type: "same_as_parent" },
  { type: "fixed", value: 5 },
  { type: "fixed_per_parent", value: 2 },
  { type: "same_as_related_sku_total", relatedSku: "CW9178I-CFG", scope: "project" },
  { type: "selected_option_count", optionGroupId: "c9300x-ac-power-supplies" },
] satisfies ConfigExpansionQuantityModel[];

// A wireless license child derives its quantity from the related access-point SKU
// total instead of Honeywell's frozen quantity 12. The required v1 quantityRule
// stays; quantityModel is the additive forward contract.
const WIRELESS_LICENSE_CHILD = {
  sku: "LIC-CW-A",
  description: "Cisco Wireless License - Advantage",
  relationshipType: "subscription",
  quantityRule: "fixed",
  includedItem: false,
  sourceRuleId: "honeywell-cisco-network-sub",
  evidence: [CITATION],
  approvalRequired: true,
  approved: false,
  quantityValue: 12,
  quantityModel: {
    type: "same_as_related_sku_total",
    relatedSku: "CW9178I-CFG",
    scope: "project",
  },
  evidenceScope: "reusable_logic",
  reviewNotes: "Derive from CW9178I-CFG access-point total, not the observed 12.",
} satisfies ConfigExpansionChildRule;

// A power-cable child derives its quantity from the selected AC power-supply
// option count rather than a frozen per-parent multiplier of 2.
const POWER_CABLE_CHILD = {
  sku: "CAB-C15-CBN",
  description: "Cabinet Jumper Power Cord, 250 VAC 13A, C14-C15 Connectors",
  relationshipType: "default_selected",
  quantityRule: "fixed_per_parent",
  includedItem: false,
  sourceRuleId: "honeywell-c9300x-48hx-a",
  evidence: [CITATION],
  approvalRequired: true,
  approved: false,
  quantityValue: 2,
  quantityModel: {
    type: "selected_option_count",
    optionGroupId: "c9300x-ac-power-supplies",
  },
  duplicatePolicy: {
    scope: "parent_segment",
    match: "sku_and_parent",
    quantitySatisfaction: "always_add_missing_delta",
  },
} satisfies ConfigExpansionChildRule;

// An option group: a default selection with engineer-review alternatives.
const PSU_OPTION_GROUP = {
  optionGroupId: "c9300x-ac-power-supplies",
  label: "C9300X AC power supplies",
  selectionMode: "multi_select",
  defaultOptionSku: "PWR-C1-1100WAC-P",
  required: true,
  engineerReviewRequired: true,
  optionSkus: ["PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2"],
  notes: "Secondary PSU is an engineer-review redundancy choice.",
} satisfies ConfigExpansionOptionGroup;

// A term option group: 3Y (36-month) default with 5Y/7Y (60/84) alternatives.
const DNA_TERM_GROUP = {
  termGroupId: "c9300-dna-term",
  defaultTermMonths: 36,
  allowedTermMonths: [36, 60, 84],
  engineerReviewRequired: true,
  optionSkus: ["C9300-DNA-A-48-3Y", "C9300-DNA-A-48-5Y", "C9300-DNA-A-48-7Y"],
  notes: "3Y default; 5Y/7Y alternatives chosen at engineer review.",
} satisfies ConfigExpansionTermOptionGroup;

// A duplicate policy scoped per project SKU, where an existing line satisfies a
// required one (per-project subscription/support de-duplication).
const PROJECT_DUPLICATE_POLICY = {
  scope: "project_sku",
  match: "sku",
  quantitySatisfaction: "existing_satisfies_required",
} satisfies ConfigExpansionDuplicatePolicy;

// A replacement candidate lives SEPARATELY from the runtime child rules. It is a
// review model only and authorizes no silent runtime SKU substitution.
const IMAGE_REPLACEMENT_CANDIDATE = {
  historicalSku: "SC9300UK9-1712",
  currentSkus: ["SC9300UK9-1715"],
  evidence: [CITATION],
  evidenceScope: "quote_observed",
  approvalRequired: true,
  approved: false,
  notes: "Historical-to-current image SKU mapping; reviewed and approved on its own, never applied silently at runtime.",
} satisfies ConfigExpansionReplacementCandidate;

// A rule pack MAY carry the advanced tables; packs that omit them (like RULE_PACK
// above) stay valid. The replacement candidate is carried here, NOT inside any
// parent rule's childLines.
const ADVANCED_RULE_PACK = {
  rulePackId: "honeywell-candidate-rules-advanced",
  name: "Honeywell candidate rules (advanced model)",
  version: "0.2.0-candidate",
  status: "candidate",
  approvalRequired: true,
  sourceScope: "honeywell_current_ccw_2026_06_02",
  parentRules: [PARENT_RULE],
  optionGroups: [PSU_OPTION_GROUP],
  termOptionGroups: [DNA_TERM_GROUP],
  replacementCandidates: [IMAGE_REPLACEMENT_CANDIDATE],
} satisfies ConfigExpansionRulePack;

// --- Advanced-model type-safety proofs (verified by tsc) --------------------

// An invalid evidence scope must be rejected.
// @ts-expect-error - "observed" is not a ConfigExpansionEvidenceScope value
const _BAD_EVIDENCE_SCOPE: ConfigExpansionEvidenceScope = "observed";

// An invalid duplicate-policy scope must be rejected. "project" is the QUANTITY
// model's scope value, not the duplicate policy's ("project_sku"); using it here
// also proves the two scope unions are distinct.
// @ts-expect-error - "project" is not a ConfigExpansionDuplicatePolicy scope
const _BAD_DUPLICATE_SCOPE: ConfigExpansionDuplicatePolicy = { scope: "project", match: "sku", quantitySatisfaction: "always_review" };

// A replacement candidate must carry evidence; omitting it is a type error.
// @ts-expect-error - evidence is required on a replacement candidate
const _REPLACEMENT_MISSING_EVIDENCE: ConfigExpansionReplacementCandidate = { historicalSku: "A", currentSkus: ["B"], evidenceScope: "needs_more_evidence", approvalRequired: true, approved: false };

// --- Runtime assertions over the representative constants -------------------

function collectKeys(node: unknown, acc: string[]): string[] {
  if (Array.isArray(node)) {
    for (const value of node) collectKeys(value, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      acc.push(key);
      collectKeys(value, acc);
    }
  }
  return acc;
}

describe("configuration-expansion artifact payload", () => {
  it("constructs a representative payload with the required provenance fields", () => {
    expect(PAYLOAD.sourceNormalizedBoqArtifactId).toBe("nbq-1");
    expect(PAYLOAD.sourceNormalizedBoqArtifactVersion).toBe(1);
    expect(PAYLOAD.sourceSkuResolutionArtifactId).toBe("sku-1");
    expect(PAYLOAD.sourceSkuResolutionArtifactVersion).toBe(2);
    expect(PAYLOAD.rulePackId).toBe("honeywell-candidate-rules");
    expect(PAYLOAD.rulePackVersion).toBe("1.0.0");
    expect(PAYLOAD.rulePackStatus).toBe("approved");
    expect(PAYLOAD.acceptedLines).toHaveLength(2);
    expect(PAYLOAD.rejectedLines).toHaveLength(0);
    expect(PAYLOAD.lineCount).toBe(PAYLOAD.acceptedLines.length);
    expect(PAYLOAD.summary.totalAcceptedLineCount).toBe(2);
    // The draft summary type still backs the upstream draft helper.
    expect(DRAFT_SUMMARY.totalLineCount).toBe(2);
  });

  it("carries no pricing fields on any payload key", () => {
    for (const key of collectKeys(PAYLOAD, [])) {
      const lower = key.toLowerCase();
      for (const token of FORBIDDEN_KEY_TOKENS) {
        expect(
          lower.includes(token),
          `payload key "${key}" contains pricing token "${token}"`
        ).toBe(false);
      }
    }
  });
});

describe("configuration-expansion rule pack", () => {
  it("requires sourceRuleId and evidence citations on every child rule", () => {
    for (const parent of RULE_PACK.parentRules) {
      for (const child of parent.childLines) {
        expect(child.sourceRuleId.length).toBeGreaterThan(0);
        expect(child.sourceRuleId).toBe(parent.ruleId);
        expect(child.evidence.length).toBeGreaterThanOrEqual(1);
        expect(child.evidence[0].sourcePath.length).toBeGreaterThan(0);
        expect(child.evidence[0].evidenceNote.length).toBeGreaterThan(0);
      }
    }
  });

  it("exposes the candidate/approved lifecycle and observed enum values", () => {
    expect(RULE_PACK_STATUS).toBe("approved");
    expect(RELATIONSHIP_TYPE).toBe("default_selected");
    expect(QUANTITY_RULE).toBe("fixed_per_parent");
    expect(RULE_PACK.status).toBe("candidate");
    // The missing-provenance literal exists only to anchor the @ts-expect-error
    // above; it is intentionally incomplete at the type level.
    expect(_CHILD_MISSING_PROVENANCE.sku).toBe("X");
  });
});

describe("configuration-expansion type module - decoupling and hygiene", () => {
  it("imports no DB, API/UI, engine, AI, pricing, catalog, or artifact-store modules", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    const importSources: string[] = [];
    const importRegex = /\bfrom\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      importSources.push(match[1]);
    }
    const forbidden = [
      "/db",
      "db/",
      "drizzle",
      "artifact-store",
      "/api",
      "/app/",
      "/components",
      "engine",
      "coordinator",
      "anthropic",
      "generative-ai",
      "/ai",
      "pricing",
      "priced-boq",
      "catalog",
      "adapter",
    ];
    for (const importSource of importSources) {
      const lower = importSource.toLowerCase();
      for (const token of forbidden) {
        expect(
          lower.includes(token),
          `module imports "${importSource}" matching forbidden "${token}"`
        ).toBe(false);
      }
    }
  });

  it("keeps the module source ASCII-only", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

describe("configuration-expansion advanced rule-model contracts", () => {
  it("derives a wireless license quantity from the related access-point SKU total", () => {
    expect(WIRELESS_LICENSE_CHILD.quantityModel).toEqual({
      type: "same_as_related_sku_total",
      relatedSku: "CW9178I-CFG",
      scope: "project",
    });
    // The required v1 quantityRule is retained alongside the forward contract.
    expect(WIRELESS_LICENSE_CHILD.quantityRule).toBe("fixed");
    expect(WIRELESS_LICENSE_CHILD.evidenceScope).toBe("reusable_logic");
  });

  it("derives a power-cable quantity from a selected option-group count", () => {
    expect(POWER_CABLE_CHILD.quantityModel).toEqual({
      type: "selected_option_count",
      optionGroupId: "c9300x-ac-power-supplies",
    });
  });

  it("models a 3Y default term with 5Y/7Y alternatives", () => {
    expect(DNA_TERM_GROUP.defaultTermMonths).toBe(36);
    expect(DNA_TERM_GROUP.allowedTermMonths).toContain(36);
    expect(DNA_TERM_GROUP.allowedTermMonths).toContain(60);
    expect(DNA_TERM_GROUP.allowedTermMonths).toContain(84);
    expect(DNA_TERM_GROUP.engineerReviewRequired).toBe(true);
  });

  it("models a project-SKU duplicate policy satisfied by an existing line", () => {
    expect(PROJECT_DUPLICATE_POLICY.scope).toBe("project_sku");
    expect(PROJECT_DUPLICATE_POLICY.quantitySatisfaction).toBe(
      "existing_satisfies_required"
    );
  });

  it("exposes an option group with a default and engineer-review alternatives", () => {
    expect(PSU_OPTION_GROUP.optionGroupId).toBe("c9300x-ac-power-supplies");
    expect(PSU_OPTION_GROUP.engineerReviewRequired).toBe(true);
    expect(PSU_OPTION_GROUP.optionSkus.length).toBeGreaterThan(1);
    expect(QUANTITY_MODELS).toHaveLength(5);
  });

  it("keeps replacement candidates separate from runtime child rules", () => {
    // The replacement candidate is its own model: no runtime child-rule fields.
    expect("quantityRule" in IMAGE_REPLACEMENT_CANDIDATE).toBe(false);
    expect("sourceRuleId" in IMAGE_REPLACEMENT_CANDIDATE).toBe(false);
    expect(IMAGE_REPLACEMENT_CANDIDATE.evidence.length).toBeGreaterThanOrEqual(1);
    // It is carried on the pack's replacementCandidates table, not in childLines.
    expect(ADVANCED_RULE_PACK.replacementCandidates).toHaveLength(1);
    for (const parentRule of ADVANCED_RULE_PACK.parentRules) {
      for (const childRule of parentRule.childLines) {
        expect("historicalSku" in childRule).toBe(false);
      }
    }
  });

  it("anchors the advanced-model type-safety directives", () => {
    // These literals exist only to anchor the @ts-expect-error directives above;
    // they are intentionally invalid at the type level but valid JS at runtime.
    expect(_BAD_EVIDENCE_SCOPE).toBe("observed");
    expect(_BAD_DUPLICATE_SCOPE.scope).toBe("project");
    expect(_REPLACEMENT_MISSING_EVIDENCE.historicalSku).toBe("A");
  });

  it("carries no pricing token on any representative fixture key", () => {
    const fixtures: unknown[] = [
      PAYLOAD,
      RULE_PACK,
      ADVANCED_RULE_PACK,
      WIRELESS_LICENSE_CHILD,
      POWER_CABLE_CHILD,
      PSU_OPTION_GROUP,
      DNA_TERM_GROUP,
      PROJECT_DUPLICATE_POLICY,
      IMAGE_REPLACEMENT_CANDIDATE,
      QUANTITY_MODELS,
      DRAFT_LINE,
      DRAFT_SUMMARY,
      REVIEW_SUMMARY,
    ];
    for (const key of collectKeys(fixtures, [])) {
      const lower = key.toLowerCase();
      for (const token of FORBIDDEN_KEY_TOKENS) {
        expect(
          lower.includes(token),
          `fixture key "${key}" contains pricing token "${token}"`
        ).toBe(false);
      }
    }
  });
});

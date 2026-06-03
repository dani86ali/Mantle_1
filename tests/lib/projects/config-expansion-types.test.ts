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
  ConfigurationExpansionArtifactPayload,
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

const SUMMARY = {
  customerLineCount: 1,
  addedLineCount: 1,
  totalLineCount: 2,
  requiresReviewCount: 1,
  includedItemCount: 1,
} satisfies ConfigurationExpansionDraftSummary;

const PAYLOAD = {
  sourceNormalizedBoqArtifactId: "nbq-1",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "sku-1",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  rulePackId: "honeywell-candidate-rules",
  rulePackVersion: "0.1.0-candidate",
  rulePackStatus: "candidate",
  lineCount: 2,
  lines: [
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
  summary: SUMMARY,
} satisfies ConfigurationExpansionArtifactPayload;

// Required-field proof: omitting sourceRuleId and evidence from a child rule must
// be a type error. If those fields were ever made optional, the directive below
// would become unused and `tsc` would fail - which is exactly the guard we want.
// @ts-expect-error - sourceRuleId and evidence are required on a child rule
const _CHILD_MISSING_PROVENANCE: ConfigExpansionChildRule = { sku: "X", description: "Y", relationshipType: "subscription", quantityRule: "fixed", includedItem: false, approvalRequired: true, approved: false };

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
    expect(PAYLOAD.rulePackVersion).toBe("0.1.0-candidate");
    expect(PAYLOAD.rulePackStatus).toBe("candidate");
    expect(PAYLOAD.lines).toHaveLength(2);
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

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getHoneywellMvpConfigExpansionRulePack,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_NAME,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
  HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
  HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_PACK_IDS,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import {
  buildConfigurationExpansionDraft,
  type ConfigurationExpansionDraft,
} from "@/lib/projects/config-expansion";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type {
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
} from "@/lib/projects/config-expansion-types";

/**
 * Behavior tests for the active Honeywell MVP configuration-expansion selector. The
 * selector composes the committed, separately-approved Batch 1 + Batch 2 + Batch 3
 * packs into one in-memory approved pack that buildConfigurationExpansionDraft
 * accepts. It approves nothing new, pulls in no later-batch decision record and no
 * candidate pack, introduces no replacement handling, and carries no pricing
 * authority. Committed packs on disk are never mutated by these tests.
 */

const SELECTOR_PATH = join(process.cwd(), "src/lib/projects/honeywell-config-expansion-rule-pack.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-config-expansion-rule-pack.test.ts");

const RULE_PACK_ID = "honeywell-mvp-composed-batch1-batch2-batch3";

// First-seen parentSku union across [Batch 1, Batch 2, Batch 3]; Batch 3 adds no new
// parent SKU, so the order matches the Batch 1 + Batch 2 composition.
const EXPECTED_PARENT_ORDER = [
  "CISCO-NETWORK-SUB",
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "CW9178I-CFG",
  "CP-7841-K9=",
];

const B1_C9300X = ["PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2", "CAB-C15-CBN"];
const B2_C9300X = [
  "CON-L1NCD-C9300XY4", "C9300-DNA-A-48", "CON-L1SWT-C93A48", "C9300-DNA-A-48-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "C9300-NW-A-48", "SC9300UK9-1715", "TE-C9K-SW", "NETWORK-PNP-LIC",
];
const B3_C9300X = [
  "C9300-SSD-NONE", "STACK-T1-50CM", "CAB-SPWR-30CM", "C9K-ACC-RBFT",
  "C9K-ACC-SCR-4", "CAB-GUIDE-1RU", "C9300X-NM-8Y",
];
const B1_C9300L = ["PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2", "CAB-C15-CBN"];
const B2_C9300L = [
  "CON-L1NCD-C93024PX", "C9300L-DNA-A-24", "CON-L1SWT-C93LA24", "C9300L-DNA-A-24-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "S9300LUK9-1718", "C9300L-NW-A-24", "TE-C9K-SW", "NETWORK-PNP-LIC",
];
const B3_C9300L = [
  "FAN-T2", "C9300L-SSD-NONE", "C9K-ACC-RBFT", "C9K-ACC-SCR-4",
  "CAB-GUIDE-1RU", "C9300L-STACK-KIT2", "C9300L-STACK-A", "STACK-T3A-50CM",
];
// Batch 3 wireless mounting/bracket/single-pack accessories under CW9178I-CFG.
const B3_CW9178 = ["AIR-AP-BRACKET-2", "AIR-AP-T-RAIL-F", "CW9178-SINGLE"];

const PRICING_TOKENS = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount"];

const EXPECTED_IMPORT_SPECIFIERS = [
  "@/lib/projects/config-expansion-rule-pack-composer",
  "@/lib/projects/config-expansion-types",
  "../../../data/config-expansion/honeywell-batch1-approved-rules.json",
  "../../../data/config-expansion/honeywell-batch2-approved-rules.json",
  "../../../data/config-expansion/honeywell-batch3-approved-rules.json",
];

// Module tokens the selector must never reference in an import specifier: the later
// batch / candidate packs, replacement handling, and pricing/catalog/API/UI/export/
// DB/AI modules. Scanned over the EXTRACTED specifiers only (never the raw source) so
// the selector doc comment can describe these boundaries without self-tripping.
const FORBIDDEN_IMPORT_TOKENS = [
  "batch4", "candidate", "replacement",
  "pric", "cost", "catalog",
  "adapter", "/api", "route",
  "component", ".tsx", "/ui",
  "export", "docx", "xlsx", "exceljs",
  "drizzle", "schema", "/db/",
  "agent", "llm", "anthropic", "openai", "gemini", "claude",
];

// Distinctive slugs that must not appear anywhere in the raw selector source. Bare
// words like "candidate" or "replacement" are intentionally NOT scanned here: the
// selector doc comment uses them in prose, and only the full slugs prove a forbidden
// reference (avoids the source-scan-matches-own-comments trap).
const FORBIDDEN_SOURCE_SLUGS = ["honeywell-batch4", "honeywell-candidate", "replacementcandidates"];

function parentBySku(p: ConfigExpansionRulePack, sku: string): ConfigExpansionParentRule | undefined {
  return p.parentRules.find((parent) => parent.parentSku === sku);
}
function childSkus(p: ConfigExpansionRulePack, sku: string): string[] {
  return (parentBySku(p, sku)?.childLines ?? []).map((c) => c.sku);
}

// --- BoQ / decision helpers for the runtime-expansion smoke -----------------

function boqLine(row: number, sku: string, quantity: number): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    sku,
    description: sku,
    quantity,
    originalCells: { "#": String(row), "Part Number": sku },
  };
}
function acceptDecision(row: number, sku: string): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    originalSku: sku,
    status: "accepted",
    suggestions: [],
    acceptedSku: sku,
  };
}
function expand(p: ConfigExpansionRulePack, rows: Array<[number, string, number]>): ConfigurationExpansionDraft {
  return buildConfigurationExpansionDraft({
    lines: rows.map(([r, s, q]) => boqLine(r, s, q)),
    decisions: rows.map(([r, s]) => acceptDecision(r, s)),
    rulePack: p,
  });
}
function added(draft: ConfigurationExpansionDraft) {
  return draft.lines.filter((l) => l.origin === "expansion");
}
function addedQty(draft: ConfigurationExpansionDraft, sku: string): number | undefined {
  return added(draft).find((l) => l.sku === sku)?.quantity;
}

function importSpecifiers(source: string): Array<{ typeOnly: boolean; from: string }> {
  const importRegex = /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: Array<{ typeOnly: boolean; from: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) found.push({ typeOnly: Boolean(m[1]), from: m[2] });
  return found;
}

// Shared read-only pack for the happy-path assertions (no test mutates it).
const pack = getHoneywellMvpConfigExpansionRulePack();

// --- Selector metadata and composed pack shape ------------------------------

describe("getHoneywellMvpConfigExpansionRulePack - composed pack shape", () => {
  it("returns an approved, no-further-approval-required pack with the active metadata", () => {
    expect(pack.status).toBe("approved");
    expect(pack.approvalRequired).toBe(false);
    expect(pack.rulePackId).toBe(RULE_PACK_ID);
    expect(pack.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
    expect(pack.version).toBe("1.0.0");
    expect(pack.version).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
    expect(pack.sourceScope).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE);
    expect(pack.name).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_NAME);
  });

  it("exposes stable source pack ids for exactly the three approved batches", () => {
    expect(HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_PACK_IDS).toEqual([
      "honeywell-batch1-approved-rules",
      "honeywell-batch2-approved-rules",
      "honeywell-batch3-approved-rules",
    ]);
  });

  it("emits one parent per parentSku in first-seen union order with unique parent SKUs", () => {
    const skus = pack.parentRules.map((p) => p.parentSku);
    expect(skus).toEqual(EXPECTED_PARENT_ORDER);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("uses the composed parent ruleId convention and rewrites every child sourceRuleId to it", () => {
    for (const p of pack.parentRules) {
      expect(p.ruleId).toBe(`${RULE_PACK_ID}::${p.parentSku}`);
      for (const c of p.childLines) {
        expect(c.sourceRuleId, `${p.parentSku}/${c.sku}`).toBe(p.ruleId);
      }
    }
  });
});

// --- Merged child sets under shared parents ---------------------------------

describe("getHoneywellMvpConfigExpansionRulePack - merged child sets", () => {
  it("merges CW9178I-CFG: Batch 2 support then Batch 3 wireless accessories, in order", () => {
    expect(childSkus(pack, "CW9178I-CFG")).toEqual(["CON-ROB-CW9178IC", ...B3_CW9178]);
  });

  it("merges C9300X-48HX-A: Batch 1 power, Batch 2 software/support, then Batch 3 hardware/accessories", () => {
    expect(childSkus(pack, "C9300X-48HX-A")).toEqual([...B1_C9300X, ...B2_C9300X, ...B3_C9300X]);
  });

  it("merges C9300L-24P-4X-A: Batch 1 power, Batch 2 software/support, then Batch 3 hardware/accessories", () => {
    expect(childSkus(pack, "C9300L-24P-4X-A")).toEqual([...B1_C9300L, ...B2_C9300L, ...B3_C9300L]);
  });

  it("merges CISCO-NETWORK-SUB: Batch 1 wireless licenses then the Batch 2 support line", () => {
    expect(childSkus(pack, "CISCO-NETWORK-SUB")).toEqual(["LIC-CW-A", "LIC-SPACES-ADV", "SVS-L0SPT-CN"]);
  });

  it("keeps CP-7841-K9= Batch 2-only with its single support child", () => {
    expect(childSkus(pack, "CP-7841-K9=")).toEqual(["CON-L1NBD-P7PK94P1"]);
  });
});

// --- Authority boundaries ---------------------------------------------------

describe("getHoneywellMvpConfigExpansionRulePack - authority boundaries", () => {
  it("emits no replacementCandidates field", () => {
    expect(pack.replacementCandidates).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(pack, "replacementCandidates")).toBe(false);
  });

  it("carries no pricing-authority key anywhere in the composed pack", () => {
    const keys: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const v of node) collect(v);
      } else if (node !== null && typeof node === "object") {
        for (const k of Object.keys(node as Record<string, unknown>)) {
          keys.push(k);
          collect((node as Record<string, unknown>)[k]);
        }
      }
    };
    collect(pack);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const token of PRICING_TOKENS) {
        expect(key.toLowerCase().includes(token), `key "${key}" contains pricing token "${token}"`).toBe(false);
      }
    }
  });
});

// --- Fresh, isolated object per call ----------------------------------------

describe("getHoneywellMvpConfigExpansionRulePack - fresh isolated pack per call", () => {
  it("returns a distinct deep-copied object each call; caller mutation cannot corrupt a later call", () => {
    const first = getHoneywellMvpConfigExpansionRulePack();
    const second = getHoneywellMvpConfigExpansionRulePack();
    expect(first).not.toBe(second);
    const parentCount = first.parentRules.length;
    const firstChildSku = first.parentRules[0].childLines[0].sku;

    // Mutate the first returned pack aggressively at every level.
    first.rulePackId = "MUTATED";
    first.status = "candidate";
    first.parentRules[0].ruleId = "MUTATED-RULE";
    first.parentRules[0].childLines[0].sku = "MUTATED-CHILD";
    first.parentRules.length = 0;

    const third = getHoneywellMvpConfigExpansionRulePack();
    expect(third.rulePackId).toBe(RULE_PACK_ID);
    expect(third.status).toBe("approved");
    expect(third.parentRules.length).toBe(parentCount);
    expect(third.parentRules[0].ruleId).toBe(`${RULE_PACK_ID}::${third.parentRules[0].parentSku}`);
    expect(third.parentRules[0].childLines[0].sku).toBe(firstChildSku);
  });
});

// --- Runtime expansion smoke ------------------------------------------------

describe("getHoneywellMvpConfigExpansionRulePack - runtime expansion smoke", () => {
  it("is accepted by buildConfigurationExpansionDraft", () => {
    expect(() => buildConfigurationExpansionDraft({ lines: [], decisions: [], rulePack: pack })).not.toThrow();
  });

  it("expands Batch 3 hardware/accessory lines under C9300L-24P-4X-A with the right multipliers", () => {
    const parentQty = 6;
    const draft = expand(pack, [[1, "C9300L-24P-4X-A", parentQty]]);
    expect(addedQty(draft, "FAN-T2")).toBe(parentQty * 3);
    expect(addedQty(draft, "C9300L-STACK-A")).toBe(parentQty * 2);
    expect(addedQty(draft, "STACK-T3A-50CM")).toBe(parentQty);
  });

  it("expands Batch 3 wireless accessory lines under CW9178I-CFG tracking the parent quantity", () => {
    const parentQty = 12;
    const draft = expand(pack, [[1, "CW9178I-CFG", parentQty]]);
    expect(addedQty(draft, "AIR-AP-BRACKET-2")).toBe(parentQty);
    expect(addedQty(draft, "AIR-AP-T-RAIL-F")).toBe(parentQty);
    expect(addedQty(draft, "CW9178-SINGLE")).toBe(parentQty);
  });

  it("expands the Batch 3 uplink network module under C9300X-48HX-A tracking the parent quantity", () => {
    const parentQty = 7;
    const draft = expand(pack, [[1, "C9300X-48HX-A", parentQty]]);
    expect(addedQty(draft, "C9300X-NM-8Y")).toBe(parentQty);
  });
});

// --- Selector source hygiene ------------------------------------------------

describe("getHoneywellMvpConfigExpansionRulePack - selector source hygiene", () => {
  it("imports exactly the composer, the contract types, and the three approved packs", () => {
    const specs = importSpecifiers(readFileSync(SELECTOR_PATH, "utf8")).map((i) => i.from);
    expect(specs.slice().sort()).toEqual(EXPECTED_IMPORT_SPECIFIERS.slice().sort());
  });

  it("references no later-batch, candidate, replacement, pricing/catalog/API/UI/export/DB, or AI module", () => {
    const specs = importSpecifiers(readFileSync(SELECTOR_PATH, "utf8")).map((i) => i.from.toLowerCase());
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        expect(spec.includes(token), `import "${spec}" references forbidden token "${token}"`).toBe(false);
      }
    }
  });

  it("does not reference the later-batch, candidate, or replacement-candidate slugs in source", () => {
    const source = readFileSync(SELECTOR_PATH, "utf8").toLowerCase();
    for (const slug of FORBIDDEN_SOURCE_SLUGS) {
      expect(source.includes(slug), `selector source references forbidden slug "${slug}"`).toBe(false);
    }
  });

  it("keeps the selector source ASCII-only", () => {
    const source = readFileSync(SELECTOR_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

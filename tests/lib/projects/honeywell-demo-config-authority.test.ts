/**
 * Tests for the Honeywell MVP demo config authority profile (Prompt 116).
 * Proves: boundary values, profile counts, parent dispositions, optic treatment,
 * child-only SKU behavior, unknown SKU behavior, copy safety, and module hygiene.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import * as authorityModule from "@/lib/projects/honeywell-demo-config-authority";
import {
  getHoneywellDemoConfigAuthorityProfile,
  getHoneywellDemoConfigAuthorityForSku,
} from "@/lib/projects/honeywell-demo-config-authority";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-config-authority.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-config-authority.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md");

const KNOWN_PARENTS: Array<{ sku: string; childCount: number }> = [
  { sku: "C9300X-48HX-A", childCount: 22 },
  { sku: "C9300L-24P-4X-A", childCount: 23 },
  { sku: "CW9178I-CFG", childCount: 4 },
  { sku: "CISCO-NETWORK-SUB", childCount: 3 },
  { sku: "CP-7841-K9=", childCount: 1 },
];

const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

function importSpecifiers(source: string): string[] {
  const matches = source.match(/from\s+"([^"]+)"/g) ?? [];
  return matches.map((m) => m.replace(/^from\s+"/, "").replace(/"$/, ""));
}

describe("honeywell-demo-config-authority boundary", () => {
  it("sets configurationAuthority: true while all other authorities are false", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    const b = profile.boundary;
    expect(b.scope).toBe("honeywell_mvp_demo_only");
    expect(b.configurationAuthority).toBe(true);
    expect(b.approvedStructuredRuleAuthority).toBe(true);
    expect(b.approvedStructuredCatalogEvidence).toBe(true);
    expect(b.pricingAuthority).toBe(false);
    expect(b.productionCiscoCatalogAuthority).toBe(false);
    expect(b.broadCiscoGeneralAuthority).toBe(false);
    expect(b.runtimeAi).toBe(false);
    expect(b.replacementAuthority).toBe(false);
    expect(b.skuSubstitutionAuthority).toBe(false);
    expect(b.silentSkuSubstitution).toBe(false);
    expect(b.unknownRelationshipsDeferred).toBe(true);
    expect(b.attachesOpticsUnderSwitches).toBe(false);
  });
});

describe("honeywell-demo-config-authority profile counts", () => {
  it("has expected rule pack id, version, and status", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    expect(profile.rulePackId).toBe("honeywell-mvp-composed-batch1-batch2-batch3");
    expect(profile.rulePackVersion).toBe("1.0.0");
    expect(profile.rulePackStatus).toBe("approved");
  });

  it("has approvalRecordId for prompt 116", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    expect(profile.approvalRecordId).toBe(
      "prompt-116-user-approved-honeywell-config-authority"
    );
  });

  it("has knownSkuCount 50", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    expect(profile.knownSkuCount).toBe(50);
  });

  it("has expandableParentCount 5", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    expect(profile.expandableParentCount).toBe(5);
  });

  it("has standaloneCustomerBoqLineCount 2", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    expect(profile.standaloneCustomerBoqLineCount).toBe(2);
  });

  it("expandableParentCount + standaloneCustomerBoqLineCount + rulePackChildOnlyCount sums to 50", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    expect(
      profile.expandableParentCount +
        profile.standaloneCustomerBoqLineCount +
        profile.rulePackChildOnlyCount
    ).toBe(50);
  });
});

describe("honeywell-demo-config-authority parent SKU dispositions", () => {
  for (const { sku, childCount } of KNOWN_PARENTS) {
    it(`${sku} -> expand_by_approved_rule_pack with childCount ${childCount}`, () => {
      const result = getHoneywellDemoConfigAuthorityForSku(sku);
      expect(result.disposition).toBe("expand_by_approved_rule_pack");
      expect(result.expandableParent).toBe(true);
      expect(result.childCount).toBe(childCount);
      expect(result.childSkus).toHaveLength(childCount);
      expect(result.knownSku).toBe(true);
      expect(result.deferred).toBe(false);
    });
  }
});

describe("honeywell-demo-config-authority optics", () => {
  for (const opticSku of STANDALONE_OPTICS) {
    it(`${opticSku} -> preserve_standalone_customer_line with childCount 0`, () => {
      const result = getHoneywellDemoConfigAuthorityForSku(opticSku);
      expect(result.disposition).toBe("preserve_standalone_customer_line");
      expect(result.standaloneCustomerBoqLine).toBe(true);
      expect(result.childCount).toBe(0);
      expect(result.childSkus).toHaveLength(0);
      expect(result.boundary.attachesOpticsUnderSwitches).toBe(false);
      expect(result.deferred).toBe(false);
    });
  }
});

describe("honeywell-demo-config-authority child-only SKU", () => {
  it("a known child-only SKU returns preserve_known_rule_pack_child with at least one parent", () => {
    const profile = getHoneywellDemoConfigAuthorityProfile();
    const childOnlySku = Object.entries(profile.skuDispositionMap).find(
      ([, d]) => d === "preserve_known_rule_pack_child"
    )?.[0];
    expect(childOnlySku).toBeDefined();
    const result = getHoneywellDemoConfigAuthorityForSku(childOnlySku as string);
    expect(result.disposition).toBe("preserve_known_rule_pack_child");
    expect(result.rulePackChildOnly).toBe(true);
    expect(result.parentSkus.length).toBeGreaterThanOrEqual(1);
    expect(result.deferred).toBe(false);
  });
});

describe("honeywell-demo-config-authority unknown SKU", () => {
  it("returns defer_unknown_relationship without throwing", () => {
    const result = getHoneywellDemoConfigAuthorityForSku("TOTALLY-UNKNOWN-SKU-99999");
    expect(result.disposition).toBe("defer_unknown_relationship");
    expect(result.knownSku).toBe(false);
    expect(result.deferred).toBe(true);
    expect(result.sku).toBe("TOTALLY-UNKNOWN-SKU-99999");
  });

  it("preserves original requested SKU exactly", () => {
    const inputSku = "UNKNOWN/SKU WITH SPACES=";
    const result = getHoneywellDemoConfigAuthorityForSku(inputSku);
    expect(result.sku).toBe(inputSku);
  });

  it("has no replacement, current, or substitution fields on unknown result", () => {
    const result = getHoneywellDemoConfigAuthorityForSku("TOTALLY-UNKNOWN-SKU-99999") as unknown as Record<string, unknown>;
    expect(result).not.toHaveProperty("replacement");
    expect(result).not.toHaveProperty("currentSku");
    expect(result).not.toHaveProperty("substitution");
  });
});

describe("honeywell-demo-config-authority copy safety", () => {
  it("mutating returned profile boundary does not affect subsequent call", () => {
    const a = getHoneywellDemoConfigAuthorityProfile();
    (a.boundary as unknown as Record<string, unknown>)["configurationAuthority"] = false;
    const b = getHoneywellDemoConfigAuthorityProfile();
    expect(b.boundary.configurationAuthority).toBe(true);
  });

  it("mutating returned per-SKU childSkus does not affect subsequent call", () => {
    const a = getHoneywellDemoConfigAuthorityForSku("C9300X-48HX-A");
    const originalLen = a.childSkus.length;
    a.childSkus.push("INJECTED-SKU");
    const b = getHoneywellDemoConfigAuthorityForSku("C9300X-48HX-A");
    expect(b.childSkus).toHaveLength(originalLen);
  });
});

describe("honeywell-demo-config-authority module hygiene", () => {
  it("source is ASCII-only", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("test is ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });

  it("doc is ASCII-only", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });

  it("source imports only capability helper and rule-pack selector", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const specifiers = importSpecifiers(source);
    for (const spec of specifiers) {
      const allowed =
        spec === "@/lib/projects/honeywell-demo-sku-capability" ||
        spec === "@/lib/projects/honeywell-config-expansion-rule-pack";
      expect(allowed, `Unexpected import: ${spec}`).toBe(true);
    }
  });

  it("source validates approved rule-pack status before returning authority", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain('pack.status !== "approved"');
    expect(source).toContain("requires an approved rule pack");
  });

  it("source has no pricing, DB, API/UI, engine, coordinator, adapter, AI/LLM, workbook/export, artifact store, routes, filesystem, or package imports", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const specifiers = importSpecifiers(source);
    const forbidden = [
      "pricing",
      "/engine",
      "/coordinator",
      "/adapter",
      "openai",
      "anthropic",
      "workbook",
      "artifact",
      "node:fs",
      "node:path",
    ];
    for (const spec of specifiers) {
      for (const term of forbidden) {
        expect(spec, `Import specifier "${spec}" must not contain "${term}"`).not.toContain(term);
      }
    }
  });

  it("exports expected symbols", () => {
    expect(typeof authorityModule.getHoneywellDemoConfigAuthorityProfile).toBe("function");
    expect(typeof authorityModule.getHoneywellDemoConfigAuthorityForSku).toBe("function");
    expect(typeof authorityModule.HONEYWELL_CONFIG_AUTHORITY_APPROVAL_RECORD_ID).toBe("string");
  });
});

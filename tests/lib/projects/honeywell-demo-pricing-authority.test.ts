/**
 * Tests for the Honeywell MVP demo pricing authority profile (Prompt 119).
 * Proves: boundary values, profile counts, SKU status map, representative SKU prices,
 * unknown SKU behavior, copy safety, source evidence provenance, and module hygiene.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import * as authorityModule from "@/lib/projects/honeywell-demo-pricing-authority";
import {
  getHoneywellDemoPricingAuthorityProfile,
  getHoneywellDemoPricingAuthorityForSku,
  HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
} from "@/lib/projects/honeywell-demo-pricing-authority";
import { getHoneywellDemoPricingFixture } from "@/lib/projects/honeywell-demo-pricing-fixture";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-pricing-authority.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-pricing-authority.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_PRICING_FIXTURE.md");

function importSpecifiers(source: string): string[] {
  const matches = source.match(/from\s+"([^"]+)"/g) ?? [];
  return matches.map((m) => m.replace(/^from\s+"/, "").replace(/"$/, ""));
}

describe("honeywell-demo-pricing-authority boundary", () => {
  it("sets all boundary flags to the approved demo-only terms", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    const b = profile.boundary;
    expect(b.deterministicPricingAuthority).toBe(true);
    expect(b.demoFixtureAuthority).toBe(true);
    expect(b.currentLocalGplSarCsvTemporarilyApproved).toBe(true);
    expect(b.activeRuntimeSourceReadsExternalGplCsv).toBe(false);
    expect(b.productionCiscoPricingAuthority).toBe(false);
    expect(b.broadCiscoGeneralPricingAuthority).toBe(false);
    expect(b.runtimeAiPricing).toBe(false);
    expect(b.runtimeCatalogLookup).toBe(false);
    expect(b.configurationAuthority).toBe(false);
    expect(b.replacementAuthority).toBe(false);
    expect(b.skuSubstitutionAuthority).toBe(false);
    expect(b.silentSkuSubstitution).toBe(false);
    expect(b.missingPricesReported).toBe(true);
  });
});

describe("honeywell-demo-pricing-authority profile", () => {
  it("has profileId and scope", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.profileId).toBe("honeywell-mvp-demo-pricing-authority-profile");
    expect(profile.scope).toBe("honeywell_mvp_demo_only");
  });

  it("has approvalRecordId for prompt 119", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.approvalRecordId).toBe(
      "prompt-119-user-approved-honeywell-demo-pricing-authority"
    );
    expect(profile.approvalRecordId).toBe(HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID);
  });

  it("has activeSource committed_honeywell_demo_pricing_fixture", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.activeSource).toBe("committed_honeywell_demo_pricing_fixture");
    expect(profile.activeSourceFixtureId).toBe("honeywell-mvp-demo-pricing-fixture");
    expect(profile.activeSourceStatus).toBe("approved_demo_fixture");
  });

  it("has currency SAR", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.currency).toBe("SAR");
  });

  it("has pricedSkuCount 50 and missingPriceSkuCount 0", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.pricedSkuCount).toBe(50);
    expect(profile.missingPriceSkuCount).toBe(0);
  });

  it("skuStatusMap has exactly 50 keys and every value is priced_from_demo_fixture", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    const entries = Object.entries(profile.skuStatusMap);
    expect(entries.length).toBe(50);
    for (const [, value] of entries) {
      expect(value).toBe("priced_from_demo_fixture");
    }
  });

  it("skuStatusMap contains fixture SKU keys", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.skuStatusMap["C9300X-48HX-A"]).toBe("priced_from_demo_fixture");
    expect(profile.skuStatusMap["LIC-CW-A"]).toBe("priced_from_demo_fixture");
    expect(profile.skuStatusMap["CON-L1NCD-C9300XY4"]).toBe("priced_from_demo_fixture");
    expect(profile.skuStatusMap["SFP-10G-LR-S="]).toBe("priced_from_demo_fixture");
  });

  it("skuStatusMap keys exactly match the committed fixture price keys", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    const fixture = getHoneywellDemoPricingFixture();
    expect(Object.keys(profile.skuStatusMap).sort()).toEqual(
      Object.keys(fixture.unitListPriceSarBySku).sort()
    );
  });

  it("activeSourceWorkbookPath references Estimate_NB167337237YA.xlsx", () => {
    const profile = getHoneywellDemoPricingAuthorityProfile();
    expect(profile.activeSourceWorkbookPath).toContain("Estimate_NB167337237YA.xlsx");
  });
});

describe("honeywell-demo-pricing-authority representative SKUs", () => {
  it("C9300X-48HX-A returns SAR 90681.4 and product category", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("C9300X-48HX-A");
    expect(result.status).toBe("priced_from_demo_fixture");
    if (result.status !== "priced_from_demo_fixture") return;
    expect(result.missingPrice).toBe(false);
    expect(result.currency).toBe("SAR");
    expect(result.unitListPriceSar).toBe(90681.4);
    expect(result.mantleCategory).toBe("product");
  });

  it("LIC-CW-A returns SAR 2811.96 and subscription category", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("LIC-CW-A");
    expect(result.status).toBe("priced_from_demo_fixture");
    if (result.status !== "priced_from_demo_fixture") return;
    expect(result.unitListPriceSar).toBe(2811.96);
    expect(result.mantleCategory).toBe("subscription");
  });

  it("CON-L1NCD-C9300XY4 returns SAR 27246.39 and service category", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("CON-L1NCD-C9300XY4");
    expect(result.status).toBe("priced_from_demo_fixture");
    if (result.status !== "priced_from_demo_fixture") return;
    expect(result.unitListPriceSar).toBe(27246.39);
    expect(result.mantleCategory).toBe("service");
  });

  it("SFP-10G-LR-S= returns SAR 9538.39 and product category", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("SFP-10G-LR-S=");
    expect(result.status).toBe("priced_from_demo_fixture");
    if (result.status !== "priced_from_demo_fixture") return;
    expect(result.unitListPriceSar).toBe(9538.39);
    expect(result.mantleCategory).toBe("product");
  });
});

describe("honeywell-demo-pricing-authority source evidence", () => {
  it("priced SKU source evidence comes from ccw_estimate referencing Estimate_NB167337237YA.xlsx", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("C9300X-48HX-A");
    expect(result.status).toBe("priced_from_demo_fixture");
    if (result.status !== "priced_from_demo_fixture") return;
    expect(result.sourceEvidence.sourceType).toBe("ccw_estimate");
    expect(result.sourceEvidence.workbookPath).toContain("Estimate_NB167337237YA.xlsx");
    expect(result.sourceEvidence.derivationNote).toBe(
      "extended_list_price_divided_by_quantity"
    );
  });
});

describe("honeywell-demo-pricing-authority unknown SKU", () => {
  it("unknown SKU returns missing_price_report_only, missingPrice true, preserves sku, no price/category/evidence", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("UNKNOWN-SKU-XYZ");
    expect(result.sku).toBe("UNKNOWN-SKU-XYZ");
    expect(result.status).toBe("missing_price_report_only");
    expect(result.missingPrice).toBe(true);
    expect("unitListPriceSar" in result).toBe(false);
    expect("currency" in result).toBe(false);
    expect("mantleCategory" in result).toBe(false);
    expect("sourceEvidence" in result).toBe(false);
  });

  it("unknown SKU has the boundary object", () => {
    const result = getHoneywellDemoPricingAuthorityForSku("UNKNOWN-SKU-XYZ");
    expect(result.boundary.deterministicPricingAuthority).toBe(true);
    expect(result.boundary.productionCiscoPricingAuthority).toBe(false);
    expect(result.boundary.missingPricesReported).toBe(true);
  });

  it("unknown SKU preserves exact input including special characters", () => {
    const weirdSku = "SKU WITH SPACES/AND=EQUALS";
    const result = getHoneywellDemoPricingAuthorityForSku(weirdSku);
    expect(result.sku).toBe(weirdSku);
    expect(result.status).toBe("missing_price_report_only");
  });
});

describe("honeywell-demo-pricing-authority copy safety", () => {
  it("mutating returned profile boundary does not affect later calls", () => {
    const a = getHoneywellDemoPricingAuthorityProfile();
    (a.boundary as unknown as Record<string, unknown>)["deterministicPricingAuthority"] = false;
    const b = getHoneywellDemoPricingAuthorityProfile();
    expect(b.boundary.deterministicPricingAuthority).toBe(true);
  });

  it("mutating returned profile skuStatusMap does not affect later calls", () => {
    const a = getHoneywellDemoPricingAuthorityProfile();
    (a.skuStatusMap as Record<string, unknown>)["C9300X-48HX-A"] = "mutated" as never;
    delete (a.skuStatusMap as Record<string, unknown>)["LIC-CW-A"];
    const b = getHoneywellDemoPricingAuthorityProfile();
    expect(b.skuStatusMap["C9300X-48HX-A"]).toBe("priced_from_demo_fixture");
    expect(b.skuStatusMap["LIC-CW-A"]).toBe("priced_from_demo_fixture");
  });

  it("mutating per-SKU boundary does not affect later calls", () => {
    const a = getHoneywellDemoPricingAuthorityForSku("C9300X-48HX-A");
    (a.boundary as unknown as Record<string, unknown>)["productionCiscoPricingAuthority"] = true;
    const b = getHoneywellDemoPricingAuthorityForSku("C9300X-48HX-A");
    expect(b.boundary.productionCiscoPricingAuthority).toBe(false);
  });

  it("mutating per-SKU sourceEvidence does not affect later calls", () => {
    const a = getHoneywellDemoPricingAuthorityForSku("C9300X-48HX-A");
    if (a.status !== "priced_from_demo_fixture") return;
    (a.sourceEvidence as unknown as Record<string, unknown>)["rawListPrice"] = 0;
    const b = getHoneywellDemoPricingAuthorityForSku("C9300X-48HX-A");
    if (b.status !== "priced_from_demo_fixture") return;
    expect(b.sourceEvidence.rawListPrice).toBeGreaterThan(0);
  });
});

describe("honeywell-demo-pricing-authority module hygiene", () => {
  it("module imports only @/lib/projects/honeywell-demo-pricing-fixture", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const specifiers = importSpecifiers(source);
    expect(specifiers).toEqual(["@/lib/projects/honeywell-demo-pricing-fixture"]);
  });

  it("module has no DB/API/UI/config-expansion/priced-BoQ/pricing-math/Mantle/export/runner/engine/coordinator/adapter/AI/catalog imports", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const specifiers = importSpecifiers(source);
    const forbidden = [
      "drizzle", "prisma", "@/lib/db",
      "pricing-math", "price-service",
      "priced-boq", "mantle-price",
      "config-expansion", "rule-pack",
      "runner", "engine", "coordinator", "adapter",
      "openai", "anthropic", "llm", "ai-sdk",
      "catalog", "@/app", "@/components", "/api", "route",
      "export", "workbook",
    ];
    for (const term of forbidden) {
      const hit = specifiers.find((s) => s.includes(term));
      expect(hit, `should not import "${term}" but found "${hit}"`).toBeUndefined();
    }
  });

  it("runtime exports are exactly the two getter functions plus the approval record constant", () => {
    const keys = Object.keys(authorityModule).sort();
    expect(keys).toEqual([
      "HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID",
      "getHoneywellDemoPricingAuthorityForSku",
      "getHoneywellDemoPricingAuthorityProfile",
    ]);
  });

  it("source file is ASCII-only", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    for (let i = 0; i < source.length; i++) {
      expect(source.charCodeAt(i), `non-ASCII at index ${i}`).toBeLessThan(128);
    }
  });

  it("test file is ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    for (let i = 0; i < test.length; i++) {
      expect(test.charCodeAt(i), `non-ASCII at index ${i}`).toBeLessThan(128);
    }
  });

  it("doc file is ASCII-only", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    for (let i = 0; i < doc.length; i++) {
      expect(doc.charCodeAt(i), `non-ASCII at index ${i}`).toBeLessThan(128);
    }
  });
});

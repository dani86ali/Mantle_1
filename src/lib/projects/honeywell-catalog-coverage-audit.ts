/**
 * Read-only Honeywell catalog coverage audit (Prompt 102). Documents which
 * Honeywell Quick BoM SKUs resolve TODAY against the committed local SKU lookup
 * source (local_stc_historical_mock) using the deterministic catalog-lookup
 * functions ONLY, closing the "needs verification" Honeywell catalog-coverage gap
 * with evidence of what resolves and what does not. The local catalog is STC
 * historical/mock data, NOT live Cisco GPL/API/CCW.
 *
 * AUDIT ONLY - grants no authority. It accepts, substitutes, prices, and silently
 * replaces nothing; it does no fuzzy or AI matching; it adds no Cisco GPL/API/CCW
 * lookup; it creates no catalog, pricing, or configuration authority; and it is
 * not approval for any SKU substitution. matchedCatalogSku reports what a
 * requested SKU matched, never substitutes it.
 *
 * PURE: composes only lookupCatalogSku (read-only) over two fixed Honeywell SKU
 * sets - the seven customer BoQ rows (customer input order) and the broader demo
 * SKU universe read as SKU identities (sorted) from the committed demo pricing
 * fixture. Imports no DB, route/API/UI, pricing engine, export/workbook,
 * configuration-expansion builder, adapter, engine, coordinator, AI/LLM, or
 * external file, and mutates no input. Source: MVP_CANONICAL_PROJECT_STATE.md (8).
 */
import {
  lookupCatalogSku,
  LOCAL_CATALOG_SOURCE,
  type CatalogLookupIndex,
  type CatalogLookupResult,
} from "@/lib/projects/catalog-lookup";
import { getHoneywellDemoPricingFixture } from "@/lib/projects/honeywell-demo-pricing-fixture";

/** Audit-only boundary: this audit grants no runtime/pricing/configuration authority. */
export const HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY = {
  auditOnly: true,
  pricingAuthority: false,
  configurationAuthority: false,
  productionCiscoCatalogAuthority: false,
  skuSubstitutionApproval: false,
} as const;

/** One requested Honeywell SKU's deterministic lookup outcome. Report only. */
export interface SkuCoverageEntry {
  /** Always the requested input SKU; never replaced by a matched catalog SKU. */
  sku: string;
  normalizedSku: string;
  outcome: "matched" | "not_found" | "ambiguous";
  matchSource: "exact" | "normalized" | null;
  /** The catalog SKU it matched (report only, never substituted); null unless matched. */
  matchedCatalogSku: string | null;
  /** Coverage flag, NOT a price value; null unless matched. */
  hasPositiveListPrice: boolean | null;
  /** Distinct ambiguous candidates in the lookup's sorted order; [] unless ambiguous. */
  candidateSkus: string[];
}

/** A customer BoQ row's audit entry: also carries its line number and quantity. */
export interface HoneywellCustomerRowCoverageEntry extends SkuCoverageEntry {
  originalLineNumber: number;
  quantity: number;
}

/** Serializable coverage counts for one audited SKU set. */
export interface CatalogCoverageCounts {
  total: number;
  matched: number;
  notFound: number;
  ambiguous: number;
  zeroOrNegativePriceMatches: number;
  exactMatches: number;
  normalizedMatches: number;
}

/** Audit of the seven customer BoQ rows; rows/lists keep customer input order. */
export interface HoneywellCustomerRowsCoverage {
  rows: HoneywellCustomerRowCoverageEntry[];
  counts: CatalogCoverageCounts;
  notFoundSkus: string[];
  ambiguousSkus: string[];
}

/** Audit of the broader demo SKU universe; entries/lists are sorted ascending. */
export interface HoneywellBroaderSkuCoverage {
  skus: SkuCoverageEntry[];
  counts: CatalogCoverageCounts;
  notFoundSkus: string[];
  ambiguousSkus: string[];
}

/** Full read-only Honeywell catalog coverage audit. */
export interface HoneywellCatalogCoverageAudit {
  catalogSource: typeof LOCAL_CATALOG_SOURCE;
  boundary: typeof HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY;
  customerRows: HoneywellCustomerRowsCoverage;
  broaderSkuUniverse: HoneywellBroaderSkuCoverage;
}

/** Seven Honeywell customer BoQ rows in customer order: [lineNumber, SKU, qty]. */
const HONEYWELL_CUSTOMER_BOQ_ROWS: ReadonlyArray<readonly [number, string, number]> = [
  [1, "CW9178I-CFG", 12],
  [2, "CISCO-NETWORK-SUB", 1],
  [3, "C9300X-48HX-A", 7],
  [4, "C9300L-24P-4X-A", 6],
  [5, "SFP-10G-LR-S=", 12],
  [6, "SFP-10/25G-LR-S=", 14],
  [7, "CP-7841-K9=", 59],
];

/** Map one deterministic lookup result onto a report-only coverage entry. */
function toCoverageEntry(result: CatalogLookupResult): SkuCoverageEntry {
  const match = result.status === "matched" ? result.match : null;
  return {
    sku: result.requestedSku,
    normalizedSku: result.normalizedSku,
    outcome: result.status,
    matchSource: match ? match.source : null,
    matchedCatalogSku: match ? match.catalogSku : null,
    hasPositiveListPrice: match ? match.hasPositiveListPrice : null,
    candidateSkus: result.status === "ambiguous" ? result.candidateSkus.slice() : [],
  };
}

/** Deterministic counts across coverage entries; preserves the caller's order. */
function summarizeCounts(entries: readonly SkuCoverageEntry[]): CatalogCoverageCounts {
  let matched = 0;
  let notFound = 0;
  let ambiguous = 0;
  let zeroOrNegativePriceMatches = 0;
  let exactMatches = 0;
  let normalizedMatches = 0;
  for (const entry of entries) {
    if (entry.outcome === "matched") {
      matched++;
      if (entry.matchSource === "exact") exactMatches++;
      else if (entry.matchSource === "normalized") normalizedMatches++;
      if (entry.hasPositiveListPrice === false) zeroOrNegativePriceMatches++;
    } else if (entry.outcome === "not_found") {
      notFound++;
    } else {
      ambiguous++;
    }
  }
  return { total: entries.length, matched, notFound, ambiguous, zeroOrNegativePriceMatches, exactMatches, normalizedMatches };
}

/** SKUs (in entry order) whose outcome is `outcome`. */
function collectSkus(entries: readonly SkuCoverageEntry[], outcome: SkuCoverageEntry["outcome"]): string[] {
  return entries.filter((entry) => entry.outcome === outcome).map((entry) => entry.sku);
}

/**
 * The broader Honeywell demo SKU universe as sorted, de-duplicated SKU identities
 * read from the committed demo pricing fixture. SKU identities only - no price,
 * category, or pricing authority is read or created.
 */
export function getHoneywellBroaderDemoSkuUniverse(): string[] {
  const fixture = getHoneywellDemoPricingFixture();
  return Array.from(new Set(Object.keys(fixture.unitListPriceSarBySku))).sort();
}

/**
 * Audit the seven Honeywell customer BoQ rows against the local STC historical/mock
 * catalog. Preserves customer input order in `rows` and both unresolved lists.
 */
export function auditHoneywellCustomerRowCoverage(index?: CatalogLookupIndex): HoneywellCustomerRowsCoverage {
  const rows: HoneywellCustomerRowCoverageEntry[] = HONEYWELL_CUSTOMER_BOQ_ROWS.map(
    ([originalLineNumber, sku, quantity]) => ({
      ...toCoverageEntry(lookupCatalogSku(sku, index)),
      originalLineNumber,
      quantity,
    })
  );
  return { rows, counts: summarizeCounts(rows), notFoundSkus: collectSkus(rows, "not_found"), ambiguousSkus: collectSkus(rows, "ambiguous") };
}

/**
 * Audit the broader Honeywell demo SKU universe against the local STC
 * historical/mock catalog. Entries and both unresolved lists are sorted ascending.
 */
export function auditHoneywellBroaderSkuCoverage(index?: CatalogLookupIndex): HoneywellBroaderSkuCoverage {
  const skus = getHoneywellBroaderDemoSkuUniverse().map((sku) => toCoverageEntry(lookupCatalogSku(sku, index)));
  return { skus, counts: summarizeCounts(skus), notFoundSkus: collectSkus(skus, "not_found"), ambiguousSkus: collectSkus(skus, "ambiguous") };
}

/**
 * Full read-only Honeywell catalog coverage audit over both SKU sets. Grants no
 * authority (see {@link HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY}); marks the
 * catalog source as local_stc_historical_mock.
 */
export function auditHoneywellCatalogCoverage(index?: CatalogLookupIndex): HoneywellCatalogCoverageAudit {
  return {
    catalogSource: LOCAL_CATALOG_SOURCE,
    boundary: HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY,
    customerRows: auditHoneywellCustomerRowCoverage(index),
    broaderSkuUniverse: auditHoneywellBroaderSkuCoverage(index),
  };
}

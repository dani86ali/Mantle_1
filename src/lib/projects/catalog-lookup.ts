/**
 * Deterministic Project-domain catalog lookup for SKU resolution steps 1 and 2
 * (exact, then normalized). Source of truth: MVP_CANONICAL_PROJECT_STATE.md (8).
 *
 * Lookup ONLY: never accepts, replaces, or prices a SKU; no fuzzy/AI matching;
 * creates no sku_resolution artifact. Reads the committed local mock catalog as
 * STC historical/mock data (NOT live Cisco GPL) via the co-located mock-data
 * helper - never the Cisco adapter, Redis, auth, fetch, env, DB, engines,
 * pricing, or API/UI. Pure: does not mutate its input catalog.
 */
import { getCatalogMock } from "@/lib/adapters/_catalog-mock-data";

/** The local catalog is STC historical/mock data, not live Cisco GPL. */
export const LOCAL_CATALOG_SOURCE = "local_stc_historical_mock" as const;

/** Identifies which catalog a lookup index or match result came from. */
export type CatalogLookupSource = string;

/** Minimal catalog row the lookup needs; a projection of the mock catalog item. */
export interface CatalogLookupItem {
  sku: string;
  description: string;
  listPrice: number;
  currency: string;
  vendor?: string;
  productCategory?: string;
  priceListId?: string;
}

/**
 * `exact` keyed by trimmed catalog SKU; `normalized` keyed by
 * {@link normalizeSkuForLookup}, every candidate preserved per key so
 * collisions can be reported as ambiguous.
 */
export interface CatalogLookupIndex {
  exact: Map<string, CatalogLookupItem>;
  normalized: Map<string, CatalogLookupItem[]>;
  catalogSource: CatalogLookupSource;
}

/** A resolved catalog match. `source` records HOW it matched, not pricing. */
export interface CatalogLookupMatch {
  requestedSku: string;
  catalogSku: string;
  description: string;
  vendor?: string;
  productCategory?: string;
  listPrice: number;
  currency: string;
  priceListId?: string;
  source: "exact" | "normalized";
  catalogSource: CatalogLookupSource;
  /** A zero/negative-price entry is still a match, but this is false. */
  hasPositiveListPrice: boolean;
}

/** Outcome for one requested SKU. Ambiguity never auto-picks a candidate. */
export type CatalogLookupResult =
  | { status: "matched"; requestedSku: string; normalizedSku: string; match: CatalogLookupMatch }
  | { status: "not_found"; requestedSku: string; normalizedSku: string }
  | { status: "ambiguous"; requestedSku: string; normalizedSku: string; candidateSkus: string[] };

/**
 * Trim, uppercase, and strip every character except A-Z and 0-9. Blank or
 * separator-only input normalizes to "" (a non-useful key that never matches).
 */
export function normalizeSkuForLookup(sku: string): string {
  if (typeof sku !== "string") return "";
  return sku.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Build a fresh match for `item`; reads only, derives `hasPositiveListPrice`. */
function toCatalogMatch(
  requestedSku: string,
  item: CatalogLookupItem,
  source: "exact" | "normalized",
  catalogSource: CatalogLookupSource
): CatalogLookupMatch {
  return {
    requestedSku,
    catalogSku: item.sku.trim(),
    description: item.description,
    ...(item.vendor !== undefined ? { vendor: item.vendor } : {}),
    ...(item.productCategory !== undefined ? { productCategory: item.productCategory } : {}),
    listPrice: item.listPrice,
    currency: item.currency,
    ...(item.priceListId !== undefined ? { priceListId: item.priceListId } : {}),
    source,
    catalogSource,
    hasPositiveListPrice: item.listPrice > 0,
  };
}

/**
 * Index a catalog for exact and normalized lookup. Does not mutate the input
 * (item references stored as-is). Blank trimmed/normalized keys are skipped; the
 * first item wins on an exact-key collision. `source` defaults to
 * `LOCAL_CATALOG_SOURCE`; pass an explicit string to tag the index provenance.
 */
export function buildCatalogLookupIndex(
  items: Record<string, CatalogLookupItem>,
  source: CatalogLookupSource = LOCAL_CATALOG_SOURCE
): CatalogLookupIndex {
  const exact = new Map<string, CatalogLookupItem>();
  const normalized = new Map<string, CatalogLookupItem[]>();
  for (const item of Object.values(items)) {
    const trimmedSku = item.sku.trim();
    if (trimmedSku !== "" && !exact.has(trimmedSku)) {
      exact.set(trimmedSku, item);
    }
    const normKey = normalizeSkuForLookup(item.sku);
    if (normKey === "") continue;
    const bucket = normalized.get(normKey);
    if (bucket) bucket.push(item);
    else normalized.set(normKey, [item]);
  }
  return { exact, normalized, catalogSource: source };
}

let cachedLocalIndex: CatalogLookupIndex | undefined;

/**
 * Index of the committed local mock catalog (STC historical/mock data), built
 * once and cached. Reads the co-located mock-data helper directly - NOT the
 * Cisco adapter - and projects each item onto {@link CatalogLookupItem}.
 */
export function getLocalMockCatalogLookupIndex(): CatalogLookupIndex {
  if (cachedLocalIndex) return cachedLocalIndex;
  const mock = getCatalogMock();
  const items: Record<string, CatalogLookupItem> = {};
  for (const [key, item] of Object.entries(mock.items)) {
    items[key] = {
      sku: item.sku,
      description: item.description,
      listPrice: item.listPrice,
      currency: item.currency,
      ...(item.vendor !== undefined ? { vendor: item.vendor } : {}),
      ...(item.productCategory !== undefined ? { productCategory: item.productCategory } : {}),
      ...(item.priceListId !== undefined ? { priceListId: item.priceListId } : {}),
    };
  }

  cachedLocalIndex = buildCatalogLookupIndex(items);
  return cachedLocalIndex;
}

/**
 * Resolve one SKU deterministically: exact (trimmed) first, then normalized. A
 * normalized hit matches only when it collapses to a single distinct catalog
 * SKU; multiple distinct SKUs are `ambiguous` (candidates sorted ascending, none
 * chosen). Anything else is `not_found`. Never accepts, replaces, or prices.
 */
export function lookupCatalogSku(
  sku: string,
  index: CatalogLookupIndex = getLocalMockCatalogLookupIndex()
): CatalogLookupResult {
  const requestedSku = typeof sku === "string" ? sku : "";
  const trimmed = requestedSku.trim();
  const normalizedSku = normalizeSkuForLookup(requestedSku);

  if (trimmed !== "") {
    const exactItem = index.exact.get(trimmed);
    if (exactItem) {
      return {
        status: "matched",
        requestedSku,
        normalizedSku,
        match: toCatalogMatch(requestedSku, exactItem, "exact", index.catalogSource),
      };
    }
  }

  if (normalizedSku !== "") {
    const candidates = index.normalized.get(normalizedSku) ?? [];
    const distinctSkus = Array.from(
      new Set(candidates.map((c) => c.sku.trim()))
    ).sort();
    if (distinctSkus.length === 1) {
      const chosen = candidates.find((c) => c.sku.trim() === distinctSkus[0])!;
      return {
        status: "matched",
        requestedSku,
        normalizedSku,
        match: toCatalogMatch(requestedSku, chosen, "normalized", index.catalogSource),
      };
    }
    if (distinctSkus.length > 1) {
      return {
        status: "ambiguous",
        requestedSku,
        normalizedSku,
        candidateSkus: distinctSkus,
      };
    }
  }

  return { status: "not_found", requestedSku, normalizedSku };
}

/** Resolve many SKUs: one result per input, original order and duplicates preserved. */
export function lookupCatalogSkus(
  skus: readonly string[],
  index: CatalogLookupIndex = getLocalMockCatalogLookupIndex()
): CatalogLookupResult[] {
  return skus.map((sku) => lookupCatalogSku(sku, index));
}

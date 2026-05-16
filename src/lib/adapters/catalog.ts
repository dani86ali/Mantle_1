/**
 * Cisco Catalog v2.0 adapter (REST/JSON).
 *
 * getItem: batch ≤1000 SKUs, one priceListId per request
 * getMappedServices: returns required licenses, services, accessories per hardware SKU
 * Caching: prices 24h TTL, EoX flags 1h TTL in Redis
 */

import { redis, tenantKey } from "@/lib/redis";
import { isMockMode, getMockError } from "@/lib/env";
import { appendAuditLog } from "@/lib/db/queries";
import { getAccessToken } from "./auth";
import type {
  CiscoCatalogItem,
  CiscoCatalogResponse,
  CiscoCatalogError,
  CiscoMappedServicesResponse,
  CiscoApiCallResult,
} from "@/types/cisco";

const MAX_SKUS_PER_REQUEST = 1000;
const PRICE_CACHE_TTL = 24 * 60 * 60; // 24 hours
const EOX_CACHE_TTL = 60 * 60; // 1 hour

interface CatalogAdapterOptions {
  tenantId: string;
  priceListId: string;
  credentials: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
}

export async function getItems(
  skus: string[],
  options: CatalogAdapterOptions
): Promise<CiscoApiCallResult<CiscoCatalogResponse>> {
  const start = Date.now();

  if (skus.length > MAX_SKUS_PER_REQUEST) {
    return {
      success: false,
      error: {
        code: "BATCH_TOO_LARGE",
        message: `Cannot batch more than ${MAX_SKUS_PER_REQUEST} SKUs per request. Got ${skus.length}.`,
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }

  if (isMockMode()) {
    return getMockCatalogItems(skus, options, start);
  }

  // Check cache first — return cached items, only fetch uncached
  const { cached, uncached } = await checkCatalogCache(
    options.tenantId,
    skus,
    options.priceListId
  );

  if (uncached.length === 0) {
    return {
      success: true,
      data: { items: cached },
      cached: true,
      durationMs: Date.now() - start,
    };
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const response = await fetch(
      `${baseUrl}/commerce/catalog/v2/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skus: uncached,
          priceListId: options.priceListId,
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      await logCiscoCall(options.tenantId, "catalog", "getItems", uncached.length, response.status, false, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: errorBody,
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as CiscoCatalogResponse;

    // Cache the fetched items
    await cacheCatalogItems(options.tenantId, data.items, options.priceListId);

    // Merge cached + fresh
    const allItems = [...cached, ...data.items];

    await logCiscoCall(options.tenantId, "catalog", "getItems", uncached.length, 200, false, Date.now() - start);

    return {
      success: true,
      data: { items: allItems, errors: data.errors },
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    await logCiscoCall(options.tenantId, "catalog", "getItems", uncached.length, 0, false, Date.now() - start);
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

export async function getMappedServices(
  hardwareSku: string,
  options: CatalogAdapterOptions
): Promise<CiscoApiCallResult<CiscoMappedServicesResponse>> {
  const start = Date.now();

  if (isMockMode()) {
    return getMockMappedServices(hardwareSku, options, start);
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const response = await fetch(
      `${baseUrl}/commerce/catalog/v2/mappedServices?sku=${encodeURIComponent(hardwareSku)}&priceListId=${encodeURIComponent(options.priceListId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      await logCiscoCall(options.tenantId, "catalog", "getMappedServices", 1, response.status, false, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: await response.text(),
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as CiscoMappedServicesResponse;
    await logCiscoCall(options.tenantId, "catalog", "getMappedServices", 1, 200, false, Date.now() - start);

    return {
      success: true,
      data,
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Mock implementations ────────────────────────────────────────────────

async function getMockCatalogItems(
  skus: string[],
  options: CatalogAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoCatalogResponse>> {
  const mockError = getMockError();
  if (mockError === "rate_limit") {
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "429 Too Many Requests", httpStatus: 429 },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
  if (mockError === "timeout") {
    await new Promise((r) => setTimeout(r, 31_000));
    return {
      success: false,
      error: { code: "TIMEOUT", message: "Request timed out" },
      cached: false,
      durationMs: Date.now() - start,
    };
  }

  // Simulate latency
  await new Promise((r) => setTimeout(r, 50));

  const { getCatalogMock } = await import("./_catalog-mock-data");
  const mockData = getCatalogMock();

  const items: CiscoCatalogItem[] = [];
  const errors: CiscoCatalogError[] = [];

  for (const sku of skus) {
    if (mockData.items[sku]) {
      items.push(mockData.items[sku]);
    } else if (mockData.errors[sku]) {
      errors.push(mockData.errors[sku]);
    } else {
      errors.push({
        sku,
        errorCode: "SKU_NOT_FOUND",
        message: `Product ${sku} not found in catalog`,
      });
    }
  }

  await logCiscoCall(options.tenantId, "catalog", "getItems", skus.length, 200, false, Date.now() - start);

  return {
    success: true,
    data: { items, errors },
    cached: false,
    durationMs: Date.now() - start,
  };
}

async function getMockMappedServices(
  hardwareSku: string,
  options: CatalogAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoMappedServicesResponse>> {
  await new Promise((r) => setTimeout(r, 50));

  const { getMappedServicesMock } = await import("./_catalog-mock-data");
  const mockData = getMappedServicesMock();

  const data = mockData[hardwareSku];
  if (!data) {
    return {
      success: false,
      error: {
        code: "SKU_NOT_FOUND",
        message: `No mapped services found for ${hardwareSku}`,
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }

  await logCiscoCall(options.tenantId, "catalog", "getMappedServices", 1, 200, false, Date.now() - start);

  return {
    success: true,
    data,
    cached: false,
    durationMs: Date.now() - start,
  };
}

// ─── Cache helpers ───────────────────────────────────────────────────────

async function checkCatalogCache(
  tenantId: string,
  skus: string[],
  priceListId: string
): Promise<{ cached: CiscoCatalogItem[]; uncached: string[] }> {
  const cached: CiscoCatalogItem[] = [];
  const uncached: string[] = [];

  for (const sku of skus) {
    const key = tenantKey(tenantId, "catalog", priceListId, sku);
    const raw = await redis.get(key);
    if (raw) {
      cached.push(JSON.parse(raw));
    } else {
      uncached.push(sku);
    }
  }

  return { cached, uncached };
}

async function cacheCatalogItems(
  tenantId: string,
  items: CiscoCatalogItem[],
  priceListId: string
): Promise<void> {
  const pipeline = redis.pipeline();
  for (const item of items) {
    const key = tenantKey(tenantId, "catalog", priceListId, item.sku);
    pipeline.setex(key, PRICE_CACHE_TTL, JSON.stringify(item));

    // EoX data cached separately with shorter TTL
    if (item.eoxInfo) {
      const eoxKey = tenantKey(tenantId, "eox", item.sku);
      pipeline.setex(eoxKey, EOX_CACHE_TTL, JSON.stringify(item.eoxInfo));
    }
  }
  await pipeline.exec();
}

async function logCiscoCall(
  tenantId: string,
  api: string,
  method: string,
  skuCount: number,
  statusCode: number,
  cached: boolean,
  durationMs: number
): Promise<void> {
  try {
    await appendAuditLog(tenantId, "cisco_api_call", null, {
      api,
      method,
      skuCount,
      statusCode,
      cached,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Audit failure should not block adapter
  }
}

/**
 * Catalog-backed list price loader for E2.
 *
 * Bridges the Cisco catalog adapter into the pipeline so E2 receives real
 * USD list prices instead of an empty map. Graceful: any failure (missing
 * tenant credentials, network error, partial coverage) is downgraded to a
 * warning so E2 still runs.
 *
 * Fortinet SKUs use a separate catalog (engines/e2/fortinet-catalog.ts) and
 * are skipped here. TODO: wire Fortinet pricing once that adapter exists.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { tenantCredentials, tenants } from "@/lib/db/schema";
import { getItems } from "@/lib/adapters/catalog";
import type { E2Device } from "@/engines/e2/orchestrator";

const DEFAULT_PRICE_LIST_ID = "Global Price List Emerging (USD)";

export interface LoadListPricesResult {
  listPrices: Record<string, number>;
  warnings: string[];
}

/** Collect Cisco-vendor SKUs from a device list (deduped). Fortinet skipped. */
export function collectCiscoSkus(devices: E2Device[] | undefined): string[] {
  if (!devices || devices.length === 0) return [];
  const set = new Set<string>();
  for (const d of devices) {
    if (d.config?.vendor && d.config.vendor !== "cisco") continue;
    if (d.model) set.add(d.model);
  }
  return Array.from(set);
}

export async function loadListPrices(
  skus: string[],
  tenantId: string,
): Promise<LoadListPricesResult> {
  if (!skus || skus.length === 0) return { listPrices: {}, warnings: [] };

  let credentials: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  } | null = null;
  let priceListId = process.env.CISCO_PRICE_LIST_ID || DEFAULT_PRICE_LIST_ID;

  try {
    const [credRow] = await db
      .select()
      .from(tenantCredentials)
      .where(eq(tenantCredentials.tenantId, tenantId))
      .limit(1);
    if (credRow) {
      credentials = {
        clientId: credRow.clientIdEnc,
        clientSecret: credRow.clientSecretEnc,
        username: credRow.ccoUsernameEnc,
        password: credRow.ccoPasswordEnc,
      };
    }
    const [tenantRow] = await db
      .select({ priceListId: tenants.priceListId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (tenantRow?.priceListId) priceListId = tenantRow.priceListId;
  } catch (err) {
    return {
      listPrices: {},
      warnings: [
        `Catalog price load skipped: tenant lookup failed (${err instanceof Error ? err.message : "db error"})`,
      ],
    };
  }

  // In mock mode the adapter ignores credentials; supply a stub so the call proceeds.
  const effectiveCreds = credentials ?? {
    clientId: "",
    clientSecret: "",
    username: "",
    password: "",
  };

  try {
    const res = await getItems(skus, {
      tenantId,
      priceListId,
      credentials: effectiveCreds,
    });
    if (!res.success || !res.data) {
      return {
        listPrices: {},
        warnings: [
          `Catalog price load failed: ${res.error?.code ?? "UNKNOWN"} ${res.error?.message ?? ""}`.trim(),
        ],
      };
    }
    const listPrices: Record<string, number> = {};
    for (const item of res.data.items) {
      if (typeof item.listPrice === "number" && item.listPrice > 0) {
        listPrices[item.sku] = item.listPrice;
      }
    }
    const warnings: string[] = [];
    const missing = skus.filter((s) => !(s in listPrices));
    if (missing.length > 0) {
      const sample = missing.slice(0, 5).join(", ");
      const more = missing.length > 5 ? "…" : "";
      warnings.push(
        `No catalog price for ${missing.length} SKU(s): ${sample}${more}`,
      );
    }
    return { listPrices, warnings };
  } catch (err) {
    return {
      listPrices: {},
      warnings: [
        `Catalog price load threw: ${err instanceof Error ? err.message : "unknown error"}`,
      ],
    };
  }
}

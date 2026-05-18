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
import { detectBoQType } from "@/engines/e2/boq-detector";
import { readExcelFile } from "@/lib/io/excel-reader";
import { parseTypeA } from "@/engines/e2/parsers/type-a-ariba";
import { parseTypeB } from "@/engines/e2/parsers/type-b-nrm2";
import { parseTypeC } from "@/engines/e2/parsers/type-c-vendor-quote";
import { parseTypeD } from "@/engines/e2/parsers/type-d-bom";
import { parseTypeE } from "@/engines/e2/parsers/type-e-telecom";
import { BoQType, type BoQLineItem } from "@/engines/e2/boq-types";

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

function parseByType(
  type: BoQType,
  sheets: Record<string, string[][]>,
): BoQLineItem[] {
  switch (type) {
    case BoQType.TYPE_A_ARIBA: return parseTypeA(sheets);
    case BoQType.TYPE_B_NRM2: return parseTypeB(sheets, "base");
    case BoQType.TYPE_B_NRM2_ADDOMMIT: return parseTypeB(sheets, "addommit");
    case BoQType.TYPE_C_VENDOR_QUOTE: return parseTypeC(sheets);
    case BoQType.TYPE_D_BOM_NO_PRICE: return parseTypeD(sheets);
    case BoQType.TYPE_E_TELECOM: return parseTypeE(sheets);
    default: return [];
  }
}

// Parsers populate partNumber only for Type A (regex-extracted from
// description) and Type D (column B). Type B/C/E never set partNumber, so
// those workbooks yield [] here even when detection succeeds.
export async function extractBoqSkus(filePath: string): Promise<string[]> {
  try {
    const excel = readExcelFile(filePath);
    const firstSheet = excel.sheets[excel.sheetNames[0]] ?? [];
    const type = detectBoQType(
      excel.sheetNames, excel.fileName, firstSheet.slice(0, 5),
    );
    if (type === BoQType.TYPE_UNKNOWN) return [];
    const lines = parseByType(type, excel.sheets);
    const set = new Set<string>();
    for (const l of lines) {
      const sku = l.partNumber?.trim();
      if (sku) set.add(sku);
    }
    return Array.from(set);
  } catch {
    return [];
  }
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

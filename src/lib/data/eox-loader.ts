/**
 * EoX dataset loader. Backed by data/cisco-eox.csv — a curated 40-row
 * starter set focused on the WS-C3650 → C9300 migration.
 *
 * KNOWN GAP: real Cisco EoX has thousands of bulletins. Expanding this
 * dataset is a separate future task (would need Cisco EoX API integration
 * or manual scraping of cisco.com/c/en/us/products/eos-eol-listing.html).
 * Tracked as backlog item A6 / B10 (TBD when scheduled).
 */

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

interface EoxRow {
  sku: string;
  status: string;
  eosDate: string;
  eolDate: string;
  replacement: string;
}

export interface EoxRecord {
  isEox: boolean;
  endOfSaleDate?: string;
  endOfLifeDate?: string;
  migrationSku?: string;
}

export interface EoxLookup {
  checkSku(sku: string): EoxRecord;
}

let cached: Map<string, EoxRecord> | null = null;

function loadCsv(): Map<string, EoxRecord> {
  const csvPath = path.join(process.cwd(), "data", "cisco-eox.csv");
  const raw = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<EoxRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  const map = new Map<string, EoxRecord>();
  for (const row of parsed.data) {
    if (!row.sku) continue;
    const status = row.status?.trim().toLowerCase();
    const isEol = status === "eol" || status === "eos_announced";
    map.set(row.sku.trim(), {
      isEox: isEol,
      endOfSaleDate: isEol ? row.eosDate?.trim() || undefined : undefined,
      endOfLifeDate: isEol ? row.eolDate?.trim() || undefined : undefined,
      migrationSku: isEol ? row.replacement?.trim() || undefined : undefined,
    });
  }
  return map;
}

export function loadEoxLookup(): EoxLookup {
  if (!cached) {
    cached = loadCsv();
  }
  const data = cached;
  return {
    checkSku(sku: string): EoxRecord {
      const hit = data.get(sku);
      if (!hit || !hit.isEox) return { isEox: false };
      return hit;
    },
  };
}

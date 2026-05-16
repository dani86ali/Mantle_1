import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { EoxLookup } from "@/lib/validation/rules/eox-check";

interface EoxRow {
  sku: string;
  status: string;
  eosDate: string;
  eolDate: string;
  replacement: string;
}

interface EoxEntry {
  isEox: boolean;
  eoxDate?: string;
  replacement?: string;
}

let cached: Map<string, EoxEntry> | null = null;

function loadCsv(): Map<string, EoxEntry> {
  const csvPath = path.join(process.cwd(), "data", "cisco-eox.csv");
  const raw = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<EoxRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  const map = new Map<string, EoxEntry>();
  for (const row of parsed.data) {
    if (!row.sku) continue;
    const status = row.status?.trim().toLowerCase();
    const isEol = status === "eol" || status === "eos_announced";
    map.set(row.sku.trim(), {
      isEox: isEol,
      eoxDate: isEol ? row.eolDate?.trim() || undefined : undefined,
      replacement: isEol ? row.replacement?.trim() || undefined : undefined,
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
    checkSku(sku: string) {
      const hit = data.get(sku);
      if (!hit) return { isEox: false };
      if (!hit.isEox) return { isEox: false };
      return { isEox: true, eoxDate: hit.eoxDate, replacement: hit.replacement };
    },
  };
}

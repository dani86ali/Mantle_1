/**
 * Shared mapping from stored intake requirements to E2 device inputs.
 * Used by both the initial intake pipeline run and the E2 re-run endpoint.
 */

import { basename, extname } from "path";
import type {
  E2Device,
  E2DeviceConfig,
} from "@/engines/e2/orchestrator";
import type { BoQLineItem } from "@/engines/e2/boq-types";
import { BoQType } from "@/engines/e2/boq-types";
import { readExcelFile } from "@/lib/io/excel-reader";
import { detectBoQType } from "@/engines/e2/boq-detector";
import { parseTypeA } from "@/engines/e2/parsers/type-a-ariba";
import { parseTypeB } from "@/engines/e2/parsers/type-b-nrm2";
import { parseTypeC } from "@/engines/e2/parsers/type-c-vendor-quote";
import { parseTypeD } from "@/engines/e2/parsers/type-d-bom";
import { parseTypeE } from "@/engines/e2/parsers/type-e-telecom";

export interface IntakeRequirementsForE2 {
  redundancyRequired?: boolean;
  dnaTier?: string;
  licenseTier?: "essentials" | "advantage";
  supportTerm?: string;
  uploadedBomLines?: { sku: string; quantity: number }[];
  quantities?: { description: string; quantity: number }[];
  uploadedFiles?: { filename?: string; path: string }[];
  keyNeeds?: string;
}

const DNA_MAP: Record<string, E2DeviceConfig["dnaTier"]> = {
  essentials: "essentials",
  advantage: "advantage",
  opt_out: "optout",
};

const TERM_MAP: Record<string, 3 | 5 | 7> = {
  "3yr": 3, "3": 3, "5yr": 5, "5": 5, "7yr": 7, "7": 7,
};

export function buildDeviceConfig(req: IntakeRequirementsForE2): E2DeviceConfig {
  return {
    redundantPsu: req.redundancyRequired,
    dnaTier: req.dnaTier ? DNA_MAP[req.dnaTier] ?? "advantage" : "advantage",
    networkTier: req.licenseTier ?? "advantage",
    licenseTerm: req.supportTerm ? (TERM_MAP[req.supportTerm] ?? 5) : 5,
    supportCriticality: "standard",
    vendor: "cisco",
  };
}

export function devicesFromIntake(req: IntakeRequirementsForE2): E2Device[] {
  const config = buildDeviceConfig(req);
  if (req.uploadedBomLines && req.uploadedBomLines.length > 0) {
    return req.uploadedBomLines.map((l) => ({
      model: l.sku, qty: l.quantity, config,
    }));
  }
  if (req.quantities && req.quantities.length > 0) {
    return req.quantities.map((q) => ({
      model: q.description, qty: q.quantity, config,
    }));
  }
  return [];
}

/**
 * Parse raw pasted BoM text into { sku, quantity } lines.
 * Supports 'SKU qty', 'SKU,qty', and 'SKU\tqty' per line; defaults qty to 1.
 */
export function parseBomText(text: string): { sku: string; quantity: number }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t\s]+/).map((p) => p.trim()).filter(Boolean);
      const qty = parseInt(parts[1] ?? "1", 10);
      return {
        sku: parts[0] ?? "",
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      };
    })
    .filter((l) => l.sku.length > 0);
}

const BOM_FILE_EXTS = new Set([".xlsx", ".xls", ".csv"]);

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

/**
 * Parse the first XLSX/XLS/CSV BoM file found in `uploadedFiles` into
 * { sku, quantity } lines suitable for `IntakeRequirementsForE2.uploadedBomLines`.
 * Returns [] (and logs a warning) when no parseable file exists or parsing fails.
 */
export async function parseBomFromUploadedFiles(
  uploadedFiles: { filename?: string; path: string }[] | undefined,
): Promise<{ sku: string; quantity: number }[]> {
  if (!uploadedFiles || uploadedFiles.length === 0) return [];
  const file = uploadedFiles.find((f) => {
    const ext = extname(f.filename ?? basename(f.path)).toLowerCase();
    return BOM_FILE_EXTS.has(ext);
  });
  if (!file) return [];

  try {
    const excel = readExcelFile(file.path);
    const firstSheet = excel.sheets[excel.sheetNames[0]] ?? [];
    const type = detectBoQType(
      excel.sheetNames, excel.fileName, firstSheet.slice(0, 5),
    );
    const lines = parseByType(type, excel.sheets);
    return lines
      .map((b) => ({
        sku: b.partNumber || b.itemNumber || b.description,
        quantity: b.qty,
      }))
      .filter((l) => l.sku.length > 0 && l.quantity > 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[parseBomFromUploadedFiles] failed to parse '${file.path}': ${msg}`,
    );
    return [];
  }
}

import { z } from "zod";
import { BoQLineItem } from "@/engines/e2/boq-types";

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

type ColMap = {
  itemNum: number;
  description: number;
  currency: number;
  uom: number;
  qty: number;
  unitPrice: number;
  leadTime: number;
  manufacturer: number;
  modelPartNum: number;
  countryOfOrigin: number;
};

// 2024+ (42 cols): O=Discount%, P=ChinaVAT%, then Q=ReqDelivery, R=LeadTime, ..., Z=Country
const COLS_2024: ColMap = {
  itemNum: 0,          // A
  description: 5,      // F
  currency: 8,         // I
  uom: 9,              // J
  qty: 11,             // L
  unitPrice: 13,       // N
  leadTime: 17,        // R
  manufacturer: 21,    // V
  modelPartNum: 23,    // X
  countryOfOrigin: 25, // Z
};

// 2022 (41 cols): O=HSCode only — everything after N shifts left by 1 vs 2024+
const COLS_2022: ColMap = {
  itemNum: 0,          // A
  description: 5,      // F
  currency: 8,         // I
  uom: 9,              // J
  qty: 11,             // L
  unitPrice: 13,       // N
  leadTime: 16,        // Q (was R in 2024+)
  manufacturer: 20,    // U (was V in 2024+)
  modelPartNum: 22,    // W (was X in 2024+)
  countryOfOrigin: 24, // Y (was Z in 2024+)
};

const ITEM_NUM_RE = /^\d+\.\d+$/;
const OEM_PART_HASH_RE = /Part#\s+(\S+)/i;
const OEM_PART_NUM_RE = /Part Number[;:]\s*\n?([^\n;]+)/i;

function extractOemPartNumber(description: string): string | undefined {
  const hashMatch = description.match(OEM_PART_HASH_RE);
  if (hashMatch) return hashMatch[1].trim();
  const numMatch = description.match(OEM_PART_NUM_RE);
  if (numMatch) return numMatch[1].trim();
  return undefined;
}

function parseNum(s: string): number | undefined {
  if (!s || s.trim() === "") return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

function findCommercialSheet(sheets: Record<string, string[][]>): {
  name: string;
  rows: string[][];
} {
  const name = Object.keys(sheets).find((s) => s.includes("Commercial Envelope"));
  if (!name) {
    throw new Error(
      `No sheet containing "Commercial Envelope" found; available: ${Object.keys(sheets).join(", ")}`
    );
  }
  return { name, rows: sheets[name] };
}

// Detect version by sheet name prefix first; fall back to header row width.
function detectVersion(sheetName: string, rows: string[][]): ColMap {
  if (sheetName.startsWith("6 ")) return COLS_2022;
  if (sheetName.startsWith("7 ")) return COLS_2024;
  const headerWidth = rows[0]?.length ?? 0;
  return headerWidth >= 42 ? COLS_2024 : COLS_2022;
}

function rowToLineItem(row: string[], cols: ColMap): BoQLineItem | null {
  const itemNumber = (row[cols.itemNum] ?? "").trim();
  if (!ITEM_NUM_RE.test(itemNumber)) return null;

  const qty = parseNum(row[cols.qty] ?? "");
  if (qty === undefined) return null;

  const description = (row[cols.description] ?? "").trim();

  const metadata: Record<string, string> = {};
  const country = (row[cols.countryOfOrigin] ?? "").trim();
  if (country) metadata.countryOfOrigin = country;
  const modelPn = (row[cols.modelPartNum] ?? "").trim();
  if (modelPn) metadata.modelPartNumber = modelPn;

  return {
    itemNumber,
    description,
    qty,
    unit: (row[cols.uom] ?? "").trim(),
    unitPrice: parseNum(row[cols.unitPrice] ?? ""),
    currency: (row[cols.currency] ?? "").trim() || undefined,
    partNumber: extractOemPartNumber(description),
    manufacturer: (row[cols.manufacturer] ?? "").trim() || undefined,
    leadTime: (row[cols.leadTime] ?? "").trim() || undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function parseTypeA(sheets: Record<string, string[][]>): BoQLineItem[] {
  SheetsSchema.parse(sheets);

  const { name, rows } = findCommercialSheet(sheets);
  const cols = detectVersion(name, rows);

  // Rows 1–4 are system rows (0-indexed: 0–3); data starts at index 4
  const items: BoQLineItem[] = [];
  for (const row of rows.slice(4)) {
    const item = rowToLineItem(row, cols);
    if (item) items.push(item);
  }
  return items;
}

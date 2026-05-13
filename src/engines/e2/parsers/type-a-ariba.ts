import { z } from "zod";
import { BoQLineItem } from "@/engines/e2/boq-types";
import {
  ColMap, detectVersion, findCommercialSheetName,
} from "@/engines/e2/parsers/type-a-cols";

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

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
  if (!s) return undefined;
  // Aramco templates use locale-formatted numbers in some cells (e.g. "6,410").
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return isNaN(n) ? undefined : n;
}

function findCommercialSheet(sheets: Record<string, string[][]>): {
  name: string;
  rows: string[][];
} {
  const name = findCommercialSheetName(Object.keys(sheets));
  if (!name) {
    throw new Error(
      `No sheet containing "Commercial Envelope" found; available: ${Object.keys(sheets).join(", ")}`
    );
  }
  return { name, rows: sheets[name] };
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
  const cols = detectVersion(name, rows[0]?.length ?? 0);

  // Rows 1–4 are system rows (0-indexed: 0–3); data starts at index 4
  const items: BoQLineItem[] = [];
  for (const row of rows.slice(4)) {
    const item = rowToLineItem(row, cols);
    if (item) items.push(item);
  }
  return items;
}

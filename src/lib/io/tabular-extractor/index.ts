// Generic, deterministic BoQ line-item extractor for arbitrary spreadsheet
// layouts (CCW EstimateDetails, CCW Price Estimate, and other TYPE_UNKNOWN
// workbooks). No AI — sheet/header/column detection is all pattern + catalog
// grounding. See ./detect.ts for the algorithm and ./patterns.ts for regexes.

import type { BoQLineItem } from "@/engines/e2/boq-types";
import { SKU_RE, parseNum } from "./patterns";
import { selectSheet, detectHeaderRow, detectColumns } from "./detect";

export interface TabularExtractionResult {
  lineItems: BoQLineItem[];
  confidence: "high" | "low" | "none";
  sheetUsed: string | null;
  detectedColumns: Record<string, number>;
  warnings: string[];
}

export interface ExtractOptions {
  catalogSkus?: string[];
}

function empty(
  sheetUsed: string | null,
  warnings: string[],
): TabularExtractionResult {
  return { lineItems: [], confidence: "none", sheetUsed, detectedColumns: {}, warnings };
}

export function extractLineItems(
  sheets: Record<string, string[][]>,
  opts: ExtractOptions = {},
): TabularExtractionResult {
  const { name: sheetUsed } = selectSheet(sheets);
  if (!sheetUsed) {
    return empty(null, [
      "No sheet with ≥3 line-item rows (SKU + numeric) — manual entry required.",
    ]);
  }

  const rows = sheets[sheetUsed];
  const headerRow = detectHeaderRow(rows);
  if (headerRow < 0) {
    return empty(sheetUsed, [
      `Could not locate a header row in sheet '${sheetUsed}' — manual entry required.`,
    ]);
  }

  const { columns, skuTier } = detectColumns(rows, headerRow, opts.catalogSkus);
  if (skuTier === null || columns.sku === undefined) {
    return empty(sheetUsed, [
      `Could not identify a SKU column in sheet '${sheetUsed}' — manual entry required.`,
    ]);
  }

  const skuCol = columns.sku;
  const descCol = columns.description;
  const qtyCol = columns.qty;
  const priceCol = columns.unitPrice;
  const uomCol = columns.uom;

  const lineItems: BoQLineItem[] = [];
  let index = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const sku = (row[skuCol] ?? "").trim();
    const qtyRaw = qtyCol !== undefined ? (row[qtyCol] ?? "").trim() : "";

    // Keep a row only when its SKU cell matches SKU_RE. This drops subtotals,
    // section headers, "Initial Term…" note rows, and — critically — bundle
    // sub-component rows whose part numbers carry a trailing dash (e.g.
    // "CS-CODEC-EQ-K9-"), which are zero-priced expansion of a parent kit.
    //
    // NOTE: the spec's skip rule also admitted rows via "OR numeric qty", but
    // that liberalization over-extracts on the MARAFIQ fixture (44 vs the
    // reference 19) by pulling in those trailing-dash sub-components. Strict
    // SKU_RE matching reproduces the reference exactly (MARAFIQ 19 / HoneyWell
    // 52); the spec declares the reference authoritative on divergence.
    if (!sku || !SKU_RE.test(sku)) continue;

    index++;
    // Default qty=1 when a valid SKU row has a blank/non-numeric qty cell.
    const qty = parseNum(qtyRaw) ?? 1;
    const unitPrice = priceCol !== undefined ? parseNum((row[priceCol] ?? "").trim()) : undefined;
    const unit = uomCol !== undefined ? (row[uomCol] ?? "").trim() || "EA" : "EA";

    lineItems.push({
      itemNumber: String(index),
      description: descCol !== undefined ? (row[descCol] ?? "").trim() : "",
      qty,
      unit,
      unitPrice,
      partNumber: sku,
      metadata: {
        sourceSheet: sheetUsed,
        // 0-based row index within the sheet array as delivered by
        // excel-reader. NOTE: when the worksheet range origin is not A1
        // (e.g. HoneyWell starts at A2) this differs from the true Excel row
        // by the origin offset — unrecoverable from string[][]. Fix #7b must
        // pass the workbook to map this back to an absolute cell. Computed
        // from the un-filtered index (do NOT filter blank rows first).
        sourceRow: String(r),
      },
    });
  }

  const detectedColumns: Record<string, number> = {};
  for (const [role, col] of Object.entries(columns)) {
    if (col !== undefined) detectedColumns[role] = col;
  }

  return {
    lineItems,
    confidence: skuTier === 1 || skuTier === 3 ? "high" : "low",
    sheetUsed,
    detectedColumns,
    warnings: [],
  };
}

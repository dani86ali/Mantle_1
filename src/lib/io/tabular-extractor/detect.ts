// Sheet selection, deep header-row detection, and 4-tier column-role detection
// for the generic tabular BoQ extractor. Pure functions, no AI.

import { SKU_RE, ROLE_KEYWORDS, isNumeric, type ColumnRole } from "./patterns";

/** A row "looks like a line item" if it has ≥1 SKU-shaped cell and ≥1 numeric cell. */
function isLineItemRow(row: string[]): boolean {
  let hasSku = false;
  let hasNum = false;
  for (const cell of row) {
    const v = (cell ?? "").trim();
    if (!v) continue;
    if (!hasSku && SKU_RE.test(v)) hasSku = true;
    if (!hasNum && isNumeric(v)) hasNum = true;
    if (hasSku && hasNum) return true;
  }
  return false;
}

function rowHasSku(row: string[]): boolean {
  return row.some((cell) => SKU_RE.test((cell ?? "").trim()));
}

/** Score = count of line-item rows. Highest wins; ties broken by key order. */
export function selectSheet(
  sheets: Record<string, string[][]>,
): { name: string | null; score: number } {
  let best: { name: string | null; score: number } = { name: null, score: 0 };
  for (const name of Object.keys(sheets)) {
    const rows = sheets[name] ?? [];
    let score = 0;
    for (const row of rows) if (isLineItemRow(row)) score++;
    if (score > best.score) best = { name, score };
  }
  // Require ≥3 line-item rows for any sheet to be usable.
  return best.score >= 3 ? best : { name: null, score: best.score };
}

/** Count how many distinct column roles have a keyword hit on this row. */
function keywordHits(row: string[]): number {
  let hits = 0;
  for (const role of Object.keys(ROLE_KEYWORDS) as ColumnRole[]) {
    if (row.some((cell) => ROLE_KEYWORDS[role].test((cell ?? "").trim()))) hits++;
  }
  return hits;
}

/**
 * Deep header-row detection. The header is the row (scanning 0..min(40,len))
 * that maximizes keyword hits (requiring ≥2) AND is followed within the next
 * 5 rows by ≥3 rows containing a SKU. Returns -1 if none qualifies.
 */
export function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(40, rows.length);
  let bestRow = -1;
  let bestHits = 1; // require ≥2, so start above 1
  for (let i = 0; i < limit; i++) {
    const hits = keywordHits(rows[i]);
    if (hits < 2 || hits <= bestHits) continue;
    let skuRows = 0;
    for (let j = i + 1; j <= i + 5 && j < rows.length; j++) {
      if (rowHasSku(rows[j])) skuRows++;
    }
    if (skuRows >= 3) {
      bestHits = hits;
      bestRow = i;
    }
  }
  return bestRow;
}

export interface ColumnDetection {
  columns: Partial<Record<ColumnRole, number>>;
  skuTier: 1 | 2 | 3 | null;
}

/** Sample up to `n` non-empty data cells from a column below the header. */
function sampleColumn(rows: string[][], headerRow: number, col: number, n: number): string[] {
  const out: string[] = [];
  for (let i = headerRow + 1; i < rows.length && out.length < n; i++) {
    const v = (rows[i]?.[col] ?? "").trim();
    if (v) out.push(v);
  }
  return out;
}

/**
 * 4-tier column-role detection.
 *  Tier 1 — header keyword match on the detected header row.
 *  Tier 2 — content pattern: column where ≥50% of sampled cells match SKU_RE.
 *  Tier 3 — catalog-grounded: column with most exact/prefix catalog matches.
 *  Tier 4 — gate handled by caller via skuTier === null.
 */
export function detectColumns(
  rows: string[][],
  headerRow: number,
  catalogSkus?: string[],
): ColumnDetection {
  const header = rows[headerRow] ?? [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const columns: Partial<Record<ColumnRole, number>> = {};

  // Tier 1: header keywords (first matching column per role wins).
  for (const role of Object.keys(ROLE_KEYWORDS) as ColumnRole[]) {
    for (let c = 0; c < header.length; c++) {
      if (ROLE_KEYWORDS[role].test((header[c] ?? "").trim())) {
        columns[role] = c;
        break;
      }
    }
  }
  let skuTier: 1 | 2 | 3 | null = columns.sku !== undefined ? 1 : null;

  // Tier 2: content pattern for SKU role if still unresolved.
  if (columns.sku === undefined) {
    let bestCol = -1;
    let bestRatio = 0;
    for (let c = 0; c < width; c++) {
      const sample = sampleColumn(rows, headerRow, c, 20);
      if (sample.length === 0) continue;
      const ratio = sample.filter((v) => SKU_RE.test(v)).length / sample.length;
      if (ratio >= 0.5 && ratio > bestRatio) {
        bestRatio = ratio;
        bestCol = c;
      }
    }
    if (bestCol >= 0) {
      columns.sku = bestCol;
      skuTier = 2;
    }
  }

  // Tier 3: catalog-grounded — overrides Tier 2 (and resolves when unresolved).
  if (catalogSkus && catalogSkus.length > 0 && skuTier !== 1) {
    const upper = catalogSkus.map((s) => s.toUpperCase());
    const catalog = new Set(upper);
    let bestCol = -1;
    let bestHits = 0;
    for (let c = 0; c < width; c++) {
      const sample = sampleColumn(rows, headerRow, c, 15);
      if (sample.length === 0) continue;
      let hits = 0;
      for (const v of sample) {
        const u = v.toUpperCase();
        // Exact, then prefix (candidate ⊃ catalog SKU or vice versa).
        if (catalog.has(u) || upper.some((k) => u.startsWith(k) || k.startsWith(u))) {
          hits++;
        }
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestCol = c;
      }
    }
    // Gate: ≤1 hit out of ~15 samples is treated as no catalog grounding.
    if (bestCol >= 0 && bestHits >= 2) {
      columns.sku = bestCol;
      skuTier = 3;
    } else if (skuTier === null) {
      // catalog present but near-zero hits and no Tier-1/2 column → fail.
      skuTier = null;
    }
  }

  return { columns, skuTier };
}

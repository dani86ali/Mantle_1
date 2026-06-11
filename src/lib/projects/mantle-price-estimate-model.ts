/**
 * Pure Project-domain export-prep mapper: turn a priced_boq artifact payload into
 * a deterministic "Mantle Price Estimate" row model for a later ExcelJS template
 * writer to consume. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (10. Priced Output
 * Contract - Mantle is the structural template; 11A.3, 19 task 8k).
 *
 * The priced_boq payload is the accepted priced EXPANDED BoM: it was produced by
 * pricing the accepted configuration_expansion artifact's acceptedLines, so each
 * row is either a preserved customer line or an accepted expansion child line, in
 * customer-then-children order. These rows carry no sourceFormat (that is a
 * normalized_boq field), and a child line is already priced by the orderable SKU
 * on its own priced line - this mapper never re-resolves SKUs or re-prices. The
 * optional parentLineNumber is copied through as trace metadata only.
 *
 * PURE: type-only imports from the priced-BoQ helper and artifact service; no
 * runtime imports at all (no exceljs, DB store, catalog/SKU service, approvals,
 * staleness, engine, AI, or API/UI). It does NO workbook generation and reads no
 * file. It only maps/copies existing priced_boq amounts - it does NOT recalculate
 * VAT or pricing math, and never invents catalog categories. The category split
 * uses an explicit caller-supplied map; priced rows without an explicit category
 * default to product totals with exactly one model warning. Never mutates inputs.
 */
import type { PricedBoqDraftLine, PricedBoqLineStatus } from "@/lib/projects/priced-boq";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";

/** Mantle splits priced totals into these three line categories. */
export type MantleLineCategory = "product" | "service" | "subscription";

// Exact model warning; the later writer and tests may assert on this verbatim.
const MISSING_CATEGORY_WARNING =
  "Mantle line category metadata was not supplied for one or more priced rows; defaulted those rows to product totals.";

// Mantle cell defaults for fields the priced_boq payload does not carry.
const SMART_ACCOUNT_MANDATORY_DEFAULT = "-";
const SERVICE_DURATION_MONTHS_DEFAULT = "---";
const ESTIMATED_LEAD_TIME_DAYS_DEFAULT = "N/A";
const PRICING_TERM_DEFAULT = "";

/**
 * One Mantle Price Estimate row: source metadata for traceability plus semantic
 * (un-formatted) cell values for the writer. Price fields are null on unpriced
 * rows so the writer can render unresolved rows in place.
 */
export interface MantlePriceEstimateRow {
  sourceFileId: string;
  sourceSheetName?: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  /** Parent customer line number for an accepted expansion child; trace only, not written to the workbook yet. */
  parentLineNumber?: string;
  originalSku: string;
  acceptedSku?: string;
  status: PricedBoqLineStatus;
  warning?: string;
  partNumber: string;
  smartAccountMandatory: string;
  description: string;
  serviceDurationMonths: string;
  estimatedLeadTimeDays: string;
  unitListPriceSar: number | null;
  pricingTerm: string;
  quantity: number;
  unitNetPriceSar: number | null;
  discountPercent: number | null;
  extendedNetPriceSar: number | null;
  /** Resolved Mantle category for priced rows; null on unpriced rows. */
  category: MantleLineCategory | null;
  /** True when a priced row had no explicit category and was defaulted to product. */
  categoryWasDefaulted: boolean;
}

/** SAR totals and line counts for the Mantle footer/summary blocks. */
export interface MantlePriceEstimateTotals {
  totalPriceSar: number;
  productTotalSar: number;
  serviceTotalSar: number;
  subscriptionTotalSar: number;
  /** Copied from payload.summary.totals; not recalculated here. */
  vatAmountSar: number;
  /** Copied from payload.summary.totals; not recalculated here. */
  totalIncVatSar: number;
  pricedLineCount: number;
  unpricedLineCount: number;
  missingDecisionCount: number;
  notAcceptedCount: number;
  missingPriceCount: number;
}

/** Deterministic intermediate model for a Mantle Price Estimate sheet. */
export interface MantlePriceEstimateModel {
  rows: MantlePriceEstimateRow[];
  totals: MantlePriceEstimateTotals;
  warnings: string[];
}

/** Read-only input for {@link buildMantlePriceEstimateModel}. */
export interface BuildMantlePriceEstimateModelInput {
  payload: PricedBoqArtifactPayload;
  /** Explicit Mantle line category per accepted SKU. Absent -> defaults to product. */
  categoryByAcceptedSku?: Readonly<Record<string, MantleLineCategory>>;
  /**
   * Optional EXPORT PRESENTATION row order: a SKU occurrence sequence (duplicates
   * allowed) that re-orders the mapped rows for the workbook only. Absent -> payload
   * line order is preserved exactly. This is presentation/order ONLY: it changes no
   * pricing, no totals, no category, and never re-resolves or substitutes a SKU.
   */
  rowOrderSkuSequence?: readonly string[];
}

/** Round a number to 2 decimals, matching the priced_boq currency convention. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Discount percent to 2 decimals; negative allowed, 0 when list price is 0. */
function discountPercentFor(unitListPriceSar: number, unitNetPriceSar: number): number {
  if (unitListPriceSar === 0) return 0;
  return round2(((unitListPriceSar - unitNetPriceSar) / unitListPriceSar) * 100);
}

/** Explicit category for an accepted SKU; undefined when no map entry exists. */
function resolveCategory(
  map: Readonly<Record<string, MantleLineCategory>> | undefined,
  acceptedSku: string | undefined
): MantleLineCategory | undefined {
  if (map === undefined || acceptedSku === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(map, acceptedSku)) return undefined;
  return map[acceptedSku];
}

/** Map one priced_boq draft line to a Mantle row, preserving source metadata. */
function mapRow(
  line: PricedBoqDraftLine,
  categoryByAcceptedSku: Readonly<Record<string, MantleLineCategory>> | undefined
): MantlePriceEstimateRow {
  const base = {
    sourceFileId: line.sourceFileId,
    ...(line.sourceSheetName !== undefined ? { sourceSheetName: line.sourceSheetName } : {}),
    sourceRowNumber: line.sourceRowNumber,
    originalLineNumber: line.originalLineNumber,
    ...(line.parentLineNumber !== undefined ? { parentLineNumber: line.parentLineNumber } : {}),
    originalSku: line.originalSku,
    ...(line.acceptedSku !== undefined ? { acceptedSku: line.acceptedSku } : {}),
    status: line.status,
    ...(line.warning !== undefined ? { warning: line.warning } : {}),
    smartAccountMandatory: SMART_ACCOUNT_MANDATORY_DEFAULT,
    description: line.description,
    serviceDurationMonths: SERVICE_DURATION_MONTHS_DEFAULT,
    estimatedLeadTimeDays: ESTIMATED_LEAD_TIME_DAYS_DEFAULT,
    pricingTerm: PRICING_TERM_DEFAULT,
    quantity: line.quantity,
  };

  if (line.status === "priced" && line.amounts !== undefined && line.acceptedSku !== undefined) {
    const { unitListPriceSar, unitSellPriceSar, extendedSellPriceSar } = line.amounts;
    const explicitCategory = resolveCategory(categoryByAcceptedSku, line.acceptedSku);
    return {
      ...base,
      partNumber: line.acceptedSku,
      unitListPriceSar,
      unitNetPriceSar: unitSellPriceSar,
      discountPercent: discountPercentFor(unitListPriceSar, unitSellPriceSar),
      extendedNetPriceSar: extendedSellPriceSar,
      category: explicitCategory ?? "product",
      categoryWasDefaulted: explicitCategory === undefined,
    };
  }

  return {
    ...base,
    partNumber: line.acceptedSku ?? line.originalSku,
    unitListPriceSar: null,
    unitNetPriceSar: null,
    discountPercent: null,
    extendedNetPriceSar: null,
    category: null,
    categoryWasDefaulted: false,
  };
}

/**
 * Re-order mapped rows by an export-presentation SKU occurrence sequence, returning a
 * fresh array (never mutating the input rows or the sequence). Each row is matched to
 * the next unused sequence position for its partNumber, so duplicate SKUs map in
 * occurrence order: the first generated CAB-C15-CBN row takes the first CAB-C15-CBN
 * sequence position, the second takes the second. Rows whose partNumber has no
 * remaining sequence position stay after the ordered rows in their original relative
 * order. This is presentation-only: it copies no values and changes no amounts.
 */
function orderRowsBySkuSequence(
  rows: MantlePriceEstimateRow[],
  sequence: readonly string[]
): MantlePriceEstimateRow[] {
  const positionsBySku = new Map<string, number[]>();
  sequence.forEach((sku, index) => {
    const positions = positionsBySku.get(sku);
    if (positions === undefined) positionsBySku.set(sku, [index]);
    else positions.push(index);
  });

  const usedCountBySku = new Map<string, number>();
  const ordered: Array<{ position: number; row: MantlePriceEstimateRow }> = [];
  const remainder: MantlePriceEstimateRow[] = [];

  for (const row of rows) {
    const positions = positionsBySku.get(row.partNumber);
    const used = usedCountBySku.get(row.partNumber) ?? 0;
    if (positions !== undefined && used < positions.length) {
      ordered.push({ position: positions[used], row });
      usedCountBySku.set(row.partNumber, used + 1);
    } else {
      remainder.push(row);
    }
  }

  ordered.sort((a, b) => a.position - b.position);
  return [...ordered.map((entry) => entry.row), ...remainder];
}

/**
 * Build the Mantle Price Estimate model from a priced_boq payload. Emits one row
 * per payload line in original order (including unpriced rows), unless an explicit
 * rowOrderSkuSequence is supplied, in which case rows are re-ordered for presentation
 * only (totals and per-row values are unchanged). totalPriceSar sums
 * the priced rows' extended net price; the product/service/subscription split uses
 * the explicit category map, defaulting unmapped priced rows to product and adding
 * exactly one warning. VAT amounts and counts are copied from the payload summary,
 * never recalculated. Pure: never mutates the payload, its lines, or the map.
 */
export function buildMantlePriceEstimateModel(
  input: BuildMantlePriceEstimateModelInput
): MantlePriceEstimateModel {
  const { payload, categoryByAcceptedSku, rowOrderSkuSequence } = input;

  const mappedRows = payload.lines.map((line) => mapRow(line, categoryByAcceptedSku));
  const rows =
    rowOrderSkuSequence !== undefined
      ? orderRowsBySkuSequence(mappedRows, rowOrderSkuSequence)
      : mappedRows;

  let totalPriceSar = 0;
  let productTotalSar = 0;
  let serviceTotalSar = 0;
  let subscriptionTotalSar = 0;
  let missingCategory = false;

  // Totals follow each row's resolved category so the split and the row metadata
  // never disagree. Priced rows carry a non-null extended price and category.
  for (const row of rows) {
    if (row.status !== "priced" || row.extendedNetPriceSar === null) continue;
    const extended = row.extendedNetPriceSar;
    totalPriceSar += extended;

    if (row.categoryWasDefaulted) missingCategory = true;
    if (row.category === "service") serviceTotalSar += extended;
    else if (row.category === "subscription") subscriptionTotalSar += extended;
    else productTotalSar += extended;
  }

  const warnings: string[] = [];
  if (missingCategory) warnings.push(MISSING_CATEGORY_WARNING);

  return {
    rows,
    totals: {
      totalPriceSar: round2(totalPriceSar),
      productTotalSar: round2(productTotalSar),
      serviceTotalSar: round2(serviceTotalSar),
      subscriptionTotalSar: round2(subscriptionTotalSar),
      vatAmountSar: payload.summary.totals.vatAmountSar,
      totalIncVatSar: payload.summary.totals.totalIncVatSar,
      pricedLineCount: payload.summary.pricedLineCount,
      unpricedLineCount: payload.summary.unpricedLineCount,
      missingDecisionCount: payload.summary.missingDecisionCount,
      notAcceptedCount: payload.summary.notAcceptedCount,
      missingPriceCount: payload.summary.missingPriceCount,
    },
    warnings,
  };
}

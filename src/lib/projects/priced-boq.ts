/**
 * Pure Project-domain pricing helpers. Two entry points share the SAR pricing math
 * (section 8/9/10; shapes in src/types/project.ts; math in src/lib/projects/pricing.ts):
 *   - buildPricedBoqDraft prices normalized BoQ lines against reviewed SKU decisions.
 *   - buildPricedExpandedBoqDraft prices an accepted expanded BoM directly from a
 *     configuration_expansion artifact's acceptedLines (the Quick BoM pricing input
 *     authority; section 11A, section 19 task 8j). No sku_resolution decisions are
 *     consulted here - the accepted lines already carry their orderable SKU.
 *
 * PURE: imports only the canonical types, the configuration-expansion line contract,
 * and pricing helpers (no DB, artifact store, catalog lookup, mock catalog, engines,
 * AI, API/UI, schema, Drizzle), runs no I/O, never mutates inputs. Does NOT decide
 * acceptance, look up the catalog, or source/convert SAR prices - it consumes explicit
 * per-SKU SAR prices from the caller. Prices only orderable SKUs with an explicit SAR
 * price (section 8/9); other rows are retained with a status/warning (section 10).
 */
import {
  calculatePricedLineAmounts,
  summarizePricedLineAmounts,
  validateProjectPricingConfig,
  type PricedLineAmounts,
  type PricingSummaryTotals,
} from "@/lib/projects/pricing";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";
import type {
  BoqInputFormat,
  CanonicalBoqLine,
  ProjectPricingConfig,
  SkuResolutionDecision,
  SkuResolutionStatus,
} from "@/types/project";

/** Per-line pricing outcome. Only `priced` rows carry amounts. (section 8/10) */
export type PricedBoqLineStatus = "priced" | "missing_decision" | "not_accepted" | "missing_price";

// Exact warning/guard messages; tests assert on these verbatim.
const NO_DECISION_WARNING = "No SKU resolution decision exists for this BoQ line.";
const NOT_ACCEPTED_WARNING = "SKU is not accepted for pricing.";
const MISSING_PRICE_WARNING = "Accepted SKU has no SAR unit price.";
const DUPLICATE_DECISION_MESSAGE = "Duplicate SKU resolution decision for BoQ line.";
const NON_SAR_PRICE_MESSAGE = "Accepted SKU price must be in SAR.";

/** Explicit caller-supplied SAR unit price for an accepted SKU. NOT catalog listPrice. */
export interface ExplicitSarUnitPrice {
  currency: "SAR";
  unitListPriceSar: number;
}

/**
 * One priced (or retained-unpriced) BoQ line. Source metadata is copied from the
 * CanonicalBoqLine in original order; `originalSku` is the line's own `sku` (the
 * customer evidence), not a decision's accepted SKU. `acceptedSku`,
 * `decisionStatus`, and `amounts` appear only when relevant to the status.
 */
export interface PricedBoqDraftLine {
  /** Present for lines mapped from a CanonicalBoqLine; absent for accepted expanded-BoM lines. */
  sourceFormat?: BoqInputFormat;
  sourceFileId: string;
  sourceSheetName?: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  parentLineNumber?: string;
  originalSku: string;
  description: string;
  quantity: number;
  originalCells: Record<string, string>;
  status: PricedBoqLineStatus;
  acceptedSku?: string;
  decisionStatus?: SkuResolutionStatus;
  amounts?: PricedLineAmounts;
  warning?: string;
}

/** Counts and SAR totals over a priced BoQ draft. Totals cover priced rows only. */
export interface PricedBoqDraftSummary {
  inputLineCount: number;
  pricedLineCount: number;
  unpricedLineCount: number;
  missingDecisionCount: number;
  notAcceptedCount: number;
  missingPriceCount: number;
  totals: PricingSummaryTotals;
}

/**
 * A priced BoQ draft: one line per input CanonicalBoqLine in original order,
 * plus a summary. Minimal; a later artifact prompt may echo `pricingConfig`.
 */
export interface PricedBoqDraft {
  lines: PricedBoqDraftLine[];
  summary: PricedBoqDraftSummary;
}

/** Input for {@link buildPricedBoqDraft}. All fields are treated as read-only. */
export interface BuildPricedBoqDraftInput {
  lines: readonly CanonicalBoqLine[];
  decisions: readonly SkuResolutionDecision[];
  pricingConfig: ProjectPricingConfig;
  /** Explicit SAR price entry per accepted SKU. NOT catalog listPrice. */
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>;
}

/** Deterministic identity for a BoQ line: its source file + row pair. */
export function getPricedBoqLineKey(line: {
  sourceFileId: string;
  sourceRowNumber: number;
}): string {
  return `${line.sourceFileId}::${line.sourceRowNumber}`;
}

/** Copy a CanonicalBoqLine's source metadata into a fresh draft-line base. */
function copySourceMetadata(
  line: CanonicalBoqLine
): Omit<PricedBoqDraftLine, "status"> {
  return {
    sourceFormat: line.sourceFormat,
    sourceFileId: line.sourceFileId,
    ...(line.sourceSheetName !== undefined
      ? { sourceSheetName: line.sourceSheetName }
      : {}),
    sourceRowNumber: line.sourceRowNumber,
    originalLineNumber: line.originalLineNumber,
    ...(line.parentLineNumber !== undefined
      ? { parentLineNumber: line.parentLineNumber }
      : {}),
    originalSku: line.sku,
    description: line.description,
    quantity: line.quantity,
    originalCells: { ...line.originalCells },
  };
}

/** Index decisions by line key, throwing the exact error on duplicate keys. */
function indexDecisions(
  decisions: readonly SkuResolutionDecision[]
): Map<string, SkuResolutionDecision> {
  const byKey = new Map<string, SkuResolutionDecision>();
  for (const decision of decisions) {
    const key = getPricedBoqLineKey(decision);
    if (byKey.has(key)) throw new Error(DUPLICATE_DECISION_MESSAGE);
    byKey.set(key, decision);
  }
  return byKey;
}

/**
 * Build a priced BoQ draft. Validates the pricing config up front (even when no
 * line is priced), indexes decisions by source file/row (throwing on duplicate
 * keys), then emits one draft line per input line in original order. A line
 * prices only when its decision is `accepted` with a non-blank acceptedSku that
 * has an explicit SAR price entry; a non-SAR entry throws, and an invalid SAR
 * value lets pricing.ts throw. Other rows are retained. Pure: never mutates.
 */
export function buildPricedBoqDraft(
  input: BuildPricedBoqDraftInput
): PricedBoqDraft {
  const { lines, decisions, pricingConfig, unitListPriceSarBySku } = input;

  validateProjectPricingConfig(pricingConfig);
  const decisionByKey = indexDecisions(decisions);

  const draftLines: PricedBoqDraftLine[] = [];
  const pricedAmounts: PricedLineAmounts[] = [];
  let missingDecisionCount = 0, notAcceptedCount = 0, missingPriceCount = 0;

  for (const line of lines) {
    const base = copySourceMetadata(line);
    const decision = decisionByKey.get(getPricedBoqLineKey(line));

    if (!decision) {
      missingDecisionCount += 1;
      draftLines.push({ ...base, status: "missing_decision", warning: NO_DECISION_WARNING });
      continue;
    }

    const acceptedSku = decision.acceptedSku?.trim() ?? "";
    if (decision.status !== "accepted" || acceptedSku === "") {
      notAcceptedCount += 1;
      draftLines.push({
        ...base,
        status: "not_accepted",
        decisionStatus: decision.status,
        warning: NOT_ACCEPTED_WARNING,
      });
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(unitListPriceSarBySku, acceptedSku)) {
      missingPriceCount += 1;
      draftLines.push({
        ...base,
        status: "missing_price",
        acceptedSku,
        decisionStatus: decision.status,
        warning: MISSING_PRICE_WARNING,
      });
      continue;
    }

    const priceEntry = unitListPriceSarBySku[acceptedSku];
    if (priceEntry.currency !== "SAR") throw new Error(NON_SAR_PRICE_MESSAGE);
    const amounts = calculatePricedLineAmounts({
      config: pricingConfig,
      unitListPriceSar: priceEntry.unitListPriceSar,
      quantity: line.quantity,
    });
    pricedAmounts.push(amounts);
    draftLines.push({
      ...base,
      status: "priced",
      acceptedSku,
      decisionStatus: decision.status,
      amounts,
    });
  }

  return {
    lines: draftLines,
    summary: {
      inputLineCount: lines.length,
      pricedLineCount: pricedAmounts.length,
      unpricedLineCount: missingDecisionCount + notAcceptedCount + missingPriceCount,
      missingDecisionCount,
      notAcceptedCount,
      missingPriceCount,
      totals: summarizePricedLineAmounts(pricedAmounts),
    },
  };
}

/** Input for {@link buildPricedExpandedBoqDraft}. All fields are treated as read-only. */
export interface BuildPricedExpandedBoqDraftInput {
  /** Accepted expanded BoM lines (customer + accepted expansion), in customer-then-children order. */
  acceptedLines: readonly ConfigurationExpansionDraftLine[];
  pricingConfig: ProjectPricingConfig;
  /** Explicit SAR price entry per orderable SKU. NOT catalog listPrice. */
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>;
}

/** The orderable SKU to price: a customer line's accepted SKU, or an expansion line's own SKU. */
function expandedPricingSkuFor(line: ConfigurationExpansionDraftLine): string {
  const candidate = line.origin === "customer" ? line.acceptedSku : line.sku;
  return candidate?.trim() ?? "";
}

/** Copy an accepted expanded-BoM line's source metadata into a fresh priced-line base. */
function copyExpandedSourceMetadata(
  line: ConfigurationExpansionDraftLine
): Omit<PricedBoqDraftLine, "status"> {
  return {
    sourceFileId: line.sourceFileId ?? "",
    ...(line.sourceSheetName !== undefined ? { sourceSheetName: line.sourceSheetName } : {}),
    sourceRowNumber: line.sourceRowNumber ?? 0,
    originalLineNumber: line.originalLineNumber ?? "",
    ...(line.parentLineNumber !== undefined ? { parentLineNumber: line.parentLineNumber } : {}),
    originalSku: line.originalSku ?? line.sku,
    description: line.description,
    quantity: line.quantity,
    originalCells: { ...(line.originalCells ?? {}) },
  };
}

/**
 * Price an accepted expanded BoM directly from a persisted configuration_expansion
 * artifact's acceptedLines (the pricing input authority; no sku_resolution decisions
 * are reintroduced). Validates the pricing config up front, then emits one priced (or
 * retained-unpriced) line per accepted line in order: a customer line prices by its
 * acceptedSku, an expansion line by its own sku; a line with no orderable SKU is
 * retained not_accepted, an orderable SKU with no SAR entry is retained missing_price,
 * and a non-SAR entry throws. Rejected expansion lines are never passed here. Pure:
 * never mutates inputs.
 */
export function buildPricedExpandedBoqDraft(
  input: BuildPricedExpandedBoqDraftInput
): PricedBoqDraft {
  const { acceptedLines, pricingConfig, unitListPriceSarBySku } = input;
  validateProjectPricingConfig(pricingConfig);

  const draftLines: PricedBoqDraftLine[] = [];
  const pricedAmounts: PricedLineAmounts[] = [];
  let notAcceptedCount = 0, missingPriceCount = 0;

  for (const line of acceptedLines) {
    const base = copyExpandedSourceMetadata(line);
    const acceptedSku = expandedPricingSkuFor(line);

    if (acceptedSku === "") {
      notAcceptedCount += 1;
      draftLines.push({ ...base, status: "not_accepted", warning: NOT_ACCEPTED_WARNING });
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(unitListPriceSarBySku, acceptedSku)) {
      missingPriceCount += 1;
      draftLines.push({ ...base, status: "missing_price", acceptedSku, warning: MISSING_PRICE_WARNING });
      continue;
    }

    const priceEntry = unitListPriceSarBySku[acceptedSku];
    if (priceEntry.currency !== "SAR") throw new Error(NON_SAR_PRICE_MESSAGE);
    const amounts = calculatePricedLineAmounts({
      config: pricingConfig,
      unitListPriceSar: priceEntry.unitListPriceSar,
      quantity: line.quantity,
    });
    pricedAmounts.push(amounts);
    draftLines.push({ ...base, status: "priced", acceptedSku, amounts });
  }

  return {
    lines: draftLines,
    summary: {
      inputLineCount: acceptedLines.length,
      pricedLineCount: pricedAmounts.length,
      unpricedLineCount: notAcceptedCount + missingPriceCount,
      missingDecisionCount: 0,
      notAcceptedCount,
      missingPriceCount,
      totals: summarizePricedLineAmounts(pricedAmounts),
    },
  };
}

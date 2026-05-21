/**
 * Pure Project-domain pricing math for Quick BoM / RFP priced output.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (9).
 * Canonical config shape: src/types/project.ts (ProjectPricingConfig).
 *
 * Deterministic TypeScript ONLY (BOMATIC First Commandment): margin/markup unit
 * sell, VAT, and 2-decimal currency rounding. SAR-only. This module is PURE - it
 * imports only the canonical config type (no DB, artifact store, catalog lookup,
 * engine, AI, API/UI, schema, or Drizzle), runs no I/O, and never mutates its
 * inputs. It does NOT decide whether a SKU is accepted; the later artifact service
 * calls these helpers only for accepted catalog SKUs. Legacy E2 pricing
 * (src/engines/e2/*) is reference only and intentionally not imported. Rounding
 * cascades invoice-style; see calculatePricedLineAmounts.
 */
import type { PricingMode, ProjectPricingConfig } from "@/types/project";

/** The only supported pricing currency. (section 9) */
export const PROJECT_PRICING_CURRENCY = "SAR" as const;

/** VAT default for Saudi projects. (section 9) */
export const DEFAULT_PROJECT_VAT_RATE_PERCENT = 15;

/** Currency values round to this many decimals by default. (section 9) */
export const DEFAULT_PROJECT_ROUNDING_DECIMALS = 2;

// Exact guard messages; tests assert on these verbatim.
const CURRENCY_MESSAGE = "Pricing currency must be SAR.";
const MODE_MESSAGE = "Pricing mode must be margin or markup.";
const MARGIN_RATE_MESSAGE =
  "Margin ratePercent must be a finite number from 0 up to, but not including, 100.";
const MARKUP_RATE_MESSAGE = "Markup ratePercent must be a finite number from 0 to 100.";
const VAT_MESSAGE = "VAT ratePercent must be a finite number from 0 to 100.";
const ROUNDING_MESSAGE = "roundingDecimals must be an integer from 0 to 6.";
const UNIT_LIST_MESSAGE = "unitListPriceSar must be a finite nonnegative number.";
const QUANTITY_MESSAGE = "quantity must be a finite nonnegative number.";

/** Input for {@link createProjectPricingConfig}; VAT and rounding may be omitted. */
export interface CreateProjectPricingConfigInput {
  mode: PricingMode;
  /** Margin or markup percentage (a percent number, e.g. 20 for 20%), per `mode`. */
  ratePercent: number;
  /** VAT percentage; defaults to {@link DEFAULT_PROJECT_VAT_RATE_PERCENT}. */
  vatRatePercent?: number;
  /** Currency rounding decimals; defaults to {@link DEFAULT_PROJECT_ROUNDING_DECIMALS}. */
  roundingDecimals?: number;
}

/** Per-line priced amounts for one accepted catalog SKU. All currency in SAR. */
export interface PricedLineAmounts {
  currency: typeof PROJECT_PRICING_CURRENCY;
  quantity: number;
  unitListPriceSar: number;
  extendedListPriceSar: number;
  unitSellPriceSar: number;
  extendedSellPriceSar: number;
  /** mode/percentages echoed as original percent numbers (not decimals). */
  pricingMode: PricingMode;
  ratePercent: number;
  vatRatePercent: number;
  vatAmountSar: number;
  totalIncVatSar: number;
}

/** Summary totals across a set of priced lines. All currency in SAR. */
export interface PricingSummaryTotals {
  currency: typeof PROJECT_PRICING_CURRENCY;
  lineCount: number;
  subtotalListPriceSar: number;
  subtotalSellPriceSar: number;
  vatAmountSar: number;
  totalIncVatSar: number;
}

/** Input for {@link calculateUnitSellPriceSar} and {@link calculatePricedLineAmounts}. */
export interface PricedLineInput {
  config: ProjectPricingConfig;
  unitListPriceSar: number;
  /** Required only by {@link calculatePricedLineAmounts}. */
  quantity?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate a pricing config against the SAR-only contract (section 9). Throws the
 * exact guard message for the first failing rule. Pure; does not mutate.
 */
export function validateProjectPricingConfig(config: ProjectPricingConfig): void {
  if (config.currency !== PROJECT_PRICING_CURRENCY) throw new Error(CURRENCY_MESSAGE);
  if (config.mode !== "margin" && config.mode !== "markup") throw new Error(MODE_MESSAGE);

  const rate = config.ratePercent;
  if (config.mode === "margin") {
    if (!isFiniteNumber(rate) || rate < 0 || rate >= 100) throw new Error(MARGIN_RATE_MESSAGE);
  } else {
    if (!isFiniteNumber(rate) || rate < 0 || rate > 100) throw new Error(MARKUP_RATE_MESSAGE);
  }

  const vat = config.vatRatePercent;
  if (!isFiniteNumber(vat) || vat < 0 || vat > 100) throw new Error(VAT_MESSAGE);

  const decimals = config.roundingDecimals;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new Error(ROUNDING_MESSAGE);
  }
}

/**
 * Build a full {@link ProjectPricingConfig} from the minimal input: forces SAR,
 * defaults VAT to 15 and rounding to 2, validates, returns a fresh object. Does
 * not mutate the input; `??` keeps an explicit 0 for VAT/rounding.
 */
export function createProjectPricingConfig(
  input: CreateProjectPricingConfigInput
): ProjectPricingConfig {
  const config: ProjectPricingConfig = {
    currency: PROJECT_PRICING_CURRENCY,
    mode: input.mode,
    ratePercent: input.ratePercent,
    vatRatePercent: input.vatRatePercent ?? DEFAULT_PROJECT_VAT_RATE_PERCENT,
    roundingDecimals: input.roundingDecimals ?? DEFAULT_PROJECT_ROUNDING_DECIMALS,
  };
  validateProjectPricingConfig(config);
  return config;
}

/**
 * Round a currency value to `decimals` places (default 2). The epsilon nudge
 * stabilizes binary-float half-cases for the nonnegative amounts this module
 * produces. Pure.
 */
export function roundCurrency(value: number, decimals = DEFAULT_PROJECT_ROUNDING_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Unit sell price (SAR), rounded to the config's decimals.
 *   margin: unitListPriceSar / (1 - rate)   (rate < 1, so no division by zero)
 *   markup: unitListPriceSar * (1 + rate)
 * Validates the config and the list price first. Pure.
 */
export function calculateUnitSellPriceSar(input: PricedLineInput): number {
  validateProjectPricingConfig(input.config);
  if (!isFiniteNumber(input.unitListPriceSar) || input.unitListPriceSar < 0) {
    throw new Error(UNIT_LIST_MESSAGE);
  }
  const rate = input.config.ratePercent / 100;
  const rawUnitSell =
    input.config.mode === "margin"
      ? input.unitListPriceSar / (1 - rate)
      : input.unitListPriceSar * (1 + rate);
  return roundCurrency(rawUnitSell, input.config.roundingDecimals);
}

/**
 * All priced amounts for one accepted catalog SKU line. Extended sell derives
 * from the rounded unit sell and VAT from the rounded extended sell, all at the
 * config's decimals; percentage fields echo the original percent numbers; a zero
 * list price prices to zero. Validates config, list price, and quantity first.
 * Pure; does not mutate input.
 */
export function calculatePricedLineAmounts(input: PricedLineInput): PricedLineAmounts {
  const { quantity } = input;
  if (!isFiniteNumber(quantity) || quantity < 0) throw new Error(QUANTITY_MESSAGE);

  const { config, unitListPriceSar } = input;
  const unitSellPriceSar = calculateUnitSellPriceSar(input);
  const decimals = config.roundingDecimals;

  const extendedSellPriceSar = roundCurrency(unitSellPriceSar * quantity, decimals);
  const vatRate = config.vatRatePercent / 100;
  const vatAmountSar = roundCurrency(extendedSellPriceSar * vatRate, decimals);

  return {
    currency: PROJECT_PRICING_CURRENCY,
    quantity,
    unitListPriceSar: roundCurrency(unitListPriceSar, decimals),
    extendedListPriceSar: roundCurrency(unitListPriceSar * quantity, decimals),
    unitSellPriceSar,
    extendedSellPriceSar,
    pricingMode: config.mode,
    ratePercent: config.ratePercent,
    vatRatePercent: config.vatRatePercent,
    vatAmountSar,
    totalIncVatSar: roundCurrency(extendedSellPriceSar + vatAmountSar, decimals),
  };
}

/**
 * Totals over already-priced lines: sums the rounded per-line extended/VAT/total
 * amounts, re-rounding each subtotal at the default decimals to absorb float
 * drift. Pure; does not mutate the input array.
 */
export function summarizePricedLineAmounts(
  lines: readonly PricedLineAmounts[]
): PricingSummaryTotals {
  let subtotalList = 0, subtotalSell = 0, vat = 0, total = 0;
  for (const line of lines) {
    subtotalList += line.extendedListPriceSar;
    subtotalSell += line.extendedSellPriceSar;
    vat += line.vatAmountSar;
    total += line.totalIncVatSar;
  }
  return {
    currency: PROJECT_PRICING_CURRENCY,
    lineCount: lines.length,
    subtotalListPriceSar: roundCurrency(subtotalList),
    subtotalSellPriceSar: roundCurrency(subtotalSell),
    vatAmountSar: roundCurrency(vat),
    totalIncVatSar: roundCurrency(total),
  };
}

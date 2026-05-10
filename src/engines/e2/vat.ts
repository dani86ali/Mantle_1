import { z } from "zod";

// ─── CS-009 ────────────────────────────────────────────────────────────────

const CalculateVATSchema = z.object({
  sellPrice: z.number().nonnegative(),
  /** Caller-supplied country rate (e.g. 0.15 KSA, 0.05 UAE, 0 for zero-rated/exempt). Never hardcoded. */
  vatRate: z.number().min(0).max(1),
});
export type CalculateVATInput = z.infer<typeof CalculateVATSchema>;

export type VATResult = {
  vatAmount: number;
  totalWithVat: number;
};

/**
 * CS-009: VAT — applies a country-specific rate to the sell price.
 *
 * Formula: vatAmount = sellPrice × vatRate; totalWithVat = sellPrice + vatAmount
 * TA ref: INPUT LISTS — global VAT config (KSA default 15%). Rate is caller-supplied;
 *   zero-rated and exempt items both pass vatRate = 0.
 */
export function calculateVAT(input: CalculateVATInput): VATResult {
  const { sellPrice, vatRate } = CalculateVATSchema.parse(input);
  const vatAmount = sellPrice * vatRate;
  return { vatAmount, totalWithVat: sellPrice + vatAmount };
}

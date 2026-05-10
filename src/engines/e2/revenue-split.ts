import { z } from "zod";

// ─── CS-008 ────────────────────────────────────────────────────────────────

const CalculateRevenueSplitSchema = z
  .object({
    sellAmount:      z.number().nonnegative(),
    stcsSplitPct:    z.number().min(0).max(1),
    partnerSplitPct: z.number().min(0).max(1),
  })
  .refine(
    (d) => Math.abs(d.stcsSplitPct + d.partnerSplitPct - 1) < 1e-9,
    { message: "stcsSplitPct + partnerSplitPct must equal 1" }
  );

export type CalculateRevenueSplitInput = z.infer<typeof CalculateRevenueSplitSchema>;

export type RevenueSplitResult = {
  stcsAmount:    number;
  partnerAmount: number;
};

/**
 * CS-008: Partition sell amount between STCS and a single partner.
 *
 * Formula: party_amount = sellAmount × splitPct  (tenant supplies the rates)
 * TA ref: FINANCIAL SUMMARY col V (Revenue Share Awarding Type), col W (OTC/MRC)
 *   Rates from INPUT LISTS: MS MRC=15%, MS OTC Extended=5%, 100% STC Scope=100%.
 *   bid_summary.giza_share_sar = sellAmount × giza_share_pct (partnerSplitPct).
 */
export function calculateRevenueSplit(
  input: CalculateRevenueSplitInput
): RevenueSplitResult {
  const { sellAmount, stcsSplitPct, partnerSplitPct } =
    CalculateRevenueSplitSchema.parse(input);
  return {
    stcsAmount:    sellAmount * stcsSplitPct,
    partnerAmount: sellAmount * partnerSplitPct,
  };
}

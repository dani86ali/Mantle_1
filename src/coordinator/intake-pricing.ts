import { getTenantConfig } from "@/lib/db/queries";
import type { E2PricingConfig } from "@/engines/e2/orchestrator";

export interface IntakePricingInput {
  country?: string;
  pricingConfig?: {
    fxRate: number;
    partnerDiscountPct: number;
    dealRegDiscountPct: number;
    profitMode: "margin" | "markup";
    profitPct: number;
    vatRate: number;
  };
}

async function defaultPricingConfig(
  tenantId: string,
  country?: string,
): Promise<E2PricingConfig> {
  const fallback: E2PricingConfig = {
    fxRate: 3.75,
    partnerDiscountPct: 0.35,
    dealRegDiscountPct: 0.08,
    profitMode: "margin",
    profitPct: 0.18,
    vatRate: 0.15,
    country: country ?? "SA",
  };
  try {
    const cfg = await getTenantConfig(tenantId);
    const p = cfg.pricingDefaults;
    if (!p) return fallback;
    return {
      fxRate: p.fxRate,
      partnerDiscountPct: p.partnerDiscountPct / 100,
      dealRegDiscountPct: p.dealRegDiscountPct / 100,
      profitMode: p.profitMode,
      profitPct: p.profitPct / 100,
      vatRate: p.vatRate / 100,
      country: country ?? "SA",
    };
  } catch {
    return fallback;
  }
}

export async function resolvePricingConfig(
  tenantId: string,
  req: IntakePricingInput,
): Promise<E2PricingConfig> {
  if (!req.pricingConfig) return defaultPricingConfig(tenantId, req.country);
  return {
    ...req.pricingConfig,
    country: req.country ?? "SA",
  };
}

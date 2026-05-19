import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";
import { loadEoxLookup } from "@/lib/data/eox-loader";

/** No end-of-life/end-of-sale SKUs in the BoM. Backed by data/cisco-eox.csv. */
export const eoxRule: ValidationRule = {
  id: "eox",
  name: "End-of-Life/Sale Status",
  description: "No EoX (end-of-life or end-of-sale) SKUs in the BoM",

  run(context: ValidationContext): ValidationResult[] {
    const lookup = loadEoxLookup();
    const results: ValidationResult[] = [];

    for (const line of context.lines) {
      const hit = lookup.checkSku(line.sku);
      if (!hit.isEox) continue;

      const migration = hit.migrationSku
        ? `. Suggested replacement: ${hit.migrationSku}`
        : "";

      results.push({
        ruleId: "eox",
        ruleName: "End-of-Life/Sale Status",
        severity: "error",
        passed: false,
        message: `SKU ${line.sku} is end-of-life (EoS: ${hit.endOfSaleDate ?? "unknown"})${migration}`,
        affectedLineIds: [line.id],
        details: {
          endOfSaleDate: hit.endOfSaleDate,
          endOfLifeDate: hit.endOfLifeDate,
          migrationSku: hit.migrationSku,
        },
      });
    }

    if (results.length === 0) {
      results.push({
        ruleId: "eox",
        ruleName: "End-of-Life/Sale Status",
        severity: "info",
        passed: true,
        message: "No end-of-life SKUs detected",
        affectedLineIds: [],
      });
    }

    return results;
  },
};

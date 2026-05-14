import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/** No end-of-life/end-of-sale SKUs in the BoM. */
export const eoxRule: ValidationRule = {
  id: "eox",
  name: "End-of-Life/Sale Status",
  description: "No EoX (end-of-life or end-of-sale) SKUs in the BoM",

  run(context: ValidationContext): ValidationResult[] {
    if (context.catalogData.size === 0 && context.lines.length > 0) {
      return [{
        ruleId: "eox",
        ruleName: "End-of-Life/Sale Status",
        severity: "warning",
        passed: false,
        message: "EoX status not verified — no catalog data available",
        affectedLineIds: context.lines.map((l) => l.id),
      }];
    }

    const results: ValidationResult[] = [];

    for (const line of context.lines) {
      const catalogItem = context.catalogData.get(line.sku);
      if (!catalogItem) continue;

      if (catalogItem.eoxStatus.isEox) {
        const migration = catalogItem.eoxStatus.migrationSku
          ? `. Suggested replacement: ${catalogItem.eoxStatus.migrationSku}`
          : "";

        results.push({
          ruleId: "eox",
          ruleName: "End-of-Life/Sale Status",
          severity: "error",
          passed: false,
          message: `SKU ${line.sku} is end-of-life (EoS: ${catalogItem.eoxStatus.endOfSaleDate ?? "unknown"})${migration}`,
          affectedLineIds: [line.id],
          details: {
            endOfSaleDate: catalogItem.eoxStatus.endOfSaleDate,
            endOfLifeDate: catalogItem.eoxStatus.endOfLifeDate,
            migrationSku: catalogItem.eoxStatus.migrationSku,
          },
        });
      }
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

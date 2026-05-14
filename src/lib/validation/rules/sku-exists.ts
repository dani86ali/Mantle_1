import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/** Every proposed SKU must exist in the Catalog API response. Catches hallucinated SKUs. */
export const skuExistsRule: ValidationRule = {
  id: "sku-exists",
  name: "SKU Existence",
  description: "Every proposed SKU must exist in the Catalog API response",

  run(context: ValidationContext): ValidationResult[] {
    if (context.catalogData.size === 0 && context.lines.length > 0) {
      return [{
        ruleId: "sku-exists",
        ruleName: "SKU Existence",
        severity: "warning",
        passed: false,
        message: "SKUs not verified against catalog — no catalog data available",
        affectedLineIds: context.lines.map((l) => l.id),
      }];
    }

    const results: ValidationResult[] = [];

    for (const line of context.lines) {
      const catalogItem = context.catalogData.get(line.sku);

      if (!catalogItem || !catalogItem.exists) {
        results.push({
          ruleId: "sku-exists",
          ruleName: "SKU Existence",
          severity: "error",
          passed: false,
          message: `SKU ${line.sku} not found in Cisco catalog`,
          affectedLineIds: [line.id],
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: "sku-exists",
        ruleName: "SKU Existence",
        severity: "info",
        passed: true,
        message: "All SKUs verified in Cisco catalog",
        affectedLineIds: [],
      });
    }

    return results;
  },
};

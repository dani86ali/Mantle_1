import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/** Every SKU must be available in the intake's region/country. */
export const regionRule: ValidationRule = {
  id: "region",
  name: "Region Availability",
  description: "Every SKU must be available in the intake region",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];
    const region = context.region.toUpperCase();

    // Map common country codes to Cisco region codes
    const regionMap: Record<string, string[]> = {
      SA: ["EMEAR", "MEA"],
      AE: ["EMEAR", "MEA"],
      BH: ["EMEAR", "MEA"],
      QA: ["EMEAR", "MEA"],
      OM: ["EMEAR", "MEA"],
      KW: ["EMEAR", "MEA"],
      GB: ["EMEAR"],
      DE: ["EMEAR"],
      FR: ["EMEAR"],
      US: ["AMER"],
      CA: ["AMER"],
      JP: ["APJC"],
      AU: ["APJC"],
      SG: ["APJC"],
      IN: ["APJC"],
    };

    const targetRegions = regionMap[context.country?.toUpperCase() ?? ""] ?? [region];

    for (const line of context.lines) {
      const catalogItem = context.catalogData.get(line.sku);
      if (!catalogItem) continue;

      const available = catalogItem.regionAvailability.some((r) =>
        targetRegions.includes(r.toUpperCase())
      );

      if (!available) {
        results.push({
          ruleId: "region",
          ruleName: "Region Availability",
          severity: "error",
          passed: false,
          message: `SKU ${line.sku} is not available in region ${region} (available: ${catalogItem.regionAvailability.join(", ")})`,
          affectedLineIds: [line.id],
          details: {
            targetRegion: region,
            availableRegions: catalogItem.regionAvailability,
          },
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: "region",
        ruleName: "Region Availability",
        severity: "info",
        passed: true,
        message: `All SKUs available in region ${region}`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

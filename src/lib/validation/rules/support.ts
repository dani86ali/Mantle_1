import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/**
 * Support attachment: SmartNet or equivalent service attached to hardware SKUs.
 *
 * Key insight from ground truth:
 * - No SmartNet on APs is a valid choice (deliberate, not an error)
 * - Switches typically require SmartNet (8x5xNBD for switching)
 * - Servers use 24x7x4 (different tier — but that's Phase 4)
 */
export const supportRule: ValidationRule = {
  id: "support",
  name: "Support Attachment",
  description: "Hardware SKUs should have SmartNet or equivalent support attached",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    const hardwareLines = context.lines.filter((line) => {
      const catalog = context.catalogData.get(line.sku);
      return catalog?.category === "hardware";
    });

    if (hardwareLines.length === 0) {
      return [
        {
          ruleId: "support",
          ruleName: "Support Attachment",
          severity: "info",
          passed: true,
          message: "No hardware lines — support rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Collect all support/service SKUs
    const serviceSkus = context.lines
      .filter((l) => l.category === "service" || l.sku.startsWith("CON-"))
      .map((l) => l.sku);

    for (const hwLine of hardwareLines) {
      const catalog = context.catalogData.get(hwLine.sku);
      const productFamily = catalog?.productFamily ?? "";

      // APs don't require SmartNet — it's a valid choice
      const isAp =
        productFamily.toLowerCase().includes("9120") ||
        productFamily.toLowerCase().includes("9130") ||
        productFamily.toLowerCase().includes("wireless") ||
        productFamily.toLowerCase().includes("access point") ||
        hwLine.sku.includes("C91") && hwLine.sku.includes("AX");

      if (isAp) {
        continue; // Skip APs — no SmartNet is valid
      }

      // Check if there's a matching service for this hardware
      const hasSupport = serviceSkus.some((sku) => {
        // CON-SNT-* pattern matches SmartNet
        return sku.startsWith("CON-");
      });

      if (!hasSupport) {
        results.push({
          ruleId: "support",
          ruleName: "Support Attachment",
          severity: "warning",
          passed: false,
          message: `Hardware SKU ${hwLine.sku} has no SmartNet or support contract attached`,
          affectedLineIds: [hwLine.id],
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: "support",
        ruleName: "Support Attachment",
        severity: "info",
        passed: true,
        message: "All applicable hardware has support contracts attached",
        affectedLineIds: [],
      });
    }

    return results;
  },
};

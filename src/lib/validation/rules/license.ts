import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/**
 * License attachment: every hardware SKU must have a license attached.
 *
 * Key insight from ground truth: DNA opt-out (e.g., C9120AX-DNA-OPTOUT)
 * is a VALID configuration — don't flag it as a missing license.
 */
export const licenseRule: ValidationRule = {
  id: "license",
  name: "License Attachment",
  description: "Every hardware SKU must have a license attached (or explicit opt-out)",

  run(context: ValidationContext): ValidationResult[] {
    if (context.catalogData.size === 0 && context.lines.length > 0) {
      return [{
        ruleId: "license",
        ruleName: "License Attachment",
        severity: "warning",
        passed: false,
        message: "License attachment not verified — no catalog data available",
        affectedLineIds: [],
      }];
    }

    const results: ValidationResult[] = [];

    const hardwareLines = context.lines.filter((line) => {
      const catalog = context.catalogData.get(line.sku);
      return catalog?.category === "hardware";
    });

    if (hardwareLines.length === 0) {
      return [
        {
          ruleId: "license",
          ruleName: "License Attachment",
          severity: "info",
          passed: true,
          message: "No hardware lines — license rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Collect all license and subscription SKUs in the BoM
    const licenseSkus = new Set(
      context.lines
        .filter(
          (l) => l.category === "license" || l.category === "subscription"
        )
        .map((l) => l.sku)
    );

    // Check for opt-out SKUs
    const hasOptOut = context.lines.some(
      (l) =>
        l.sku.includes("OPTOUT") ||
        l.sku.includes("OPT-OUT") ||
        l.description.toLowerCase().includes("opt out") ||
        l.description.toLowerCase().includes("opt-out")
    );

    for (const hwLine of hardwareLines) {
      const catalog = context.catalogData.get(hwLine.sku);
      const productFamily = catalog?.productFamily ?? "";

      // Check if this hardware has any associated license
      const hasLicense = context.lines.some((l) => {
        if (l.category !== "license" && l.category !== "subscription") {
          return false;
        }
        // Match on product family prefix (first segment, e.g., C9300L from C9300L-24UXG-4X-A)
        const hwPrefix = hwLine.sku.split("-")[0];
        return l.sku.startsWith(hwPrefix) || l.parentLineId === hwLine.id;
      });

      // AP-specific: opt-out is valid
      const isAp = productFamily.toLowerCase().includes("9120") ||
        productFamily.toLowerCase().includes("9130") ||
        productFamily.toLowerCase().includes("wireless") ||
        hwLine.sku.includes("C91");

      if (!hasLicense && !(isAp && hasOptOut)) {
        results.push({
          ruleId: "license",
          ruleName: "License Attachment",
          severity: "warning",
          passed: false,
          message: `Hardware SKU ${hwLine.sku} has no license attached. Expected Network Essentials/Advantage and/or DNA license.`,
          affectedLineIds: [hwLine.id],
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: "license",
        ruleName: "License Attachment",
        severity: "info",
        passed: true,
        message: "All hardware SKUs have licenses attached",
        affectedLineIds: [],
      });
    }

    return results;
  },
};

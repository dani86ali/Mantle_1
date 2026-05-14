import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/**
 * PSU redundancy: if redundancy is requested, verify that both primary
 * and secondary PSU SKUs are present for each chassis.
 *
 * Key insight from ground truth: redundant PSU = primary + secondary SKUs
 * (different part numbers, e.g., PWR-C1-1100WAC-P vs PWR-C1-1100WAC-P/2).
 */
export const psuRule: ValidationRule = {
  id: "psu",
  name: "PSU Redundancy",
  description: "If redundancy requested, PSU count must be ≥ 2× chassis count",

  run(context: ValidationContext): ValidationResult[] {
    if (context.catalogData.size === 0 && context.lines.length > 0) {
      return [{
        ruleId: "psu",
        ruleName: "PSU Redundancy",
        severity: "warning",
        passed: false,
        message: "PSU redundancy not verified — no catalog data available",
        affectedLineIds: [],
      }];
    }

    const results: ValidationResult[] = [];

    const redundancyRequired =
      context.requirements.redundancyRequired ??
      context.tenantStandards.requireRedundantPsu;

    if (!redundancyRequired) {
      return [
        {
          ruleId: "psu",
          ruleName: "PSU Redundancy",
          severity: "info",
          passed: true,
          message: "PSU redundancy not required — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Find hardware chassis lines
    const chassisLines = context.lines.filter((line) => {
      const catalog = context.catalogData.get(line.sku);
      return catalog?.category === "hardware" && catalog.psuData;
    });

    if (chassisLines.length === 0) {
      return [
        {
          ruleId: "psu",
          ruleName: "PSU Redundancy",
          severity: "info",
          passed: true,
          message: "No hardware chassis found — PSU rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Count PSU line items
    const psuLines = context.lines.filter(
      (line) =>
        line.sku.includes("PWR-") ||
        line.description.toLowerCase().includes("power supply")
    );

    const primaryPsuCount = psuLines
      .filter((l) => !l.sku.includes("/2"))
      .reduce((sum, l) => sum + l.quantity, 0);

    const secondaryPsuCount = psuLines
      .filter((l) => l.sku.includes("/2"))
      .reduce((sum, l) => sum + l.quantity, 0);

    const totalChassis = chassisLines.reduce(
      (sum, l) => sum + l.quantity,
      0
    );

    if (secondaryPsuCount < totalChassis) {
      results.push({
        ruleId: "psu",
        ruleName: "PSU Redundancy",
        severity: "error",
        passed: false,
        message: `Redundant PSU required: need ${totalChassis} secondary PSU(s) but found ${secondaryPsuCount}. Each chassis needs a secondary PSU (e.g., PWR-C1-1100WAC-P/2).`,
        affectedLineIds: chassisLines.map((l) => l.id),
        details: {
          totalChassis,
          primaryPsuCount,
          secondaryPsuCount,
        },
      });
    }

    if (primaryPsuCount < totalChassis) {
      results.push({
        ruleId: "psu",
        ruleName: "PSU Redundancy",
        severity: "error",
        passed: false,
        message: `Missing primary PSU: need ${totalChassis} primary PSU(s) but found ${primaryPsuCount}`,
        affectedLineIds: chassisLines.map((l) => l.id),
      });
    }

    if (results.length === 0) {
      results.push({
        ruleId: "psu",
        ruleName: "PSU Redundancy",
        severity: "info",
        passed: true,
        message: `PSU redundancy satisfied: ${primaryPsuCount} primary + ${secondaryPsuCount} secondary for ${totalChassis} chassis`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

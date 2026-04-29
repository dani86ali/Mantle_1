import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/**
 * Stacking: if stacking is requested, verify stacking cables are present
 * and count matches the topology.
 *
 * Key insight from ground truth:
 * - Stacking = kit + modules + cables (three separate line items)
 * - Module count = 2 per switch
 * - Cable count depends on topology (ring vs chain)
 */
export const stackingRule: ValidationRule = {
  id: "stacking",
  name: "Stacking",
  description: "If stacking requested, verify stacking components are present",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!context.requirements.stackingRequired) {
      return [
        {
          ruleId: "stacking",
          ruleName: "Stacking",
          severity: "info",
          passed: true,
          message: "Stacking not required — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Find stackable chassis
    const stackableLines = context.lines.filter((line) => {
      const catalog = context.catalogData.get(line.sku);
      return catalog?.stackingData?.stackable;
    });

    if (stackableLines.length === 0) {
      // Check if any hardware is in the BoM at all
      const hwLines = context.lines.filter(
        (l) => l.category === "hardware"
      );
      if (hwLines.length > 0) {
        results.push({
          ruleId: "stacking",
          ruleName: "Stacking",
          severity: "warning",
          passed: false,
          message:
            "Stacking requested but no stackable hardware found in BoM",
          affectedLineIds: hwLines.map((l) => l.id),
        });
      }
      return results;
    }

    const totalSwitches = stackableLines.reduce(
      (sum, l) => sum + l.quantity,
      0
    );

    // Check for stacking kit
    const stackKitLines = context.lines.filter(
      (l) =>
        l.sku.includes("STACK-KIT") || l.sku.includes("STACK-PLUS-KIT")
    );
    const totalStackKits = stackKitLines.reduce(
      (sum, l) => sum + l.quantity,
      0
    );

    if (totalStackKits < totalSwitches) {
      results.push({
        ruleId: "stacking",
        ruleName: "Stacking",
        severity: "error",
        passed: false,
        message: `Stacking kit missing: need ${totalSwitches} kits but found ${totalStackKits}`,
        affectedLineIds: stackableLines.map((l) => l.id),
      });
    }

    // Check for stack modules (2 per switch)
    const stackModuleLines = context.lines.filter(
      (l) =>
        l.sku.match(/STACK$/) ||
        (l.sku.includes("STACK") &&
          !l.sku.includes("KIT") &&
          !l.sku.includes("CABLE") &&
          !l.sku.includes("T3") &&
          !l.sku.includes("T1"))
    );
    const totalModules = stackModuleLines.reduce(
      (sum, l) => sum + l.quantity,
      0
    );
    const requiredModules = totalSwitches * 2;

    if (totalModules < requiredModules) {
      results.push({
        ruleId: "stacking",
        ruleName: "Stacking",
        severity: "error",
        passed: false,
        message: `Stack modules insufficient: need ${requiredModules} (2 per switch) but found ${totalModules}`,
        affectedLineIds: stackableLines.map((l) => l.id),
      });
    }

    // Check for stacking cables
    const stackCableLines = context.lines.filter(
      (l) =>
        l.sku.includes("STACK-T") ||
        l.description.toLowerCase().includes("stacking cable")
    );
    const totalCables = stackCableLines.reduce(
      (sum, l) => sum + l.quantity,
      0
    );

    // Minimum cables: N switches need N cables for a ring, N-1 for a chain
    if (totalCables < totalSwitches - 1) {
      results.push({
        ruleId: "stacking",
        ruleName: "Stacking",
        severity: "error",
        passed: false,
        message: `Stacking cables insufficient: need at least ${totalSwitches - 1} cables for ${totalSwitches} switches but found ${totalCables}`,
        affectedLineIds: stackableLines.map((l) => l.id),
      });
    }

    if (results.length === 0) {
      results.push({
        ruleId: "stacking",
        ruleName: "Stacking",
        severity: "info",
        passed: true,
        message: `Stacking configuration complete: ${totalStackKits} kits, ${totalModules} modules, ${totalCables} cables for ${totalSwitches} switches`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

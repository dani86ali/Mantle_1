import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/**
 * Optics count: SFP/QSFP transceiver line items must not exceed
 * the chassis slot count.
 */
export const opticsRule: ValidationRule = {
  id: "optics",
  name: "Optics Count",
  description: "Transceiver count must not exceed chassis SFP/QSFP slots",

  run(context: ValidationContext): ValidationResult[] {
    if (context.catalogData.size === 0 && context.lines.length > 0) {
      return [{
        ruleId: "optics",
        ruleName: "Optics Count",
        severity: "warning",
        passed: false,
        message: "Optics count not verified — no catalog data available",
        affectedLineIds: [],
      }];
    }

    const results: ValidationResult[] = [];

    // Find chassis lines that have optics data
    const chassisLines = context.lines.filter((line) => {
      const catalog = context.catalogData.get(line.sku);
      return catalog?.opticsData && catalog.opticsData.totalTransceiverSlots > 0;
    });

    if (chassisLines.length === 0) {
      return [
        {
          ruleId: "optics",
          ruleName: "Optics Count",
          severity: "info",
          passed: true,
          message: "No chassis with optics slots — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Count total optics/transceiver line items
    const opticSkuPatterns = [
      /^SFP/i,
      /^GLC/i,
      /^QSFP/i,
      /^C9300.*10G/i,
      /transceiver/i,
    ];

    const opticLines = context.lines.filter((line) =>
      opticSkuPatterns.some((p) => p.test(line.sku) || p.test(line.description))
    );

    const totalOptics = opticLines.reduce((sum, l) => sum + l.quantity, 0);
    const totalSlots = chassisLines.reduce((sum, l) => {
      const catalog = context.catalogData.get(l.sku)!;
      return sum + catalog.opticsData!.totalTransceiverSlots * l.quantity;
    }, 0);

    if (totalOptics > totalSlots) {
      results.push({
        ruleId: "optics",
        ruleName: "Optics Count",
        severity: "error",
        passed: false,
        message: `Transceiver count (${totalOptics}) exceeds available slots (${totalSlots})`,
        affectedLineIds: [
          ...chassisLines.map((l) => l.id),
          ...opticLines.map((l) => l.id),
        ],
        details: { totalOptics, totalSlots },
      });
    } else {
      results.push({
        ruleId: "optics",
        ruleName: "Optics Count",
        severity: "info",
        passed: true,
        message: `Optics count OK (${totalOptics} of ${totalSlots} slots used)`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

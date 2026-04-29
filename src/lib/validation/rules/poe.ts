import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";

/**
 * PoE math: for each switch chassis, verify that the PSU PoE budget
 * is sufficient for the number of PoE ports claimed.
 *
 * Standard PoE classes and max power draw:
 * - Class 0: 15.4W
 * - Class 1: 4W
 * - Class 2: 7W
 * - Class 3: 15.4W
 * - Class 4 (PoE+): 30W
 * - Class 5-8 (UPoE): 60-90W
 */
export const poeRule: ValidationRule = {
  id: "poe",
  name: "PoE Budget",
  description: "PSU PoE budget must cover connected device power requirements",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Only check hardware lines that have PoE data
    const switchLines = context.lines.filter((line) => {
      const catalog = context.catalogData.get(line.sku);
      return catalog?.poeData && catalog.poeData.poeBudgetWatts > 0;
    });

    if (switchLines.length === 0) {
      return [
        {
          ruleId: "poe",
          ruleName: "PoE Budget",
          severity: "info",
          passed: true,
          message: "No PoE switches in BoM — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    for (const line of switchLines) {
      const catalog = context.catalogData.get(line.sku)!;
      const poe = catalog.poeData!;

      // Default to PoE+ (30W per port) if no class specified
      const wattsPerPort = getWattsPerPort(
        context.requirements.poeClass ?? "class4"
      );
      const totalRequired = poe.poePortCount * wattsPerPort;

      if (totalRequired > poe.poeBudgetWatts) {
        results.push({
          ruleId: "poe",
          ruleName: "PoE Budget",
          severity: "warning",
          passed: false,
          message: `SKU ${line.sku}: PoE budget ${poe.poeBudgetWatts}W may be insufficient for ${poe.poePortCount} ports at ${wattsPerPort}W each (${totalRequired}W needed). Consider higher-watt PSU or reducing port load.`,
          affectedLineIds: [line.id],
          details: {
            poeBudgetWatts: poe.poeBudgetWatts,
            poePortCount: poe.poePortCount,
            wattsPerPort,
            totalRequired,
          },
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: "poe",
        ruleName: "PoE Budget",
        severity: "info",
        passed: true,
        message: "PoE budget sufficient for all switches",
        affectedLineIds: [],
      });
    }

    return results;
  },
};

function getWattsPerPort(poeClass: string): number {
  const classMap: Record<string, number> = {
    class0: 15.4,
    class1: 4,
    class2: 7,
    class3: 15.4,
    class4: 30,
    class5: 45,
    class6: 60,
    class7: 75,
    class8: 90,
  };
  return classMap[poeClass.toLowerCase()] ?? 30;
}

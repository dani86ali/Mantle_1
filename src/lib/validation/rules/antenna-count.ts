import { z } from "zod";
import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";
import rawSpecs from "../../../../docs/BOMATIC_Device_Specs.json";

const ApSpecSchema = z.object({
  model: z.string(),
  antennas_needed: z.number().int().min(0),
  antenna_sku: z.string().optional(),
});

const AP_SPECS = z.array(ApSpecSchema).parse(rawSpecs.cisco_wireless_aps);

function findApSpec(sku: string) {
  return AP_SPECS.find((s) => sku === s.model || sku.startsWith(s.model + "-"));
}

export const antennaCountRule: ValidationRule = {
  id: "antenna-count",
  name: "Antenna Count",
  description:
    "External-antenna APs need antennas_needed × AP-qty antenna SKUs in BoM. Internal-antenna models (antennas_needed = 0) are skipped.",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    const apLines = context.lines.filter((line) => {
      const spec = findApSpec(line.sku);
      return spec && spec.antennas_needed > 0 && line.category === "hardware";
    });

    if (apLines.length === 0) {
      return [
        {
          ruleId: "antenna-count",
          ruleName: "Antenna Count",
          severity: "info",
          passed: true,
          message: "No external-antenna APs in BoM — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    for (const apLine of apLines) {
      const spec = findApSpec(apLine.sku)!;
      if (!spec.antenna_sku) continue;

      const requiredQty = apLine.quantity * spec.antennas_needed;
      const antennaLines = context.lines.filter((l) => l.sku === spec.antenna_sku);
      const actualQty = antennaLines.reduce((sum, l) => sum + l.quantity, 0);

      if (actualQty !== requiredQty) {
        results.push({
          ruleId: "antenna-count",
          ruleName: "Antenna Count",
          severity: "error",
          passed: false,
          message: `${apLine.sku} × ${apLine.quantity}: needs ${requiredQty} antennas (${spec.antennas_needed} per AP) but found ${actualQty} × ${spec.antenna_sku}`,
          affectedLineIds: [apLine.id, ...antennaLines.map((l) => l.id)],
          details: {
            apSku: apLine.sku,
            apQty: apLine.quantity,
            antennasPerAp: spec.antennas_needed,
            antennaSku: spec.antenna_sku,
            requiredQty,
            actualQty,
          },
        });
      }
    }

    if (results.length === 0) {
      const total = apLines.reduce((sum, l) => sum + l.quantity * findApSpec(l.sku)!.antennas_needed, 0);
      results.push({
        ruleId: "antenna-count",
        ruleName: "Antenna Count",
        severity: "info",
        passed: true,
        message: `Antenna count correct: ${total} antennas for ${apLines.length} AP model(s)`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

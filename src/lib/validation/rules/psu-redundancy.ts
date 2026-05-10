import { z } from "zod";
import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";
import rawSpecs from "../../../../docs/BOMATIC_Device_Specs.json";

// Verifies that redundant PSU uses different SKUs for primary and secondary slots.
// Ground truth (Shahid §3 + psu_rules): redundant = primary SKU + secondary /2 SKU,
// NOT 2× the same primary SKU.

const SwitchPsuSpecSchema = z.object({
  model: z.string(),
  psu_default: z.string().optional(),
  psu_redundant: z.string().optional(),
});

const SWITCH_PSU_SPECS = z.array(SwitchPsuSpecSchema).parse([
  ...rawSpecs.cisco_switches.catalyst_9300,
  ...rawSpecs.cisco_switches.catalyst_9300L,
  ...rawSpecs.cisco_switches.catalyst_9300X,
]);

function findSwitchPsuSpec(sku: string) {
  return SWITCH_PSU_SPECS.find(
    (s) => sku === s.model || sku.startsWith(s.model + "-")
  );
}

export const psuRedundancyRule: ValidationRule = {
  id: "psu-redundancy",
  name: "PSU Redundancy (SKU Check)",
  description:
    "When multiple PSUs are ordered for a switch, primary and secondary SKUs must differ.",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    const switchLines = context.lines.filter((line) => {
      if (line.category !== "hardware") return false;
      const spec = findSwitchPsuSpec(line.sku);
      return spec?.psu_default !== undefined && spec?.psu_redundant !== undefined;
    });

    if (switchLines.length === 0) {
      return [
        {
          ruleId: "psu-redundancy",
          ruleName: "PSU Redundancy (SKU Check)",
          severity: "info",
          passed: true,
          message: "No switches with redundant PSU spec in BoM — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Group by spec model so multiple lines of the same model sum correctly
    type SwitchGroup = {
      specModel: string;
      psuDefault: string;
      psuRedundant: string;
      chassisQty: number;
      lineIds: string[];
    };
    const groups = new Map<string, SwitchGroup>();

    for (const swLine of switchLines) {
      const spec = findSwitchPsuSpec(swLine.sku)!;
      const existing = groups.get(spec.model) ?? {
        specModel: spec.model,
        psuDefault: spec.psu_default!,
        psuRedundant: spec.psu_redundant!,
        chassisQty: 0,
        lineIds: [],
      };
      existing.chassisQty += swLine.quantity;
      existing.lineIds.push(swLine.id);
      groups.set(spec.model, existing);
    }

    for (const group of Array.from(groups.values())) {
      const primaryLines = context.lines.filter((l) => l.sku === group.psuDefault);
      const secondaryLines = context.lines.filter((l) => l.sku === group.psuRedundant);

      const primaryQty = primaryLines.reduce((sum, l) => sum + l.quantity, 0);
      const secondaryQty = secondaryLines.reduce((sum, l) => sum + l.quantity, 0);

      // Error: more primary PSUs than chassis (implying 2× primary instead of primary + secondary)
      // with no secondary PSU ordered at all
      if (primaryQty > group.chassisQty && secondaryQty === 0) {
        results.push({
          ruleId: "psu-redundancy",
          ruleName: "PSU Redundancy (SKU Check)",
          severity: "error",
          passed: false,
          message:
            `${group.specModel}: found ${primaryQty} × ${group.psuDefault} but ` +
            `secondary PSU (${group.psuRedundant}) is absent — ` +
            `use ${group.psuDefault} × ${group.chassisQty} + ${group.psuRedundant} × ${group.chassisQty}`,
          affectedLineIds: [...group.lineIds, ...primaryLines.map((l) => l.id)],
          details: {
            specModel: group.specModel,
            psuDefault: group.psuDefault,
            psuRedundant: group.psuRedundant,
            chassisQty: group.chassisQty,
            primaryQty,
            secondaryQty,
          },
        });
      }
    }

    if (results.length === 0) {
      const totalChassis = Array.from(groups.values()).reduce(
        (s, g) => s + g.chassisQty,
        0
      );
      results.push({
        ruleId: "psu-redundancy",
        ruleName: "PSU Redundancy (SKU Check)",
        severity: "info",
        passed: true,
        message: `PSU SKU redundancy correct for ${totalChassis} chassis`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

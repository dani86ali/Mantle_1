import { z } from "zod";
import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";
import rawSpecs from "../../../../docs/BOMATIC_Device_Specs.json";

const SwitchSpecSchema = z.object({
  model: z.string(),
  fans: z.number().int().min(0),
  // fan_sku is absent on some models (e.g. C9300X) — skip those silently
  fan_sku: z.string().optional(),
});

// Flatten all switch families into one lookup table
const SWITCH_SPECS = z
  .array(SwitchSpecSchema)
  .parse([
    ...rawSpecs.cisco_switches.catalyst_9300,
    ...rawSpecs.cisco_switches.catalyst_9300L,
    ...rawSpecs.cisco_switches.catalyst_9300X,
  ]);

function findSwitchSpec(sku: string) {
  return SWITCH_SPECS.find((s) => sku === s.model || sku.startsWith(s.model + "-"));
}

export const fanCountRule: ValidationRule = {
  id: "fan-count",
  name: "Fan Count",
  description:
    "Switch chassis must include fans × switch-qty fan SKUs in BoM. Missing or wrong count is a warning (not an error).",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    const switchLines = context.lines.filter((line) => {
      const spec = findSwitchSpec(line.sku);
      // Only process specs that have a known fan SKU
      return spec && spec.fan_sku && spec.fans > 0 && line.category === "hardware";
    });

    if (switchLines.length === 0) {
      return [
        {
          ruleId: "fan-count",
          ruleName: "Fan Count",
          severity: "info",
          passed: true,
          message: "No switch chassis with known fan SKUs in BoM — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    // Group by fan_sku so multiple switch models sharing the same fan SKU are checked together
    type FanGroup = { fanSku: string; requiredQty: number; switchLineIds: string[] };
    const fanGroups = new Map<string, FanGroup>();

    for (const swLine of switchLines) {
      const spec = findSwitchSpec(swLine.sku)!;
      const fanSku = spec.fan_sku!;
      const existing = fanGroups.get(fanSku) ?? { fanSku, requiredQty: 0, switchLineIds: [] };
      existing.requiredQty += swLine.quantity * spec.fans;
      existing.switchLineIds.push(swLine.id);
      fanGroups.set(fanSku, existing);
    }

    for (const group of Array.from(fanGroups.values())) {
      const fanLines = context.lines.filter((l) => l.sku === group.fanSku);
      const actualQty = fanLines.reduce((sum, l) => sum + l.quantity, 0);

      if (actualQty !== group.requiredQty) {
        results.push({
          ruleId: "fan-count",
          ruleName: "Fan Count",
          severity: "warning",
          passed: false,
          // Note: ground truth (Shahid §3) uses FAN-T2; specs list C9300L-FAN-1RU — data discrepancy, rule follows specs.
          message: `Fan module count incorrect: need ${group.requiredQty} × ${group.fanSku} but found ${actualQty}`,
          affectedLineIds: [...group.switchLineIds, ...fanLines.map((l) => l.id)],
          details: {
            fanSku: group.fanSku,
            requiredQty: group.requiredQty,
            actualQty,
          },
        });
      }
    }

    if (results.length === 0) {
      const total = Array.from(fanGroups.values()).reduce((sum, g) => sum + g.requiredQty, 0);
      results.push({
        ruleId: "fan-count",
        ruleName: "Fan Count",
        severity: "info",
        passed: true,
        message: `Fan count correct: ${total} fan module(s) across ${switchLines.length} switch model(s)`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

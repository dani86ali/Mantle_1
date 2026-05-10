import { z } from "zod";
import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";
import rawSpecs from "../../../../docs/BOMATIC_Device_Specs.json";

// Ground truth (Shahid §3 + stacking_rules in Device Specs):
// C9300L needs: kit (1 per switch) + C9300L-STACK adapters (2 per switch) + cables
// C9300 needs: cables only (StackWise ports are built-in, no separate kit or adapters)
// Rule triggers on "multiple switches of same model" — not on requirements.stackingRequired.

const SwitchStackSpecSchema = z.object({
  model: z.string(),
  stack_kit_needed: z.boolean().optional(),
  stack_kit_sku: z.string().optional(),
});

const SWITCH_STACK_SPECS = z.array(SwitchStackSpecSchema).parse([
  ...rawSpecs.cisco_switches.catalyst_9300,
  ...rawSpecs.cisco_switches.catalyst_9300L,
  ...rawSpecs.cisco_switches.catalyst_9300X,
]);

function findStackSpec(sku: string) {
  return SWITCH_STACK_SPECS.find(
    (s) => sku === s.model || sku.startsWith(s.model + "-")
  );
}

export const stackingRule: ValidationRule = {
  id: "stacking",
  name: "Stacking",
  description:
    "When multiple switches of the same model are present, verifies stacking kit, modules (2/switch), and cables.",

  run(context: ValidationContext): ValidationResult[] {
    const results: ValidationResult[] = [];

    const switchLines = context.lines.filter((line) => {
      if (line.category !== "hardware") return false;
      return findStackSpec(line.sku) !== undefined;
    });

    // Group by spec model (C9300L-24UXG-4X covers -A, -E licence variants)
    type SwitchGroup = {
      specModel: string;
      spec: (typeof SWITCH_STACK_SPECS)[0];
      totalQty: number;
      lineIds: string[];
    };
    const groups = new Map<string, SwitchGroup>();

    for (const line of switchLines) {
      const spec = findStackSpec(line.sku)!;
      const existing = groups.get(spec.model) ?? {
        specModel: spec.model,
        spec,
        totalQty: 0,
        lineIds: [],
      };
      existing.totalQty += line.quantity;
      existing.lineIds.push(line.id);
      groups.set(spec.model, existing);
    }

    const stackingGroups = Array.from(groups.values()).filter(
      (g) => g.totalQty > 1
    );

    if (stackingGroups.length === 0) {
      return [
        {
          ruleId: "stacking",
          ruleName: "Stacking",
          severity: "info",
          passed: true,
          message: "No switch groups with multiple units — stacking not applicable",
          affectedLineIds: [],
        },
      ];
    }

    for (const group of stackingGroups) {
      const N = group.totalQty;

      if (group.spec.stack_kit_needed === true) {
        const kitSku = group.spec.stack_kit_sku ?? "C9300L-STACK-KIT";
        const kitLines = context.lines.filter((l) => l.sku === kitSku);
        const kitQty = kitLines.reduce((sum, l) => sum + l.quantity, 0);

        if (kitQty < N) {
          results.push({
            ruleId: "stacking",
            ruleName: "Stacking",
            severity: "error",
            passed: false,
            message: `${group.specModel} × ${N}: stacking kit (${kitSku}) missing — need ${N}, found ${kitQty}`,
            affectedLineIds: [...group.lineIds, ...kitLines.map((l) => l.id)],
          });
        }

        // Stack adapters (e.g. C9300L-STACK): 2 per switch, only for kit-required models
        const moduleFamily = group.specModel.split("-")[0]; // "C9300L"
        const moduleSku = `${moduleFamily}-STACK`;
        const moduleLines = context.lines.filter((l) => l.sku === moduleSku);
        const moduleQty = moduleLines.reduce((sum, l) => sum + l.quantity, 0);
        const requiredModules = N * 2;

        if (moduleQty < requiredModules) {
          results.push({
            ruleId: "stacking",
            ruleName: "Stacking",
            severity: "error",
            passed: false,
            message: `${group.specModel} × ${N}: stack adapters (${moduleSku}) insufficient — need ${requiredModules} (2 per switch), found ${moduleQty}`,
            affectedLineIds: [...group.lineIds, ...moduleLines.map((l) => l.id)],
          });
        }
      }

      // Stacking cables: required for all stackable switch families
      const cableLines = context.lines.filter(
        (l) =>
          l.sku.startsWith("STACK-T") ||
          l.description.toLowerCase().includes("stacking cable")
      );
      const cableQty = cableLines.reduce((sum, l) => sum + l.quantity, 0);

      if (cableQty === 0) {
        results.push({
          ruleId: "stacking",
          ruleName: "Stacking",
          severity: "error",
          passed: false,
          message: `${group.specModel} × ${N}: no stacking cables found — ring needs ${N}, chain needs ${N - 1}`,
          affectedLineIds: group.lineIds,
        });
      } else if (cableQty < N) {
        // Present but fewer than ring topology requires — flag as warning (chain is valid)
        results.push({
          ruleId: "stacking",
          ruleName: "Stacking",
          severity: "warning",
          passed: false,
          message: `${group.specModel} × ${N}: ${cableQty} stacking cable(s) — ring topology needs ${N} (chain needs ${N - 1})`,
          affectedLineIds: [...group.lineIds, ...cableLines.map((l) => l.id)],
        });
      }
    }

    if (results.length === 0) {
      const total = stackingGroups.reduce((s, g) => s + g.totalQty, 0);
      results.push({
        ruleId: "stacking",
        ruleName: "Stacking",
        severity: "info",
        passed: true,
        message: `Stacking configuration valid: ${total} switches in ${stackingGroups.length} stack group(s)`,
        affectedLineIds: [],
      });
    }

    return results;
  },
};

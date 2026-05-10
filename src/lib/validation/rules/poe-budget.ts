import { z } from "zod";
import type { ValidationRule, ValidationContext, ValidationResult } from "@/types/validation";
import rawSpecs from "../../../../docs/BOMATIC_Device_Specs.json";

// Scope: AP PoE draw only. poe_device_draw_reference entries (phones, cameras) are
// keyed by device type, not Cisco SKU, so they cannot be matched against BoM lines.

const SwitchPoESpecSchema = z.object({
  model: z.string(),
  poe_budget_default_w: z.number().min(0),
});

const SWITCH_POE_SPECS = z.array(SwitchPoESpecSchema).parse([
  ...rawSpecs.cisco_switches.catalyst_9300,
  ...rawSpecs.cisco_switches.catalyst_9300L,
  ...rawSpecs.cisco_switches.catalyst_9300X,
]);

const ApPoESpecSchema = z.object({
  model: z.string(),
  poe_draw_w: z.number().min(0),
});

const AP_POE_SPECS = z.array(ApPoESpecSchema).parse(rawSpecs.cisco_wireless_aps);

function findSwitchPoESpec(sku: string) {
  return SWITCH_POE_SPECS.find(
    (s) => sku === s.model || sku.startsWith(s.model + "-")
  );
}

function findApPoESpec(sku: string) {
  return AP_POE_SPECS.find(
    (s) => sku === s.model || sku.startsWith(s.model + "-")
  );
}

export const poeBudgetRule: ValidationRule = {
  id: "poe-budget",
  name: "PoE Budget (Device Draw)",
  description:
    "Sum AP PoE draws from BoM against total switch PoE budget (system-wide — no topology assumed).",

  run(context: ValidationContext): ValidationResult[] {
    const switchLines = context.lines.filter((line) => {
      if (line.category !== "hardware") return false;
      const spec = findSwitchPoESpec(line.sku);
      return spec !== undefined && spec.poe_budget_default_w > 0;
    });

    if (switchLines.length === 0) {
      return [
        {
          ruleId: "poe-budget",
          ruleName: "PoE Budget (Device Draw)",
          severity: "info",
          passed: true,
          message: "No PoE switches in BoM — rule not applicable",
          affectedLineIds: [],
        },
      ];
    }

    const totalBudgetW = switchLines.reduce((sum, line) => {
      const spec = findSwitchPoESpec(line.sku)!;
      return sum + spec.poe_budget_default_w * line.quantity;
    }, 0);

    const apLines = context.lines.filter((line) => {
      if (line.category !== "hardware") return false;
      return findApPoESpec(line.sku) !== undefined;
    });

    if (apLines.length === 0) {
      const switchCount = switchLines.reduce((s, l) => s + l.quantity, 0);
      return [
        {
          ruleId: "poe-budget",
          ruleName: "PoE Budget (Device Draw)",
          severity: "info",
          passed: true,
          message: `PoE budget available: ${totalBudgetW}W across ${switchCount} switch(es) — no PoE devices in BoM`,
          affectedLineIds: [],
        },
      ];
    }

    const totalDrawW = apLines.reduce((sum, line) => {
      const spec = findApPoESpec(line.sku)!;
      return sum + spec.poe_draw_w * line.quantity;
    }, 0);

    const utilizationPct = totalDrawW / totalBudgetW;
    const pctDisplay = Math.round(utilizationPct * 100);
    const switchLineIds = switchLines.map((l) => l.id);
    const apLineIds = apLines.map((l) => l.id);
    const details = { totalBudgetW, totalDrawW, utilizationPct: pctDisplay };

    if (totalDrawW > totalBudgetW) {
      return [
        {
          ruleId: "poe-budget",
          ruleName: "PoE Budget (Device Draw)",
          severity: "error",
          passed: false,
          message: `PoE budget exceeded: ${totalDrawW}W required but only ${totalBudgetW}W available (${pctDisplay}%)`,
          affectedLineIds: [...switchLineIds, ...apLineIds],
          details,
        },
      ];
    }

    if (utilizationPct > 0.8) {
      return [
        {
          ruleId: "poe-budget",
          ruleName: "PoE Budget (Device Draw)",
          severity: "warning",
          passed: false,
          message: `PoE budget at ${pctDisplay}%: ${totalDrawW}W of ${totalBudgetW}W — approaching limit`,
          affectedLineIds: [...switchLineIds, ...apLineIds],
          details,
        },
      ];
    }

    return [
      {
        ruleId: "poe-budget",
        ruleName: "PoE Budget (Device Draw)",
        severity: "info",
        passed: true,
        message: `PoE budget OK: ${totalDrawW}W of ${totalBudgetW}W used (${pctDisplay}%)`,
        affectedLineIds: [],
        details,
      },
    ];
  },
};

/**
 * Deterministic validation engine.
 *
 * Runs all 9 validation rules against a candidate BoM.
 * NO LLM calls — every rule is deterministic with a traceable source of truth.
 * LLM is used for fix suggestions only (in the agent's fix loop).
 */

import type {
  ValidationResult,
  ValidationContext,
  ValidationRule,
} from "@/types/validation";

import { skuExistsRule } from "./rules/sku-exists";
import { eoxRule } from "./rules/eox";
import { regionRule } from "./rules/region";
import { poeRule } from "./rules/poe";
import { opticsRule } from "./rules/optics";
import { psuRule } from "./rules/psu";
import { licenseRule } from "./rules/license";
import { stackingRule } from "./rules/stacking";
import { supportRule } from "./rules/support";

const ALL_RULES: ValidationRule[] = [
  skuExistsRule,
  eoxRule,
  regionRule,
  poeRule,
  opticsRule,
  psuRule,
  licenseRule,
  stackingRule,
  supportRule,
];

export function runValidation(
  context: ValidationContext,
  rules?: ValidationRule[]
): ValidationResult[] {
  const rulesToRun = rules ?? ALL_RULES;
  const results: ValidationResult[] = [];

  for (const rule of rulesToRun) {
    const ruleResults = rule.run(context);
    results.push(...ruleResults);
  }

  return results;
}

export function summarizeResults(results: ValidationResult[]): {
  passed: number;
  warnings: number;
  errors: number;
  overallStatus: "pass" | "warning" | "error";
} {
  let passed = 0;
  let warnings = 0;
  let errors = 0;

  for (const r of results) {
    if (r.passed) passed++;
    else if (r.severity === "warning") warnings++;
    else errors++;
  }

  const overallStatus =
    errors > 0 ? "error" : warnings > 0 ? "warning" : "pass";

  return { passed, warnings, errors, overallStatus };
}

export { ALL_RULES };

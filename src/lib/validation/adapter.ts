import type {
  ValidationRule,
  ValidationRuleId,
  ValidationResult,
  ValidationSeverity,
} from "@/types/validation";

export interface SimpleRuleResult {
  valid: boolean;
  severity: ValidationSeverity;
  message: string;
}

export function adaptSimpleRule(
  simpleFn: (lines: unknown) => SimpleRuleResult,
  ruleId: ValidationRuleId,
  name: string,
  description: string
): ValidationRule {
  return {
    id: ruleId,
    name,
    description,
    run(context): ValidationResult[] {
      const result = simpleFn(context.lines);
      return [
        {
          ruleId,
          ruleName: name,
          severity: result.severity,
          passed: result.valid,
          message: result.message,
          affectedLineIds: [],
        },
      ];
    },
  };
}

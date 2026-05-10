import { z } from "zod";

const InputSchema = z.array(z.object({ sku: z.string() }).passthrough());

export type DnaOptoutResult = {
  valid: boolean;
  severity: "info" | "warning" | "error";
  message: string;
};

// Matches any SKU ending in -DNA-OPTOUT (e.g., C9120AX-DNA-OPTOUT)
const DNA_OPTOUT_PATTERN = /^.+-DNA-OPTOUT$/i;

export function checkDnaOptout(lines: unknown): DnaOptoutResult {
  const parsed = InputSchema.parse(lines);
  const hasOptout = parsed.some((line) => DNA_OPTOUT_PATTERN.test(line.sku));

  if (hasOptout) {
    return {
      valid: true,
      severity: "info",
      message: "DNA subscription opted out — intentional",
    };
  }

  return {
    valid: true,
    severity: "info",
    message: "No DNA opt-out SKU present — standard license check applies",
  };
}

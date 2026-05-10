import { z } from "zod";

const InputSchema = z.array(z.object({ sku: z.string() }).passthrough());

export type ApOnlyResult = {
  valid: boolean;
  severity: "info" | "warning" | "error";
  message: string;
};

// Cisco Catalyst wireless AP families (C9120, C9130, C9136, C9166, C9176)
const AP_PATTERN = /^C9(120|130|136|166|176)/i;
// Catalyst 9800 wireless controller (C9800-L, C9800-40, C9800-80, C9800-CL)
const CONTROLLER_PATTERN = /^C9800/i;

export function checkApOnly(lines: unknown): ApOnlyResult {
  const parsed = InputSchema.parse(lines);

  const hasAps = parsed.some((line) => AP_PATTERN.test(line.sku));
  const hasController = parsed.some((line) => CONTROLLER_PATTERN.test(line.sku));

  if (!hasAps) {
    return {
      valid: true,
      severity: "info",
      message: "No AP SKUs detected — AP-only rule not applicable",
    };
  }

  if (hasController) {
    return {
      valid: true,
      severity: "info",
      message: "Wireless controller present — AP-only rule not applicable",
    };
  }

  return {
    valid: true,
    severity: "info",
    message: "AP-only estimate — controller assumed separate",
  };
}

import { z } from "zod";

const InputSchema = z.array(z.object({ sku: z.string() }).passthrough());

export type LicenseDepsResult = {
  valid: boolean;
  severity: "info" | "warning" | "error";
  message: string;
};

// Matches C9300- and C9300L- switch hardware (not C9300X)
const SWITCH_PATTERN = /^C9300L?-/i;
// Matches NW license SKUs for either family: C9300*-NW-* or C9300L*-NW-*
const NW_LICENSE_PATTERN = /^C9300L?.*-NW-/i;
// Matches DNA license SKUs; negative lookahead excludes -DNA-OPTOUT
const DNA_LICENSE_PATTERN = /^C9300L?.*-DNA-(?!OPTOUT)/i;
// Matches explicit DNA opt-out for any product family
const DNA_OPTOUT_PATTERN = /^.+-DNA-OPTOUT$/i;

export function checkLicenseDeps(lines: unknown): LicenseDepsResult {
  const parsed = InputSchema.parse(lines);

  const hasSwitches = parsed.some((l) => SWITCH_PATTERN.test(l.sku));

  if (!hasSwitches) {
    return {
      valid: true,
      severity: "info",
      message: "No C9300/C9300L switches in BoM — license-deps rule not applicable",
    };
  }

  const hasNwLicense = parsed.some((l) => NW_LICENSE_PATTERN.test(l.sku));
  const hasDnaOptout = parsed.some((l) => DNA_OPTOUT_PATTERN.test(l.sku));
  const hasDnaLicense = parsed.some((l) => DNA_LICENSE_PATTERN.test(l.sku));

  const errors: string[] = [];

  if (!hasNwLicense) {
    errors.push("Network license (C9300*-NW-*) missing");
  }

  if (!hasDnaOptout && !hasDnaLicense) {
    errors.push("DNA license (C9300*-DNA-*) missing and no DNA-OPTOUT present");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      severity: "error",
      message: `C9300/C9300L license requirement(s) unmet: ${errors.join("; ")}`,
    };
  }

  return {
    valid: true,
    severity: "info",
    message: "C9300/C9300L license requirements satisfied",
  };
}

import { z } from "zod";

export interface EoxLookup {
  checkSku(sku: string): { isEox: boolean; eoxDate?: string; replacement?: string };
}

export const stubEoxLookup: EoxLookup = {
  checkSku(_sku: string) {
    return { isEox: false };
  },
};

const InputSchema = z.array(z.object({ sku: z.string() }).passthrough());

export type EoxCheckResult = {
  valid: boolean;
  severity: "info" | "warning" | "error";
  message: string;
};

export function checkEox(
  lines: unknown,
  lookup: EoxLookup = stubEoxLookup
): EoxCheckResult {
  const parsed = InputSchema.parse(lines);

  type EoxHit = { sku: string; eoxDate?: string; replacement?: string };
  const hits: EoxHit[] = [];

  for (const line of parsed) {
    const result = lookup.checkSku(line.sku);
    if (result.isEox) {
      hits.push({ sku: line.sku, eoxDate: result.eoxDate, replacement: result.replacement });
    }
  }

  if (hits.length === 0) {
    return { valid: true, severity: "info", message: "No end-of-life SKUs detected" };
  }

  const details = hits.map(({ sku, eoxDate, replacement }) => {
    const base = `${sku} (EoS: ${eoxDate ?? "unknown"})`;
    return replacement ? `${base} → suggested replacement: ${replacement}` : base;
  });

  return {
    valid: false,
    severity: "warning",
    message: `EoX SKU(s) detected: ${details.join("; ")}`,
  };
}

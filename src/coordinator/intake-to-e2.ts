/**
 * Shared mapping from stored intake requirements to E2 device inputs.
 * Used by both the initial intake pipeline run and the E2 re-run endpoint.
 */

import type {
  E2Device,
  E2DeviceConfig,
} from "@/engines/e2/orchestrator";

export interface IntakeRequirementsForE2 {
  redundancyRequired?: boolean;
  dnaTier?: string;
  licenseTier?: "essentials" | "advantage";
  supportTerm?: string;
  uploadedBomLines?: { sku: string; quantity: number }[];
  quantities?: { description: string; quantity: number }[];
  keyNeeds?: string;
}

const DNA_MAP: Record<string, E2DeviceConfig["dnaTier"]> = {
  essentials: "essentials",
  advantage: "advantage",
  opt_out: "optout",
};

const TERM_MAP: Record<string, 3 | 5 | 7> = {
  "3yr": 3, "3": 3, "5yr": 5, "5": 5, "7yr": 7, "7": 7,
};

export function buildDeviceConfig(req: IntakeRequirementsForE2): E2DeviceConfig {
  return {
    redundantPsu: req.redundancyRequired,
    dnaTier: req.dnaTier ? DNA_MAP[req.dnaTier] ?? "advantage" : "advantage",
    networkTier: req.licenseTier ?? "advantage",
    licenseTerm: req.supportTerm ? (TERM_MAP[req.supportTerm] ?? 5) : 5,
    supportCriticality: "standard",
    vendor: "cisco",
  };
}

export function devicesFromIntake(req: IntakeRequirementsForE2): E2Device[] {
  const config = buildDeviceConfig(req);
  if (req.uploadedBomLines && req.uploadedBomLines.length > 0) {
    return req.uploadedBomLines.map((l) => ({
      model: l.sku, qty: l.quantity, config,
    }));
  }
  if (req.quantities && req.quantities.length > 0) {
    return req.quantities.map((q) => ({
      model: q.description, qty: q.quantity, config,
    }));
  }
  return [];
}

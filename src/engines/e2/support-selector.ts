import { z } from "zod";

export interface SupportLine {
  sku: string;
  description: string;
  qty: number;
  termMonths: number;
  tier: string;
}

const ConfigSchema = z.object({
  criticality: z.enum(["standard", "mission_critical", "none"]),
  term: z.union([z.literal(12), z.literal(36), z.literal(60)]),
  vendor: z.enum(["cisco", "fortinet"]),
});

export type SupportConfig = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  model: z.string().min(1),
  qty: z.number().int().positive(),
});

// Verified Cisco SmartNet model encodings (source: shahid-cisco-ground-truth.md §3)
const CISCO_ENCODED: Record<string, string> = {
  "C9300L-24UXG-4X": "C93024GA",
};

function encodeForCisco(model: string): string {
  return CISCO_ENCODED[model] ?? model.replace(/-/g, "");
}

// FortiGate-201F → F201F  (FC-10-{modelCode}-{svc}-02)
function encodeForFortinet(model: string): string {
  const suffix = model.split("-").slice(1).join("");
  return "F" + suffix;
}

export function selectSupport(
  model: string,
  qty: number,
  config: { criticality: "standard" | "mission_critical" | "none"; term: 12 | 36 | 60; vendor: "cisco" | "fortinet" }
): SupportLine[] {
  InputSchema.parse({ model, qty });
  ConfigSchema.parse(config);

  const { criticality, term, vendor } = config;

  if (criticality === "none") return [];

  if (vendor === "cisco") {
    const prefix = criticality === "mission_critical" ? "CON-SSSNT" : "CON-SNT";
    const tier = criticality === "mission_critical" ? "SmartNet 24x7x4" : "SmartNet 8x5xNBD";
    const desc = criticality === "mission_critical"
      ? `Cisco SMARTnet 24x7x4 — ${model}`
      : `Cisco SMARTnet 8x5xNBD — ${model}`;

    return [{
      sku: `${prefix}-${encodeForCisco(model)}`,
      description: desc,
      qty,
      termMonths: term,
      tier,
    }];
  }

  // Fortinet
  const serviceCode = criticality === "mission_critical" ? "284" : "247";
  const tier = criticality === "mission_critical" ? "FortiCare Elite" : "FortiCare Premium 24x7";
  const desc = criticality === "mission_critical"
    ? `FortiCare Elite — ${model}`
    : `FortiCare Premium 24x7 — ${model}`;

  return [{
    sku: `FC-10-${encodeForFortinet(model)}-${serviceCode}-02`,
    description: desc,
    qty,
    termMonths: term,
    tier,
  }];
}

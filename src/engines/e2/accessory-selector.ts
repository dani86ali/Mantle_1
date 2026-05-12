import { z } from "zod";
import specsJson from "../../../docs/BOMATIC_Device_Specs.json";
import { normalizeModel } from "@/lib/utils/normalize-model";

export interface AccessoryLine {
  sku: string;
  description: string;
  qtyPerUnit: number;
  totalQty: number;
  category: string;
}

export const OptionsSchema = z.object({
  redundantPsu:  z.boolean().optional(),
  rackMount:     z.boolean().optional(),
  powerCordType: z.string().optional(),
  antennaType:   z.string().optional(),
});

export type AccessoryOptions = z.infer<typeof OptionsSchema>;

const InputSchema = z.object({
  model: z.string().min(1),
  qty:   z.number().int().positive(),
});

// Minimal shape used by this selector — optional fields come from JSON
interface DeviceSpec {
  model:          string;
  psu_default?:   string;
  psu_redundant?: string;
  fans?:          number;
  fan_sku?:       string;
  antenna?:       string;
  antennas_needed?: number;
  antenna_sku?:   string;
}

type DeviceClass = "switch" | "ap" | "fortigate";

const SWITCHES = [
  ...(specsJson.cisco_switches.catalyst_9300  as unknown as DeviceSpec[]),
  ...(specsJson.cisco_switches.catalyst_9300L as unknown as DeviceSpec[]),
  ...(specsJson.cisco_switches.catalyst_9300X as unknown as DeviceSpec[]),
];

const APS = specsJson.cisco_wireless_aps as unknown as DeviceSpec[];

const FORTIGATES = specsJson.fortigate_firewalls as unknown as DeviceSpec[];

function lookup(model: string): { spec: DeviceSpec; cls: DeviceClass } {
  for (const s of SWITCHES) {
    if (model === s.model) return { spec: s, cls: "switch" };
  }
  for (const s of APS) {
    if (model === s.model) return { spec: s, cls: "ap" };
  }
  for (const s of FORTIGATES) {
    if (model === s.model) return { spec: s, cls: "fortigate" };
  }
  throw new Error(`Unknown model: ${model}`);
}

// Strip "FG-" prefix to get the bare model code used in Fortinet accessory SKUs
function fgSuffix(model: string): string {
  return model.replace(/^FG-/, "");
}

function acc(sku: string, description: string, qtyPerUnit: number, units: number): AccessoryLine {
  return { sku, description, qtyPerUnit, totalQty: qtyPerUnit * units, category: "accessory" };
}

const DEFAULT_CORD = "CAB-TA-UK";

export function selectAccessories(
  model: string,
  qty: number,
  options: AccessoryOptions = {}
): AccessoryLine[] {
  InputSchema.parse({ model, qty });
  OptionsSchema.parse(options);

  const { spec, cls } = lookup(normalizeModel(model));
  const { powerCordType = DEFAULT_CORD } = options;
  const redundantPsu = options.redundantPsu === true;

  // Only honour redundant-PSU request when spec has a secondary SKU
  const hasRedundant = redundantPsu && !!spec.psu_redundant;

  const out: AccessoryLine[] = [];

  if (cls === "switch") {
    if (spec.psu_default) {
      out.push(acc(spec.psu_default, "Primary power supply", 1, qty));
    }
    if (hasRedundant) {
      out.push(acc(spec.psu_redundant!, "Redundant power supply", 1, qty));
    }
    if (spec.fans !== undefined && spec.fan_sku) {
      out.push(acc(spec.fan_sku, "Fan module", spec.fans, qty));
    }
    // 1 cord per installed PSU
    const psuCount = hasRedundant ? 2 : 1;
    out.push(acc(powerCordType, "Power cord", psuCount, qty));

    // Rack accessories (always included for 1RU Catalyst 9K chassis)
    out.push(acc("C9K-ACC-SCR-4",   "Rack mount screws",  1, qty));
    out.push(acc("CAB-GUIDE-1RU",   "1RU cable guide",    1, qty));
    out.push(acc("C9K-ACC-RBFT",    "Rubber feet",        1, qty));
    out.push(acc("C9300L-SSD-NONE", "SSD option — none",  1, qty));
  } else if (cls === "ap") {
    out.push(acc("AIR-AP-BRACKET-1", "Low profile mount bracket",       1, qty));
    out.push(acc("AIR-AP-T-RAIL-R",  "Ceiling T-rail clip (recessed)",  1, qty));

    if (spec.antenna === "external" && spec.antennas_needed && spec.antenna_sku) {
      out.push(acc(spec.antenna_sku, "External antenna", spec.antennas_needed, qty));
    }
  } else {
    // FortiGate: generic SKU patterns; no fans/SSD/rubber feet
    const suffix = fgSuffix(spec.model);
    const psuCount = redundantPsu ? 2 : 1;
    out.push(acc(`FG-SP-${suffix}`, "Power supply", psuCount, qty));
    out.push(acc(`SP-FGR-${suffix}-KIT`, "Rack mount kit", 1, qty));
    out.push(acc(powerCordType, "Power cord", psuCount, qty));
  }

  return out;
}

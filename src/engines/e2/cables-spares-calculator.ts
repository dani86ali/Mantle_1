import { z } from "zod";

export interface CableLine {
  sku: string;
  description: string;
  qty: number;
  category: "cable";
  type: "patch" | "trunk" | "stacking" | "power" | "console";
}

export interface SpareLine {
  sku: string;
  description: string;
  qty: number;
  category: "spare";
}

const DeviceSchema = z.object({
  model: z.string().min(1),
  qty: z.number().int().positive(),
  role: z.enum(["access", "distribution", "core", "ap"]),
});

export type CableDevice = z.infer<typeof DeviceSchema>;

const CablesInputSchema = z.object({
  devices: z.array(DeviceSchema),
  rackCount: z.number().int().positive().optional(),
});

const BomLineSchema = z.object({
  sku: z.string().min(1),
  qty: z.number().int().nonnegative(),
  category: z.string().min(1),
});

export type BomLineForSpares = z.infer<typeof BomLineSchema>;

const SparesInputSchema = z.object({
  bomLines: z.array(BomLineSchema),
  spareRate: z.number().min(0).max(1),
});

const UPLINK_PATCH_SKU = "CAB-ETH-S-RJ45=";
const CONSOLE_SKU      = "CAB-CON-RJ45";
const TRUNK_SKU        = "CAB-ETH-TRUNK-10M";
const AP_PATCH_SKU     = "CAB-C6A-3M";

const SWITCH_ROLES = new Set<CableDevice["role"]>(["access", "distribution", "core"]);

export function calculateCables(
  devices: CableDevice[],
  rackCount?: number
): CableLine[] {
  CablesInputSchema.parse({ devices, rackCount });

  let switchCount = 0;
  let apCount = 0;
  const uniqueSwitchModels = new Set<string>();

  for (const d of devices) {
    if (SWITCH_ROLES.has(d.role)) {
      switchCount += d.qty;
      uniqueSwitchModels.add(d.model);
    } else if (d.role === "ap") {
      apCount += d.qty;
    }
  }

  const lines: CableLine[] = [];

  if (switchCount > 0) {
    lines.push({
      sku: UPLINK_PATCH_SKU,
      description: "RJ45 patch cable (redundant uplink)",
      qty: switchCount * 2,
      category: "cable",
      type: "patch",
    });
    lines.push({
      sku: CONSOLE_SKU,
      description: "RJ45 console management cable",
      qty: uniqueSwitchModels.size,
      category: "cable",
      type: "console",
    });
  }

  if (apCount > 0) {
    lines.push({
      sku: AP_PATCH_SKU,
      description: "Cat6A 3m patch cable for access point",
      qty: apCount,
      category: "cable",
      type: "patch",
    });
  }

  if (rackCount !== undefined && rackCount > 1) {
    const pairs = (rackCount * (rackCount - 1)) / 2;
    lines.push({
      sku: TRUNK_SKU,
      description: "10m inter-rack trunk cable",
      qty: pairs,
      category: "cable",
      type: "trunk",
    });
  }

  return lines;
}

const SPARE_ALLOWED_CATEGORIES = new Set(["hardware", "accessory"]);
const SPARE_MIN_QTY = 10;

export function calculateSpares(
  bomLines: BomLineForSpares[],
  spareRate: number = 0.05
): SpareLine[] {
  SparesInputSchema.parse({ bomLines, spareRate });

  const lines: SpareLine[] = [];

  for (const line of bomLines) {
    if (!SPARE_ALLOWED_CATEGORIES.has(line.category)) continue;
    if (line.qty < SPARE_MIN_QTY) continue;

    const spareQty = Math.ceil(line.qty * spareRate);
    if (spareQty < 1) continue;

    lines.push({
      sku: line.sku,
      description: `Spare for ${line.sku}`,
      qty: spareQty,
      category: "spare",
    });
  }

  return lines;
}

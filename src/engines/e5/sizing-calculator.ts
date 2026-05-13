/**
 * E5 — Deterministic sizing calculator.
 *
 * Pure function. Maps a {@link SizingInput} + topology + vendor to a
 * {@link SizingResult} (access / distribution / core / firewall / wireless).
 *
 * Rules encoded:
 *   • Access ports:  ceil(portCount * 1.2)  (20% headroom — sizing_guidelines.switches)
 *   • Firewall:      size by NGFW throughput, 1.5x bandwidth for 3-year growth
 *   • Wireless:      1 AP per 40 users (office density) + 20% overlap
 *   • Core/dist:     always HA pair (qty 2 minimum)
 *
 * No I/O, no AI calls, no side effects — values come from device-specs.ts.
 */
import { z } from 'zod';
import {
  CISCO_ACCESS_SWITCHES,
  CISCO_CORE_SWITCHES,
  CISCO_WIRELESS_APS,
  FORTIGATE_FIREWALLS,
  CISCO_FIREWALLS,
  FIREWALL_SIZING_TIERS,
  AP_DENSITY,
  SWITCH_HEADROOM,
  FIREWALL_GROWTH_FACTOR,
} from '@/engines/e5/device-specs';
import {
  SizingInputSchema,
  TopologyPatternSchema,
  type SizingInput,
  type SizingResult,
  type DeviceSelection,
  type TopologyPattern,
} from '@/engines/e5/types';

const VendorSchema = z.enum(['cisco', 'fortinet']);
export type SizingVendor = z.infer<typeof VendorSchema>;

function pickAccessSwitch(totalPorts: number): { model: string; ports: number } {
  // Prefer PoE 48-port (covers wireless/phones). 24-port for small sites.
  const preferred = totalPorts <= 24 ? 'C9300-24P' : 'C9300-48P';
  const spec = CISCO_ACCESS_SWITCHES.find((s) => s.model === preferred)!;
  return { model: spec.model, ports: spec.ports };
}

function pickCoreModel(topology: TopologyPattern): string {
  switch (topology) {
    case 'two_tier_collapsed_core': return 'C9500-24Y4C';
    case 'three_tier_core_dist_access': return 'C9500-32C';
    case 'fat_tree_superpod':       return 'C9500-32C';
    case 'slingshot_dragonfly':     return 'C9500-32C';
    case 'hub_and_spoke_gpon':      return 'C9500-24Y4C';
    case 'ot_it_segmented':         return 'C9500-24Y4C';
  }
}

function pickFortigate(bandwidthMbps: number): string {
  const tier = FIREWALL_SIZING_TIERS.find((t) => bandwidthMbps <= t.bandwidthMbpsMax);
  return tier?.recommended ?? FIREWALL_SIZING_TIERS[FIREWALL_SIZING_TIERS.length - 1].recommended;
}

function pickCiscoFirewall(bandwidthGbps: number): string {
  // Reference tiers from Design_Patterns.md §6.2 — match by NGFW throughput.
  const tier = CISCO_FIREWALLS.find((fw) => bandwidthGbps <= fw.ngfwGbps);
  return tier?.model ?? CISCO_FIREWALLS[CISCO_FIREWALLS.length - 1].model;
}

function pickApModel(): string {
  return CISCO_WIRELESS_APS[0].model; // C9120AXI — Shahid's reference / Wi-Fi 6 default
}

function pickWirelessController(apCount: number): { model: string; qty: number } {
  if (apCount <= 250) return { model: 'C9800-L', qty: 1 };
  return { model: 'C9800-40', qty: Math.max(1, Math.ceil(apCount / 1000)) };
}

/**
 * Calculate device quantities and models for an E5 design pass.
 *
 * @param input    User/port/bandwidth/site counts and flags.
 * @param topology Selected topology pattern (decision tree output).
 * @param vendor   Vendor lock — affects firewall selection only.
 * @returns        Grouped device selections with reasoning strings.
 */
export function calculateSizing(
  input: SizingInput,
  topology: TopologyPattern,
  vendor: SizingVendor,
): SizingResult {
  const i = SizingInputSchema.parse(input);
  const t = TopologyPatternSchema.parse(topology);
  const v = VendorSchema.parse(vendor);

  // ── Access switches ────────────────────────────────────────────────
  const totalPorts = Math.ceil(i.portCount * SWITCH_HEADROOM);
  const access = pickAccessSwitch(totalPorts);
  const accessQty = totalPorts === 0 ? 0 : Math.ceil(totalPorts / access.ports);
  const accessDevices: DeviceSelection[] = accessQty > 0 ? [{
    role: 'access',
    model: access.model,
    vendor: 'cisco',
    quantity: accessQty,
    reasoning: `${i.portCount} requested ports × ${SWITCH_HEADROOM} headroom = ${totalPorts}; ${access.model} provides ${access.ports} ports each → ⌈${totalPorts}/${access.ports}⌉ = ${accessQty}.`,
  }] : [];

  // ── Core (always HA pair) ──────────────────────────────────────────
  const coreModel = pickCoreModel(t);
  const coreDevices: DeviceSelection[] = [{
    role: 'core',
    model: coreModel,
    vendor: 'cisco',
    quantity: 2,
    reasoning: `Topology=${t} → ${coreModel} core pair (HA active/active).`,
  }];

  // ── Distribution (three-tier only) ─────────────────────────────────
  const distributionDevices: DeviceSelection[] = [];
  if (t === 'three_tier_core_dist_access') {
    const perSite = i.idfRoomsPerFloor && i.idfRoomsPerFloor > 0 ? i.idfRoomsPerFloor : 2;
    const distQty = Math.max(2, perSite * Math.max(1, i.siteCount));
    distributionDevices.push({
      role: 'distribution',
      model: 'C9500-24Y4C',
      vendor: 'cisco',
      quantity: distQty,
      reasoning: `Three-tier topology with ${i.siteCount} site(s) × ${perSite} distribution pair(s) per site = ${distQty}.`,
    });
  }

  // ── Firewalls (always HA pair) ─────────────────────────────────────
  const grownGbps = i.bandwidthGbps * FIREWALL_GROWTH_FACTOR;
  const grownMbps = grownGbps * 1000;
  const fwModel = v === 'fortinet' ? pickFortigate(grownMbps) : pickCiscoFirewall(grownGbps);
  const fwVendor = v === 'fortinet' ? 'fortinet' : 'cisco';
  const fwSpec = v === 'fortinet'
    ? FORTIGATE_FIREWALLS.find((f) => f.model === fwModel)
    : CISCO_FIREWALLS.find((f) => f.model === fwModel);
  const fwReason = `Bandwidth ${i.bandwidthGbps} Gbps × ${FIREWALL_GROWTH_FACTOR} growth = ${grownGbps} Gbps → ${fwModel} (NGFW ${fwSpec?.ngfwGbps ?? '?'} Gbps).`;
  const firewalls: DeviceSelection[] = [{
    role: 'firewall',
    model: fwModel,
    vendor: fwVendor,
    quantity: 2,
    reasoning: fwReason,
  }];

  // ── Wireless (only when hasWireless) ───────────────────────────────
  const accessPoints: DeviceSelection[] = [];
  const wirelessControllers: DeviceSelection[] = [];
  if (i.hasWireless && i.userCount > 0) {
    const apCount = Math.ceil((i.userCount / AP_DENSITY.office) * SWITCH_HEADROOM);
    const apModel = pickApModel();
    accessPoints.push({
      role: 'access_point',
      model: apModel,
      vendor: 'cisco',
      quantity: apCount,
      reasoning: `${i.userCount} users ÷ ${AP_DENSITY.office} users/AP × ${SWITCH_HEADROOM} overlap = ${apCount} APs (${apModel}, Wi-Fi 6).`,
    });
    const wlc = pickWirelessController(apCount);
    wirelessControllers.push({
      role: 'wireless_controller',
      model: wlc.model,
      vendor: 'cisco',
      quantity: wlc.qty,
      reasoning: `${apCount} APs → ${wlc.model} (${apCount <= 250 ? '≤250 APs' : '1 controller per 1000 APs'}).`,
    });
  }

  return {
    coreDevices,
    distributionDevices,
    accessDevices,
    firewalls,
    wirelessControllers,
    accessPoints,
  };
}

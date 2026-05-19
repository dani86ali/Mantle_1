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
 * Each DeviceSelection carries both the bare `model` (for traceability /
 * sizing arithmetic) and a concrete `orderableSku` (for catalog lookup).
 * Tier defaults per device class:
 *   • switches: 'advantage'  (STC typical bid; coordinator/E2 may downgrade)
 *   • APs:      'domain_e'   (MEA / ETSI regulatory domain)
 *   • firewalls/WLCs: 'standard'
 *
 * No I/O, no AI calls, no side effects — values come from device-specs.ts.
 */
import { z } from 'zod';
import {
  CISCO_ACCESS_SWITCHES,
  CISCO_CORE_SWITCHES,
  CISCO_WIRELESS_APS,
  CISCO_WIRELESS_CONTROLLERS,
  FORTIGATE_FIREWALLS,
  CISCO_FIREWALLS,
  FIREWALL_SIZING_TIERS,
  AP_DENSITY,
  SWITCH_HEADROOM,
  FIREWALL_GROWTH_FACTOR,
  type AccessSwitchSpec,
  type CoreSwitchSpec,
  type WirelessApSpec,
  type FortigateFirewallSpec,
  type CiscoFirewallSpec,
  type WirelessControllerSpec,
} from '@/engines/e5/device-specs';
import { resolveOrderableSku } from '@/engines/e5/orderable-sku-resolver';
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

const SWITCH_TIER = 'advantage', AP_TIER = 'domain_e', FW_TIER = 'standard', WLC_TIER = 'standard';

const CORE_BY_TOPOLOGY: Record<TopologyPattern, string> = {
  two_tier_collapsed_core:     'C9500-24Y4C',
  three_tier_core_dist_access: 'C9500-32C',
  fat_tree_superpod:           'C9500-32C',
  slingshot_dragonfly:         'C9500-32C',
  hub_and_spoke_gpon:          'C9500-24Y4C',
  ot_it_segmented:             'C9500-24Y4C',
};

const pickAccessSwitch = (totalPorts: number): AccessSwitchSpec =>
  CISCO_ACCESS_SWITCHES.find((s) => s.model === (totalPorts <= 24 ? 'C9300-24P' : 'C9300-48P'))!;

const pickCoreSpec = (topology: TopologyPattern): CoreSwitchSpec =>
  CISCO_CORE_SWITCHES.find((s) => s.model === CORE_BY_TOPOLOGY[topology])!;

function pickFortigateSpec(bandwidthMbps: number): FortigateFirewallSpec {
  const tier = FIREWALL_SIZING_TIERS.find((t) => bandwidthMbps <= t.bandwidthMbpsMax);
  const model = tier?.recommended ?? FIREWALL_SIZING_TIERS[FIREWALL_SIZING_TIERS.length - 1].recommended;
  return FORTIGATE_FIREWALLS.find((f) => f.model === model)!;
}

// Reference tiers from Design_Patterns.md §6.2 — match by NGFW throughput.
const pickCiscoFirewallSpec = (bandwidthGbps: number): CiscoFirewallSpec =>
  CISCO_FIREWALLS.find((f) => bandwidthGbps <= f.ngfwGbps) ?? CISCO_FIREWALLS[CISCO_FIREWALLS.length - 1];

const pickApSpec = (): WirelessApSpec => CISCO_WIRELESS_APS[0]; // C9120AXI — Wi-Fi 6 default

function pickWlcSpec(apCount: number): { spec: WirelessControllerSpec; qty: number } {
  if (apCount <= 250) return { spec: CISCO_WIRELESS_CONTROLLERS.find((w) => w.model === 'C9800-L')!, qty: 1 };
  return { spec: CISCO_WIRELESS_CONTROLLERS.find((w) => w.model === 'C9800-40')!, qty: Math.max(1, Math.ceil(apCount / 1000)) };
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
  const accessSpec = pickAccessSwitch(totalPorts);
  const accessQty = totalPorts === 0 ? 0 : Math.ceil(totalPorts / accessSpec.ports);
  const accessDevices: DeviceSelection[] = accessQty > 0 ? [{
    role: 'access',
    model: accessSpec.model,
    orderableSku: resolveOrderableSku({ ...accessSpec, tier: SWITCH_TIER }),
    vendor: 'cisco',
    quantity: accessQty,
    reasoning: `${i.portCount} requested ports × ${SWITCH_HEADROOM} headroom = ${totalPorts}; ${accessSpec.model} provides ${accessSpec.ports} ports each → ⌈${totalPorts}/${accessSpec.ports}⌉ = ${accessQty}.`,
  }] : [];

  // ── Core (always HA pair) ──────────────────────────────────────────
  const coreSpec = pickCoreSpec(t);
  const coreDevices: DeviceSelection[] = [{
    role: 'core',
    model: coreSpec.model,
    orderableSku: resolveOrderableSku({ ...coreSpec, tier: SWITCH_TIER }),
    vendor: 'cisco',
    quantity: 2,
    reasoning: `Topology=${t} → ${coreSpec.model} core pair (HA active/active).`,
  }];

  // ── Distribution (three-tier only) ─────────────────────────────────
  const distributionDevices: DeviceSelection[] = [];
  if (t === 'three_tier_core_dist_access') {
    const perSite = i.idfRoomsPerFloor && i.idfRoomsPerFloor > 0 ? i.idfRoomsPerFloor : 2;
    const distQty = Math.max(2, perSite * Math.max(1, i.siteCount));
    const distSpec = CISCO_CORE_SWITCHES.find((s) => s.model === 'C9500-24Y4C')!;
    distributionDevices.push({
      role: 'distribution',
      model: distSpec.model,
      orderableSku: resolveOrderableSku({ ...distSpec, tier: SWITCH_TIER }),
      vendor: 'cisco',
      quantity: distQty,
      reasoning: `Three-tier topology with ${i.siteCount} site(s) × ${perSite} distribution pair(s) per site = ${distQty}.`,
    });
  }

  // ── Firewalls (always HA pair) ─────────────────────────────────────
  const grownGbps = i.bandwidthGbps * FIREWALL_GROWTH_FACTOR;
  const grownMbps = grownGbps * 1000;
  const fwSpec = v === 'fortinet' ? pickFortigateSpec(grownMbps) : pickCiscoFirewallSpec(grownGbps);
  const fwVendor = v === 'fortinet' ? 'fortinet' : 'cisco';
  const fwReason = `Bandwidth ${i.bandwidthGbps} Gbps × ${FIREWALL_GROWTH_FACTOR} growth = ${grownGbps} Gbps → ${fwSpec.model} (NGFW ${fwSpec.ngfwGbps} Gbps).`;
  const firewalls: DeviceSelection[] = [{
    role: 'firewall',
    model: fwSpec.model,
    orderableSku: resolveOrderableSku({ ...fwSpec, tier: FW_TIER }),
    vendor: fwVendor,
    quantity: 2,
    reasoning: fwReason,
  }];

  // ── Wireless (only when hasWireless) ───────────────────────────────
  const accessPoints: DeviceSelection[] = [];
  const wirelessControllers: DeviceSelection[] = [];
  if (i.hasWireless && i.userCount > 0) {
    const apCount = Math.ceil((i.userCount / AP_DENSITY.office) * SWITCH_HEADROOM);
    const apSpec = pickApSpec();
    accessPoints.push({
      role: 'access_point',
      model: apSpec.model,
      orderableSku: resolveOrderableSku({ ...apSpec, tier: AP_TIER }),
      vendor: 'cisco',
      quantity: apCount,
      reasoning: `${i.userCount} users ÷ ${AP_DENSITY.office} users/AP × ${SWITCH_HEADROOM} overlap = ${apCount} APs (${apSpec.model}, Wi-Fi 6).`,
    });
    const wlc = pickWlcSpec(apCount);
    wirelessControllers.push({
      role: 'wireless_controller',
      model: wlc.spec.model,
      orderableSku: resolveOrderableSku({ ...wlc.spec, tier: WLC_TIER }),
      vendor: 'cisco',
      quantity: wlc.qty,
      reasoning: `${apCount} APs → ${wlc.spec.model} (${apCount <= 250 ? '≤250 APs' : '1 controller per 1000 APs'}).`,
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

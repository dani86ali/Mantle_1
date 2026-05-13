/**
 * E5 — Deterministic rack-elevation generator.
 *
 * Pure function. Builds {@link RackElevation} layouts from a {@link SizingResult}.
 * Heights come from device-specs.ts (rackUnits field) — no AI, no math
 * by Claude (BOMATIC §1).
 *
 * Layout rules:
 *   • Rack is 42U. Top 2U reserved for patch panels, bottom 2U for cable mgmt.
 *   • Devices placed top-down within each group: MDF rack holds core →
 *     firewalls; IDF racks hold access switches; 1U gap between groups.
 *   • Desktop form factor (FortiGate 60F/81F, rackUnits=0) → 1U shelf, label
 *     calls out the shelf note.
 *   • If a group exceeds usable U, spill the overflow to a second rack
 *     (e.g. IDF-1-R2).
 */
import {
  CISCO_ACCESS_SWITCHES,
  CISCO_CORE_SWITCHES,
  CISCO_FIREWALLS,
  CISCO_WIRELESS_APS,
  FORTIGATE_FIREWALLS,
} from '@/engines/e5/device-specs';
import type {
  DeviceSelection,
  RackDevice,
  RackElevation,
  SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';

const RACK_TOTAL_U = 42;
const PATCH_PANEL_U = 2;
const CABLE_MGMT_U = 2;
const USABLE_U = RACK_TOTAL_U - PATCH_PANEL_U - CABLE_MGMT_U; // 38U
const SHELF_U = 1;
const GROUP_GAP_U = 1;
const DEFAULT_HEIGHT_U = 1;

interface PlacedItem {
  model: string;
  heightU: number;
  role: string;
  isShelf: boolean;
}

function lookupRackUnits(model: string): number {
  const lookups: ReadonlyArray<ReadonlyArray<{ model: string; rackUnits: number }>> = [
    CISCO_ACCESS_SWITCHES,
    CISCO_CORE_SWITCHES,
    CISCO_FIREWALLS,
    FORTIGATE_FIREWALLS,
    CISCO_WIRELESS_APS.map((a) => ({ model: a.model, rackUnits: 0 })),
  ];
  for (const table of lookups) {
    const hit = table.find((row) => row.model === model);
    if (hit) return hit.rackUnits;
  }
  return DEFAULT_HEIGHT_U;
}

function expandGroup(devices: DeviceSelection[]): PlacedItem[] {
  const out: PlacedItem[] = [];
  for (const d of devices) {
    const ru = lookupRackUnits(d.model);
    const isShelf = ru === 0;
    const heightU = isShelf ? SHELF_U : ru;
    for (let i = 0; i < d.quantity; i++) {
      out.push({ model: d.model, heightU, role: d.role, isShelf });
    }
  }
  return out;
}

function labelFor(item: PlacedItem, index: number): string {
  const base = `${item.model} (${item.role}#${index + 1})`;
  return item.isShelf ? `${base} — desktop, shelf-mounted` : base;
}

/**
 * Pack a flat list of items top-down into 1+ racks. The first rack uses
 * `firstRackId`; subsequent racks append `-R2`, `-R3`, etc. Patch-panel band
 * sits at top, cable-mgmt at bottom; items consume the usable band between.
 */
function packIntoRacks(items: PlacedItem[], rackBaseId: string): RackElevation[] {
  const racks: RackElevation[] = [];
  if (items.length === 0) return racks;

  let rackIndex = 1;
  let consumed = 0;
  let current: RackElevation = {
    rackId: `${rackBaseId}-R${rackIndex}`,
    totalU: RACK_TOTAL_U,
    devices: [],
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (consumed + it.heightU > USABLE_U) {
      racks.push(current);
      rackIndex += 1;
      consumed = 0;
      current = {
        rackId: `${rackBaseId}-R${rackIndex}`,
        totalU: RACK_TOTAL_U,
        devices: [],
      };
    }
    // top-down: startU = RACK_TOTAL_U - PATCH_PANEL_U - consumed - heightU + 1
    const startU = RACK_TOTAL_U - PATCH_PANEL_U - consumed - it.heightU + 1;
    const device: RackDevice = {
      deviceModel: it.model,
      startU,
      heightU: it.heightU,
      side: 'front',
      label: labelFor(it, i),
    };
    current.devices.push(device);
    consumed += it.heightU;
  }
  racks.push(current);
  return racks;
}

function withGapBetweenGroups(groups: PlacedItem[][]): PlacedItem[] {
  const out: PlacedItem[] = [];
  for (let g = 0; g < groups.length; g++) {
    if (groups[g].length === 0) continue;
    if (out.length > 0) {
      // synthetic gap: a 1U "spacer" item (no device emitted, just heightU
      // consumed). Emit it as a non-device by skipping in label/output but
      // we still need to bump consumed U — easier to model as a real RackDevice
      // would clutter output, so we emit a 1U placeholder labelled "gap".
      out.push({ model: '<gap>', heightU: GROUP_GAP_U, role: 'gap', isShelf: false });
    }
    out.push(...groups[g]);
  }
  return out;
}

function stripGaps(racks: RackElevation[]): RackElevation[] {
  return racks.map((r) => ({
    ...r,
    devices: r.devices.filter((d) => d.deviceModel !== '<gap>'),
  }));
}

/**
 * Generate rack elevations for the MDF (core + firewalls) and IDF (access)
 * tiers of the design.
 *
 * @param sizing    Output of calculateSizing.
 * @param topology  Selected topology pattern (drives distribution placement).
 * @returns         One {@link RackElevation} per rack needed. MDF first, IDFs after.
 */
export function generateRackElevations(
  sizing: SizingResult,
  topology: TopologyPattern,
): RackElevation[] {
  // MDF rack — core, distribution (when three-tier), firewalls
  const mdfGroups: PlacedItem[][] = [
    expandGroup(sizing.coreDevices),
    topology === 'three_tier_core_dist_access' ? expandGroup(sizing.distributionDevices) : [],
    expandGroup(sizing.firewalls),
  ];
  const mdfItems = withGapBetweenGroups(mdfGroups);
  const mdfRacks = stripGaps(packIntoRacks(mdfItems, 'MDF'));

  // IDF racks — access switches; one IDF group per "site" group.
  // Default: a single IDF rack family for all access switches.
  const accessItems = expandGroup(sizing.accessDevices);
  const idfRacks = stripGaps(packIntoRacks(accessItems, 'IDF-1'));

  return [...mdfRacks, ...idfRacks];
}

/**
 * E5 — Deterministic port-map generator.
 *
 * Pure function. Walks {@link SizingResult} and produces one {@link PortMap}
 * per physical device (expanding by quantity). Port counts come from
 * device-specs lookup tables — no AI, no math by Claude (BOMATIC §1).
 *
 * Per-role rules:
 *   • Access switch: first N ports access→Data VLAN; middle 4 trunk→voice/
 *     wireless (when present); last 2 trunk uplinks to core/distribution.
 *   • Core/distribution switch: first 2 ports trunk→firewall pair; rest
 *     routed (L3) links to distribution/access.
 *   • Firewall: ports 1–4 assigned to outside/inside/dmz/management zones;
 *     remaining ports marked unused.
 *
 * Cisco port-id prefix by speed: Gi(1G/mGig), Te(10G), Tw(25G), Fo(40G),
 * Hu(100G). Slot/module fixed at 1/0 — sufficient for non-modular access.
 */
import {
  CISCO_ACCESS_SWITCHES,
  CISCO_CORE_SWITCHES,
} from '@/engines/e5/device-specs';
import type {
  PortAssignment,
  PortMap,
  SizingResult,
  VlanEntry,
} from '@/engines/e5/types';

const UPLINK_PORTS = 2;
const TRUNK_MIDDLE_PORTS = 4;
const FIREWALL_PORT_COUNT = 8;
const FIREWALL_ZONES = ['outside', 'inside', 'dmz', 'management'] as const;

function speedFor(portType: string): { speed: string; prefix: string } {
  if (/mGig/i.test(portType)) return { speed: 'mGig', prefix: 'Gi' };
  const m = portType.match(/(\d+)G/);
  const n = m ? m[1] : '1';
  switch (n) {
    case '1':   return { speed: '1G',   prefix: 'Gi' };
    case '10':  return { speed: '10G',  prefix: 'Te' };
    case '25':  return { speed: '25G',  prefix: 'Tw' };
    case '40':  return { speed: '40G',  prefix: 'Fo' };
    case '100': return { speed: '100G', prefix: 'Hu' };
    default:    return { speed: `${n}G`, prefix: 'Gi' };
  }
}

function pid(prefix: string, n: number): string {
  return `${prefix}1/0/${n}`;
}

function findVlan(vlans: VlanEntry[], baseName: string): VlanEntry | undefined {
  return vlans.find((v) => v.name === baseName || v.name.startsWith(`${baseName}-`));
}

function accessPorts(total: number, speed: string, prefix: string, vlans: VlanEntry[]): PortAssignment[] {
  const data = findVlan(vlans, 'Data');
  const voice = findVlan(vlans, 'Voice');
  const wireless = findVlan(vlans, 'Wireless');
  const trunkCarried = [voice, wireless].filter((v): v is VlanEntry => !!v);
  const middle = trunkCarried.length > 0 ? Math.min(TRUNK_MIDDLE_PORTS, Math.max(0, total - UPLINK_PORTS)) : 0;
  const accessCount = Math.max(0, total - UPLINK_PORTS - middle);
  const trunkVlanStr = trunkCarried.map((v) => v.id).join(',');

  const ports: PortAssignment[] = [];
  for (let p = 1; p <= total; p++) {
    if (p <= accessCount) {
      ports.push({
        portId: pid(prefix, p),
        type: 'access',
        connectedTo: 'end-user/workstation',
        vlan: data?.id,
        speed,
        description: `Access port — ${data?.name ?? 'Data'} VLAN`,
      });
    } else if (p <= accessCount + middle) {
      ports.push({
        portId: pid(prefix, p),
        type: 'trunk',
        connectedTo: 'phone/AP',
        vlan: trunkCarried[0]!.id,
        speed,
        description: `Trunk — VLANs ${trunkVlanStr}`,
      });
    } else {
      ports.push({
        portId: pid(prefix, p),
        type: 'trunk',
        connectedTo: 'core/distribution',
        speed,
        description: 'Uplink trunk to core',
      });
    }
  }
  return ports;
}

function corePorts(total: number, speed: string, prefix: string): PortAssignment[] {
  const ports: PortAssignment[] = [];
  for (let p = 1; p <= total; p++) {
    if (p <= 2) {
      ports.push({
        portId: pid(prefix, p),
        type: 'trunk',
        connectedTo: `firewall-${p}`,
        speed,
        description: 'Trunk to firewall',
      });
    } else {
      ports.push({
        portId: pid(prefix, p),
        type: 'routed',
        connectedTo: 'distribution/access',
        speed,
        description: 'Routed L3 link',
      });
    }
  }
  return ports;
}

function firewallPortsFor(total: number, speed: string, prefix: string): PortAssignment[] {
  const ports: PortAssignment[] = [];
  for (let p = 1; p <= total; p++) {
    if (p <= FIREWALL_ZONES.length) {
      const zone = FIREWALL_ZONES[p - 1];
      ports.push({
        portId: pid(prefix, p),
        type: zone === 'inside' ? 'trunk' : 'routed',
        connectedTo: zone,
        speed,
        description: `${zone} security zone`,
      });
    } else {
      ports.push({
        portId: pid(prefix, p),
        type: 'unused',
        connectedTo: '',
        speed,
        description: 'Unused',
      });
    }
  }
  return ports;
}

/**
 * Build port maps for every switch and firewall in the sizing result.
 *
 * @param sizing  Output of {@link calculateSizing}.
 * @param vlans   VLAN table from {@link planIPVlans} (drives access VLAN assignment).
 * @returns       One {@link PortMap} per physical device (expanded by quantity).
 */
export function generatePortMaps(sizing: SizingResult, vlans: VlanEntry[]): PortMap[] {
  const result: PortMap[] = [];

  for (const d of sizing.accessDevices) {
    const spec = CISCO_ACCESS_SWITCHES.find((s) => s.model === d.model);
    if (!spec) continue;
    const { speed, prefix } = speedFor(spec.portType);
    for (let n = 1; n <= d.quantity; n++) {
      result.push({
        deviceId: `${d.role}-${d.model}-${n}`,
        model: d.model,
        ports: accessPorts(spec.ports, speed, prefix, vlans),
      });
    }
  }

  for (const d of [...sizing.coreDevices, ...sizing.distributionDevices]) {
    const spec = CISCO_CORE_SWITCHES.find((s) => s.model === d.model);
    if (!spec) continue;
    const { speed, prefix } = speedFor(spec.portType);
    for (let n = 1; n <= d.quantity; n++) {
      result.push({
        deviceId: `${d.role}-${d.model}-${n}`,
        model: d.model,
        ports: corePorts(spec.ports, speed, prefix),
      });
    }
  }

  for (const d of sizing.firewalls) {
    const { speed, prefix } = speedFor('1G');
    for (let n = 1; n <= d.quantity; n++) {
      result.push({
        deviceId: `${d.role}-${d.model}-${n}`,
        model: d.model,
        ports: firewallPortsFor(FIREWALL_PORT_COUNT, speed, prefix),
      });
    }
  }

  return result;
}

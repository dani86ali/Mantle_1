/**
 * E5 — Deterministic cable-schedule generator.
 *
 * Pure function. Walks {@link PortMap} output from generatePortMaps and emits
 * one {@link CableScheduleEntry} per trunk/routed port that has a `connectedTo`
 * target, plus one power-cable row per physical device.
 *
 * Length is inferred from port-context heuristics (we do not have surveyed
 * cable lengths at this stage):
 *   • same-rack runs (firewall pair, FW zones)        →  1 m
 *   • desk drops (phone/AP)                           → 10 m
 *   • access ↔ core/dist uplink (two-tier)            → 30 m  (same-floor)
 *   • access ↔ core/dist uplink (three-tier)          → 50 m  (between-floors)
 *
 * Cable type follows TIA-568 / Cisco design guidance:
 *   • <5 m on 10G/25G   → DAC twinax
 *   • <10 m             → Cat 6A
 *   • 10–90 m           → multi-mode fiber (OM4)
 *   • >90 m             → single-mode fiber (OS2)
 *
 * No I/O, no AI calls, no side effects (BOMATIC §1).
 */
import type {
  CableScheduleEntry,
  PortAssignment,
  PortMap,
  TopologyPattern,
} from '@/engines/e5/types';

const SAME_RACK_M = 1;
const PHONE_AP_M = 10;
const TWO_TIER_UPLINK_M = 30;
const THREE_TIER_UPLINK_M = 50;
const POWER_CABLE_M = 3;
const UNKNOWN_PORT = '?';
const FW_ZONES = new Set(['outside', 'inside', 'dmz', 'management']);

function inferLengthMeters(topology: TopologyPattern, port: PortAssignment): number {
  const t = port.connectedTo;
  if (t.startsWith('firewall-')) return SAME_RACK_M;
  if (FW_ZONES.has(t)) return SAME_RACK_M;
  if (t === 'phone/AP') return PHONE_AP_M;
  if (t === 'core/distribution' || t === 'distribution/access') {
    return topology === 'three_tier_core_dist_access'
      ? THREE_TIER_UPLINK_M
      : TWO_TIER_UPLINK_M;
  }
  return TWO_TIER_UPLINK_M;
}

function cableTypeFor(port: PortAssignment, meters: number): CableScheduleEntry['type'] {
  const t = port.connectedTo;
  // Connection-type overrides (Playbook §3.7-16 cable plant practice):
  //   firewall trunks, FW zone ports, and desk drops are always copper.
  if (t.startsWith('firewall-')) return 'cat6a';
  if (FW_ZONES.has(t)) return 'cat6a';
  if (t === 'phone/AP') return 'cat6a';
  // Length-based selection for uplink runs.
  const is10or25 = /^(10G|25G)/.test(port.speed);
  if (meters < 5 && is10or25) return 'dac';
  if (meters < 10) return 'cat6a';
  if (meters <= 90) return 'fiber_mm';
  return 'fiber_sm';
}

function nextCableId(seq: number): string {
  return `CBL-${String(seq).padStart(3, '0')}`;
}

function formatLabel(fromDevice: string, fromPort: string, toDevice: string, toPort: string): string {
  return `${fromDevice}:${fromPort} <-> ${toDevice}:${toPort}`;
}

/**
 * Build a cable schedule from generated port maps and the selected topology.
 *
 * @param portMaps  Per-device port assignments from generatePortMaps.
 * @param topology  Selected topology pattern (drives uplink run length).
 * @returns         Cable schedule rows in sequential CBL-NNN order (signal
 *                  cables first, then one power cable per device).
 */
export function generateCableSchedule(
  portMaps: PortMap[],
  topology: TopologyPattern,
): CableScheduleEntry[] {
  const cables: CableScheduleEntry[] = [];
  let seq = 1;

  for (const map of portMaps) {
    for (const port of map.ports) {
      if (port.type !== 'trunk' && port.type !== 'routed') continue;
      if (!port.connectedTo) continue;
      const meters = inferLengthMeters(topology, port);
      const type = cableTypeFor(port, meters);
      cables.push({
        cableId: nextCableId(seq++),
        type,
        fromDevice: map.deviceId,
        fromPort: port.portId,
        toDevice: port.connectedTo,
        toPort: UNKNOWN_PORT,
        lengthMeters: meters,
        label: formatLabel(map.deviceId, port.portId, port.connectedTo, UNKNOWN_PORT),
      });
    }
  }

  for (const map of portMaps) {
    cables.push({
      cableId: nextCableId(seq++),
      type: 'power',
      fromDevice: map.deviceId,
      fromPort: 'PSU',
      toDevice: 'PDU',
      toPort: UNKNOWN_PORT,
      lengthMeters: POWER_CABLE_M,
      label: formatLabel(map.deviceId, 'PSU', 'PDU', UNKNOWN_PORT),
    });
  }

  return cables;
}

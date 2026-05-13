/**
 * E5 — draw.io diagram generator (deterministic, never AI).
 *
 * Emits uncompressed mxGraphModel XML per Design_Patterns.md §5. Walks all
 * six SizingResult buckets so every populated role appears as a node.
 * Layout is a fixed grid; an engineer adjusts in draw.io.
 */

import type {
  DeviceSelection,
  IPVlanPlan,
  SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';
import {
  COLOR,
  EDGE_COLOR,
  ROW_GAP,
  connectAll,
  renderMxFile,
  rowOf,
  type DiagramEdge,
  type DiagramNode,
} from '@/engines/e5/diagram-xml';

export interface DiagramOutput {
  logicalTopology: string;
  physicalTopology?: string;
}

interface Built { nodes: DiagramNode[]; edges: DiagramEdge[]; }

function buildHierarchical(topology: TopologyPattern, sizing: SizingResult): Built {
  const isThreeTier = topology === 'three_tier_core_dist_access';
  const fws = rowOf(sizing.firewalls, 'Firewall', 40, COLOR.fw, 'fw', 'hexagon');
  const core = rowOf(sizing.coreDevices, 'Core', 40 + ROW_GAP, COLOR.core, 'core');
  const dist = isThreeTier
    ? rowOf(sizing.distributionDevices, 'Distribution', 40 + ROW_GAP * 2, COLOR.dist, 'dist')
    : [];
  const accessY = isThreeTier ? 40 + ROW_GAP * 3 : 40 + ROW_GAP * 2;
  const access = rowOf(sizing.accessDevices, 'Access', accessY, COLOR.access, 'access');
  const wlcY = accessY + ROW_GAP;
  const wlc = rowOf(sizing.wirelessControllers, 'WLC', wlcY, COLOR.wlc, 'wlc');
  const ap = rowOf(sizing.accessPoints, 'AP', wlcY + ROW_GAP, COLOR.ap, 'ap');

  const edges: DiagramEdge[] = [];
  edges.push(...connectAll(core, fws, '10G', EDGE_COLOR.backbone, 3));
  if (isThreeTier) {
    edges.push(...connectAll(dist, core, '40G', EDGE_COLOR.backbone, 3));
    edges.push(...connectAll(access, dist, '10G', EDGE_COLOR.dist, 2));
  } else {
    edges.push(...connectAll(access, core, '10G', EDGE_COLOR.dist, 2));
  }
  edges.push(...connectAll(wlc, core, 'trunk', EDGE_COLOR.dist, 2));
  edges.push(...connectAll(ap, access, 'PoE', EDGE_COLOR.access, 1));
  return { nodes: [...fws, ...core, ...dist, ...access, ...wlc, ...ap], edges };
}

function buildFatTree(sizing: SizingResult): Built {
  const spine = rowOf(sizing.coreDevices, 'Spine (InfiniBand)', 80, COLOR.spine, 'spine');
  const leaf = rowOf(sizing.accessDevices, 'Leaf (InfiniBand)', 80 + ROW_GAP * 2, COLOR.leaf, 'leaf');
  const fws = rowOf(sizing.firewalls, 'Firewall', 80 + ROW_GAP * 3, COLOR.fw, 'fw', 'hexagon');
  const wlc = rowOf(sizing.wirelessControllers, 'WLC', 80 + ROW_GAP * 4, COLOR.wlc, 'wlc');
  const ap = rowOf(sizing.accessPoints, 'AP', 80 + ROW_GAP * 5, COLOR.ap, 'ap');
  const edges = connectAll(leaf, spine, 'NDR 400G InfiniBand', EDGE_COLOR.backbone, 3);
  return { nodes: [...spine, ...leaf, ...fws, ...wlc, ...ap], edges };
}

function buildOtItSegmented(sizing: SizingResult): Built {
  const core = rowOf(sizing.coreDevices, 'IT Core', 40, COLOR.core, 'core');
  const fws = rowOf(sizing.firewalls, 'IT/OT Firewall', 40 + ROW_GAP, COLOR.fw, 'fw', 'hexagon');
  const access = rowOf(sizing.accessDevices, 'OT Access', 40 + ROW_GAP * 2, COLOR.access, 'access');
  const dist = rowOf(sizing.distributionDevices, 'Distribution', 40 + ROW_GAP * 3, COLOR.dist, 'dist');
  const wlc = rowOf(sizing.wirelessControllers, 'WLC', 40 + ROW_GAP * 4, COLOR.wlc, 'wlc');
  const ap = rowOf(sizing.accessPoints, 'AP', 40 + ROW_GAP * 5, COLOR.ap, 'ap');
  const edges: DiagramEdge[] = [
    ...connectAll(core, fws, 'trusted', EDGE_COLOR.backbone, 3),
    ...connectAll(fws, access, 'OT VLAN', EDGE_COLOR.dist, 2),
    ...connectAll(access, dist, '10G', EDGE_COLOR.dist, 2),
    ...connectAll(ap, access, 'PoE', EDGE_COLOR.access, 1),
    ...connectAll(wlc, core, 'trunk', EDGE_COLOR.dist, 2),
  ];
  return { nodes: [...core, ...fws, ...access, ...dist, ...wlc, ...ap], edges };
}

function buildGeneric(sizing: SizingResult): Built {
  const buckets: Array<[string, DeviceSelection[], string]> = [
    ['Core', sizing.coreDevices, COLOR.core],
    ['Distribution', sizing.distributionDevices, COLOR.dist],
    ['Access', sizing.accessDevices, COLOR.access],
    ['Firewall', sizing.firewalls, COLOR.fw], // shape stays rect in generic fallback
    ['WLC', sizing.wirelessControllers, COLOR.wlc],
    ['AP', sizing.accessPoints, COLOR.ap],
  ];
  const nodes: DiagramNode[] = [];
  const rows: DiagramNode[][] = [];
  let row = 0;
  for (const [label, devs, fill] of buckets) {
    const rn = rowOf(devs, label, 40 + row * ROW_GAP, fill, label.toLowerCase());
    if (rn.length > 0) { rows.push(rn); row++; nodes.push(...rn); }
  }
  const edges: DiagramEdge[] = [];
  for (let i = 1; i < rows.length; i++) {
    edges.push(...connectAll(rows[i], rows[i - 1], '', EDGE_COLOR.dist, 2));
  }
  return { nodes, edges };
}

/**
 * Build a logical topology draw.io XML string from sizing + topology.
 * IPVlanPlan reserved for future VLAN annotation; unused in v1.
 */
export function generateDiagrams(
  topology: TopologyPattern,
  sizing: SizingResult,
  _ipVlanPlan?: IPVlanPlan,
): DiagramOutput {
  let built: Built;
  if (topology === 'two_tier_collapsed_core' || topology === 'three_tier_core_dist_access') {
    built = buildHierarchical(topology, sizing);
  } else if (topology === 'fat_tree_superpod') {
    built = buildFatTree(sizing);
  } else if (topology === 'ot_it_segmented') {
    built = buildOtItSegmented(sizing);
  } else {
    built = buildGeneric(sizing);
  }
  return {
    logicalTopology: renderMxFile(built.nodes, built.edges, `Logical-${topology}`),
  };
}

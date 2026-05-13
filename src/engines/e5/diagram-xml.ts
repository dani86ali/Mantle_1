/**
 * E5 — draw.io XML primitives. Shared by diagram-generator.ts and
 * diagram-templates.ts. Emits uncompressed mxGraphModel cells per
 * Design_Patterns.md §5.1–5.2.
 */

import type { DeviceSelection } from '@/engines/e5/types';

export type NodeShape = 'rect' | 'hexagon' | 'cloud';

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  fillColor: string;
  shape?: NodeShape;
}

export interface DiagramEdge {
  source: string;
  target: string;
  label: string;
  color: string;
  strokeWidth: number;
}

export const NODE_W = 120;
export const NODE_H = 60;
export const COL_GAP = 180;
export const ROW_GAP = 140;

export const COLOR = {
  core: '#036897',
  dist: '#1A73B8',
  access: '#6FA8DC',
  fw: '#CC0000',
  wlc: '#9966CC',
  ap: '#66B2FF',
  spine: '#76A5AF',
  leaf: '#A4C2F4',
} as const;

export const EDGE_COLOR = {
  backbone: '#CC0000',
  dist: '#009900',
  access: '#000000',
} as const;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function deviceLabel(role: string, d: DeviceSelection): string {
  return `${role}\n${d.quantity}× ${d.model}`;
}

export function rowOf(
  devs: DeviceSelection[],
  roleLabel: string,
  y: number,
  fillColor: string,
  idPrefix: string,
  shape: NodeShape = 'rect',
): DiagramNode[] {
  if (devs.length === 0) return [];
  const totalW = devs.length * NODE_W + (devs.length - 1) * (COL_GAP - NODE_W);
  const startX = 400 - totalW / 2;
  return devs.map((d, i) => ({
    id: `${idPrefix}-${i}`,
    label: deviceLabel(roleLabel, d),
    x: Math.round(startX + i * COL_GAP),
    y,
    fillColor,
    shape,
  }));
}

export function connectAll(
  srcs: DiagramNode[],
  dsts: DiagramNode[],
  label: string,
  color: string,
  strokeWidth: number,
): DiagramEdge[] {
  const out: DiagramEdge[] = [];
  for (const s of srcs) for (const d of dsts) {
    out.push({ source: s.id, target: d.id, label, color, strokeWidth });
  }
  return out;
}

function shapePrefix(shape: NodeShape | undefined): string {
  if (shape === 'hexagon') return 'shape=hexagon;perimeter=hexagonPerimeter2;';
  if (shape === 'cloud') return 'shape=cloud;';
  return 'rounded=0;';
}

function nodeXml(n: DiagramNode): string {
  const style =
    `${shapePrefix(n.shape)}whiteSpace=wrap;html=1;fillColor=${n.fillColor};` +
    `strokeColor=#ffffff;fontColor=#ffffff;fontStyle=1;align=center;verticalAlign=middle;`;
  return (
    `        <mxCell id="${escapeXml(n.id)}" value="${escapeXml(n.label)}" ` +
    `style="${style}" vertex="1" parent="1">\n` +
    `          <mxGeometry x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" as="geometry" />\n` +
    `        </mxCell>`
  );
}

function edgeXml(e: DiagramEdge, idx: number): string {
  const style =
    `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;` +
    `strokeColor=${e.color};strokeWidth=${e.strokeWidth};`;
  return (
    `        <mxCell id="edge-${idx}" value="${escapeXml(e.label)}" style="${style}" ` +
    `edge="1" parent="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">\n` +
    `          <mxGeometry relative="1" as="geometry" />\n` +
    `        </mxCell>`
  );
}

export function renderMxFile(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  pageName: string,
): string {
  const cells = [...nodes.map(nodeXml), ...edges.map((e, i) => edgeXml(e, i))].join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<mxfile host="bomatic" type="device">\n` +
    `  <diagram name="${escapeXml(pageName)}" id="${escapeXml(pageName)}">\n` +
    `    <mxGraphModel dx="1422" dy="757" grid="1" gridSize="10" guides="1" ` +
    `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
    `pageWidth="1654" pageHeight="1169" math="0" shadow="0">\n` +
    `      <root>\n` +
    `        <mxCell id="0" />\n` +
    `        <mxCell id="1" parent="0" />\n` +
    `${cells}\n` +
    `      </root>\n` +
    `    </mxGraphModel>\n` +
    `  </diagram>\n` +
    `</mxfile>`
  );
}

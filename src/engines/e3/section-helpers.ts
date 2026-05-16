/** E3 section-helpers — shared formatters and lookups for deterministic
 *  proposal sections. Pure functions, no I/O, no AI.
 */

import {
  PROPOSAL_SECTIONS,
  type ProposalSection,
  type ProposalSectionSpec,
} from './types';

export interface SectionBomLine {
  sku: string;
  description: string;
  qty: number;
  category: string;
  extendedSell?: number;
}

export interface SectionTotals {
  hardwareTotal: number;
  softwareTotal: number;
  serviceTotal: number;
  subscriptionTotal: number;
  grandTotalExVat: number;
  vatAmount: number;
  grandTotalIncVat: number;
}

export interface SectionRequirement {
  id?: string;
  text: string;
  classification: 'mandatory' | 'optional' | 'conditional';
}

export interface SectionComplianceStats {
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  alternative: number;
}

export interface SectionMatrixRow {
  requirementId?: string;
  requirementText: string;
  frameworkId: string;
  controlId?: string;
  controlName: string;
  status: string;
}

const SUPPORT_PREFIXES = ['CON-', 'FC-'] as const;

const SUPPORT_TIER_MAP: ReadonlyArray<{ prefix: string; tier: string }> = [
  { prefix: 'CON-SSSNT', tier: 'Cisco SmartNet 24x7x4' },
  { prefix: 'CON-OSP', tier: 'Cisco SmartNet 24x7x4 Onsite' },
  { prefix: 'CON-SNTP', tier: 'Cisco SmartNet 24x7x4 Premium' },
  { prefix: 'CON-SNT', tier: 'Cisco SmartNet 8x5xNBD' },
  { prefix: 'FC-10', tier: 'FortiCare Premium' },
  { prefix: 'FC-', tier: 'FortiCare Standard' },
];

export function specBySlug(slug: string): ProposalSectionSpec {
  const spec = PROPOSAL_SECTIONS.find((p) => p.slug === slug);
  if (!spec) throw new Error(`[section-helpers] no spec for slug "${slug}"`);
  return spec;
}

export function makeSection(slug: string, content: string): ProposalSection {
  const spec = specBySlug(slug);
  return {
    id: spec.id,
    title: spec.title,
    slug: spec.slug,
    content,
    generationMethod: spec.generationMethod,
    status: 'generated',
  };
}

export function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}

export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const fixed = rounded.toFixed(2);
  const [whole, frac] = fixed.split('.');
  const withSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${withSeparators}.${frac}`;
}

export function isSupportLine(line: SectionBomLine): boolean {
  const cat = line.category.toLowerCase();
  if (cat === 'service' || cat === 'support') return true;
  return SUPPORT_PREFIXES.some((p) => line.sku.toUpperCase().startsWith(p));
}

export function mapSupportTier(sku: string): string {
  const up = sku.toUpperCase();
  for (const { prefix, tier } of SUPPORT_TIER_MAP) {
    if (up.startsWith(prefix)) return tier;
  }
  return 'Vendor-Standard Support';
}

export function groupByCategory(
  lines: SectionBomLine[],
): Array<[string, SectionBomLine[]]> {
  const map = new Map<string, SectionBomLine[]>();
  for (const l of lines) {
    const key = l.category || 'other';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(l);
  }
  return Array.from(map.entries());
}

export function renderRequirementsTable(
  title: string,
  reqs: SectionRequirement[],
): string {
  const rows: string[] = [
    `### ${title} (${reqs.length})`,
    '',
    '| ID | Requirement |',
    '|---|---|',
  ];
  for (const r of reqs) {
    rows.push(`| ${r.id ?? ''} | ${escapeCell(r.text)} |`);
  }
  return rows.join('\n');
}

export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

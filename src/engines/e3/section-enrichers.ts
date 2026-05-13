/** E3 section-enrichers — optional, pure post-processors that append E4/E5
 *  context to existing sections when that data is supplied. If E4/E5 data is
 *  absent, sections pass through unchanged (RFP mode).
 */

import { escapeCell } from './section-helpers';
import type { ProposalSection } from './types';
import type {
  E3BaselineEntry,
  E3E4Data,
  E3E5Data,
  E3HLDSection,
  E3RequirementsBaseline,
} from './orchestrator-types';

const BASELINE_CATEGORIES: Array<{ key: keyof E3RequirementsBaseline; label: string }> = [
  { key: 'business', label: 'Business' },
  { key: 'functional', label: 'Functional' },
  { key: 'nonFunctional', label: 'Non-Functional' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'assumptions', label: 'Assumptions' },
];

function renderBaselineCategory(label: string, entries: E3BaselineEntry[]): string {
  const rows: string[] = [
    `#### ${label} (${entries.length})`,
    '',
  ];
  if (entries.length === 0) {
    rows.push('_No entries captured in this category._');
    return rows.join('\n');
  }
  rows.push('| ID | Priority | Requirement |');
  rows.push('|---|---|---|');
  for (const e of entries) {
    rows.push(`| ${e.id} | ${e.priority} | ${escapeCell(e.text)} |`);
  }
  return rows.join('\n');
}

export function renderBaselineSummary(baseline: E3RequirementsBaseline): string {
  const parts: string[] = [
    '### Discovery Requirements Baseline (E4)',
    '',
    'The following five-category baseline was captured from the client discovery questionnaire (Playbook §2.3).',
    '',
  ];
  for (const { key, label } of BASELINE_CATEGORIES) {
    parts.push(renderBaselineCategory(label, baseline[key]));
    parts.push('');
  }
  return parts.join('\n').trimEnd();
}

function renderDesignApproach(d: NonNullable<E3E5Data['designApproach']>): string {
  const rows: string[] = [
    '### Design Approach (E5)',
    '',
    `- Methodology: ${d.methodology}`,
    `- Approach: ${d.approach}`,
    `- Topology pattern: ${d.topologyPattern ?? 'n/a'}`,
    `- Vendor: ${d.vendor}`,
    `- Frameworks: ${d.frameworks.join(', ') || 'n/a'}`,
  ];
  return rows.join('\n');
}

function renderSizing(sizing: NonNullable<E3E5Data['sizing']>): string {
  const groups: Array<[string, NonNullable<E3E5Data['sizing']>[keyof NonNullable<E3E5Data['sizing']>]]> = [
    ['Core', sizing.coreDevices],
    ['Distribution', sizing.distributionDevices],
    ['Access', sizing.accessDevices],
    ['Firewalls', sizing.firewalls],
    ['Wireless Controllers', sizing.wirelessControllers],
    ['Access Points', sizing.accessPoints],
  ];
  const rows: string[] = ['### Sizing Decisions (E5)', ''];
  rows.push('| Layer | Role | Model | Vendor | Qty | Reasoning |');
  rows.push('|---|---|---|---|---|---|');
  let anyRow = false;
  for (const [layer, devices] of groups) {
    for (const d of devices) {
      anyRow = true;
      rows.push(`| ${layer} | ${escapeCell(d.role)} | ${escapeCell(d.model)} | ${escapeCell(d.vendor)} | ${d.quantity} | ${escapeCell(d.reasoning)} |`);
    }
  }
  if (!anyRow) rows.push('| — | — | — | — | 0 | No sizing decisions captured |');
  return rows.join('\n');
}

function renderHldSnapshots(sections: E3HLDSection[]): string {
  if (sections.length === 0) return '';
  const rows: string[] = ['### HLD Section Highlights (E5)', ''];
  for (const s of sections.slice(0, 12)) {
    rows.push(`#### §${s.sectionNumber} ${s.title}`);
    rows.push('');
    rows.push(s.content);
    rows.push('');
  }
  return rows.join('\n').trimEnd();
}

export function enrichRequirementsSection(
  section: ProposalSection,
  e4: E3E4Data,
): ProposalSection {
  const appended = `${section.content}\n\n${renderBaselineSummary(e4.requirementsBaseline)}`;
  return { ...section, content: appended };
}

export function enrichProposedSolutionSection(
  section: ProposalSection,
  e5: E3E5Data,
): ProposalSection {
  const parts: string[] = [section.content];
  if (e5.designApproach) parts.push('', renderDesignApproach(e5.designApproach));
  if (e5.sizing) parts.push('', renderSizing(e5.sizing));
  if (e5.hldSections && e5.hldSections.length > 0) {
    parts.push('', renderHldSnapshots(e5.hldSections));
  }
  return { ...section, content: parts.join('\n') };
}

export function enrichImplementationSection(
  section: ProposalSection,
  e5: E3E5Data,
): ProposalSection {
  if (!e5.designApproach && !e5.sizing) return section;
  const lines: string[] = [section.content, '', '### Design-Driven Implementation Inputs (E5)', ''];
  if (e5.designApproach) {
    lines.push(`- Topology: ${e5.designApproach.topologyPattern ?? 'n/a'}`);
    lines.push(`- Methodology: ${e5.designApproach.methodology} (${e5.designApproach.approach})`);
    lines.push(`- Vendor: ${e5.designApproach.vendor}`);
  }
  if (e5.sizing) {
    const total =
      e5.sizing.coreDevices.length +
      e5.sizing.distributionDevices.length +
      e5.sizing.accessDevices.length +
      e5.sizing.firewalls.length +
      e5.sizing.wirelessControllers.length +
      e5.sizing.accessPoints.length;
    lines.push(`- Distinct device roles to install: ${total}`);
  }
  return { ...section, content: lines.join('\n') };
}

export function applyEnrichments(
  sections: ProposalSection[],
  e4: E3E4Data | undefined,
  e5: E3E5Data | undefined,
): ProposalSection[] {
  if (!e4 && !e5) return sections;
  return sections.map((s) => {
    if (e4 && s.slug === 'requirements') return enrichRequirementsSection(s, e4);
    if (e5 && s.slug === 'proposed_solution') return enrichProposedSolutionSection(s, e5);
    if (e5 && s.slug === 'implementation') return enrichImplementationSection(s, e5);
    return s;
  });
}

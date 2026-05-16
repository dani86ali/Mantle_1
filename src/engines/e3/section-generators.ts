/** E3 section-generators — deterministic content for the 8 non-AI proposal
 *  sections (cover, requirements, technical specs, service levels, commercial,
 *  compliance, appendices, signature page). Pure functions per First Commandment.
 *  Source: docs/Network_PreSales_Playbook_Final_Consolidated.md §6.1.
 */

import { getBoilerplate, renderBoilerplate } from './boilerplate-kb';
import type { ProposalMetadata, ProposalSection } from './types';
import {
  escapeCell,
  formatMoney,
  groupByCategory,
  isSupportLine,
  makeSection,
  mapSupportTier,
  renderRequirementsTable,
  capitalize,
  type SectionBomLine,
  type SectionComplianceStats,
  type SectionMatrixRow,
  type SectionRequirement,
  type SectionTotals,
} from './section-helpers';

export type {
  SectionBomLine,
  SectionComplianceStats,
  SectionMatrixRow,
  SectionRequirement,
  SectionTotals,
} from './section-helpers';

export interface RequirementsInput {
  requirements: SectionRequirement[];
}

export interface TechSpecsInput {
  bom: SectionBomLine[];
  totals: SectionTotals;
}

export interface ServiceLevelsInput {
  bom: SectionBomLine[];
}

export interface CommercialInput {
  totals: SectionTotals;
}

export interface ComplianceInput {
  complianceMatrix: {
    stats: SectionComplianceStats;
    rows?: SectionMatrixRow[];
  };
}

export interface AllSectionsE1Input extends RequirementsInput, ComplianceInput {}
export interface AllSectionsE2Input extends TechSpecsInput {}

export function generateCoverPage(meta: ProposalMetadata): ProposalSection {
  const entry = getBoilerplate('cover_page');
  const { text } = renderBoilerplate(entry, {
    customerName: meta.customerName,
    projectName: meta.projectName,
    tenantName: meta.tenantName,
    date: meta.date,
  });
  return makeSection('cover_page', text);
}

export function generateRequirementsSection(
  e1: RequirementsInput,
): ProposalSection {
  const reqs = e1.requirements;
  const mand = reqs.filter((r) => r.classification === 'mandatory');
  const opt = reqs.filter((r) => r.classification === 'optional');
  const cond = reqs.filter((r) => r.classification === 'conditional');
  const out: string[] = [
    '## Understanding of Customer Requirements',
    '',
    `Total requirements analysed: ${reqs.length} — mandatory: ${mand.length}, optional: ${opt.length}, conditional: ${cond.length}.`,
    '',
    renderRequirementsTable('Mandatory Requirements', mand),
    '',
    renderRequirementsTable('Optional Requirements', opt),
    '',
    renderRequirementsTable('Conditional Requirements', cond),
  ];
  return makeSection('requirements', out.join('\n'));
}

export function generateTechnicalSpecs(e2: TechSpecsInput): ProposalSection {
  const out: string[] = ['## Technical Specifications', ''];
  for (const [cat, lines] of groupByCategory(e2.bom)) {
    out.push(`### ${capitalize(cat)} (${lines.length} item${lines.length === 1 ? '' : 's'})`);
    out.push('');
    out.push('| SKU | Description | Qty |');
    out.push('|---|---|---|');
    for (const l of lines) {
      out.push(`| ${escapeCell(l.sku)} | ${escapeCell(l.description)} | ${l.qty} |`);
    }
    out.push('');
  }
  out.push('Capacity and performance characteristics are governed by the listed device specifications and vendor datasheets (Appendix D).');
  return makeSection('technical_specs', out.join('\n'));
}

export function generateServiceLevels(e2: ServiceLevelsInput): ProposalSection {
  const supports = e2.bom.filter(isSupportLine);
  const out: string[] = [
    '## Service Levels & Support',
    '',
    '| SKU | Support Tier | Qty |',
    '|---|---|---|',
  ];
  if (supports.length === 0) {
    out.push('| — | No support SKUs in BoM | 0 |');
  } else {
    for (const s of supports) {
      out.push(`| ${escapeCell(s.sku)} | ${mapSupportTier(s.sku)} | ${s.qty} |`);
    }
  }
  return makeSection('service_levels', out.join('\n'));
}

export function generateCommercial(
  e2: CommercialInput,
  meta: ProposalMetadata,
): ProposalSection {
  const t = e2.totals;
  const fmt = (n: number): string => formatMoney(n, meta.currency);
  const out: string[] = [
    '## Commercial Proposal',
    '',
    `Currency: ${meta.currency}`,
    '',
    '| Category | Amount |',
    '|---|---|',
    `| Hardware | ${fmt(t.hardwareTotal)} |`,
    `| Software | ${fmt(t.softwareTotal)} |`,
    `| Services | ${fmt(t.serviceTotal)} |`,
    `| Subscriptions | ${fmt(t.subscriptionTotal)} |`,
    `| **Subtotal (ex VAT)** | ${fmt(t.grandTotalExVat)} |`,
    `| VAT | ${fmt(t.vatAmount)} |`,
    `| **Grand Total** | ${fmt(t.grandTotalIncVat)} |`,
    '',
    `Valid for ${meta.validityDays} days from ${meta.date}.`,
  ];
  return makeSection('commercial', out.join('\n'));
}

export function generateComplianceSection(
  e1: ComplianceInput,
): ProposalSection {
  const s = e1.complianceMatrix.stats;
  const rows = e1.complianceMatrix.rows ?? [];
  const coverage = s.total === 0 ? 0 : (s.compliant + s.alternative) / s.total;
  const out: string[] = [
    '## Compliance Matrix',
    '',
    `Total requirements: ${s.total}`,
    `Compliant: ${s.compliant}`,
    `Partial: ${s.partial}`,
    `Non-Compliant: ${s.nonCompliant}`,
    `Alternative: ${s.alternative}`,
    `Coverage: ${(coverage * 100).toFixed(1)}%`,
    '',
  ];
  if (rows.length > 0) {
    out.push('| Requirement | Framework | Control | Status |');
    out.push('|---|---|---|---|');
    for (const r of rows) {
      const reqLabel = r.requirementId
        ? `${escapeCell(r.requirementId)}: ${escapeCell(r.requirementText)}`
        : escapeCell(r.requirementText);
      out.push(
        `| ${reqLabel} | ${escapeCell(r.frameworkId)} | ${escapeCell(r.controlName)} | ${escapeCell(r.status)} |`,
      );
    }
  } else {
    out.push('The full line-by-line compliance matrix is provided in Appendix B.');
  }
  return makeSection('compliance_matrix', out.join('\n'));
}

export function generateAppendices(
  _e1: AllSectionsE1Input,
  _e2: AllSectionsE2Input,
): ProposalSection {
  const items = [
    'Appendix A — Bill of Materials',
    'Appendix B — Compliance Matrix',
    'Appendix C — Network Diagrams: Network topology and design diagrams are provided as separate deliverables. Refer to the HLD/LLD document package.',
    'Appendix D — Vendor Datasheets: Relevant vendor datasheets for specified equipment are available upon request.',
    'Appendix E — Team CVs: Project team qualifications and certifications are provided under separate cover upon request.',
  ];
  const content = '## Appendices\n\n' + items.map((i) => `- ${i}`).join('\n');
  return makeSection('appendices', content);
}

export function generateSignaturePage(meta: ProposalMetadata): ProposalSection {
  const entry = getBoilerplate('signature_page');
  const { text } = renderBoilerplate(entry, {
    customerName: meta.customerName,
    projectName: meta.projectName,
    tenantName: meta.tenantName,
  });
  return makeSection('signature_page', text);
}

export function generateAllDeterministicSections(
  e1: AllSectionsE1Input,
  e2: AllSectionsE2Input,
  meta: ProposalMetadata,
): ProposalSection[] {
  return [
    generateCoverPage(meta),
    generateRequirementsSection(e1),
    generateTechnicalSpecs(e2),
    generateServiceLevels(e2),
    generateCommercial(e2, meta),
    generateComplianceSection(e1),
    generateAppendices(e1, e2),
    generateSignaturePage(meta),
  ];
}

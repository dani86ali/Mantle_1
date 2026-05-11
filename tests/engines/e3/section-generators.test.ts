import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCoverPage,
  generateRequirementsSection,
  generateTechnicalSpecs,
  generateServiceLevels,
  generateCommercial,
  generateComplianceSection,
  generateAppendices,
  generateSignaturePage,
  generateAllDeterministicSections,
  type SectionBomLine,
  type SectionRequirement,
  type SectionTotals,
  type SectionComplianceStats,
} from '@/engines/e3/section-generators';
import { PROPOSAL_SECTIONS, type ProposalMetadata } from '@/engines/e3/types';

const META: ProposalMetadata = {
  customerName: 'Aramco',
  projectName: 'DataCenter Refresh',
  estimateId: 'EST-001',
  date: '2026-05-11',
  validityDays: 60,
  country: 'KSA',
  currency: 'SAR',
  tenantName: 'NexusGlobal',
};

const REQS: SectionRequirement[] = [
  { id: 'R-001', text: 'System shall support 99.99% uptime', classification: 'mandatory' },
  { id: 'R-002', text: 'System shall support IPv6', classification: 'mandatory' },
  { id: 'R-003', text: 'System should integrate with SIEM', classification: 'optional' },
  { id: 'R-004', text: 'If multi-site, support SD-WAN', classification: 'conditional' },
];

const BOM: SectionBomLine[] = [
  { sku: 'C9300-48P', description: 'Catalyst 9300 48-port PoE', qty: 4, category: 'hardware', extendedSell: 40000 },
  { sku: 'C9300-DNA-E', description: 'DNA Essentials 3yr', qty: 4, category: 'subscription', extendedSell: 6000 },
  { sku: 'CON-SNT-C9300', description: 'SmartNet 8x5xNBD 3yr', qty: 4, category: 'service', extendedSell: 3200 },
  { sku: 'CON-SSSNT-FG100F', description: '24x7x4 FG-100F 3yr', qty: 2, category: 'service', extendedSell: 4000 },
  { sku: 'FC-10-FG100F-950-02-36', description: 'FortiCare Premium 3yr', qty: 2, category: 'service', extendedSell: 5000 },
];

const TOTALS: SectionTotals = {
  hardwareTotal: 40000,
  softwareTotal: 0,
  serviceTotal: 12200,
  subscriptionTotal: 6000,
  grandTotalExVat: 58200,
  vatAmount: 8730,
  grandTotalIncVat: 66930,
};

const COMPLIANCE_STATS: SectionComplianceStats = {
  total: 20,
  compliant: 15,
  partial: 3,
  nonCompliant: 1,
  alternative: 1,
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateCoverPage', () => {
  it('contains customer name, project name, tenant, and date', () => {
    const s = generateCoverPage(META);
    expect(s.content).toContain('Aramco');
    expect(s.content).toContain('DataCenter Refresh');
    expect(s.content).toContain('NexusGlobal');
    expect(s.content).toContain('2026-05-11');
    expect(s.content).not.toContain('{{');
  });

  it('has the cover_page slug and id 0', () => {
    const s = generateCoverPage(META);
    expect(s.slug).toBe('cover_page');
    expect(s.id).toBe(0);
    expect(s.generationMethod).toBe('deterministic');
  });
});

describe('generateRequirementsSection', () => {
  it('lists mandatory count and the mandatory requirement text', () => {
    const s = generateRequirementsSection({ requirements: REQS });
    expect(s.content).toMatch(/mandatory: 2/);
    expect(s.content).toContain('99.99%');
    expect(s.content).toContain('IPv6');
    expect(s.content).toMatch(/Mandatory Requirements \(2\)/);
    expect(s.content).toMatch(/Optional Requirements \(1\)/);
    expect(s.content).toMatch(/Conditional Requirements \(1\)/);
  });

  it('uses the requirements slug and id 3', () => {
    const s = generateRequirementsSection({ requirements: REQS });
    expect(s.slug).toBe('requirements');
    expect(s.id).toBe(3);
  });
});

describe('generateTechnicalSpecs', () => {
  it('lists every SKU from the BoM', () => {
    const s = generateTechnicalSpecs({ bom: BOM, totals: TOTALS });
    for (const line of BOM) {
      expect(s.content).toContain(line.sku);
    }
    expect(s.slug).toBe('technical_specs');
    expect(s.id).toBe(5);
  });
});

describe('generateServiceLevels', () => {
  it('maps CON-SNT to Cisco SmartNet 8x5xNBD', () => {
    const s = generateServiceLevels({ bom: BOM });
    expect(s.content).toContain('Cisco SmartNet 8x5xNBD');
  });

  it('maps CON-SSSNT to Cisco SmartNet 24x7x4', () => {
    const s = generateServiceLevels({ bom: BOM });
    expect(s.content).toContain('Cisco SmartNet 24x7x4');
  });

  it('maps FC-10 to FortiCare Premium', () => {
    const s = generateServiceLevels({ bom: BOM });
    expect(s.content).toContain('FortiCare Premium');
  });

  it('uses the service_levels slug and id 7', () => {
    const s = generateServiceLevels({ bom: BOM });
    expect(s.slug).toBe('service_levels');
    expect(s.id).toBe(7);
  });
});

describe('generateCommercial', () => {
  it('shows the grand total with currency', () => {
    const s = generateCommercial({ totals: TOTALS }, META);
    expect(s.content).toContain('SAR');
    expect(s.content).toContain('66,930.00');
    expect(s.content).toMatch(/Grand Total/);
    expect(s.content).toContain('60 days');
  });

  it('has the commercial slug and id 8', () => {
    const s = generateCommercial({ totals: TOTALS }, META);
    expect(s.slug).toBe('commercial');
    expect(s.id).toBe(8);
  });
});

describe('generateComplianceSection', () => {
  it('shows the coverage percentage from stats', () => {
    const s = generateComplianceSection({ complianceMatrix: { stats: COMPLIANCE_STATS } });
    // (15 + 1) / 20 = 80%
    expect(s.content).toContain('80.0%');
    expect(s.content).toContain('Total requirements: 20');
    expect(s.content).toContain('Compliant: 15');
  });

  it('handles zero requirements without dividing by zero', () => {
    const empty: SectionComplianceStats = { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 };
    const s = generateComplianceSection({ complianceMatrix: { stats: empty } });
    expect(s.content).toContain('0.0%');
  });

  it('uses the compliance_matrix slug and id 10', () => {
    const s = generateComplianceSection({ complianceMatrix: { stats: COMPLIANCE_STATS } });
    expect(s.slug).toBe('compliance_matrix');
    expect(s.id).toBe(10);
  });
});

describe('generateAppendices', () => {
  it('lists 5 appendix items A through E', () => {
    const s = generateAppendices(
      { requirements: REQS, complianceMatrix: { stats: COMPLIANCE_STATS } },
      { bom: BOM, totals: TOTALS },
    );
    expect(s.content).toContain('Appendix A');
    expect(s.content).toContain('Appendix B');
    expect(s.content).toContain('Appendix C');
    expect(s.content).toContain('Appendix D');
    expect(s.content).toContain('Appendix E');
    const matches = s.content.match(/Appendix [A-E]/g) ?? [];
    expect(matches.length).toBe(5);
    expect(s.slug).toBe('appendices');
    expect(s.id).toBe(13);
  });
});

describe('generateSignaturePage', () => {
  it('renders customer, project, and tenant', () => {
    const s = generateSignaturePage(META);
    expect(s.content).toContain('Aramco');
    expect(s.content).toContain('DataCenter Refresh');
    expect(s.content).toContain('NexusGlobal');
    expect(s.content).not.toContain('{{');
    expect(s.slug).toBe('signature_page');
    expect(s.id).toBe(14);
  });
});

describe('generateAllDeterministicSections', () => {
  it('returns 8 sections with correct ids and slugs', () => {
    const sections = generateAllDeterministicSections(
      { requirements: REQS, complianceMatrix: { stats: COMPLIANCE_STATS } },
      { bom: BOM, totals: TOTALS },
      META,
    );
    expect(sections).toHaveLength(8);

    const expected = [
      'cover_page',
      'requirements',
      'technical_specs',
      'service_levels',
      'commercial',
      'compliance_matrix',
      'appendices',
      'signature_page',
    ];
    expect(sections.map((s) => s.slug)).toEqual(expected);

    for (const sec of sections) {
      const spec = PROPOSAL_SECTIONS.find((p) => p.slug === sec.slug);
      expect(spec).toBeDefined();
      expect(sec.id).toBe(spec!.id);
      expect(sec.title).toBe(spec!.title);
    }
  });
});

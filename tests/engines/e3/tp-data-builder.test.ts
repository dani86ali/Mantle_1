import { describe, it, expect } from 'vitest';
import { buildTpData, splitSectionBody } from '@/engines/e3/tp-data-builder';
import type { TpDataBuilderInput } from '@/engines/e3/tp-data-builder';
import type { ProposalMetadata, ProposalSection } from '@/engines/e3/types';

const META: ProposalMetadata = {
  customerName: 'ACME Bank',
  projectName: 'Branch Refresh',
  estimateId: 'EST-2026-0042',
  date: '2026-05-19',
  validityDays: 30,
  country: 'SA',
  currency: 'SAR',
  tenantName: 'Solutions By STC',
};

function sec(slug: string, content: string, id = 0): ProposalSection {
  return { id, title: slug, slug, content, generationMethod: 'deterministic', status: 'generated' };
}

function input(overrides: Partial<TpDataBuilderInput> = {}): TpDataBuilderInput {
  return {
    metadata: META,
    e1: {
      requirements: [],
      stats: { totalRequirements: 0, mandatoryCount: 0 },
      complianceMatrix: { stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 } },
      riskFlags: [],
      evalCriteria: {},
      vendorPreferences: [],
      sectorDetection: { sector: 'unknown' },
      clarifications: {},
    },
    e2: { bom: [], totals: { hardwareTotal: 0, softwareTotal: 0, serviceTotal: 0, subscriptionTotal: 0, grandTotalExVat: 0, vatAmount: 0, grandTotalIncVat: 0 }, validationResults: [] },
    sections: [],
    ...overrides,
  };
}

describe('splitSectionBody', () => {
  it('splits paragraphs on blank lines', () => {
    const chunks = splitSectionBody('Para one.\n\nPara two.\n\nPara three.');
    expect(chunks).toEqual(['Para one.', 'Para two.', 'Para three.']);
  });

  it('returns single-chunk array for body without blank-line separators', () => {
    expect(splitSectionBody('Just one paragraph.')).toEqual(['Just one paragraph.']);
  });

  it('returns empty array for empty / undefined', () => {
    expect(splitSectionBody('')).toEqual([]);
    expect(splitSectionBody(undefined)).toEqual([]);
    expect(splitSectionBody('   \n  \n  ')).toEqual([]);
  });
});

describe('buildTpData', () => {
  it('maps scalar metadata fields to template placeholders', () => {
    const data = buildTpData(input({ rfqNumber: 'RFQ-2026-001', contactName: 'Jane Doe' }));
    expect(data.customerName).toBe('ACME Bank');
    expect(data.customerFullName).toBe('ACME Bank');
    expect(data.opportunityNumber).toBe('EST-2026-0042');
    expect(data.rfqNumber).toBe('RFQ-2026-001');
    expect(data.documentDate).toBe('2026-05-19');
    expect(data.projectName).toBe('Branch Refresh');
    expect(data.contactName).toBe('Jane Doe');
  });

  it('renders a single-revision history with today\'s date when missing fields default', () => {
    const data = buildTpData(input());
    expect(data.revisions).toHaveLength(1);
    expect(data.revisions[0].revisionVersion).toBe('1.0');
    expect(data.revisions[0].revisionDate).toBe('2026-05-19');
  });

  it('maps e2.bom lines with sku as partNumber when orderableSku is absent', () => {
    const data = buildTpData(input({
      e2: {
        bom: [
          { sku: 'C9300-48P', description: 'Cat 9300', qty: 4, category: 'hardware', unitSellPrice: 1, extendedSell: 4 },
          { sku: 'CON-SSSNT', description: 'SmartNet', qty: 2, category: 'service', unitSellPrice: 1, extendedSell: 2 },
        ],
        totals: { hardwareTotal: 0, softwareTotal: 0, serviceTotal: 0, subscriptionTotal: 0, grandTotalExVat: 0, vatAmount: 0, grandTotalIncVat: 0 },
        validationResults: [],
      },
    }));
    expect(data.bom).toHaveLength(2);
    expect(data.bom[0].partNumber).toBe('C9300-48P');
    expect(data.bom[0].description).toBe('Cat 9300');
    expect(data.bom[0].qty).toBe(4);
    expect(data.bom[0].unit).toBe('Each');
  });

  it('prefers orderableSku over sku when present', () => {
    const bomWithOrderable = [{
      sku: 'BARE-MODEL',
      orderableSku: 'C9300-48P-A',
      description: 'Cat 9300 Advantage',
      qty: 1,
      category: 'hardware',
      unitSellPrice: 1,
      extendedSell: 1,
    }] as unknown as never;
    const data = buildTpData(input({
      e2: {
        bom: bomWithOrderable,
        totals: { hardwareTotal: 0, softwareTotal: 0, serviceTotal: 0, subscriptionTotal: 0, grandTotalExVat: 0, vatAmount: 0, grandTotalIncVat: 0 },
        validationResults: [],
      },
    }));
    expect(data.bom[0].partNumber).toBe('C9300-48P-A');
  });

  it('splits section bodies into paragraph arrays for the three prose loops', () => {
    const sections = [
      sec('executive_summary', 'Exec p1.\n\nExec p2.'),
      sec('requirements', 'Single understanding paragraph.'),
      sec('scope_assumptions', 'Assume A.\n\nAssume B.\n\nAssume C.'),
    ];
    const data = buildTpData(input({ sections }));
    expect(data.executiveSummaryBody).toEqual(['Exec p1.', 'Exec p2.']);
    expect(data.understandingBody).toEqual(['Single understanding paragraph.']);
    expect(data.assumptionsBody).toEqual(['Assume A.', 'Assume B.', 'Assume C.']);
  });

  it('returns empty arrays for absent sections (no throw)', () => {
    const data = buildTpData(input({ sections: [] }));
    expect(data.executiveSummaryBody).toEqual([]);
    expect(data.understandingBody).toEqual([]);
    expect(data.assumptionsBody).toEqual([]);
    expect(data.bom).toEqual([]);
  });
});

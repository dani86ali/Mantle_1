import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { runE3, type E3Input } from '@/engines/e3/orchestrator';
import { PROPOSAL_SECTIONS } from '@/engines/e3/types';

const mockCallAI = vi.mocked(callAI);

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'bomatic-e3-orch-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

beforeEach(() => {
  mockCallAI.mockReset();
});

function aiSuccess(taskIdPrefix: string, content: string) {
  return {
    success: true as const,
    data: { content, wordCount: 100 },
    tokensUsed: 100,
    latencyMs: 10,
    _taskIdPrefix: taskIdPrefix,
  };
}

function routeAi(prefix: string, content: string) {
  return (args: { taskId: string }) => {
    if (args.taskId.startsWith(prefix)) {
      return Promise.resolve({
        success: true as const,
        data: { content, wordCount: 100 },
        tokensUsed: 100,
        latencyMs: 10,
      });
    }
    return null;
  };
}

function buildInput(overrides: Partial<E3Input> = {}): E3Input {
  return {
    metadata: {
      customerName: 'Al Rajhi Bank',
      projectName: 'Branch Network Refresh',
      estimateId: 'EST-2026-0042',
      date: '2026-05-11',
      validityDays: 30,
      country: 'SA',
      currency: 'SAR',
      tenantName: 'Nexus Global Affiliates',
    },
    e1: {
      requirements: [
        { id: 'R-001', text: '24x7 high availability', classification: 'mandatory' },
        { id: 'R-002', text: 'IPsec VPN', classification: 'mandatory' },
        { id: 'R-003', text: 'SD-WAN', classification: 'optional' },
        { id: 'R-004', text: 'Cloud monitoring', classification: 'conditional' },
      ],
      stats: { totalRequirements: 4, mandatoryCount: 2, criticalRisks: 0 },
      complianceMatrix: {
        stats: { total: 4, compliant: 3, partial: 1, nonCompliant: 0, alternative: 0 },
      },
      riskFlags: [],
      evalCriteria: { methodology: 'unknown' },
      vendorPreferences: [
        { vendor: 'Cisco', category: 'switching', status: 'preferred' },
        { vendor: 'Fortinet', category: 'security', status: 'preferred' },
      ],
      sectorDetection: { sector: 'banking', frameworks: ['SAMA CSF', 'NCA ECC-1:2018'] },
      clarifications: { questions: [] },
    },
    e2: {
      bom: [
        { sku: 'C9300-48P', description: 'Cat 9300 48-port', qty: 10, category: 'hardware', unitSellPrice: 5000, extendedSell: 50000 },
        { sku: 'C9300-DNA-A', description: 'DNA Advantage', qty: 10, category: 'subscription', unitSellPrice: 800, extendedSell: 8000 },
        { sku: 'CON-SSSNT-C9300', description: 'SmartNet 24x7x4', qty: 10, category: 'service', unitSellPrice: 600, extendedSell: 6000 },
      ],
      totals: {
        hardwareTotal: 50000,
        softwareTotal: 0,
        serviceTotal: 6000,
        subscriptionTotal: 8000,
        grandTotalExVat: 64000,
        vatAmount: 9600,
        grandTotalIncVat: 73600,
      },
      validationResults: [],
    },
    costStack: {
      hardwareCost: 40000,
      softwareCost: 0,
      servicesCost: 4500,
      subscriptionCost: 6500,
      travelCost: 500,
      trainingCost: 1000,
      contingency: 1500,
    },
    outputDir: tmpDir,
    siteCount: 4,
    migrationApproach: 'phased',
    timeline: '12 weeks',
    keyStrengths: ['Cisco Gold Partner', 'Fortinet Expert Partner', 'MENA delivery footprint'],
    ...overrides,
  };
}

function mockAllAiSuccess() {
  mockCallAI.mockImplementation(async (args: { taskId: string }) => {
    const map: Array<[string, string]> = [
      ['cover-letter', '## Cover Letter\n\nAI cover letter content for Al Rajhi Bank.'],
      ['executive-summary', '## Executive Summary\n\nAI executive summary content. Total SAR 64,000.'],
      ['proposed-solution', '## Proposed Solution\n\nAI proposed solution content describing Cisco and Fortinet architecture across all layers.'],
      ['implementation', '## Implementation Approach\n\nAI implementation content with phases and PPDIOO methodology covering the full deployment.'],
      ['scope-customizer', '## Scope, Assumptions, Exclusions, Dependencies\n\nAI scope content for the engagement scope.'],
    ];
    for (const [prefix, content] of map) {
      if (args.taskId.startsWith(prefix)) {
        return {
          success: true as const,
          data: { content, wordCount: 80 },
          tokensUsed: 100,
          latencyMs: 10,
        };
      }
    }
    return {
      success: false as const,
      error: 'unrouted',
      retryCount: 1,
      fallback: 'engineer_review' as const,
    };
  });
}

function mockAllAiFailure() {
  mockCallAI.mockResolvedValue({
    success: false,
    error: 'API outage',
    retryCount: 1,
    fallback: 'engineer_review',
  });
}

describe('runE3 — happy path (AI success)', () => {
  it('returns all 15 sections in id order', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    expect(out.sections).toHaveLength(PROPOSAL_SECTIONS.length);
    for (let i = 0; i < out.sections.length; i++) {
      expect(out.sections[i].id).toBe(i);
    }
    const slugs = out.sections.map((s) => s.slug);
    for (const spec of PROPOSAL_SECTIONS) {
      expect(slugs).toContain(spec.slug);
    }
  });

  it('generates three pricing tiers with totals', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    expect(out.tiers.tiers).toHaveLength(3);
    expect(out.tiers.tiers.map((t) => t.name)).toEqual(['good', 'better', 'best']);
    for (const t of out.tiers.tiers) {
      expect(t.totals.grandTotal).toBeGreaterThan(0);
    }
    expect(out.tiers.comparison).toHaveLength(3);
  });

  it('analyses margin with totalCost, totalSell, approvalLevel, and flags array', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    expect(out.margin.totalCost).toBe(40000 + 0 + 4500 + 6500);
    expect(out.margin.totalSell).toBe(64000);
    expect(out.margin.approvalLevel).toBeDefined();
    expect(Array.isArray(out.margin.flags)).toBe(true);
  });

  it('writes proposal docx and financial xlsx to outputDir', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    expect(out.proposalPath).toBeDefined();
    expect(out.financialPath).toBeDefined();
    expect(out.proposalPath!.endsWith('.docx')).toBe(true);
    expect(out.financialPath!.endsWith('.xlsx')).toBe(true);
    const { stat } = await import('fs/promises');
    const docxStat = await stat(out.proposalPath!);
    const xlsxStat = await stat(out.financialPath!);
    expect(docxStat.size).toBeGreaterThan(0);
    expect(xlsxStat.size).toBeGreaterThan(0);
  });

  it('contains AI-enhanced content in the AI sections', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    const exec = out.sections.find((s) => s.slug === 'executive_summary');
    expect(exec?.content).toContain('AI executive summary content');
    const cover = out.sections.find((s) => s.slug === 'cover_letter');
    expect(cover?.content).toContain('AI cover letter');
  });

  it('calls callAI exactly five times (one per AI section)', async () => {
    mockAllAiSuccess();
    await runE3(buildInput());
    expect(mockCallAI).toHaveBeenCalledTimes(5);
  });
});

describe('runE3 — AI failure fallback', () => {
  it('still produces all 15 sections when every AI call fails', async () => {
    mockAllAiFailure();
    const out = await runE3(buildInput());
    expect(out.sections).toHaveLength(PROPOSAL_SECTIONS.length);
    const slugs = out.sections.map((s) => s.slug);
    expect(slugs).toContain('cover_letter');
    expect(slugs).toContain('executive_summary');
    expect(slugs).toContain('proposed_solution');
    expect(slugs).toContain('implementation');
    expect(slugs).toContain('scope_assumptions');
  });

  it('uses deterministic fallback text when AI fails', async () => {
    mockAllAiFailure();
    const out = await runE3(buildInput());
    const exec = out.sections.find((s) => s.slug === 'executive_summary');
    expect(exec?.content).toContain('Al Rajhi Bank');
    expect(exec?.content).toContain('### Challenge');
    const impl = out.sections.find((s) => s.slug === 'implementation');
    expect(impl?.content).toContain('PPDIOO');
  });

  it('still emits docx and xlsx artifacts on AI failure', async () => {
    mockAllAiFailure();
    const out = await runE3(buildInput());
    expect(out.proposalPath).toBeDefined();
    expect(out.financialPath).toBeDefined();
  });
});

describe('runE3 — emitFiles=false', () => {
  it('skips file writes when emitFiles is false', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput({ emitFiles: false }));
    expect(out.proposalPath).toBeUndefined();
    expect(out.financialPath).toBeUndefined();
    expect(out.sections).toHaveLength(PROPOSAL_SECTIONS.length);
  });
});

describe('runE3 — RFI enrichment (E4/E5 optional inputs)', () => {
  const baseline = {
    business: [
      { id: 'RB-001', text: 'Reduce branch outages — Critical', source: 'A1', priority: 'critical' as const, validated: false },
    ],
    functional: [
      { id: 'RB-002', text: 'SD-WAN with two ISPs', source: 'C1', priority: 'high' as const, validated: false },
    ],
    nonFunctional: [
      { id: 'RB-003', text: 'RTO ≤ 4 hours', source: 'D4', priority: 'high' as const, validated: false },
    ],
    constraints: [
      { id: 'RB-004', text: 'SAMA CSF compliance', source: 'E1', priority: 'critical' as const, validated: false },
    ],
    assumptions: [
      { id: 'RB-005', text: 'Cisco preferred vendor', source: 'F1', priority: 'medium' as const, validated: false },
    ],
  };

  const designApproach = {
    methodology: 'ppdioo',
    approach: 'top_down',
    frameworks: ['ppdioo', 'cisco_safe'],
    topologyPattern: 'two_tier_collapsed_core',
    vendor: 'cisco',
    projectType: 'campus_refresh',
  };
  const sizing = {
    coreDevices: [
      { role: 'core', model: 'C9500-32QC', vendor: 'cisco', quantity: 2, reasoning: 'Collapsed core for 4 sites' },
    ],
    distributionDevices: [],
    accessDevices: [
      { role: 'access', model: 'C9300-48P', vendor: 'cisco', quantity: 10, reasoning: '480 ports across branches' },
    ],
    firewalls: [],
    wirelessControllers: [],
    accessPoints: [],
  };
  const hldSections = [
    { sectionNumber: 1, title: 'Executive Summary', content: 'HLD exec summary text...' },
    { sectionNumber: 2, title: 'Network Architecture', content: 'Two-tier collapsed core...' },
  ];

  it('appends E4 baseline content to the requirements section when e4 is supplied', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput({ e4: { requirementsBaseline: baseline } }));
    const req = out.sections.find((s) => s.slug === 'requirements');
    expect(req).toBeDefined();
    expect(req!.content).toContain('Discovery Requirements Baseline (E4)');
    expect(req!.content).toContain('RB-001');
    expect(req!.content).toContain('SAMA CSF compliance');
    expect(req!.content).toContain('Non-Functional');
  });

  it('appends E5 design context to the proposed_solution section when e5 is supplied', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput({ e5: { designApproach, sizing, hldSections } }));
    const sol = out.sections.find((s) => s.slug === 'proposed_solution');
    expect(sol).toBeDefined();
    expect(sol!.content).toContain('Design Approach (E5)');
    expect(sol!.content).toContain('two_tier_collapsed_core');
    expect(sol!.content).toContain('Sizing Decisions (E5)');
    expect(sol!.content).toContain('C9500-32QC');
    expect(sol!.content).toContain('HLD Section Highlights (E5)');
    expect(sol!.content).toContain('Network Architecture');
  });

  it('appends E5 inputs to the implementation section when e5 is supplied', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput({ e5: { designApproach, sizing } }));
    const impl = out.sections.find((s) => s.slug === 'implementation');
    expect(impl).toBeDefined();
    expect(impl!.content).toContain('Design-Driven Implementation Inputs (E5)');
    expect(impl!.content).toContain('two_tier_collapsed_core');
    expect(impl!.content).toContain('Distinct device roles to install: 2');
  });

  it('RFP mode (no e4/e5) leaves all sections unchanged', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    const req = out.sections.find((s) => s.slug === 'requirements');
    const sol = out.sections.find((s) => s.slug === 'proposed_solution');
    const impl = out.sections.find((s) => s.slug === 'implementation');
    expect(req!.content).not.toContain('Discovery Requirements Baseline (E4)');
    expect(sol!.content).not.toContain('Design Approach (E5)');
    expect(impl!.content).not.toContain('Design-Driven Implementation Inputs (E5)');
  });
});

describe('runE3 — deterministic sections', () => {
  it('cover page mentions customer and project', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    const cover = out.sections.find((s) => s.slug === 'cover_page');
    expect(cover?.content).toContain('Al Rajhi Bank');
    expect(cover?.content).toContain('Branch Network Refresh');
  });

  it('commercial section reflects e2 totals and currency', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    const commercial = out.sections.find((s) => s.slug === 'commercial');
    expect(commercial?.content).toContain('SAR');
    expect(commercial?.content).toContain('64,000');
  });

  it('compliance section reports coverage from E1 stats', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    const compliance = out.sections.find((s) => s.slug === 'compliance_matrix');
    expect(compliance?.content).toContain('Total requirements: 4');
    expect(compliance?.content).toContain('Compliant: 3');
  });

  it('company profile and references sections are present', async () => {
    mockAllAiSuccess();
    const out = await runE3(buildInput());
    expect(out.sections.find((s) => s.slug === 'company_profile')).toBeDefined();
    expect(out.sections.find((s) => s.slug === 'references')).toBeDefined();
  });
});

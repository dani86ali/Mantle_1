import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({ callAI: vi.fn() }));

import { callAI } from '@/lib/ai/client';
import {
  generateHLDNarrative,
  type HLDNarrativeInput,
} from '@/engines/e5/hld-narrative-generator';
import type { MigrationApproach, SizingResult } from '@/engines/e5/types';

const mockCallAI = vi.mocked(callAI);

const sizing: SizingResult = {
  coreDevices: [{ role: 'core', model: 'C9500-48Y4C', vendor: 'cisco', quantity: 2, reasoning: '' }],
  distributionDevices: [],
  accessDevices: [{ role: 'access', model: 'C9300-48P', vendor: 'cisco', quantity: 8, reasoning: '' }],
  firewalls: [{ role: 'firewall', model: 'FPR-2110', vendor: 'cisco', quantity: 2, reasoning: '' }],
  wirelessControllers: [],
  accessPoints: [],
};

const baseInput: HLDNarrativeInput = {
  topology: 'two_tier_collapsed_core',
  sizing,
  vendor: 'cisco',
  projectType: 'enterprise-campus',
  customerName: 'Acme Corp',
};

function aiOk(content: string): Awaited<ReturnType<typeof callAI>> {
  return { success: true, data: { content }, tokensUsed: 100, latencyMs: 50 } as never;
}
function aiFail(): Awaited<ReturnType<typeof callAI>> {
  return { success: false, error: 'mock failure', retryCount: 1, fallback: 'engineer_review' } as never;
}

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('generateHLDNarrative', () => {
  it('returns all 12 sections sorted by sectionNumber', async () => {
    mockCallAI.mockResolvedValue(aiOk(
      'This Cisco two_tier_collapsed_core design adheres to hierarchical and resilient principles. '.repeat(2),
    ));
    const sections = await generateHLDNarrative(baseInput);
    expect(sections).toHaveLength(12);
    expect(sections.map((s) => s.sectionNumber)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it('deterministic sections have non-empty template content', async () => {
    mockCallAI.mockResolvedValue(aiOk(
      'Cisco two_tier_collapsed_core solution architecture. '.repeat(3),
    ));
    const sections = await generateHLDNarrative(baseInput);
    for (const n of [1, 3, 4, 7, 8, 10, 11, 12]) {
      const s = sections.find((x) => x.sectionNumber === n);
      expect(s).toBeDefined();
      expect(s!.content.length).toBeGreaterThan(20);
    }
    expect(sections.find((s) => s.sectionNumber === 1)!.content).toContain('Acme Corp');
    expect(sections.find((s) => s.sectionNumber === 8)!.content).toContain('C9500-48Y4C');
  });

  it('AI calls include topology and vendor in prompt', async () => {
    mockCallAI.mockResolvedValue(aiOk(
      'Cisco two_tier_collapsed_core solution. '.repeat(3),
    ));
    await generateHLDNarrative(baseInput);
    expect(mockCallAI).toHaveBeenCalledTimes(4);
    for (const call of mockCallAI.mock.calls) {
      const arg = call[0];
      expect(arg.systemPrompt).toContain('cisco');
      expect(arg.systemPrompt.toLowerCase()).toContain('two-tier collapsed core');
      expect(arg.prompt).toContain('two_tier_collapsed_core');
      expect(arg.taskId).toMatch(/^hld-narrative:section-\d+$/);
    }
  });

  it('AI failure → fallback content present for all 4 AI sections', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateHLDNarrative(baseInput);
    expect(sections).toHaveLength(12);
    for (const n of [2, 5, 6, 9]) {
      const s = sections.find((x) => x.sectionNumber === n)!;
      expect(s.content.length).toBeGreaterThan(20);
    }
    expect(sections.find((s) => s.sectionNumber === 2)!.content).toMatch(/Two-Tier Collapsed Core/);
    expect(sections.find((s) => s.sectionNumber === 9)!.content.toLowerCase()).toContain('firepower');
  });

  it('post-gate: AI content missing vendor name → fallback used', async () => {
    mockCallAI.mockResolvedValue(aiOk(
      'The two_tier_collapsed_core design provides resilience and scalability without naming any platform. '.repeat(2),
    ));
    const sections = await generateHLDNarrative(baseInput);
    const sec2 = sections.find((s) => s.sectionNumber === 2)!;
    expect(sec2.content).toMatch(/Two-Tier Collapsed Core/);
    expect(sec2.content).toMatch(/Acme Corp/);
  });

  it('post-gate: AI content missing topology → fallback used', async () => {
    mockCallAI.mockResolvedValue(aiOk(
      'This Cisco network design provides resilience and follows hierarchical principles only. '.repeat(2),
    ));
    const sections = await generateHLDNarrative(baseInput);
    const sec6 = sections.find((s) => s.sectionNumber === 6)!;
    expect(sec6.content.toLowerCase()).toContain('two-tier collapsed core');
  });

  it('migration section renders phases when migrationApproach provided', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const migration: MigrationApproach = {
      method: 'parallel_run',
      riskLevel: 'medium',
      reasoning: 'Brownfield with redundancy.',
      phases: [
        { name: 'Parallel Install', description: 'Install alongside', durationDays: 10, rollbackPlan: 'decommission new gear' },
        { name: 'Traffic Migration', description: 'Move VLANs', durationDays: 14, rollbackPlan: 'reroute via legacy trunks' },
      ],
    };
    const sections = await generateHLDNarrative({ ...baseInput, migrationApproach: migration });
    const mig = sections.find((s) => s.sectionNumber === 10)!;
    expect(mig.content).toContain('parallel_run');
    expect(mig.content).toContain('Parallel Install');
    expect(mig.content).toContain('Traffic Migration');
    expect(mig.content).not.toMatch(/selectMigrationApproach/);
  });

  it('migration section falls back when migrationApproach is missing', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateHLDNarrative(baseInput);
    const mig = sections.find((s) => s.sectionNumber === 10)!;
    expect(mig.content).toMatch(/to be determined/i);
  });

  it('resilience section adapts to three-tier topology', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateHLDNarrative({ ...baseInput, topology: 'three_tier_core_dist_access' });
    const sec7 = sections.find((s) => s.sectionNumber === 7)!;
    expect(sec7.content).toMatch(/distribution/i);
  });
});

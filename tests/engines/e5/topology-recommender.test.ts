import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  recommendTopology,
  type TopologyInput,
} from '@/engines/e5/topology-recommender';
import type { TopologyPattern } from '@/engines/e5/types';

const mockCallAI = vi.mocked(callAI);

const baseInput: TopologyInput = {
  projectType: 'enterprise-campus',
  portCount: 200,
  siteCount: 1,
  buildingCount: 1,
  userCount: 150,
  bandwidthGbps: 10,
  hasOT: false,
  hasHPC: false,
  hasGPON: false,
};

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('recommendTopology — deterministic high-confidence paths', () => {
  it('NVIDIA HPC → fat_tree_superpod without calling AI', async () => {
    const result = await recommendTopology({
      ...baseInput,
      projectType: 'ai-training-cluster',
      hasHPC: true,
      isNvidia: true,
    });

    expect(result.pattern).toBe('fat_tree_superpod');
    expect(result.confidence).toBe(0.95);
    expect(result.reasoning).toMatch(/InfiniBand|Fat-Tree|SuperPOD/i);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('Non-NVIDIA HPC → slingshot_dragonfly without calling AI', async () => {
    const result = await recommendTopology({
      ...baseInput,
      projectType: 'seismic-hpc',
      hasHPC: true,
      isNvidia: false,
    });

    expect(result.pattern).toBe('slingshot_dragonfly');
    expect(result.confidence).toBe(0.95);
    expect(result.reasoning).toMatch(/Slingshot|Dragonfly|HPE/i);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('HPC with isNvidia unspecified → slingshot_dragonfly (defaults non-Nvidia)', async () => {
    const result = await recommendTopology({
      ...baseInput,
      hasHPC: true,
    });

    expect(result.pattern).toBe('slingshot_dragonfly');
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('GPON hospitality → hub_and_spoke_gpon without calling AI', async () => {
    const result = await recommendTopology({
      ...baseInput,
      projectType: 'hotel-deployment',
      hasGPON: true,
    });

    expect(result.pattern).toBe('hub_and_spoke_gpon');
    expect(result.confidence).toBe(0.95);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('OT/SCADA present → ot_it_segmented without calling AI', async () => {
    const result = await recommendTopology({
      ...baseInput,
      projectType: 'oil-and-gas-plant',
      hasOT: true,
    });

    expect(result.pattern).toBe('ot_it_segmented');
    expect(result.confidence).toBe(0.9);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('Small single-building office (<500 ports, 1 building) → two_tier_collapsed_core', async () => {
    const result = await recommendTopology({
      ...baseInput,
      portCount: 200,
      buildingCount: 1,
    });

    expect(result.pattern).toBe('two_tier_collapsed_core');
    expect(result.confidence).toBe(0.9);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('Large campus (>=1000 ports) → three_tier_core_dist_access', async () => {
    const result = await recommendTopology({
      ...baseInput,
      portCount: 1500,
      buildingCount: 1,
    });

    expect(result.pattern).toBe('three_tier_core_dist_access');
    expect(result.confidence).toBe(0.85);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('Multi-building (small port count) → three_tier_core_dist_access', async () => {
    const result = await recommendTopology({
      ...baseInput,
      portCount: 300,
      buildingCount: 4,
    });

    expect(result.pattern).toBe('three_tier_core_dist_access');
    expect(result.confidence).toBe(0.85);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('High IDF density (>5 per floor) → three_tier_core_dist_access', async () => {
    const result = await recommendTopology({
      ...baseInput,
      portCount: 800,
      buildingCount: 1,
      idfRoomsPerFloor: 7,
    });

    expect(result.pattern).toBe('three_tier_core_dist_access');
    expect(result.confidence).toBe(0.85);
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('recommendTopology — ambiguous AI-escalation paths', () => {
  const ambiguousInput: TopologyInput = {
    ...baseInput,
    portCount: 600,
    buildingCount: 1,
  };

  it('uses AI result on ambiguous 500–999 port range', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        pattern: 'three_tier_core_dist_access',
        reasoning: 'Anticipated growth past 1k ports within 24 months.',
        alternativePattern: 'two_tier_collapsed_core',
        alternativeReasoning: 'Cheaper if no growth expected.',
      },
      tokensUsed: 250,
      latencyMs: 80,
    });

    const result = await recommendTopology(ambiguousInput);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.pattern).toBe('three_tier_core_dist_access');
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toContain('growth');
    expect(result.alternativePattern).toBe('two_tier_collapsed_core');
    expect(result.alternativeReasoning).toContain('Cheaper');

    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('senior network architect');
    expect(callArgs.prompt).toContain('Port count: 600');
    expect(callArgs.prompt).toContain('two_tier_collapsed_core');
  });

  it('AI failure on ambiguous case → deterministic two_tier fallback', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await recommendTopology(ambiguousInput);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.pattern).toBe('two_tier_collapsed_core');
    expect(result.confidence).toBe(0.7);
    expect(result.reasoning).toContain('AI escalation failed');
    expect(result.reasoning).toContain('rate limit');
  });

  it('AI returns invalid (non-enum) pattern → deterministic fallback', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      // Bypass the type system to simulate a Zod-bypassed/legacy response
      // arriving with a pattern outside the enum.
      data: {
        pattern: 'mesh_overlay_v9' as unknown as TopologyPattern,
        reasoning: 'Made-up pattern not in catalog.',
      },
      tokensUsed: 100,
      latencyMs: 40,
    });

    const result = await recommendTopology(ambiguousInput);

    expect(result.pattern).toBe('two_tier_collapsed_core');
    expect(result.confidence).toBe(0.7);
    expect(result.reasoning).toContain('invalid pattern');
  });
});

describe('recommendTopology — coverage of all six patterns', () => {
  it('returns each TopologyPattern enum value through some path', async () => {
    const seen = new Set<TopologyPattern>();

    seen.add(
      (await recommendTopology({ ...baseInput, hasHPC: true, isNvidia: true }))
        .pattern,
    );
    seen.add(
      (await recommendTopology({ ...baseInput, hasHPC: true })).pattern,
    );
    seen.add((await recommendTopology({ ...baseInput, hasGPON: true })).pattern);
    seen.add((await recommendTopology({ ...baseInput, hasOT: true })).pattern);
    seen.add(
      (await recommendTopology({ ...baseInput, portCount: 200 })).pattern,
    );
    seen.add(
      (await recommendTopology({ ...baseInput, portCount: 1500 })).pattern,
    );

    expect(seen).toEqual(
      new Set<TopologyPattern>([
        'fat_tree_superpod',
        'slingshot_dragonfly',
        'hub_and_spoke_gpon',
        'ot_it_segmented',
        'two_tier_collapsed_core',
        'three_tier_core_dist_access',
      ]),
    );
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

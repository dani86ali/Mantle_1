import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/engines/e5/methodology-selector', () => ({ selectMethodology: vi.fn() }));
vi.mock('@/engines/e5/topology-recommender', () => ({ recommendTopology: vi.fn() }));
vi.mock('@/engines/e5/sizing-calculator', () => ({ calculateSizing: vi.fn() }));
vi.mock('@/engines/e5/compatibility-validator', () => ({ validateCompatibility: vi.fn() }));
vi.mock('@/engines/e5/hld-narrative-generator', () => ({ generateHLDNarrative: vi.fn() }));
vi.mock('@/engines/e5/hld-docx-generator', () => ({ generateHLDDocx: vi.fn() }));
vi.mock('@/engines/e5/diagram-generator', () => ({ generateDiagrams: vi.fn() }));
vi.mock('@/engines/e5/ip-vlan-planner', () => ({ planIPVlans: vi.fn() }));
vi.mock('@/engines/e5/port-map-generator', () => ({ generatePortMaps: vi.fn() }));
vi.mock('@/engines/e5/cable-schedule-generator', () => ({ generateCableSchedule: vi.fn() }));
vi.mock('@/engines/e5/qos-policy-generator', () => ({ generateQoSPolicy: vi.fn() }));
vi.mock('@/engines/e5/migration-selector', () => ({ selectMigrationApproach: vi.fn() }));
vi.mock('@/engines/e5/lld-narrative-generator', () => ({ generateLLDNarrative: vi.fn() }));
vi.mock('@/engines/e5/lld-docx-generator', () => ({ generateLLDDocx: vi.fn() }));
vi.mock('@/engines/e5/rack-elevation-generator', () => ({ generateRackElevations: vi.fn() }));
vi.mock('@/engines/e5/component-list-builder', () => ({ buildComponentList: vi.fn() }));

import { selectMethodology } from '@/engines/e5/methodology-selector';
import { recommendTopology } from '@/engines/e5/topology-recommender';
import { calculateSizing } from '@/engines/e5/sizing-calculator';
import { validateCompatibility } from '@/engines/e5/compatibility-validator';
import { generateHLDNarrative } from '@/engines/e5/hld-narrative-generator';
import { generateHLDDocx } from '@/engines/e5/hld-docx-generator';
import { generateDiagrams } from '@/engines/e5/diagram-generator';
import { planIPVlans } from '@/engines/e5/ip-vlan-planner';
import { generatePortMaps } from '@/engines/e5/port-map-generator';
import { generateCableSchedule } from '@/engines/e5/cable-schedule-generator';
import { generateQoSPolicy } from '@/engines/e5/qos-policy-generator';
import { selectMigrationApproach } from '@/engines/e5/migration-selector';
import { generateLLDNarrative } from '@/engines/e5/lld-narrative-generator';
import { generateLLDDocx } from '@/engines/e5/lld-docx-generator';
import { generateRackElevations } from '@/engines/e5/rack-elevation-generator';
import { buildComponentList } from '@/engines/e5/component-list-builder';

import { runE5, runE5Detailed } from '@/engines/e5/orchestrator';
import type { CheckpointCallback, E5InputData, Phase1Handoff } from '@/engines/e5/orchestrator';
import type { EngineInput, PipelineState } from '@/coordinator/types';
import type {
  CompatibilityResult, DesignApproach, IPVlanPlan, MigrationApproach,
  QoSPolicy, SizingResult, TopologyPattern,
} from '@/engines/e5/types';

const mMethod = vi.mocked(selectMethodology);
const mTopo = vi.mocked(recommendTopology);
const mSize = vi.mocked(calculateSizing);
const mCompat = vi.mocked(validateCompatibility);
const mHldNarr = vi.mocked(generateHLDNarrative);
const mHldDocx = vi.mocked(generateHLDDocx);
const mDiagrams = vi.mocked(generateDiagrams);
const mIp = vi.mocked(planIPVlans);
const mPort = vi.mocked(generatePortMaps);
const mCable = vi.mocked(generateCableSchedule);
const mQos = vi.mocked(generateQoSPolicy);
const mMig = vi.mocked(selectMigrationApproach);
const mLldNarr = vi.mocked(generateLLDNarrative);
const mLldDocx = vi.mocked(generateLLDDocx);
const mRack = vi.mocked(generateRackElevations);
const mComp = vi.mocked(buildComponentList);

function makeState(): PipelineState {
  const now = new Date();
  return {
    id: 'pipe-1', opportunityId: 'opp-1', mode: 'rfi', currentEngine: 'e5',
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [], engineCalls: [], timestamps: { createdAt: now, updatedAt: now },
  };
}

const baseInputData: E5InputData = {
  requirementsBaseline: {}, vendor: 'cisco', customerName: 'Acme', projectName: 'Refresh',
  projectType: 'campus_refresh', siteCount: 2, buildingCount: 1, portCount: 400,
  userCount: 200, bandwidthGbps: 5,
};

function makeInput(data: Partial<E5InputData> = {}): EngineInput<E5InputData> {
  return {
    engine: 'e5', pipelineState: makeState(),
    inputData: { ...baseInputData, ...data },
  };
}

const APPROACH: DesignApproach = {
  methodology: 'ppdioo', approach: 'top_down', frameworks: ['ppdioo'],
  topologyPattern: null, vendor: 'cisco', projectType: 'campus_refresh',
};
const TOPOLOGY: TopologyPattern = 'two_tier_collapsed_core';
const SIZING: SizingResult = {
  coreDevices: [{ role: 'core', model: 'C9500-24Y4C', vendor: 'cisco', quantity: 2, reasoning: 'r' }],
  distributionDevices: [], accessDevices: [], firewalls: [], wirelessControllers: [], accessPoints: [],
};
const COMPAT: CompatibilityResult = { valid: true, errors: [], warnings: [] };
const VLAN_PLAN: IPVlanPlan = { vlans: [], subnets: [], vrfs: [] };
const QOS: QoSPolicy = { vendor: 'cisco', classes: [], markingPolicy: '', queuingPolicy: '' };
const MIG: MigrationApproach = { method: 'cutover', phases: [], riskLevel: 'low', reasoning: 'r' };

function defaultMocks(): void {
  mMethod.mockReturnValue(APPROACH);
  mTopo.mockResolvedValue({ pattern: TOPOLOGY, confidence: 0.9, reasoning: 'r' });
  mSize.mockReturnValue(SIZING);
  mCompat.mockReturnValue(COMPAT);
  mHldNarr.mockResolvedValue([{ sectionNumber: 1, title: 'A', content: 'x' }]);
  mHldDocx.mockResolvedValue('/tmp/hld.docx');
  mDiagrams.mockReturnValue({ logicalTopology: '<mx/>' });
  mIp.mockReturnValue(VLAN_PLAN);
  mPort.mockReturnValue([]);
  mCable.mockReturnValue([]);
  mQos.mockReturnValue(QOS);
  mMig.mockReturnValue(MIG);
  mLldNarr.mockResolvedValue([{ sectionNumber: 1, title: 'A', content: 'x' }]);
  mLldDocx.mockResolvedValue('/tmp/lld.docx');
  mRack.mockReturnValue([]);
  mComp.mockReturnValue([{ model: 'C9500-24Y4C', vendor: 'cisco', quantity: 2, role: 'core', fromDesignStep: 'sizing-calculator' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultMocks();
});

describe('runE5 — input validation', () => {
  it('returns error EngineOutput when customerName is missing', async () => {
    const out = await runE5({
      engine: 'e5',
      pipelineState: makeState(),
      inputData: {} as E5InputData,
    });
    expect(out.error).toBeDefined();
  });
  it('returns just the EngineOutput shape via runE5', async () => {
    const out = await runE5(makeInput());
    expect(out.engine).toBe('e5');
    expect(Array.isArray(out.warnings)).toBe(true);
  });
});

describe('runE5 — full pipeline', () => {
  it('runs all steps in order and reaches all three checkpoints', async () => {
    const calls: string[] = [];
    const cb: CheckpointCallback = vi.fn((id: string) => {
      calls.push(id);
      return { decision: 'approved' as const };
    });
    const out = await runE5Detailed(makeInput({ onCheckpoint: cb }));
    expect(out.phase).toBe('full');
    expect(mMethod).toHaveBeenCalledTimes(1);
    expect(mTopo).toHaveBeenCalledTimes(1);
    expect(mSize).toHaveBeenCalledTimes(1);
    expect(mCompat).toHaveBeenCalledTimes(2); // step 4 + step 17
    expect(mHldNarr).toHaveBeenCalledTimes(1);
    expect(mHldDocx).toHaveBeenCalledTimes(1);
    expect(mDiagrams).toHaveBeenCalledTimes(1);
    expect(mIp).toHaveBeenCalledTimes(1);
    expect(mPort).toHaveBeenCalledTimes(1);
    expect(mCable).toHaveBeenCalledTimes(1);
    expect(mQos).toHaveBeenCalledTimes(1);
    expect(mMig).toHaveBeenCalledTimes(2); // phase 1 (for HLD §10) + phase 2 step 13
    expect(mLldNarr).toHaveBeenCalledTimes(1);
    expect(mLldDocx).toHaveBeenCalledTimes(1);
    expect(mRack).toHaveBeenCalledTimes(1);
    expect(mComp).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['e5-design-approach', 'e5-hld', 'e5-lld']);
    expect(out.output.artifacts.hldDocument).toBe('/tmp/hld.docx');
    expect(out.output.artifacts.lldDocument).toBe('/tmp/lld.docx');
    expect(out.output.artifacts.diagrams).toEqual(['<mx/>']);
    expect(out.output.artifacts.componentList).toBeDefined();
    expect(out.componentList).toHaveLength(1);
    expect(out.output.artifacts.designSummary).toBeDefined();
    const parsed = JSON.parse(out.output.artifacts.designSummary!);
    expect(parsed.designApproach).toBeDefined();
    expect(parsed.sizing).toBeDefined();
    expect(Array.isArray(parsed.hldSections)).toBe(true);
  });
});

describe('runE5 — HLD-only phase', () => {
  it('runs steps 1-7 plus component-list build, skips phase 2', async () => {
    const out = await runE5Detailed(makeInput({ phase: 'hld' }));
    expect(out.phase).toBe('hld');
    expect(mMethod).toHaveBeenCalledTimes(1);
    expect(mTopo).toHaveBeenCalledTimes(1);
    expect(mSize).toHaveBeenCalledTimes(1);
    expect(mHldNarr).toHaveBeenCalledTimes(1);
    expect(mDiagrams).toHaveBeenCalledTimes(1);
    expect(mIp).not.toHaveBeenCalled();
    expect(mLldNarr).not.toHaveBeenCalled();
    expect(mRack).not.toHaveBeenCalled();
    // componentList IS built in phase=hld — E2 needs devices to price (Fix #5).
    expect(mComp).toHaveBeenCalledTimes(1);
    expect(mComp).toHaveBeenCalledWith(SIZING);
    expect(out.componentList).toBeDefined();
    expect(out.componentList?.length).toBeGreaterThan(0);
    expect(out.output.artifacts.componentList).toBeDefined();
    expect(out.output.artifacts.hldDocument).toBe('/tmp/hld.docx');
    expect(out.output.artifacts.lldDocument).toBeUndefined();
  });
});

describe('runE5 — LLD-only phase', () => {
  it('runs steps 9-19 and skips phase 1', async () => {
    const handoff: Phase1Handoff = {
      designApproach: APPROACH, topology: TOPOLOGY, sizing: SIZING, compatibility: COMPAT,
    };
    const out = await runE5Detailed(makeInput({ phase: 'lld', hldHandoff: handoff }));
    expect(out.phase).toBe('lld');
    expect(mMethod).not.toHaveBeenCalled();
    expect(mTopo).not.toHaveBeenCalled();
    expect(mHldNarr).not.toHaveBeenCalled();
    expect(mIp).toHaveBeenCalledTimes(1);
    expect(mLldNarr).toHaveBeenCalledTimes(1);
    expect(mRack).toHaveBeenCalledTimes(1);
    expect(mComp).toHaveBeenCalledTimes(1);
    expect(out.output.artifacts.lldDocument).toBe('/tmp/lld.docx');
    expect(out.output.artifacts.hldDocument).toBeUndefined();
  });
  it('returns error when LLD phase lacks hldHandoff', async () => {
    const out = await runE5Detailed(makeInput({ phase: 'lld' }));
    expect(out.output.error).toContain('hldHandoff');
  });
});

describe('runE5 — checkpoint revision loops', () => {
  it('design-approach revision re-runs steps 1-2', async () => {
    const cb: CheckpointCallback = vi.fn()
      .mockImplementationOnce((id: string) => id === 'e5-design-approach'
        ? { decision: 'revision_requested' as const, notes: 'try again' }
        : { decision: 'approved' as const })
      .mockImplementation(() => ({ decision: 'approved' as const }));
    await runE5Detailed(makeInput({ onCheckpoint: cb }));
    expect(mMethod).toHaveBeenCalledTimes(2);
    expect(mTopo).toHaveBeenCalledTimes(2);
    // Steps 3-4 still run only once after the loop exits.
    expect(mSize).toHaveBeenCalledTimes(1);
  });

  it('HLD checkpoint revision re-runs steps 5-7', async () => {
    let nth = 0;
    const cb: CheckpointCallback = vi.fn((id: string) => {
      nth++;
      if (id === 'e5-hld' && nth === 2) return { decision: 'revision_requested' as const, notes: 'more' };
      return { decision: 'approved' as const };
    });
    await runE5Detailed(makeInput({ onCheckpoint: cb }));
    expect(mHldNarr).toHaveBeenCalledTimes(2);
    expect(mHldDocx).toHaveBeenCalledTimes(2);
    expect(mDiagrams).toHaveBeenCalledTimes(2);
    expect(mMethod).toHaveBeenCalledTimes(1);
    expect(mTopo).toHaveBeenCalledTimes(1);
  });

  it('LLD checkpoint revision re-runs steps 14-16', async () => {
    const cb: CheckpointCallback = vi.fn((id: string, _a: string, rev: number) => {
      if (id === 'e5-lld' && rev === 0) return { decision: 'revision_requested' as const, notes: 'r' };
      return { decision: 'approved' as const };
    });
    await runE5Detailed(makeInput({ onCheckpoint: cb }));
    expect(mLldNarr).toHaveBeenCalledTimes(2);
    expect(mLldDocx).toHaveBeenCalledTimes(2);
    expect(mRack).toHaveBeenCalledTimes(2);
    expect(mIp).toHaveBeenCalledTimes(1);
  });

  it('design-approach checkpoint hard-caps at 3 revisions', async () => {
    const cb = vi.fn((id: string) => id === 'e5-design-approach'
      ? { decision: 'revision_requested' as const, notes: 'r' }
      : { decision: 'approved' as const });
    await runE5Detailed(makeInput({ onCheckpoint: cb as CheckpointCallback }));
    expect(mMethod).toHaveBeenCalledTimes(4);
    expect(mTopo).toHaveBeenCalledTimes(4);
    const designCalls = cb.mock.calls.filter((c) => c[0] === 'e5-design-approach');
    expect(designCalls).toHaveLength(3);
  });

  it('HLD checkpoint hard-caps at 3 revisions', async () => {
    const cb = vi.fn((id: string) => id === 'e5-hld'
      ? { decision: 'revision_requested' as const, notes: 'r' }
      : { decision: 'approved' as const });
    await runE5Detailed(makeInput({ onCheckpoint: cb as CheckpointCallback }));
    expect(mHldNarr).toHaveBeenCalledTimes(4);
    expect(mHldDocx).toHaveBeenCalledTimes(4);
    expect(mDiagrams).toHaveBeenCalledTimes(4);
    const hldCalls = cb.mock.calls.filter((c) => c[0] === 'e5-hld');
    expect(hldCalls).toHaveLength(3);
  });

  it('LLD checkpoint hard-caps at 3 revisions', async () => {
    const cb = vi.fn((id: string) => id === 'e5-lld'
      ? { decision: 'revision_requested' as const, notes: 'r' }
      : { decision: 'approved' as const });
    await runE5Detailed(makeInput({ onCheckpoint: cb as CheckpointCallback }));
    expect(mLldNarr).toHaveBeenCalledTimes(4);
    expect(mLldDocx).toHaveBeenCalledTimes(4);
    expect(mRack).toHaveBeenCalledTimes(4);
    const lldCalls = cb.mock.calls.filter((c) => c[0] === 'e5-lld');
    expect(lldCalls).toHaveLength(3);
  });
});

describe('runE5 — step failure resilience', () => {
  it('continues when an early step throws and subsequent steps still run', async () => {
    mSize.mockImplementationOnce(() => { throw new Error('sizing outage'); });
    const out = await runE5Detailed(makeInput());
    expect(mCompat).toHaveBeenCalled();
    expect(mHldNarr).toHaveBeenCalled();
    expect(mIp).toHaveBeenCalled();
    expect(mComp).toHaveBeenCalled();
    expect(out.output.warnings.some((w) => w.includes('Step 3'))).toBe(true);
    expect(out.logs.find((l) => l.step === 3)?.status).toBe('failed');
    expect(out.logs.find((l) => l.step === 4)?.status).toBe('completed');
  });

  it('continues when an AI step throws', async () => {
    mHldNarr.mockRejectedValueOnce(new Error('AI outage'));
    const out = await runE5Detailed(makeInput());
    expect(mHldDocx).toHaveBeenCalled();
    expect(mDiagrams).toHaveBeenCalled();
    expect(out.output.warnings.some((w) => w.includes('Step 5'))).toBe(true);
  });
});

describe('runE5 — component list build', () => {
  it('builds the component list at the end of a full run', async () => {
    const out = await runE5Detailed(makeInput());
    expect(mComp).toHaveBeenCalledTimes(1);
    expect(mComp).toHaveBeenCalledWith(SIZING);
    expect(out.componentList?.length).toBeGreaterThan(0);
  });
});

describe('runE5 — step log shape', () => {
  it('every step log entry has step/name/status/durationMs', async () => {
    const out = await runE5Detailed(makeInput());
    expect(out.logs.length).toBeGreaterThan(0);
    for (const log of out.logs) {
      expect(['started', 'completed', 'skipped', 'failed']).toContain(log.status);
      expect(typeof log.durationMs).toBe('number');
      expect(typeof log.step).toBe('number');
      expect(typeof log.name).toBe('string');
    }
  });

  it('logs include all 19 step numbers on a full run', async () => {
    const out = await runE5Detailed(makeInput());
    const stepNums = new Set(out.logs.map((l) => l.step));
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]) {
      expect(stepNums.has(s)).toBe(true);
    }
  });
});

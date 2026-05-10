import { describe, it, expect } from 'vitest';
import { getEngineSequence, getNextEngine } from '@/coordinator/router';
import type { PipelineState, ArtifactRegistry } from '@/coordinator/types';

function makeArtifacts(overrides: Partial<ArtifactRegistry> = {}): ArtifactRegistry {
  return { e1: {}, e2: {}, e3: {}, e4: {}, e5: {}, ...overrides };
}

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    id: 'pipe-001',
    opportunityId: 'opp-abc',
    mode: 'rfp',
    currentEngine: 'e1',
    artifacts: makeArtifacts(),
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: new Date('2026-05-09'), updatedAt: new Date('2026-05-09') },
    ...overrides,
  };
}

describe('getEngineSequence', () => {
  it('returns correct RFP sequence', () => {
    expect(getEngineSequence('rfp')).toEqual(['e1', 'e2', 'e3']);
  });

  it('returns correct RFI sequence', () => {
    expect(getEngineSequence('rfi')).toEqual(['e4', 'e5', 'e2', 'e3']);
  });
});

describe('getNextEngine', () => {
  it('returns first engine when no artifacts exist (rfp)', () => {
    const state = makePipelineState({ mode: 'rfp' });
    expect(getNextEngine(state)).toBe('e1');
  });

  it('returns first engine when no artifacts exist (rfi)', () => {
    const state = makePipelineState({ mode: 'rfi' });
    expect(getNextEngine(state)).toBe('e4');
  });

  it('skips completed engines and returns next pending one (rfp)', () => {
    const state = makePipelineState({
      mode: 'rfp',
      artifacts: makeArtifacts({ e1: { sector: 'telecom' } }),
    });
    expect(getNextEngine(state)).toBe('e2');
  });

  it('skips multiple completed engines (rfp)', () => {
    const state = makePipelineState({
      mode: 'rfp',
      artifacts: makeArtifacts({
        e1: { sector: 'telecom' },
        e2: { pricingSummary: 's3://bucket/pricing.json' },
      }),
    });
    expect(getNextEngine(state)).toBe('e3');
  });

  it('skips completed engines (rfi) and returns next pending one', () => {
    const state = makePipelineState({
      mode: 'rfi',
      artifacts: makeArtifacts({ e4: { questionnaire: 's3://bucket/q.docx' } }),
    });
    expect(getNextEngine(state)).toBe('e5');
  });

  it('skips completed engines in rfi sequence past e4 and e5', () => {
    const state = makePipelineState({
      mode: 'rfi',
      artifacts: makeArtifacts({
        e4: { questionnaire: 's3://bucket/q.docx' },
        e5: { hldDocument: 's3://bucket/hld.docx' },
      }),
    });
    expect(getNextEngine(state)).toBe('e2');
  });

  it('returns complete when all rfp engines have artifacts', () => {
    const state = makePipelineState({
      mode: 'rfp',
      artifacts: makeArtifacts({
        e1: { sector: 'telecom' },
        e2: { pricingSummary: 's3://bucket/pricing.json' },
        e3: { submissionPdf: 's3://bucket/submission.pdf' },
      }),
    });
    expect(getNextEngine(state)).toBe('complete');
  });

  it('returns complete when all rfi engines have artifacts', () => {
    const state = makePipelineState({
      mode: 'rfi',
      artifacts: makeArtifacts({
        e4: { questionnaire: 's3://bucket/q.docx' },
        e5: { hldDocument: 's3://bucket/hld.docx' },
        e2: { bomWorkbook: 's3://bucket/bom.xlsx' },
        e3: { submissionPdf: 's3://bucket/submission.pdf' },
      }),
    });
    expect(getNextEngine(state)).toBe('complete');
  });
});

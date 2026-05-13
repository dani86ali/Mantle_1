import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/engines/e4/project-type-detector', () => ({
  detectProjectType: vi.fn(),
}));
vi.mock('@/engines/e4/project-type-ai', () => ({
  enhancedProjectTypeDetection: vi.fn(),
}));
vi.mock('@/engines/e4/questionnaire-generator', () => ({
  generateQuestionnaire: vi.fn(),
  questionnaireToMarkdown: vi.fn(),
}));
vi.mock('@/engines/e4/emphasis-matrix', () => ({
  getPrioritizedSections: vi.fn(),
}));
vi.mock('@/engines/e4/question-customizer', () => ({
  customizeQuestions: vi.fn(),
}));
vi.mock('@/engines/e4/response-parser', () => ({
  parseResponse: vi.fn(),
}));
vi.mock('@/engines/e4/free-text-interpreter', () => ({
  interpretFreeText: vi.fn(),
}));
vi.mock('@/engines/e4/gap-detector-ai', () => ({
  enhancedGapDetection: vi.fn(),
}));
vi.mock('@/engines/e4/requirements-baseline-builder', () => ({
  buildRequirementsBaseline: vi.fn(),
}));

import { detectProjectType } from '@/engines/e4/project-type-detector';
import { enhancedProjectTypeDetection } from '@/engines/e4/project-type-ai';
import {
  generateQuestionnaire,
  questionnaireToMarkdown,
} from '@/engines/e4/questionnaire-generator';
import { getPrioritizedSections } from '@/engines/e4/emphasis-matrix';
import { customizeQuestions } from '@/engines/e4/question-customizer';
import { parseResponse } from '@/engines/e4/response-parser';
import { interpretFreeText } from '@/engines/e4/free-text-interpreter';
import { enhancedGapDetection } from '@/engines/e4/gap-detector-ai';
import { buildRequirementsBaseline } from '@/engines/e4/requirements-baseline-builder';
import { runE4, runE4Detailed } from '@/engines/e4/orchestrator';
import type { CheckpointCallback } from '@/engines/e4/orchestrator';
import type { EngineInput, PipelineState } from '@/coordinator/types';
import type {
  ClientResponse,
  Question,
  QuestionnaireSection,
} from '@/engines/e4/types';

const mDetect = vi.mocked(detectProjectType);
const mDetectAI = vi.mocked(enhancedProjectTypeDetection);
const mGenerate = vi.mocked(generateQuestionnaire);
const mToMarkdown = vi.mocked(questionnaireToMarkdown);
const mPrioritized = vi.mocked(getPrioritizedSections);
const mCustomize = vi.mocked(customizeQuestions);
const mParse = vi.mocked(parseResponse);
const mInterpret = vi.mocked(interpretFreeText);
const mGapDetect = vi.mocked(enhancedGapDetection);
const mBuildBaseline = vi.mocked(buildRequirementsBaseline);

function makeState(): PipelineState {
  const now = new Date();
  return {
    id: 'pipe-1',
    opportunityId: 'opp-1',
    mode: 'rfi',
    currentEngine: 'e4',
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

function makeInput(inputData: Record<string, unknown>, revisionNotes?: string): EngineInput {
  return { engine: 'e4', pipelineState: makeState(), inputData, revisionNotes };
}

const Q_A1: Question = { id: 'A1', section: 'A', priority: 'required', responseType: 'text', text: 'A1 text' };
const Q_B1: Question = { id: 'B1', section: 'B', priority: 'required', responseType: 'text', text: 'B1 text' };
const SECTIONS: QuestionnaireSection[] = [
  { id: 'A', title: 'A', description: '', questions: [Q_A1] },
  { id: 'B', title: 'B', description: '', questions: [Q_B1] },
];

function defaultMockSetup(): void {
  mDetect.mockReturnValue({ type: 'campus_refresh', confidence: 0.9, evidence: ['campus refresh'] });
  mDetectAI.mockResolvedValue({ type: 'sd_wan', confidence: 0.85, evidence: ['sd-wan'] });
  mGenerate.mockReturnValue({
    sections: SECTIONS,
    totalQuestions: 2,
    requiredQuestions: 2,
    projectType: 'campus_refresh',
    emphasis: { A: 'high', B: 'high', C: 'medium', D: 'medium', E: 'medium', F: 'medium' },
  });
  mPrioritized.mockReturnValue(['A', 'B', 'C', 'D', 'E', 'F']);
  mToMarkdown.mockReturnValue('# Questionnaire\n\nMOCK');
  mCustomize.mockResolvedValue([Q_A1, Q_B1]);
  mParse.mockResolvedValue({
    responses: [{ questionId: 'A1', answer: 'parsed answer', confidence: 1, source: 'structured' }],
    format: 'excel',
  });
  mInterpret.mockResolvedValue([
    { questionId: 'A1', answer: 'free text answer', confidence: 0.9, source: 'ai_interpreted' },
  ]);
  mGapDetect.mockResolvedValue({
    completeQuestions: ['A1'],
    incompleteQuestions: ['B1'],
    vagueAnswers: [],
    missingCategories: [],
    contradictions: [],
    unstatedAssumptions: [],
  });
  mBuildBaseline.mockReturnValue({
    business: [{ id: 'RB-001', text: 'A1 — parsed', source: 'A1', priority: 'critical', validated: false }],
    functional: [], nonFunctional: [], constraints: [], assumptions: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultMockSetup();
});

describe('runE4 — phase detection', () => {
  it('routes phase 1 when no response payload is present', async () => {
    const out = await runE4Detailed(makeInput({ clientName: 'Acme', country: 'SA' }));
    expect(out.phase).toBe('phase1');
    expect(out.output.artifacts.questionnaire).toBeDefined();
    expect(out.output.artifacts.requirementsBaseline).toBeUndefined();
  });

  it('routes phase 2 when clientResponses are present', async () => {
    const responses: ClientResponse[] = [
      { questionId: 'A1', answer: 'value', confidence: 1, source: 'structured' },
    ];
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', clientResponses: responses, questions: [Q_A1, Q_B1],
    }));
    expect(out.phase).toBe('phase2');
    expect(out.output.artifacts.requirementsBaseline).toBeDefined();
    expect(out.output.artifacts.questionnaire).toBeUndefined();
  });

  it('routes phase 2 when responseFilePath is present', async () => {
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseFilePath: '/tmp/r.xlsx', questions: [Q_A1, Q_B1],
    }));
    expect(out.phase).toBe('phase2');
  });

  it('routes phase 2 when responseText is present', async () => {
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseText: 'A1: hello', questions: [Q_A1, Q_B1],
    }));
    expect(out.phase).toBe('phase2');
  });
});

describe('runE4 — phase 1 happy path', () => {
  it('detects project type, generates questionnaire, returns markdown', async () => {
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', description: 'campus refresh project',
    }));
    expect(mDetect).toHaveBeenCalledTimes(1);
    expect(mGenerate).toHaveBeenCalledTimes(1);
    expect(mToMarkdown).toHaveBeenCalledTimes(1);
    expect(out.output.artifacts.questionnaire).toContain('MOCK');
    expect(out.phase1?.questions).toHaveLength(2);
    expect(out.phase1?.projectType).toBe('campus_refresh');
  });

  it('skips question customization when no sector is supplied', async () => {
    await runE4Detailed(makeInput({ clientName: 'Acme', country: 'SA' }));
    expect(mCustomize).not.toHaveBeenCalled();
  });

  it('calls customizeQuestions when sector is supplied', async () => {
    await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', sector: 'banking',
    }));
    expect(mCustomize).toHaveBeenCalledTimes(1);
  });

  it('uses the AI detector when input is flagged ambiguous', async () => {
    await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', ambiguous: true, description: 'unclear',
    }));
    expect(mDetectAI).toHaveBeenCalledTimes(1);
    expect(mDetect).not.toHaveBeenCalled();
  });

  it('reaches the e4-questionnaire checkpoint and returns approved', async () => {
    const cb: CheckpointCallback = vi.fn().mockResolvedValue({ decision: 'approved' });
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', onCheckpoint: cb,
    }));
    expect(cb).toHaveBeenCalledWith('e4-questionnaire', expect.stringContaining('MOCK'), 0);
    expect(out.phase1?.revisions).toBe(0);
  });
});

describe('runE4 — phase 1 revision loop', () => {
  it('re-runs steps 2-4 on revision_requested and stops after approved', async () => {
    const cb = vi.fn()
      .mockResolvedValueOnce({ decision: 'revision_requested', notes: 'add more compliance' })
      .mockResolvedValueOnce({ decision: 'approved' });
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', onCheckpoint: cb as CheckpointCallback,
    }));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(mGenerate).toHaveBeenCalledTimes(2);
    expect(mToMarkdown).toHaveBeenCalledTimes(2);
    expect(out.phase1?.revisions).toBe(1);
    expect(out.output.artifacts.questionnaire).toContain('revision notes: add more compliance');
  });

  it('hard-caps revisions at 3', async () => {
    const cb = vi.fn().mockResolvedValue({ decision: 'revision_requested', notes: 'more' });
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', onCheckpoint: cb as CheckpointCallback,
    }));
    // Initial pass + 3 revision rounds = 4 generate calls; 3 checkpoint invocations.
    expect(mGenerate).toHaveBeenCalledTimes(4);
    expect(cb).toHaveBeenCalledTimes(3);
    expect(out.phase1?.revisions).toBe(3);
  });
});

describe('runE4 — phase 2 Excel path', () => {
  it('parses Excel responses, detects gaps, builds baseline', async () => {
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseFilePath: '/tmp/r.xlsx',
      questions: [Q_A1, Q_B1],
    }));
    expect(mParse).toHaveBeenCalledTimes(1);
    expect(mInterpret).not.toHaveBeenCalled();
    expect(mGapDetect).toHaveBeenCalledTimes(1);
    expect(mBuildBaseline).toHaveBeenCalledTimes(1);
    expect(out.phase2?.responses).toHaveLength(1);
    expect(out.phase2?.format).toBe('excel');
    expect(out.output.artifacts.requirementsBaseline).toBeDefined();
  });
});

describe('runE4 — phase 2 free-text path', () => {
  it('interprets free text, detects gaps, builds baseline', async () => {
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseText: 'A1: my answer here',
      questions: [Q_A1, Q_B1],
    }));
    expect(mInterpret).toHaveBeenCalledTimes(1);
    expect(mParse).not.toHaveBeenCalled();
    expect(mGapDetect).toHaveBeenCalledTimes(1);
    expect(mBuildBaseline).toHaveBeenCalledTimes(1);
    expect(out.phase2?.format).toBe('text');
  });
});

describe('runE4 — phase 2 checkpoint + revision', () => {
  it('reaches e4-requirements checkpoint', async () => {
    const cb = vi.fn().mockResolvedValue({ decision: 'approved' });
    await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseFilePath: '/tmp/r.xlsx',
      questions: [Q_A1, Q_B1], onCheckpoint: cb as CheckpointCallback,
    }));
    expect(cb).toHaveBeenCalledWith('e4-requirements', expect.any(String), 0);
  });

  it('re-runs steps 7-9 on revision_requested', async () => {
    const cb = vi.fn()
      .mockResolvedValueOnce({ decision: 'revision_requested', notes: 'clarify B1' })
      .mockResolvedValueOnce({ decision: 'approved' });
    await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseFilePath: '/tmp/r.xlsx',
      questions: [Q_A1, Q_B1], onCheckpoint: cb as CheckpointCallback,
    }));
    expect(mParse).toHaveBeenCalledTimes(2);
    expect(mGapDetect).toHaveBeenCalledTimes(2);
    expect(mBuildBaseline).toHaveBeenCalledTimes(2);
  });
});

describe('runE4 — step failure resilience', () => {
  it('continues phase 2 when gap detection throws', async () => {
    mGapDetect.mockRejectedValueOnce(new Error('AI outage'));
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', responseFilePath: '/tmp/r.xlsx',
      questions: [Q_A1, Q_B1],
    }));
    expect(mBuildBaseline).toHaveBeenCalledTimes(1);
    expect(out.output.artifacts.requirementsBaseline).toBeDefined();
    expect(out.output.warnings.some((w) => w.includes('Step 8'))).toBe(true);
    expect(out.logs.find((l) => l.step === 8)?.status).toBe('failed');
    expect(out.logs.find((l) => l.step === 9)?.status).toBe('completed');
  });

  it('continues phase 1 when question customization throws', async () => {
    mCustomize.mockRejectedValueOnce(new Error('AI outage'));
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA', sector: 'banking',
    }));
    expect(mToMarkdown).toHaveBeenCalledTimes(1);
    expect(out.output.artifacts.questionnaire).toBeDefined();
    expect(out.output.warnings.some((w) => w.includes('Step 3'))).toBe(true);
  });

  it('logs each step with status and durationMs', async () => {
    const out = await runE4Detailed(makeInput({
      clientName: 'Acme', country: 'SA',
    }));
    expect(out.logs.length).toBeGreaterThan(0);
    for (const log of out.logs) {
      expect(['started', 'completed', 'skipped', 'failed']).toContain(log.status);
      expect(typeof log.durationMs).toBe('number');
      expect(typeof log.step).toBe('number');
      expect(typeof log.name).toBe('string');
    }
  });

  it('runE4 returns just the EngineOutput shape', async () => {
    const out = await runE4(makeInput({ clientName: 'Acme', country: 'SA' }));
    expect(out.engine).toBe('e4');
    expect(out.artifacts.questionnaire).toBeDefined();
    expect(Array.isArray(out.warnings)).toBe(true);
  });

  it('returns an error EngineOutput when required input fields are missing', async () => {
    const out = await runE4(makeInput({}));
    expect(out.error).toBeDefined();
    expect(out.artifacts.questionnaire).toBeUndefined();
  });
});

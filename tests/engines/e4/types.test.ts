import { describe, it, expect } from 'vitest';
import {
  QUESTIONNAIRE_SECTIONS,
  type ProjectType,
  type EmphasisLevel,
  type Question,
  type QuestionnaireSection,
  type ClientResponse,
  type BaselineEntry,
  type RequirementsBaseline,
  type GapAnalysis,
  type E4Config,
} from '@/engines/e4/types';

describe('QUESTIONNAIRE_SECTIONS (Playbook §2.4)', () => {
  it('has exactly 6 sections', () => {
    expect(QUESTIONNAIRE_SECTIONS).toHaveLength(6);
  });

  it('uses IDs A through F in order', () => {
    expect(QUESTIONNAIRE_SECTIONS.map((s) => s.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
  });

  it('section IDs are unique', () => {
    const ids = QUESTIONNAIRE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('titles match §2.4 sections', () => {
    expect(QUESTIONNAIRE_SECTIONS.map((s) => s.title)).toEqual([
      'Business Context',
      'Current-State Network',
      'Applications & Traffic',
      'Future-State Requirements',
      'Compliance & Regulatory (MENA)',
      'Commercial & Delivery',
    ]);
  });

  it('every section has a non-empty description and a questions array', () => {
    for (const s of QUESTIONNAIRE_SECTIONS) {
      expect(s.description.length).toBeGreaterThan(0);
      expect(Array.isArray(s.questions)).toBe(true);
    }
  });
});

describe('ProjectType union', () => {
  it('has exactly 10 values', () => {
    const values: ProjectType[] = [
      'campus_refresh',
      'greenfield_campus',
      'sd_wan',
      'dc_modernization',
      'wireless_deployment',
      'security_upgrade',
      'branch_rollout',
      'cloud_connectivity',
      'ot_network',
      'general',
    ];
    expect(values).toHaveLength(10);
    expect(new Set(values).size).toBe(10);
  });
});

describe('EmphasisLevel union', () => {
  it('accepts all four levels', () => {
    const levels: EmphasisLevel[] = ['high', 'medium', 'low', 'skip'];
    expect(levels).toHaveLength(4);
  });
});

describe('RequirementsBaseline shape', () => {
  it('has exactly the 5 categories from §2.3', () => {
    const baseline: RequirementsBaseline = {
      business: [],
      functional: [],
      nonFunctional: [],
      constraints: [],
      assumptions: [],
    };
    expect(Object.keys(baseline).sort()).toEqual(
      ['assumptions', 'business', 'constraints', 'functional', 'nonFunctional'].sort(),
    );
    expect(Object.keys(baseline)).toHaveLength(5);
  });
});

describe('Type constructability', () => {
  it('constructs a Question', () => {
    const q: Question = {
      id: 'A1',
      text: 'Industry, headcount, sites in scope.',
      section: 'A',
      priority: 'required',
      responseType: 'text',
    };
    expect(q.id).toBe('A1');
  });

  it('constructs a QuestionnaireSection', () => {
    const s: QuestionnaireSection = {
      id: 'A',
      title: 'Business Context',
      description: 'x',
      questions: [],
    };
    expect(s.questions).toEqual([]);
  });

  it('constructs a ClientResponse with all source variants', () => {
    const r1: ClientResponse = { questionId: 'A1', answer: 'Banking', source: 'structured' };
    const r2: ClientResponse = { questionId: 'A2', answer: ['cost', 'agility'], source: 'free_text' };
    const r3: ClientResponse = { questionId: 'A3', answer: 1_000_000, source: 'ai_interpreted', confidence: 0.8 };
    const r4: ClientResponse = { questionId: 'A4', answer: null, source: 'structured' };
    expect([r1, r2, r3, r4]).toHaveLength(4);
  });

  it('constructs a BaselineEntry', () => {
    const e: BaselineEntry = {
      id: 'BR-1',
      text: 'Reduce branch operating cost',
      source: 'A2',
      priority: 'high',
      validated: false,
    };
    expect(e.priority).toBe('high');
  });

  it('constructs a GapAnalysis', () => {
    const g: GapAnalysis = {
      completeQuestions: ['A1'],
      incompleteQuestions: ['B2'],
      vagueAnswers: [{ questionId: 'C1', answer: 'some apps', reason: 'no count' }],
      missingCategories: ['nonFunctional'],
    };
    expect(g.vagueAnswers[0].questionId).toBe('C1');
  });

  it('constructs an E4Config (minimal and full)', () => {
    const min: E4Config = { clientName: 'Acme', country: 'KSA' };
    const full: E4Config = {
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'sd_wan',
      sector: 'banking',
      existingVendors: ['Cisco', 'Fortinet'],
    };
    expect(min.clientName).toBe('Acme');
    expect(full.projectType).toBe('sd_wan');
  });
});

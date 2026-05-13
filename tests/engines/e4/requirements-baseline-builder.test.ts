import { describe, it, expect } from 'vitest';
import {
  buildRequirementsBaseline,
  analyzeGaps,
} from '@/engines/e4/requirements-baseline-builder';
import { QUESTION_BANK } from '@/engines/e4/questionnaire-template';
import type { ClientResponse } from '@/engines/e4/types';

const r = (questionId: string, answer: ClientResponse['answer']): ClientResponse => ({
  questionId,
  answer,
  source: 'structured',
  confidence: 1.0,
});

describe('buildRequirementsBaseline — section → category mapping', () => {
  it('maps Section A questions to business', () => {
    const responses = [r('A1', 'Banking, 2500 staff, 14 sites')];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.business).toHaveLength(1);
    expect(baseline.business[0].source).toBe('A1');
    expect(baseline.business[0].text).toContain('Banking, 2500 staff, 14 sites');
    expect(baseline.functional).toHaveLength(0);
  });

  it('maps Section B (current state) to constraints', () => {
    const responses = [r('B1', 'MPLS via STC')];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.constraints).toHaveLength(1);
    expect(baseline.constraints[0].source).toBe('B1');
  });

  it('maps Section C to functional', () => {
    const responses = [r('C1', 'SAP, M365, Salesforce — top 3 apps')];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.functional).toHaveLength(1);
    expect(baseline.functional[0].source).toBe('C1');
  });

  it('maps Section D non-D4 to functional', () => {
    const responses = [r('D2', ['aws', 'azure'])];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.functional).toHaveLength(1);
    expect(baseline.functional[0].source).toBe('D2');
    expect(baseline.functional[0].text).toContain('aws, azure');
  });

  it('maps Section D4 (SLAs) and D4a/D4b to nonFunctional', () => {
    const responses = [
      r('D4', '99.99% availability, < 50ms latency'),
      r('D4a', 'active_active'),
      r('D4b', '4-hour Sunday window'),
    ];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.nonFunctional).toHaveLength(3);
    expect(baseline.nonFunctional.map((e) => e.source).sort()).toEqual([
      'D4', 'D4a', 'D4b',
    ]);
    expect(baseline.functional).toHaveLength(0);
  });

  it('maps Section E (compliance) to constraints', () => {
    const responses = [r('E1', ['nca_ecc', 'pdpl'])];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.constraints).toHaveLength(1);
    expect(baseline.constraints[0].source).toBe('E1');
  });

  it('maps Section F (commercial) to assumptions', () => {
    const responses = [r('F1', ['cisco'])];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.assumptions).toHaveLength(1);
    expect(baseline.assumptions[0].source).toBe('F1');
  });
});

describe('buildRequirementsBaseline — entry shape', () => {
  it('auto-numbers entries as RB-001, RB-002, …', () => {
    const responses = [
      r('A1', 'one'),
      r('A2', 'two'),
      r('B1', 'three'),
    ];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    const allIds = [...baseline.business, ...baseline.constraints].map((e) => e.id).sort();
    expect(allIds).toEqual(['RB-001', 'RB-002', 'RB-003']);
  });

  it('maps required→critical, recommended→high, optional→medium', () => {
    const responses = [
      r('A1', 'required-priority answer'),     // priority: required
      r('A1b', 'recommended-priority answer'), // priority: recommended
      r('C3a', 'optional-priority answer'),    // priority: optional
    ];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    const a1 = baseline.business.find((e) => e.source === 'A1');
    const a1b = baseline.business.find((e) => e.source === 'A1b');
    const c3a = baseline.functional.find((e) => e.source === 'C3a');
    expect(a1!.priority).toBe('critical');
    expect(a1b!.priority).toBe('high');
    expect(c3a!.priority).toBe('medium');
  });

  it('marks every new entry validated=false', () => {
    const responses = [r('A1', 'something')];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.business[0].validated).toBe(false);
  });

  it('skips responses with null or empty answers', () => {
    const responses = [
      r('A1', null),
      r('A2', ''),
      r('B1', 'real answer'),
    ];
    const baseline = buildRequirementsBaseline(responses, QUESTION_BANK);
    expect(baseline.business).toHaveLength(0);
    expect(baseline.constraints).toHaveLength(1);
  });
});

describe('analyzeGaps', () => {
  it('flags required questions with no answer as incomplete', () => {
    const responses = [r('A1', 'present')];
    const gaps = analyzeGaps(responses, QUESTION_BANK);
    expect(gaps.completeQuestions).toContain('A1');
    // A2 is required but absent.
    expect(gaps.incompleteQuestions).toContain('A2');
  });

  it('flags text answers shorter than 10 chars as vague', () => {
    const responses = [
      r('A2', 'short'),    // text-type, < 10 chars → vague
      r('A4', 'six mo'),   // text-type, < 10 chars → vague
      r('B7', 'A long enough description of the pain.'), // not vague
    ];
    const gaps = analyzeGaps(responses, QUESTION_BANK);
    const vagueIds = gaps.vagueAnswers.map((v) => v.questionId);
    expect(vagueIds).toContain('A2');
    expect(vagueIds).toContain('A4');
    expect(vagueIds).not.toContain('B7');
  });

  it('does not flag short select/multiselect answers as vague', () => {
    const responses = [
      r('A3a', 'tbd'),       // select, 3 chars — not text-type
      r('D2', ['aws']),      // multiselect — not text-type
    ];
    const gaps = analyzeGaps(responses, QUESTION_BANK);
    expect(gaps.vagueAnswers.find((v) => v.questionId === 'A3a')).toBeUndefined();
    expect(gaps.vagueAnswers.find((v) => v.questionId === 'D2')).toBeUndefined();
  });

  it('lists baseline categories that have zero entries as missing', () => {
    // Only Section A → only `business` populated.
    const responses = [r('A1', 'banking 2500 staff')];
    const gaps = analyzeGaps(responses, QUESTION_BANK);
    expect(gaps.missingCategories).toEqual(
      expect.arrayContaining(['functional', 'nonFunctional', 'constraints', 'assumptions']),
    );
    expect(gaps.missingCategories).not.toContain('business');
  });

  it('reports no missingCategories when every category has at least one entry', () => {
    const responses = [
      r('A1', 'business answer text'),
      r('B1', 'constraint answer text'),
      r('C1', 'functional answer text'),
      r('D4', 'nonFunctional SLA text'),
      r('F1', ['cisco']),
    ];
    const gaps = analyzeGaps(responses, QUESTION_BANK);
    expect(gaps.missingCategories).toEqual([]);
  });
});

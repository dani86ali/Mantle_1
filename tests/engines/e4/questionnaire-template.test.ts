import { describe, it, expect } from 'vitest';
import { QUESTIONNAIRE_SECTIONS } from '@/engines/e4/types';
import {
  QUESTION_BANK,
  getQuestionsBySection,
  getRequiredQuestions,
} from '@/engines/e4/questionnaire-template';

const VALID_SECTION_IDS = new Set(QUESTIONNAIRE_SECTIONS.map((s) => s.id));
const VALID_PRIORITIES = new Set(['required', 'recommended', 'optional']);
const VALID_RESPONSE_TYPES = new Set([
  'text', 'number', 'select', 'multiselect', 'table', 'file',
]);

describe('QUESTION_BANK', () => {
  it('contains at least 60 questions', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(60);
  });

  it('represents every section A–F', () => {
    const sectionsCovered = new Set(QUESTION_BANK.map((q) => q.section));
    VALID_SECTION_IDS.forEach((id) => {
      expect(sectionsCovered.has(id)).toBe(true);
    });
  });

  it('has at least 20 required questions', () => {
    const required = QUESTION_BANK.filter((q) => q.priority === 'required');
    expect(required.length).toBeGreaterThanOrEqual(20);
  });

  it('every question has a unique id', () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question references a valid section', () => {
    QUESTION_BANK.forEach((q) => {
      expect(VALID_SECTION_IDS.has(q.section)).toBe(true);
    });
  });

  it('every question has a non-empty text and valid priority/responseType', () => {
    for (const q of QUESTION_BANK) {
      expect(q.text.length).toBeGreaterThan(0);
      expect(VALID_PRIORITIES.has(q.priority)).toBe(true);
      expect(VALID_RESPONSE_TYPES.has(q.responseType)).toBe(true);
    }
  });

  it('select and multiselect questions have a non-empty options array', () => {
    for (const q of QUESTION_BANK) {
      if (q.responseType === 'select' || q.responseType === 'multiselect') {
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options!.length).toBeGreaterThan(0);
      }
    }
  });

  it('non-choice questions do not define options', () => {
    for (const q of QUESTION_BANK) {
      if (q.responseType !== 'select' && q.responseType !== 'multiselect') {
        expect(q.options).toBeUndefined();
      }
    }
  });

  it('every base question from §2.4 is present', () => {
    const baseIds = [
      'A1', 'A2', 'A3', 'A4', 'A5',
      'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
      'C1', 'C2', 'C3', 'C4',
      'D1', 'D2', 'D3', 'D4',
      'E1', 'E2', 'E3', 'E4', 'E5',
      'F1', 'F2', 'F3', 'F4',
    ];
    const bankIds = new Set(QUESTION_BANK.map((q) => q.id));
    for (const id of baseIds) {
      expect(bankIds.has(id)).toBe(true);
    }
  });
});

describe('getQuestionsBySection', () => {
  it('returns only questions for the given section', () => {
    for (const s of QUESTIONNAIRE_SECTIONS) {
      const qs = getQuestionsBySection(s.id);
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) expect(q.section).toBe(s.id);
    }
  });

  it('returns an empty array for an unknown section', () => {
    expect(getQuestionsBySection('Z')).toEqual([]);
  });
});

describe('getRequiredQuestions', () => {
  it('returns only required-priority questions', () => {
    const qs = getRequiredQuestions();
    expect(qs.length).toBeGreaterThanOrEqual(20);
    for (const q of qs) expect(q.priority).toBe('required');
  });
});

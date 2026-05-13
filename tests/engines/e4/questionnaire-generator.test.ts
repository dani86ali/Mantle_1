import { describe, it, expect, vi } from 'vitest';
import {
  filterQuestionsByEmphasis,
  generateQuestionnaire,
  questionnaireToMarkdown,
} from '@/engines/e4/questionnaire-generator';
import { QUESTION_BANK } from '@/engines/e4/questionnaire-template';
import { QUESTIONNAIRE_SECTIONS, type EmphasisLevel } from '@/engines/e4/types';

const sectionCount = (sectionId: string) =>
  QUESTION_BANK.filter((q) => q.section === sectionId).length;
const requiredCount = (sectionId: string) =>
  QUESTION_BANK.filter((q) => q.section === sectionId && q.priority === 'required').length;
const requiredOrRecommendedCount = (sectionId: string) =>
  QUESTION_BANK.filter(
    (q) =>
      q.section === sectionId &&
      (q.priority === 'required' || q.priority === 'recommended'),
  ).length;

describe('filterQuestionsByEmphasis', () => {
  const sectionB = QUESTION_BANK.filter((q) => q.section === 'B');

  it('high returns every question', () => {
    expect(filterQuestionsByEmphasis(sectionB, 'high')).toHaveLength(sectionB.length);
  });

  it('medium drops optional questions', () => {
    const out = filterQuestionsByEmphasis(sectionB, 'medium');
    expect(out.every((q) => q.priority !== 'optional')).toBe(true);
    expect(out.length).toBe(requiredOrRecommendedCount('B'));
  });

  it('low keeps only required', () => {
    const out = filterQuestionsByEmphasis(sectionB, 'low');
    expect(out.every((q) => q.priority === 'required')).toBe(true);
    expect(out.length).toBe(requiredCount('B'));
  });

  it('skip returns an empty list', () => {
    expect(filterQuestionsByEmphasis(sectionB, 'skip')).toEqual([]);
  });
});

describe('generateQuestionnaire — project type resolution', () => {
  it('uses an explicit config.projectType', () => {
    const q = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'sd_wan',
    });
    expect(q.projectType).toBe('sd_wan');
  });

  it('falls back to detectProjectType from description', () => {
    const q = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      description: 'Campus refresh across 12 floors with switch replacement.',
    });
    expect(q.projectType).toBe('campus_refresh');
  });

  it('returns general when no projectType and no description signals', () => {
    const q = generateQuestionnaire({ clientName: 'Acme', country: 'KSA' });
    expect(q.projectType).toBe('general');
  });
});

describe('generateQuestionnaire — emphasis-driven inclusion', () => {
  it('campus_refresh includes every B-section question (high emphasis)', () => {
    const q = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'campus_refresh',
    });
    const sectionB = q.sections.find((s) => s.id === 'B');
    expect(sectionB).toBeDefined();
    expect(sectionB!.questions.length).toBe(sectionCount('B'));
  });

  it('general project type has medium emphasis everywhere — no optional questions surface', () => {
    const q = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'general',
    });
    expect(q.sections).toHaveLength(QUESTIONNAIRE_SECTIONS.length);
    for (const section of q.sections) {
      expect(section.questions.every((qq) => qq.priority !== 'optional')).toBe(true);
      expect(section.questions.length).toBe(requiredOrRecommendedCount(section.id));
    }
  });

  it('totalQuestions varies by project type when a high-emphasis section contains optional questions', () => {
    // security_upgrade flags E as high; E contains optional questions (E5, E5a)
    // which medium-emphasis general drops — so security_upgrade pulls in more.
    const security = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'security_upgrade',
    });
    const general = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'general',
    });
    expect(security.totalQuestions).toBeGreaterThan(general.totalQuestions);
  });

  it('requiredQuestions counts only required-priority questions kept after filtering', () => {
    const q = generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'campus_refresh',
    });
    const manuallyCounted = q.sections.reduce(
      (acc, s) => acc + s.questions.filter((qq) => qq.priority === 'required').length,
      0,
    );
    expect(q.requiredQuestions).toBe(manuallyCounted);
  });
});

describe('generateQuestionnaire — skip omits a section entirely', () => {
  it('a section flagged "skip" is removed from sections[]', async () => {
    vi.resetModules();
    vi.doMock('@/engines/e4/emphasis-matrix', () => ({
      getEmphasis: (): Record<string, EmphasisLevel> => ({
        A: 'medium',
        B: 'skip',
        C: 'medium',
        D: 'medium',
        E: 'medium',
        F: 'medium',
      }),
      getPrioritizedSections: () => ['A', 'C', 'D', 'E', 'F', 'B'],
    }));

    const mod = await import('@/engines/e4/questionnaire-generator');
    const q = mod.generateQuestionnaire({
      clientName: 'Acme',
      country: 'KSA',
      projectType: 'general',
    });

    expect(q.sections.find((s) => s.id === 'B')).toBeUndefined();
    expect(q.sections).toHaveLength(5);
    expect(q.emphasis.B).toBe('skip');

    vi.doUnmock('@/engines/e4/emphasis-matrix');
    vi.resetModules();
  });
});

describe('questionnaireToMarkdown', () => {
  const q = generateQuestionnaire({
    clientName: 'Acme',
    country: 'KSA',
    projectType: 'campus_refresh',
  });
  const md = questionnaireToMarkdown(q);

  it('contains every included section title', () => {
    for (const section of q.sections) {
      expect(md).toContain(`Section ${section.id} — ${section.title}`);
    }
  });

  it('contains every included question text', () => {
    for (const section of q.sections) {
      for (const question of section.questions) {
        expect(md).toContain(question.text);
      }
    }
  });

  it('renders a response-type hint in brackets for each question', () => {
    const firstQ = q.sections[0].questions[0];
    expect(md).toMatch(new RegExp(`\\[${firstQ.id}\\][^\\n]*\\[[^\\]]+\\]`));
  });

  it('flags required questions with the (required) tag', () => {
    expect(md).toContain('**(required)**');
  });

  it('renders options for select/multiselect questions', () => {
    const optionQ = q.sections
      .flatMap((s) => s.questions)
      .find((qq) => qq.options && qq.options.length > 0);
    expect(optionQ).toBeDefined();
    expect(md).toContain(`Options: ${optionQ!.options!.join(', ')}`);
  });
});

import { describe, it, expect } from 'vitest';
import {
  parseResponse,
  matchResponseToQuestion,
} from '@/engines/e4/response-parser';
import { QUESTION_BANK } from '@/engines/e4/questionnaire-template';

describe('parseResponse — Excel sheets', () => {
  it('parses a sheet with question/answer columns', async () => {
    const sheets = {
      Responses: [
        ['Question ID', 'Answer'],
        ['A1', 'Banking, 2500 staff, 14 sites'],
        ['A2', 'Modernize aging campus LAN'],
        ['B1', 'MPLS to all branches, ETB Q3 2027'],
      ],
    };

    const result = await parseResponse({ sheets });

    expect(result.format).toBe('excel');
    expect(result.responses).toHaveLength(3);
    expect(result.responses[0]).toEqual({
      questionId: 'A1',
      answer: 'Banking, 2500 staff, 14 sites',
      confidence: 1.0,
      source: 'structured',
    });
    expect(result.responses[1].questionId).toBe('A2');
    expect(result.responses[2].source).toBe('structured');
  });

  it('finds the header row even if it is not the first row', async () => {
    const sheets = {
      Sheet1: [
        ['Acme Corp — Discovery Responses'],
        [''],
        ['Ref', 'Response'],
        ['A1', 'Healthcare, 800 staff'],
      ],
    };
    const result = await parseResponse({ sheets });
    expect(result.format).toBe('excel');
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0].questionId).toBe('A1');
  });

  it('skips rows whose ID does not exist in QUESTION_BANK', async () => {
    const sheets = {
      Responses: [
        ['Question', 'Answer'],
        ['A1', 'real answer'],
        ['ZZ99', 'bogus row'],
      ],
    };
    const result = await parseResponse({ sheets });
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0].questionId).toBe('A1');
  });

  it('returns format=unknown when no question/answer columns are detectable', async () => {
    const sheets = {
      Responses: [
        ['Foo', 'Bar'],
        ['A1', 'something'],
      ],
    };
    const result = await parseResponse({ sheets });
    expect(result.format).toBe('unknown');
    expect(result.responses).toEqual([]);
  });
});

describe('parseResponse — free text', () => {
  it("parses 'A1: answer' format", async () => {
    const text = `
A1: Banking, 2500 staff, 14 sites in KSA
A2: Aging gear, EoL Catalyst 6500s
B1: MPLS via STC, contracts end 2027
`;
    const result = await parseResponse({ text });
    expect(result.format).toBe('text');

    const a1 = result.responses.find((r) => r.questionId === 'A1');
    expect(a1).toBeDefined();
    expect(a1!.answer).toBe('Banking, 2500 staff, 14 sites in KSA');
    expect(a1!.source).toBe('free_text');
    expect(a1!.confidence).toBe(0.7);

    const b1 = result.responses.find((r) => r.questionId === 'B1');
    expect(b1!.answer).toBe('MPLS via STC, contracts end 2027');
  });

  it("parses 'A1.' and 'A1 -' marker variants", async () => {
    const text = `A1. Retail, 150 stores
A2 - Reduce cost
B1 - SD-WAN pilot in 2 sites`;
    const result = await parseResponse({ text });
    expect(result.format).toBe('text');
    const a1 = result.responses.find((r) => r.questionId === 'A1');
    const a2 = result.responses.find((r) => r.questionId === 'A2');
    const b1 = result.responses.find((r) => r.questionId === 'B1');
    expect(a1!.answer).toContain('Retail');
    expect(a2!.answer).toBe('Reduce cost');
    expect(b1!.answer).toContain('SD-WAN');
  });

  it('emits null for questions that are not present in the text', async () => {
    const text = 'A1: Banking, 14 sites';
    const result = await parseResponse({ text });
    expect(result.format).toBe('text');
    expect(result.responses.length).toBe(QUESTION_BANK.length);
    const unmatched = result.responses.filter((r) => r.answer === null);
    expect(unmatched.length).toBe(QUESTION_BANK.length - 1);
    const a1 = result.responses.find((r) => r.questionId === 'A1');
    expect(a1!.answer).toBe('Banking, 14 sites');
  });

  it('returns format=unknown when no markers are found', async () => {
    const text = 'Just some prose with no question markers at all.';
    const result = await parseResponse({ text });
    expect(result.format).toBe('unknown');
    expect(result.responses).toEqual([]);
  });

  it('normalizes lowercase IDs (a1) to uppercase (A1) before matching', async () => {
    const text = 'a1: Banking, 14 sites';
    const result = await parseResponse({ text });
    expect(result.format).toBe('text');
    const a1 = result.responses.find((r) => r.questionId === 'A1');
    expect(a1!.answer).toBe('Banking, 14 sites');
  });
});

describe('parseResponse — empty inputs', () => {
  it('returns format=unknown when no input is supplied', async () => {
    const result = await parseResponse({});
    expect(result.format).toBe('unknown');
    expect(result.responses).toEqual([]);
  });
});

describe('matchResponseToQuestion', () => {
  it('matches a sentence to the question with the highest keyword overlap', () => {
    const responseText =
      'We have 500 wireless access points across 12 sites running on a Cisco WLC controller.';
    const out = matchResponseToQuestion(responseText, QUESTION_BANK);
    const b4 = out.find((m) => m.questionId === 'B4');
    expect(b4).toBeDefined();
    expect(b4!.answer).toContain('wireless');
  });

  it('returns nothing for a response with no overlap', () => {
    const out = matchResponseToQuestion('Lorem ipsum dolor sit amet.', QUESTION_BANK);
    expect(out).toEqual([]);
  });
});

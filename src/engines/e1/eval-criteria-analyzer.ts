import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { wrapUntrusted } from '@/lib/ai/wrap-untrusted';
import {
  findEvalSheet,
  parseEvaluationSheet,
  deriveMethodologyFromEnvelopes,
} from '@/engines/e1/eval-criteria-sheet';
import type {
  Envelope,
  EvalCriteriaResult,
  EvalMethodology,
} from '@/engines/e1/eval-criteria-types';

export type { Envelope, EvalCriteriaResult, EvalMethodology };

const EVAL_SECTION_RE =
  /\b(?:evaluation\s+criteria|scoring\s+methodology|assessment\s+criteria|technical\s+score|weighted\s+score|envelope\s+(?:1|2|3|A|B|C|one|two|three)|minimum\s+(?:passing|acceptable)\s+(?:score|mark)|passing\s+mark)\b/i;
const IKTVA_RE = /\b(?:IKTVA|local\s+content|saudization)\b/i;
const ADMIN_RE = /\benvelope\s+(?:1|A|one)\b|\badministrative\s+(?:envelope|stage|pass)/i;
const TECH_RE = /\benvelope\s+(?:2|B|two)\b|\btechnical\s+(?:envelope|stage|score|evaluation)/i;
const COMM_RE = /\benvelope\s+(?:3|C|three)\b|\bcommercial\s+(?:envelope|stage|score|evaluation)/i;
const PASS_FAIL_RE = /\bpass\s*\/?\s*fail\b/i;
const PASSING_THRESHOLD_RE =
  /(?:minimum\s+(?:acceptable\s+)?(?:passing\s+)?(?:score|mark|technical\s+score)|passing\s+(?:mark|score)|threshold)\s*(?:of|:|=|is|must\s+be)?\s*(\d{1,3})\s*%/i;

const KNOWN_CATEGORIES = ['Technical', 'Commercial', 'Administrative', 'Experience', 'Financial', 'Quality', 'Schedule', 'Price'];

const EvalCriteriaSchema = z.object({
  methodology: z.enum(['sequential_envelope', 'weighted_score', 'pass_fail', 'best_value', 'unknown']),
  envelopes: z.array(
    z.object({ name: z.string(), weight: z.number(), passThreshold: z.number(), criteria: z.array(z.string()) }),
  ),
  iktvaRequired: z.boolean(),
});

function findCategoryWeight(text: string, name: string): number | null {
  const re = new RegExp(
    `\\b${name}(?:\\s+(?:score|envelope|evaluation|criteria))?\\s*(?:[:=,\\-–]|is|weight(?:ed)?(?:\\s+at)?|carries|accounts\\s+for|of|=)*\\s*(\\d{1,3})\\s*%`,
    'i',
  );
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : null;
}

interface RegexScan {
  envelopes: Envelope[];
  methodology: EvalMethodology;
  passingThreshold?: number;
  iktvaRequired: boolean;
  hasEvalSection: boolean;
}

function regexScan(text: string): RegexScan {
  const hasEvalSection = EVAL_SECTION_RE.test(text);
  const iktvaRequired = IKTVA_RE.test(text);

  if (!hasEvalSection && !iktvaRequired) {
    return { envelopes: [], methodology: 'unknown', iktvaRequired: false, hasEvalSection: false };
  }

  const passMatch = text.match(PASSING_THRESHOLD_RE);
  const passingThreshold = passMatch ? parseInt(passMatch[1], 10) : undefined;
  const sequential = ADMIN_RE.test(text) && TECH_RE.test(text) && COMM_RE.test(text);

  const weights = new Map<string, number>();
  for (const cat of KNOWN_CATEGORIES) {
    const w = findCategoryWeight(text, cat);
    if (w !== null && w > 0 && w <= 100) weights.set(cat, w);
  }

  if (sequential) {
    const envelopes: Envelope[] = [
      { name: 'Administrative', weight: weights.get('Administrative') ?? 0, passThreshold: 0, criteria: [] },
      { name: 'Technical', weight: weights.get('Technical') ?? 0, passThreshold: passingThreshold ?? 0, criteria: [] },
      { name: 'Commercial', weight: weights.get('Commercial') ?? 0, passThreshold: 0, criteria: [] },
    ];
    return { envelopes, methodology: 'sequential_envelope', passingThreshold, iktvaRequired, hasEvalSection: true };
  }

  if (weights.size >= 2) {
    const total = Array.from(weights.values()).reduce((s, w) => s + w, 0);
    if (total >= 90 && total <= 110) {
      const envelopes: Envelope[] = Array.from(weights.entries()).map(([name, weight]) => ({
        name,
        weight,
        passThreshold: 0,
        criteria: [],
      }));
      return { envelopes, methodology: 'weighted_score', passingThreshold, iktvaRequired, hasEvalSection: true };
    }
  }

  if (PASS_FAIL_RE.test(text) && weights.size === 0) {
    return { envelopes: [], methodology: 'pass_fail', passingThreshold, iktvaRequired, hasEvalSection: true };
  }

  return { envelopes: [], methodology: 'unknown', passingThreshold, iktvaRequired, hasEvalSection };
}

function findExcerpt(combined: string): string {
  const m = combined.match(EVAL_SECTION_RE);
  if (!m || m.index === undefined) return combined.slice(0, 2000);
  const start = Math.max(0, m.index - 500);
  const end = Math.min(combined.length, m.index + 1500);
  return combined.slice(start, end);
}

async function escalateToAI(excerpt: string): Promise<EvalCriteriaResult | null> {
  const result = await callAI({
    systemPrompt:
      'You extract evaluation/scoring methodology from RFP text. Identify envelopes ' +
      '(e.g., Administrative/Technical/Commercial) with their weights and pass thresholds. ' +
      'Return strict JSON only.',
    prompt:
      `Extract the evaluation structure from this RFP excerpt and return strict JSON.\n\n` +
      `Excerpt:\n${wrapUntrusted(excerpt, 'rfp-excerpt')}\n\n` +
      `Respond with: {"methodology": "sequential_envelope"|"weighted_score"|"pass_fail"|"best_value"|"unknown", ` +
      `"envelopes": [{"name": string, "weight": number, "passThreshold": number, "criteria": string[]}], ` +
      `"iktvaRequired": boolean}.`,
    outputSchema: EvalCriteriaSchema,
    taskId: `eval-criteria-analyzer:${excerpt.slice(0, 40)}`,
    untrustedContent: true,
  });
  if (!result.success) return null;
  return {
    methodology: result.data.methodology,
    envelopes: result.data.envelopes,
    iktvaRequired: result.data.iktvaRequired,
    source: 'ai_extraction',
  };
}

export async function analyzeEvalCriteria(
  texts: { filename: string; content: string }[],
  sheetData?: Record<string, string[][]>,
): Promise<EvalCriteriaResult> {
  if (sheetData) {
    const found = findEvalSheet(sheetData);
    if (found) {
      const parsed = parseEvaluationSheet(found.rows);
      if (parsed.envelopes.length > 0) {
        return {
          methodology: deriveMethodologyFromEnvelopes(parsed.envelopes),
          envelopes: parsed.envelopes,
          iktvaRequired: parsed.iktvaRequired,
          source: `excel_sheet:${found.name}`,
        };
      }
    }
  }

  const combined = texts.map((t) => t.content).join('\n\n');
  const scan = regexScan(combined);

  if (!scan.hasEvalSection && !scan.iktvaRequired) {
    return { methodology: 'unknown', envelopes: [], iktvaRequired: false, source: 'none' };
  }

  if (scan.methodology !== 'unknown') {
    return {
      methodology: scan.methodology,
      envelopes: scan.envelopes,
      passingThreshold: scan.passingThreshold,
      iktvaRequired: scan.iktvaRequired,
      source: 'text_regex',
    };
  }

  if (!scan.hasEvalSection) {
    return {
      methodology: 'unknown',
      envelopes: [],
      passingThreshold: scan.passingThreshold,
      iktvaRequired: scan.iktvaRequired,
      source: 'iktva_only',
    };
  }

  const aiResult = await escalateToAI(findExcerpt(combined));
  if (aiResult) {
    return {
      ...aiResult,
      passingThreshold: scan.passingThreshold,
      iktvaRequired: aiResult.iktvaRequired || scan.iktvaRequired,
    };
  }

  return {
    methodology: 'unknown',
    envelopes: [],
    passingThreshold: scan.passingThreshold,
    iktvaRequired: scan.iktvaRequired,
    source: 'engineer_review',
  };
}

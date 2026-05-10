import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { extractReferences } from '@/engines/e1/missing-doc-detector';

export type RequirementClassification = 'mandatory' | 'optional' | 'conditional';

export interface Requirement {
  id: string;
  text: string;
  classification: RequirementClassification;
  confidence: number;
  sourceFile: string;
  indicators: string[];
  relatedStandards: string[];
}

export interface ExtractionStats {
  total: number;
  mandatory: number;
  optional: number;
  conditional: number;
  lowConfidence: number;
}

export interface ExtractionResult {
  requirements: Requirement[];
  stats: ExtractionStats;
}

const HIGH_CONFIDENCE = 0.8;
const MIN_CONFIDENCE = 0.5;
const LOW_CONFIDENCE_FLAG = 0.7;

const AIClassificationSchema = z.object({
  classification: z.enum(['mandatory', 'optional', 'conditional']),
  confidence: z.number(),
  reasoning: z.string(),
});

interface IndicatorPattern {
  re: RegExp;
  weight: number;
  label: string;
}

// Mandatory indicators — patterns sourced from E1_RFP_Parser_Process_Flow.md §Step 3.
// `shall`/`must` use a negative lookahead so prohibitions are matched separately below.
const MANDATORY_INDICATORS: IndicatorPattern[] = [
  { re: /\bshall\b(?!\s+(?:not|neither))/gi, weight: 0.9, label: 'shall' },
  { re: /\bmust\b(?!\s+(?:not|neither))/gi, weight: 0.9, label: 'must' },
  { re: /\b(?:required\s+to|is\s+required|are\s+required)\b/gi, weight: 0.9, label: 'required' },
  { re: /\b(?:mandatory|obligatory)\b/gi, weight: 0.95, label: 'mandatory' },
  { re: /\b(?:will\s+be\s+disqualified|failure\s+to\s+comply)\b/gi, weight: 0.95, label: 'disqualification' },
  { re: /\b(?:shall\s+not|must\s+not|is\s+prohibited)\b/gi, weight: 0.9, label: 'prohibited' },
];

const OPTIONAL_INDICATORS: IndicatorPattern[] = [
  { re: /\bshould\b/gi, weight: 0.65, label: 'should' },
  { re: /\b(?:may|can|could)\b/gi, weight: 0.6, label: 'may/can' },
  { re: /\b(?:recommended|preferred|desirable|optional(?:ly)?)\b/gi, weight: 0.9, label: 'recommended/optional' },
  { re: /\bit\s+is\s+(?:suggested|advisable|preferable)\b/gi, weight: 0.9, label: 'suggested' },
  { re: /\b(?:where\s+possible|if\s+feasible|when\s+practicable)\b/gi, weight: 0.85, label: 'where-possible' },
];

const CONDITIONAL_INDICATORS: IndicatorPattern[] = [
  { re: /\b(?:if\s+applicable|where\s+required|as\s+needed)\b/gi, weight: 0.9, label: 'if-applicable' },
  { re: /\bat\s+(?:Saudi\s+Aramco(?:'s)?|the\s+(?:client|company)(?:'s)?)\s+(?:sole\s+)?discretion\b/gi, weight: 0.9, label: 'discretion' },
  { re: /\bunless\s+otherwise\s+(?:specified|agreed|directed)\b/gi, weight: 0.9, label: 'unless-otherwise' },
  { re: /\b(?:subject\s+to|contingent\s+upon|provided\s+that)\b/gi, weight: 0.7, label: 'subject-to' },
];

// "shall not be required/needed/expected" is an exclusion of obligation, not a requirement.
// Discard the whole sentence so neither prohibition nor "required to" patterns claim it.
const NEGATED_MANDATORY =
  /\b(?:shall|must|will)\s+not\s+be\s+(?:required|needed|expected|obligated|deemed|construed)\b/i;

interface CategoryMatch {
  score: number;
  indicators: string[];
}

function matchCategory(sentence: string, patterns: IndicatorPattern[]): CategoryMatch | null {
  let maxScore = 0;
  const labels: string[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags);
    if (re.test(sentence)) {
      labels.push(p.label);
      if (p.weight > maxScore) maxScore = p.weight;
    }
  }
  return labels.length > 0 ? { score: maxScore, indicators: labels } : null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractStandards(sentence: string): string[] {
  return extractReferences(sentence, '')
    .filter((r) => r.pattern === 'aramco_standard' || r.pattern === 'external_standard')
    .map((r) => r.ref);
}

interface ClassifiedSentence {
  classification: RequirementClassification;
  confidence: number;
  indicators: string[];
}

export function classifyBySignals(sentence: string): ClassifiedSentence | null {
  if (NEGATED_MANDATORY.test(sentence)) return null;

  const m = matchCategory(sentence, MANDATORY_INDICATORS);
  const o = matchCategory(sentence, OPTIONAL_INDICATORS);
  const c = matchCategory(sentence, CONDITIONAL_INDICATORS);

  const mScore = m?.score ?? 0;
  const oScore = o?.score ?? 0;
  const cScore = c?.score ?? 0;

  if (mScore === 0 && oScore === 0 && cScore === 0) return null;

  // Priority: conditional > mandatory > optional. A conditional wrapper ("if applicable",
  // "unless otherwise specified", etc.) gates the entire requirement, so it outranks the
  // mandatory verb that sits inside it ("If applicable, vendor shall comply ...").
  if (c) {
    return { classification: 'conditional', confidence: cScore, indicators: c.indicators };
  }
  if (m) {
    return { classification: 'mandatory', confidence: mScore, indicators: m.indicators };
  }
  if (o) {
    return { classification: 'optional', confidence: oScore, indicators: o.indicators };
  }
  return null;
}

async function escalateToAI(sentence: string): Promise<ClassifiedSentence | null> {
  const result = await callAI({
    systemPrompt:
      'You classify single RFP sentences as mandatory, optional, or conditional based on ' +
      'the requirement language used. Return strict JSON only.',
    prompt:
      `Classify this RFP sentence and return strict JSON.\n\n` +
      `Sentence: "${sentence}"\n\n` +
      `Respond with: {"classification": "mandatory"|"optional"|"conditional", ` +
      `"confidence": <0..1>, "reasoning": "<short explanation>"}.`,
    outputSchema: AIClassificationSchema,
    taskId: `requirements-extractor:${sentence.slice(0, 40)}`,
  });
  if (!result.success) return null;
  return {
    classification: result.data.classification,
    confidence: result.data.confidence,
    indicators: ['ai-classified'],
  };
}

export async function extractRequirements(
  text: string,
  sourceFile: string,
): Promise<ExtractionResult> {
  const sentences = splitSentences(text);
  const requirements: Requirement[] = [];
  let counter = 1;

  for (const sentence of sentences) {
    const initial = classifyBySignals(sentence);
    if (!initial) continue;

    let final: ClassifiedSentence;
    if (initial.confidence > HIGH_CONFIDENCE) {
      final = initial;
    } else if (initial.confidence >= MIN_CONFIDENCE) {
      const aiResult = await escalateToAI(sentence);
      final = aiResult ?? initial;
    } else {
      continue;
    }

    requirements.push({
      id: `R-${String(counter++).padStart(3, '0')}`,
      text: sentence,
      classification: final.classification,
      confidence: final.confidence,
      sourceFile,
      indicators: final.indicators,
      relatedStandards: extractStandards(sentence),
    });
  }

  const stats: ExtractionStats = {
    total: requirements.length,
    mandatory: requirements.filter((r) => r.classification === 'mandatory').length,
    optional: requirements.filter((r) => r.classification === 'optional').length,
    conditional: requirements.filter((r) => r.classification === 'conditional').length,
    lowConfidence: requirements.filter((r) => r.confidence < LOW_CONFIDENCE_FLAG).length,
  };

  return { requirements, stats };
}

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { wrapUntrusted } from '@/lib/ai/wrap-untrusted';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import type { MissingDocument } from '@/engines/e1/missing-doc-detector';
import type { EvalCriteriaResult } from '@/engines/e1/eval-criteria-types';

export type ClarificationPriority = 'critical' | 'important' | 'nice_to_have';
export type ClarificationCategory =
  | 'missing_document'
  | 'ambiguous_requirement'
  | 'missing_scope'
  | 'commercial'
  | 'compliance';

export interface ClarificationQuestion {
  id: string;
  question: string;
  priority: ClarificationPriority;
  category: ClarificationCategory;
  relatedRequirementIds: string[];
  reasoning: string;
}

export interface ClarificationStats {
  total: number;
  critical: number;
  important: number;
  niceToHave: number;
}

export interface ClarificationResult {
  questions: ClarificationQuestion[];
  stats: ClarificationStats;
}

export interface GenerateClarificationsInput {
  requirements: Requirement[];
  missingDocs: MissingDocument[];
  evalCriteria?: EvalCriteriaResult;
  projectContext?: string;
}

const LOW_CONFIDENCE = 0.7;
const PRIORITY_RANK: Record<ClarificationPriority, number> = {
  critical: 0,
  important: 1,
  nice_to_have: 2,
};

const AIQuestionsSchema = z.array(
  z.object({
    question: z.string(),
    priority: z.enum(['critical', 'important', 'nice_to_have']),
    category: z.enum([
      'missing_document',
      'ambiguous_requirement',
      'missing_scope',
      'commercial',
      'compliance',
    ]),
    relatedRequirementIds: z.array(z.string()),
    reasoning: z.string(),
  }),
);

type DraftQuestion = Omit<ClarificationQuestion, 'id'>;

function questionsForMissingDocs(missingDocs: MissingDocument[]): DraftQuestion[] {
  return missingDocs
    .filter((d) => d.severity === 'critical' || d.severity === 'high')
    .map((d) => ({
      question:
        `Please provide ${d.referencedDoc} referenced in ${d.referencedIn} ` +
        `— required for compliance assessment.`,
      priority: 'critical',
      category: 'missing_document',
      relatedRequirementIds: [],
      reasoning: `Document ${d.referencedDoc} referenced but not supplied; severity ${d.severity}.`,
    }));
}

function questionsForLowConfidence(requirements: Requirement[]): DraftQuestion[] {
  return requirements
    .filter((r) => r.confidence < LOW_CONFIDENCE)
    .map((r) => ({
      question:
        `Requirement ${r.id} is ambiguous: ${r.text} ` +
        `Please confirm if this is mandatory or optional.`,
      priority: 'important',
      category: 'ambiguous_requirement',
      relatedRequirementIds: [r.id],
      reasoning: `Classification confidence ${r.confidence.toFixed(2)} is below ${LOW_CONFIDENCE}.`,
    }));
}

async function questionsFromAI(
  input: GenerateClarificationsInput,
): Promise<DraftQuestion[]> {
  const reqDigest = input.requirements.map((r) => ({
    id: r.id,
    text: r.text,
    classification: r.classification,
    confidence: r.confidence,
  }));
  const missingDigest = input.missingDocs.map((d) => ({
    referencedDoc: d.referencedDoc,
    severity: d.severity,
  }));
  const ec = input.evalCriteria;
  const evalDigest = ec
    ? {
        methodology: ec.methodology,
        envelopes: ec.envelopes.map((e) => ({ name: e.name, weight: e.weight, passThreshold: e.passThreshold })),
        passingThreshold: ec.passingThreshold,
        iktvaRequired: ec.iktvaRequired,
      }
    : null;

  const result = await callAI({
    systemPrompt:
      'You are a senior pre-sales engineer reviewing an RFP. Generate clarification ' +
      'questions a bid team should send to the client to close scope gaps, unstated ' +
      'assumptions, and commercial ambiguities. Skip questions already covered by ' +
      'flagged missing documents or low-confidence requirements. Return strict JSON only.',
    prompt:
      `Project context: ${wrapUntrusted(input.projectContext ?? '(none provided)', 'project-context')}\n\n` +
      `Requirements:\n${wrapUntrusted(JSON.stringify(reqDigest, null, 2), 'rfp-requirements')}\n\n` +
      `Missing documents (already flagged, do not duplicate):\n` +
      `${wrapUntrusted(JSON.stringify(missingDigest, null, 2), 'missing-docs')}\n\n` +
      `Evaluation criteria:\n${JSON.stringify(evalDigest, null, 2)}\n\n` +
      `Respond with a JSON array: [{"question": "...", "priority": ` +
      `"critical"|"important"|"nice_to_have", "category": "missing_document"|` +
      `"ambiguous_requirement"|"missing_scope"|"commercial"|"compliance", ` +
      `"relatedRequirementIds": ["R-001"], "reasoning": "..."}].`,
    outputSchema: AIQuestionsSchema,
    taskId: 'clarification-generator',
    untrustedContent: true,
  });

  return result.success ? result.data : [];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const tokensA = new Set(na.split(' ').filter((w) => w.length > 3));
  const tokensB = new Set(nb.split(' ').filter((w) => w.length > 3));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  let overlap = 0;
  tokensA.forEach((t) => {
    if (tokensB.has(t)) overlap++;
  });
  const union = tokensA.size + tokensB.size - overlap;
  return overlap / union >= 0.85;
}

function dedupe(drafts: DraftQuestion[]): DraftQuestion[] {
  const kept: DraftQuestion[] = [];
  for (const d of drafts) {
    if (!kept.some((k) => similar(k.question, d.question))) kept.push(d);
  }
  return kept;
}

export async function generateClarifications(
  input: GenerateClarificationsInput,
): Promise<ClarificationResult> {
  const deterministic: DraftQuestion[] = [
    ...questionsForMissingDocs(input.missingDocs),
    ...questionsForLowConfidence(input.requirements),
  ];

  const hasInput =
    input.requirements.length > 0 ||
    input.missingDocs.length > 0 ||
    input.evalCriteria !== undefined;
  const aiDrafts = hasInput ? await questionsFromAI(input) : [];

  const merged = dedupe([...deterministic, ...aiDrafts]);
  merged.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  const questions: ClarificationQuestion[] = merged.map((d, i) => ({
    id: `CQ-${String(i + 1).padStart(3, '0')}`,
    ...d,
  }));

  return {
    questions,
    stats: {
      total: questions.length,
      critical: questions.filter((q) => q.priority === 'critical').length,
      important: questions.filter((q) => q.priority === 'important').length,
      niceToHave: questions.filter((q) => q.priority === 'nice_to_have').length,
    },
  };
}

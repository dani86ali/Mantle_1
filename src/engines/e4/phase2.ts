/**
 * E4 phase 2 — client response processing through the e4-requirements checkpoint.
 * Steps 6-10 from Runtime Architecture §4.4. Revision loop bounded to 3 cycles.
 */

import { parseResponse } from './response-parser';
import { interpretFreeText } from './free-text-interpreter';
import { enhancedGapDetection, type EnhancedGapAnalysis } from './gap-detector-ai';
import { buildRequirementsBaseline } from './requirements-baseline-builder';
import { generateQuestionnaire } from './questionnaire-generator';
import { detectProjectType } from './project-type-detector';
import { runStep, type E4StepLog } from './orchestrator-helpers';
import type { EngineInput } from '@/coordinator/types';
import type {
  ClientResponse,
  Question,
  RequirementsBaseline,
} from './types';
import type { E4InputData } from './orchestrator-types';

const MAX_REVISIONS = 3;

type ResponseFormat = 'preparsed' | 'excel' | 'text' | 'unknown';

export interface Phase2Result {
  baselineRef: string;
  baseline: RequirementsBaseline;
  gaps: EnhancedGapAnalysis;
  responses: ClientResponse[];
  format: ResponseFormat;
  revisions: number;
}

const EMPTY_BASELINE: RequirementsBaseline = {
  business: [],
  functional: [],
  nonFunctional: [],
  constraints: [],
  assumptions: [],
};

const EMPTY_GAPS: EnhancedGapAnalysis = {
  completeQuestions: [],
  incompleteQuestions: [],
  vagueAnswers: [],
  missingCategories: [],
  contradictions: [],
  unstatedAssumptions: [],
};

function resolveQuestions(data: E4InputData): Question[] {
  if (data.questions && data.questions.length > 0) return data.questions;
  const projectType =
    data.projectType ??
    detectProjectType(data.description ?? '', data.clientName, data.sector).type;
  const generated = generateQuestionnaire({
    clientName: data.clientName,
    country: data.country,
    sector: data.sector,
    projectType,
    description: data.description,
    existingVendors: data.existingVendors,
  });
  return generated.sections.flatMap((s) => s.questions);
}

function detectFormat(data: E4InputData): ResponseFormat {
  if (data.clientResponses && data.clientResponses.length > 0) return 'preparsed';
  if (data.responseFilePath) return 'excel';
  if (data.responseText) return 'text';
  return 'unknown';
}

export async function runPhase2(
  data: E4InputData,
  logs: E4StepLog[],
  warnings: string[],
  input: EngineInput,
): Promise<Phase2Result> {
  const questions = resolveQuestions(data);
  const format = detectFormat(data);
  logs.push({ step: 6, name: `detectFormat:${format}`, status: 'completed', durationMs: 0 });

  let revisions = 0;
  let revisionNotes: string | undefined = input.revisionNotes;
  let responses: ClientResponse[] = [];
  let gaps: EnhancedGapAnalysis = EMPTY_GAPS;
  let baseline: RequirementsBaseline = EMPTY_BASELINE;

  while (true) {
    if (format === 'preparsed') {
      responses = data.clientResponses ?? [];
      logs.push({ step: 7, name: 'usePreparsedResponses', status: 'completed', durationMs: 0 });
    } else if (format === 'excel') {
      const step7 = await runStep(
        7,
        'parseResponse',
        () => parseResponse({ filePath: data.responseFilePath }),
        logs,
        input,
      );
      if (step7.ok && step7.result) responses = step7.result.responses;
      else { responses = []; warnings.push('Step 7 parseResponse failed'); }
    } else if (format === 'text') {
      const step7 = await runStep(
        7,
        'interpretFreeText',
        () => interpretFreeText(data.responseText ?? '', questions),
        logs,
        input,
      );
      if (step7.ok && step7.result) responses = step7.result;
      else { responses = []; warnings.push('Step 7 interpretFreeText failed'); }
    } else {
      responses = [];
      warnings.push('Step 7 skipped: no response payload (clientResponses/responseFilePath/responseText)');
      logs.push({ step: 7, name: 'parseResponse', status: 'skipped', durationMs: 0 });
    }

    const contextSuffix = revisionNotes ? ` [revision: ${revisionNotes}]` : '';
    const step8 = await runStep(
      8,
      'enhancedGapDetection',
      () => enhancedGapDetection(responses, questions, (data.projectContext ?? '') + contextSuffix),
      logs,
      input,
    );
    gaps = step8.ok && step8.result ? step8.result : EMPTY_GAPS;
    if (!step8.ok) warnings.push('Step 8 enhancedGapDetection failed; using empty gap analysis');

    const step9 = await runStep(
      9,
      'buildRequirementsBaseline',
      () => buildRequirementsBaseline(responses, questions),
      logs,
      input,
    );
    baseline = step9.ok && step9.result ? step9.result : EMPTY_BASELINE;
    if (!step9.ok) warnings.push('Step 9 buildRequirementsBaseline failed; emitting empty baseline');

    if (!data.onCheckpoint || revisions >= MAX_REVISIONS) break;
    const decision = await data.onCheckpoint(
      'e4-requirements',
      JSON.stringify({ baseline, gaps }),
      revisions,
    );
    if (decision.decision !== 'revision_requested') break;
    revisions++;
    revisionNotes = decision.notes;
  }

  const baselineRef = JSON.stringify(baseline);
  return { baselineRef, baseline, gaps, responses, format, revisions };
}

/**
 * E4 phase 1 — questionnaire generation up to the e4-questionnaire checkpoint.
 * Steps 1-5 from Runtime Architecture §4.4. Revision loop bounded to 3 cycles.
 */

import { enhancedProjectTypeDetection } from './project-type-ai';
import { detectProjectType } from './project-type-detector';
import {
  generateQuestionnaire,
  questionnaireToMarkdown,
  type GeneratedQuestionnaire,
} from './questionnaire-generator';
import { getPrioritizedSections } from './emphasis-matrix';
import { customizeQuestions } from './question-customizer';
import { recordSkip, runStep, type E4StepLog } from './orchestrator-helpers';
import type { EngineInput } from '@/coordinator/types';
import type {
  ProjectType,
  Question,
  QuestionnaireSection,
} from './types';
import type { E4InputData } from './orchestrator-types';

const MAX_REVISIONS = 3;

export interface Phase1Result {
  questionnaireMd: string;
  projectType: ProjectType;
  questions: Question[];
  revisions: number;
}

function reorderSections(
  q: GeneratedQuestionnaire,
  projectType: ProjectType,
): GeneratedQuestionnaire {
  const order = getPrioritizedSections(projectType);
  const sections = [...q.sections].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
  return { ...q, sections };
}

function applyCustomized(
  q: GeneratedQuestionnaire,
  customized: Question[],
): GeneratedQuestionnaire {
  const bySection = new Map<string, Question[]>();
  for (const item of customized) {
    const bucket = bySection.get(item.section) ?? [];
    bucket.push(item);
    bySection.set(item.section, bucket);
  }
  const sections: QuestionnaireSection[] = q.sections.map((s) => ({
    ...s,
    questions: bySection.get(s.id) ?? s.questions,
  }));
  return { ...q, sections };
}

export async function runPhase1(
  data: E4InputData,
  logs: E4StepLog[],
  warnings: string[],
  input: EngineInput,
): Promise<Phase1Result> {
  const description = data.description ?? '';
  const step1 = await runStep(
    1,
    'detectProjectType',
    () =>
      data.ambiguous
        ? enhancedProjectTypeDetection(description, data.clientName, data.sector)
        : Promise.resolve(detectProjectType(description, data.clientName, data.sector)),
    logs,
    input,
  );
  const projectType: ProjectType = step1.ok && step1.result
    ? (step1.result.type as ProjectType)
    : (data.projectType ?? 'general');

  let questionnaire: GeneratedQuestionnaire | undefined;
  let questionnaireMd = '';
  let revisions = 0;
  let revisionNotes: string | undefined = input.revisionNotes;

  while (true) {
    const step2 = await runStep(
      2,
      'generateQuestionnaire',
      () =>
        generateQuestionnaire({
          clientName: data.clientName,
          country: data.country,
          sector: data.sector,
          projectType,
          existingVendors: data.existingVendors,
          description,
        }),
      logs,
      input,
    );
    if (!step2.ok || !step2.result) {
      throw new Error(`E4 phase 1 step 2 (generateQuestionnaire) failed: ${step2.error ?? 'no result'}`);
    }
    questionnaire = reorderSections(step2.result, projectType);

    if (data.sector) {
      const baseQuestions = questionnaire.sections.flatMap((s) => s.questions);
      const step3 = await runStep(
        3,
        'customizeQuestions',
        () =>
          customizeQuestions(baseQuestions, {
            clientName: data.clientName,
            country: data.country,
            sector: data.sector,
            projectType,
            description,
            existingVendors: data.existingVendors,
          }),
        logs,
        input,
      );
      if (step3.ok && step3.result) {
        questionnaire = applyCustomized(questionnaire, step3.result);
      } else {
        warnings.push('Step 3 customizeQuestions failed; using base questionnaire');
      }
    } else {
      recordSkip(3, 'customizeQuestions', logs);
    }

    const step4 = await runStep(
      4,
      'questionnaireToMarkdown',
      () => questionnaireToMarkdown(questionnaire!),
      logs,
      input,
    );
    if (!step4.ok || !step4.result) {
      throw new Error(`E4 phase 1 step 4 (questionnaireToMarkdown) failed: ${step4.error ?? 'no result'}`);
    }
    questionnaireMd = revisionNotes
      ? `<!-- revision notes: ${revisionNotes} -->\n${step4.result}`
      : step4.result;

    if (!data.onCheckpoint || revisions >= MAX_REVISIONS) break;
    const decision = await data.onCheckpoint('e4-questionnaire', questionnaireMd, revisions);
    if (decision.decision !== 'revision_requested') break;
    revisions++;
    revisionNotes = decision.notes;
  }

  const questions = questionnaire!.sections.flatMap((s) => s.questions);
  return { questionnaireMd, projectType, questions, revisions };
}

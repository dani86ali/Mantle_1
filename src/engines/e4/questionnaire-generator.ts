/**
 * E4 — Discovery questionnaire generator.
 * Combines QUESTION_BANK, project-type detection, and the emphasis matrix to
 * produce the per-engagement questionnaire delivered to the client.
 */

import { detectProjectType } from './project-type-detector';
import { getEmphasis } from './emphasis-matrix';
import { QUESTION_BANK } from './questionnaire-template';
import {
  QUESTIONNAIRE_SECTIONS,
  type E4Config,
  type EmphasisLevel,
  type ProjectType,
  type Question,
  type QuestionnaireSection,
  type QuestionResponseType,
} from './types';

export interface GeneratedQuestionnaire {
  sections: QuestionnaireSection[];
  totalQuestions: number;
  requiredQuestions: number;
  projectType: ProjectType;
  emphasis: Record<string, EmphasisLevel>;
}

export function filterQuestionsByEmphasis(
  questions: Question[],
  level: EmphasisLevel,
): Question[] {
  switch (level) {
    case 'skip':
      return [];
    case 'high':
      return questions;
    case 'medium':
      return questions.filter(
        (q) => q.priority === 'required' || q.priority === 'recommended',
      );
    case 'low':
      return questions.filter((q) => q.priority === 'required');
  }
}

export function generateQuestionnaire(config: E4Config): GeneratedQuestionnaire {
  const projectType: ProjectType =
    config.projectType ??
    detectProjectType(config.description ?? '', config.clientName, config.sector).type;

  const emphasis = getEmphasis(projectType);

  const sections: QuestionnaireSection[] = [];
  let totalQuestions = 0;
  let requiredQuestions = 0;

  for (const section of QUESTIONNAIRE_SECTIONS) {
    const level = emphasis[section.id] ?? 'medium';
    if (level === 'skip') continue;

    const pool = QUESTION_BANK.filter((q) => q.section === section.id);
    const filtered = filterQuestionsByEmphasis(pool, level);

    sections.push({
      id: section.id,
      title: section.title,
      description: section.description,
      questions: filtered,
    });

    totalQuestions += filtered.length;
    requiredQuestions += filtered.filter((q) => q.priority === 'required').length;
  }

  return { sections, totalQuestions, requiredQuestions, projectType, emphasis };
}

const RESPONSE_HINT: Record<QuestionResponseType, string> = {
  text: 'free text',
  number: 'number',
  select: 'single choice',
  multiselect: 'multi-select',
  table: 'table',
  file: 'attachment',
};

export function questionnaireToMarkdown(q: GeneratedQuestionnaire): string {
  const lines: string[] = [];
  lines.push('# Discovery Questionnaire');
  lines.push('');
  lines.push(`**Project type:** \`${q.projectType}\``);
  lines.push(
    `**Questions:** ${q.totalQuestions} total — ${q.requiredQuestions} required`,
  );
  lines.push('');

  for (const section of q.sections) {
    lines.push(`## Section ${section.id} — ${section.title}`);
    lines.push('');
    lines.push(`_${section.description}_`);
    lines.push('');
    section.questions.forEach((question, idx) => {
      const requiredTag = question.priority === 'required' ? ' **(required)**' : '';
      lines.push(
        `${idx + 1}. **[${question.id}]** ${question.text} _[${RESPONSE_HINT[question.responseType]}]_${requiredTag}`,
      );
      if (question.options && question.options.length > 0) {
        lines.push(`   - Options: ${question.options.join(', ')}`);
      }
      if (question.helpText) {
        lines.push(`   - _${question.helpText}_`);
      }
    });
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

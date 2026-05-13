/**
 * E4 — Requirements baseline builder.
 * Maps ClientResponse[] + Question[] → five-category RequirementsBaseline
 * (business / functional / nonFunctional / constraints / assumptions),
 * per Playbook §2.3. Also exposes analyzeGaps for missing/vague answers.
 */

import type {
  BaselineEntry,
  BaselinePriority,
  ClientResponse,
  GapAnalysis,
  Question,
  QuestionPriority,
  RequirementsBaseline,
  VagueAnswer,
} from './types';

type BaselineKey = keyof RequirementsBaseline;

const VAGUE_LENGTH_THRESHOLD = 10;

function categorizeQuestion(question: Question): BaselineKey {
  switch (question.section) {
    case 'A':
      return 'business';
    case 'B':
      // Current-state infrastructure — treated as constraints on the future design.
      return 'constraints';
    case 'C':
      return 'functional';
    case 'D':
      // D4 SLAs / DR / maintenance windows → nonFunctional. Everything else
      // in the future-state section is functional.
      return question.id.startsWith('D4') ? 'nonFunctional' : 'functional';
    case 'E':
      // Compliance / regulatory framing.
      return 'constraints';
    case 'F':
      // Commercial preferences become engagement assumptions.
      return 'assumptions';
    default:
      return 'assumptions';
  }
}

function mapPriority(priority: QuestionPriority): BaselinePriority {
  switch (priority) {
    case 'required':
      return 'critical';
    case 'recommended':
      return 'high';
    case 'optional':
      return 'medium';
  }
}

function formatAnswer(answer: ClientResponse['answer']): string {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.join(', ');
  return String(answer);
}

function isMeaningfulAnswer(answer: ClientResponse['answer']): boolean {
  if (answer === null || answer === undefined) return false;
  if (Array.isArray(answer)) return answer.length > 0;
  if (typeof answer === 'number') return true;
  return answer.trim().length > 0;
}

function makeEntryId(index: number): string {
  return `RB-${String(index).padStart(3, '0')}`;
}

export function buildRequirementsBaseline(
  responses: ClientResponse[],
  questions: Question[],
): RequirementsBaseline {
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const baseline: RequirementsBaseline = {
    business: [],
    functional: [],
    nonFunctional: [],
    constraints: [],
    assumptions: [],
  };

  let counter = 1;
  for (const response of responses) {
    if (!isMeaningfulAnswer(response.answer)) continue;
    const question = questionsById.get(response.questionId);
    if (!question) continue;

    const category = categorizeQuestion(question);
    const entry: BaselineEntry = {
      id: makeEntryId(counter++),
      text: `${question.text} — ${formatAnswer(response.answer)}`,
      source: question.id,
      priority: mapPriority(question.priority),
      validated: false,
    };
    baseline[category].push(entry);
  }

  return baseline;
}

export function analyzeGaps(
  responses: ClientResponse[],
  questions: Question[],
): GapAnalysis {
  const responseById = new Map(responses.map((r) => [r.questionId, r]));
  const completeQuestions: string[] = [];
  const incompleteQuestions: string[] = [];
  const vagueAnswers: VagueAnswer[] = [];

  for (const question of questions) {
    const response = responseById.get(question.id);
    const hasAnswer = response ? isMeaningfulAnswer(response.answer) : false;

    if (question.priority === 'required') {
      if (hasAnswer) {
        completeQuestions.push(question.id);
      } else {
        incompleteQuestions.push(question.id);
      }
    }

    if (hasAnswer && response && question.responseType === 'text') {
      const text = formatAnswer(response.answer).trim();
      if (text.length < VAGUE_LENGTH_THRESHOLD) {
        vagueAnswers.push({
          questionId: question.id,
          answer: text,
          reason: `Answer is shorter than ${VAGUE_LENGTH_THRESHOLD} characters`,
        });
      }
    }
  }

  const baseline = buildRequirementsBaseline(responses, questions);
  const missingCategories: string[] = [];
  for (const key of Object.keys(baseline) as BaselineKey[]) {
    if (baseline[key].length === 0) missingCategories.push(key);
  }

  return { completeQuestions, incompleteQuestions, vagueAnswers, missingCategories };
}

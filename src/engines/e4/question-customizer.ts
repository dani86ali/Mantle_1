import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import type { E4Config, Question } from './types';

const RESPONSE_TYPES = [
  'text',
  'number',
  'select',
  'multiselect',
  'table',
  'file',
] as const;

const CustomQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  section: z.string(),
  priority: z.enum(['required', 'recommended', 'optional']),
  responseType: z.enum(RESPONSE_TYPES),
  helpText: z.string().optional(),
});

const CustomQuestionsSchema = z.array(CustomQuestionSchema);

export async function customizeQuestions(
  baseQuestions: Question[],
  config: E4Config,
): Promise<Question[]> {
  const sector = config.sector ?? 'general';
  const country = config.country;
  const n = baseQuestions.length;
  const projectType = config.projectType ?? 'unspecified';

  const result = await callAI({
    systemPrompt:
      `You are a senior pre-sales engineer preparing a discovery questionnaire ` +
      `for ${sector} in ${country}. The base questionnaire has ${n} questions. ` +
      `Suggest 3-5 additional questions specific to this project type, sector, and ` +
      `region that would help uncover requirements the template misses.`,
    prompt:
      `Project type: ${projectType}\n` +
      `Client: ${config.clientName}\n` +
      `Country: ${country}\n` +
      `Sector: ${sector}\n` +
      `Existing sections: A=Business Context, B=Current-State Network, ` +
      `C=Applications & Traffic, D=Future-State Requirements, ` +
      `E=Compliance & Regulatory (MENA), F=Commercial & Delivery.\n\n` +
      `Return strict JSON: an array of 3-5 question objects. Each:\n` +
      `{"id": <any string, will be replaced>, "text": <question>, ` +
      `"section": <A|B|C|D|E|F>, ` +
      `"priority": "required"|"recommended"|"optional", ` +
      `"responseType": "text"|"number"|"select"|"multiselect"|"table"|"file", ` +
      `"helpText": <optional string>}`,
    outputSchema: CustomQuestionsSchema,
    taskId: `question-customizer:${config.clientName}:${projectType}`,
  });

  if (!result.success) return baseQuestions;

  const customized: Question[] = result.data.map((q, idx) => ({
    id: `CQ-${String(idx + 1).padStart(3, '0')}`,
    text: q.text,
    section: q.section,
    priority: q.priority,
    responseType: q.responseType,
    helpText: q.helpText,
  }));

  return [...baseQuestions, ...customized];
}

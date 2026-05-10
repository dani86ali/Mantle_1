import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import type { ControlRef } from '@/engines/e1/compliance-matrix-controls';

export type ComplianceStatus =
  | 'Compliant'
  | 'Partially Compliant'
  | 'Non-Compliant'
  | 'Alternative Proposed';

export interface RawMatch {
  requirement: Requirement;
  frameworkId: string;
  control: ControlRef;
}

export const DEFAULT_STATUS: ComplianceStatus = 'Partially Compliant';
export const DEFAULT_NOTES = 'Requires solution detail review';
const BATCH_SIZE = 5;

const STATUS_ENUM = z.enum([
  'Compliant',
  'Partially Compliant',
  'Non-Compliant',
  'Alternative Proposed',
]);
const StatusBatchSchema = z.array(
  z.object({
    requirementId: z.string(),
    status: STATUS_ENUM,
    notes: z.string(),
  }),
);

export function pairKey(m: RawMatch): string {
  return `${m.requirement.id}#${m.frameworkId}#${m.control.id}`;
}

export async function assignStatuses(
  matches: RawMatch[],
  solutionContext?: string,
): Promise<Map<string, { status: ComplianceStatus; notes: string }>> {
  const result = new Map<string, { status: ComplianceStatus; notes: string }>();
  const fallback = { status: DEFAULT_STATUS, notes: DEFAULT_NOTES };

  if (!solutionContext) {
    for (const m of matches) result.set(pairKey(m), fallback);
    return result;
  }

  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    const items = batch.map((m) => ({
      requirementId: pairKey(m),
      requirementText: m.requirement.text,
      frameworkId: m.frameworkId,
      controlId: m.control.id,
      controlName: m.control.name,
    }));

    const aiResult = await callAI({
      systemPrompt:
        'You assign compliance status for RFP requirement / framework control pairs ' +
        'based on a proposed solution. For each pair return one of: Compliant, ' +
        'Partially Compliant, Non-Compliant, Alternative Proposed. ' +
        'Use the requirementId we provide verbatim — it is a composite key. ' +
        'Return strict JSON only.',
      prompt:
        `Solution context:\n"""${solutionContext}"""\n\n` +
        `Pairs to assess (assign status + concise notes for each):\n` +
        `${JSON.stringify(items, null, 2)}\n\n` +
        `Respond with a JSON array of objects, one per pair: ` +
        `[{"requirementId": "<echo verbatim>", "status": "...", "notes": "..."}].`,
      outputSchema: StatusBatchSchema,
      taskId: `compliance-matrix-status:batch-${i}`,
    });

    if (aiResult.success) {
      const byKey = new Map(aiResult.data.map((d) => [d.requirementId, d]));
      for (const m of batch) {
        const found = byKey.get(pairKey(m));
        result.set(
          pairKey(m),
          found ? { status: found.status, notes: found.notes } : fallback,
        );
      }
    } else {
      for (const m of batch) result.set(pairKey(m), fallback);
    }
  }
  return result;
}

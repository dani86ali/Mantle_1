import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { wrapUntrusted } from '@/lib/ai/wrap-untrusted';

export interface CatalogEntry {
  sku: string;
  description: string;
  family: string;
}

export interface FuzzyMatchInput {
  description: string;
  manufacturer?: string;
  category?: string;
}

export interface FuzzyMatchResult {
  matchedSku: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'no_match';
  originalInput: string;
  reasoning?: string;
}

const AIOutputSchema = z.object({
  sku: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const SYSTEM_PROMPT =
  'You are a Cisco/Fortinet product catalog expert. Given a description, ' +
  'find the best matching SKU from the provided catalog. If no good match ' +
  'exists, return confidence 0 and explain why.';

function buildPrompt(input: FuzzyMatchInput, catalog: CatalogEntry[]): string {
  const catalogLines = catalog
    .map((c) => `- ${c.sku} | ${c.family} | ${c.description}`)
    .join('\n');

  const hints: string[] = [];
  if (input.manufacturer) hints.push(`Manufacturer: ${input.manufacturer}`);
  if (input.category) hints.push(`Category: ${input.category}`);
  const hintBlock = hints.length ? `\n\nHints:\n${hints.join('\n')}` : '';

  return (
    `Find the best matching catalog SKU for this BoQ line item description.\n\n` +
    `Description: ${wrapUntrusted(input.description, 'boq-description')}${hintBlock}\n\n` +
    `Catalog (sku | family | description):\n${catalogLines}\n\n` +
    `Respond with JSON: {"sku": "<exact SKU from catalog>", ` +
    `"confidence": <0..1>, "reasoning": "<short explanation>"}.\n` +
    `If no acceptable match exists, set confidence to 0 and explain why.`
  );
}

export async function fuzzyMatchSku(
  input: FuzzyMatchInput,
  catalog: CatalogEntry[],
): Promise<FuzzyMatchResult> {
  const desc = input.description.trim();
  const descLower = desc.toLowerCase();

  // (1) Exact SKU match (case-insensitive) — no AI call.
  const exact = catalog.find((c) => c.sku.toLowerCase() === descLower);
  if (exact) {
    return {
      matchedSku: exact.sku,
      confidence: 1.0,
      matchType: 'exact',
      originalInput: input.description,
    };
  }

  // (2) Prefix / contains match — no AI call.
  const prefixOrContains = catalog.find((c) => {
    const skuLower = c.sku.toLowerCase();
    return skuLower.startsWith(descLower) || skuLower.includes(descLower);
  });
  if (prefixOrContains) {
    return {
      matchedSku: prefixOrContains.sku,
      confidence: 0.9,
      matchType: 'exact',
      originalInput: input.description,
    };
  }

  // (3) AI fuzzy match.
  const aiResult = await callAI({
    prompt: buildPrompt(input, catalog),
    systemPrompt: SYSTEM_PROMPT,
    outputSchema: AIOutputSchema,
    taskId: `fuzzy-sku-match:${desc.slice(0, 40)}`,
    untrustedContent: true,
  });

  if (!aiResult.success) {
    return {
      matchedSku: '',
      confidence: 0,
      matchType: 'no_match',
      originalInput: input.description,
      reasoning: `AI fallback to engineer_review: ${aiResult.error}`,
    };
  }

  const { sku, confidence, reasoning } = aiResult.data;
  const inCatalog = catalog.some((c) => c.sku === sku);

  if (!inCatalog) {
    return {
      matchedSku: sku,
      confidence: 0,
      matchType: 'no_match',
      originalInput: input.description,
      reasoning: `AI returned SKU not in catalog: ${reasoning}`,
    };
  }

  return {
    matchedSku: sku,
    confidence,
    matchType: 'fuzzy',
    originalInput: input.description,
    reasoning,
  };
}

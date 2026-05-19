import {
  tokenize,
  tokenOverlap,
  normalizedEditDistance,
} from './string-similarity';

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

const TOKEN_WEIGHT = 0.7;
const EDIT_WEIGHT = 0.3;
const MANUFACTURER_BOOST = 0.1;
const CATEGORY_BOOST = 0.05;
const CONFIDENCE_THRESHOLD = 0.55;

function scoreCatalogEntry(
  input: FuzzyMatchInput,
  entry: CatalogEntry,
): number {
  const inputTokens = tokenize(input.description);
  const entryTokens = tokenize(`${entry.description} ${entry.family}`);
  const overlap = tokenOverlap(inputTokens, entryTokens);
  const edit = normalizedEditDistance(
    input.description.toLowerCase(),
    entry.description.toLowerCase(),
  );

  let score = TOKEN_WEIGHT * overlap + EDIT_WEIGHT * edit;

  if (input.manufacturer) {
    const mfgLower = input.manufacturer.toLowerCase();
    const familyLower = entry.family.toLowerCase();
    const descLower = entry.description.toLowerCase();
    if (familyLower.includes(mfgLower) || descLower.includes(mfgLower)) {
      score += MANUFACTURER_BOOST;
    }
  }

  if (input.category) {
    const catTokens = tokenize(input.category);
    if (catTokens.length > 0) {
      const entryAllTokens = tokenize(
        `${entry.description} ${entry.family}`,
      );
      const catOverlap = tokenOverlap(catTokens, entryAllTokens);
      if (catOverlap > 0) score += CATEGORY_BOOST;
    }
  }

  return Math.min(score, 1);
}

export function fuzzyMatchSku(
  input: FuzzyMatchInput,
  catalog: CatalogEntry[],
): FuzzyMatchResult {
  const desc = input.description.trim();
  const descLower = desc.toLowerCase();

  const exact = catalog.find((c) => c.sku.toLowerCase() === descLower);
  if (exact) {
    return {
      matchedSku: exact.sku,
      confidence: 1.0,
      matchType: 'exact',
      originalInput: input.description,
    };
  }

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

  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const entry of catalog) {
    const score = scoreCatalogEntry(input, entry);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  if (best && best.score >= CONFIDENCE_THRESHOLD) {
    return {
      matchedSku: best.entry.sku,
      confidence: Number(best.score.toFixed(3)),
      matchType: 'fuzzy',
      originalInput: input.description,
      reasoning: 'token-overlap + edit-distance',
    };
  }

  return {
    matchedSku: '',
    confidence: 0,
    matchType: 'no_match',
    originalInput: input.description,
    reasoning: best
      ? `best deterministic score ${best.score.toFixed(3)} below ${CONFIDENCE_THRESHOLD} threshold`
      : 'empty catalog',
  };
}

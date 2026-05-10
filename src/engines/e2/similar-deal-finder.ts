import { z } from 'zod';
import { callAI } from '@/lib/ai/client';

export interface DealProfile {
  sector: string;
  country: string;
  dealSize?: number;
  vendors: string[];
  productCategories: string[];
  requirements?: string[];
}

export interface DealSummary {
  opportunityId: string;
  customerName: string;
  sector: string;
  country: string;
  dealValue: number;
  vendors: string[];
  productCategories: string[];
  outcome: 'won' | 'lost' | 'pending';
  winLossReason?: string;
  margin?: number;
}

export interface SimilarDeal {
  opportunityId: string;
  customerName: string;
  similarityScore: number;
  matchFactors: string[];
  dealValue: number;
  outcome: string;
  margin?: number;
}

export interface SimilarDealResult {
  matches: SimilarDeal[];
  stats: {
    totalSearched: number;
    matchesFound: number;
    avgMarginOfWins: number | null;
  };
}

const SCORE_THRESHOLD = 0.4;
const TOP_N = 10;
const AI_TRIGGER_MIN = 3;
const AI_HISTORY_CAP = 50;

const AIOutputSchema = z.array(
  z.object({
    opportunityId: z.string(),
    similarityScore: z.number(),
    matchFactors: z.array(z.string()),
  }),
);

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.toLowerCase()));
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  a.forEach((v) => {
    if (b.has(v)) out.push(v);
  });
  return out;
}

interface ScoredDeal {
  deal: DealSummary;
  score: number;
  factors: string[];
}

function scoreDeal(current: DealProfile, past: DealSummary): ScoredDeal {
  const factors: string[] = [];
  let score = 0;

  if (current.sector.toLowerCase() === past.sector.toLowerCase()) {
    score += 0.3;
    factors.push(`sector:${past.sector}`);
  }
  if (current.country.toLowerCase() === past.country.toLowerCase()) {
    score += 0.2;
    factors.push(`country:${past.country}`);
  }

  const vendorOverlap = intersect(
    lowerSet(current.vendors),
    lowerSet(past.vendors),
  );
  if (vendorOverlap.length > 0) {
    score += 0.2;
    factors.push(`vendors:${vendorOverlap.join(',')}`);
  }

  const catOverlap = intersect(
    lowerSet(current.productCategories),
    lowerSet(past.productCategories),
  );
  if (catOverlap.length > 0) {
    score += 0.2;
    factors.push(`categories:${catOverlap.join(',')}`);
  }

  if (current.dealSize !== undefined && past.dealValue > 0) {
    const ratio = current.dealSize / past.dealValue;
    if (ratio >= 0.5 && ratio <= 1.5) {
      score += 0.1;
      factors.push('dealSize±50%');
    }
  }

  return { deal: past, score, factors };
}

function toSimilarDeal(scored: ScoredDeal): SimilarDeal {
  return {
    opportunityId: scored.deal.opportunityId,
    customerName: scored.deal.customerName,
    similarityScore: Number(scored.score.toFixed(3)),
    matchFactors: scored.factors,
    dealValue: scored.deal.dealValue,
    outcome: scored.deal.outcome,
    margin: scored.deal.margin,
  };
}

async function aiSupplement(
  current: DealProfile,
  history: DealSummary[],
  alreadyMatchedIds: Set<string>,
): Promise<SimilarDeal[]> {
  const recent = history.slice(-AI_HISTORY_CAP);
  const result = await callAI({
    systemPrompt:
      'You are a pre-sales analyst. Identify historical deals similar to the current ' +
      'opportunity that a simple sector/country/vendor scoring algorithm might miss — ' +
      'e.g. different sector but same technical requirements, adjacent product categories, ' +
      'comparable buyer profile. Return strict JSON only.',
    prompt:
      `Current deal:\n${JSON.stringify(current, null, 2)}\n\n` +
      `Historical deals:\n${JSON.stringify(recent, null, 2)}\n\n` +
      `Respond with a JSON array of similar deals: ` +
      `[{"opportunityId": "...", "similarityScore": <0..1>, "matchFactors": ["..."]}]. ` +
      `Only include deals not trivially matched by sector/country/vendor overlap.`,
    outputSchema: AIOutputSchema,
    taskId: 'similar-deal-finder',
  });

  if (!result.success) return [];

  const byId = new Map(history.map((d) => [d.opportunityId, d]));
  const out: SimilarDeal[] = [];
  for (const item of result.data) {
    if (alreadyMatchedIds.has(item.opportunityId)) continue;
    const deal = byId.get(item.opportunityId);
    if (!deal) continue;
    out.push({
      opportunityId: deal.opportunityId,
      customerName: deal.customerName,
      similarityScore: item.similarityScore,
      matchFactors: item.matchFactors,
      dealValue: deal.dealValue,
      outcome: deal.outcome,
      margin: deal.margin,
    });
  }
  return out;
}

export async function findSimilarDeals(
  currentDeal: DealProfile,
  historicalDeals: DealSummary[],
): Promise<SimilarDealResult> {
  if (historicalDeals.length === 0) {
    return {
      matches: [],
      stats: { totalSearched: 0, matchesFound: 0, avgMarginOfWins: null },
    };
  }

  const scored = historicalDeals
    .map((d) => scoreDeal(currentDeal, d))
    .filter((s) => s.score > SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  const deterministic = scored.map(toSimilarDeal);
  const matchedIds = new Set(deterministic.map((d) => d.opportunityId));

  let merged = deterministic;
  if (deterministic.length < AI_TRIGGER_MIN) {
    const aiMatches = await aiSupplement(currentDeal, historicalDeals, matchedIds);
    merged = [...deterministic, ...aiMatches]
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, TOP_N);
  }

  const wonMargins = merged
    .filter((m) => m.outcome === 'won' && typeof m.margin === 'number')
    .map((m) => m.margin as number);
  const avgMarginOfWins =
    wonMargins.length > 0
      ? wonMargins.reduce((a, b) => a + b, 0) / wonMargins.length
      : null;

  return {
    matches: merged,
    stats: {
      totalSearched: historicalDeals.length,
      matchesFound: merged.length,
      avgMarginOfWins,
    },
  };
}

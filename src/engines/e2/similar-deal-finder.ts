import { tokenize, tokenOverlap } from './string-similarity';

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
  description?: string;
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
const REQUIREMENTS_THRESHOLD = 0.3;
const REQUIREMENTS_WEIGHT = 0.15;

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

  if (current.requirements && current.requirements.length > 0) {
    const pastText = [past.winLossReason, past.description]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join(' ');
    if (pastText.length > 0) {
      const currentTokens = tokenize(current.requirements.join(' '));
      const pastTokens = tokenize(pastText);
      const overlap = tokenOverlap(currentTokens, pastTokens);
      if (overlap >= REQUIREMENTS_THRESHOLD) {
        score += REQUIREMENTS_WEIGHT;
        const shared = currentTokens
          .filter((t) => pastTokens.includes(t))
          .slice(0, 2);
        factors.push(`requirements:${shared.join(',')}`);
      }
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

export function findSimilarDeals(
  currentDeal: DealProfile,
  historicalDeals: DealSummary[],
): SimilarDealResult {
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

  const matches = scored.map(toSimilarDeal);

  const wonMargins = matches
    .filter((m) => m.outcome === 'won' && typeof m.margin === 'number')
    .map((m) => m.margin as number);
  const avgMarginOfWins =
    wonMargins.length > 0
      ? wonMargins.reduce((a, b) => a + b, 0) / wonMargins.length
      : null;

  return {
    matches,
    stats: {
      totalSearched: historicalDeals.length,
      matchesFound: matches.length,
      avgMarginOfWins,
    },
  };
}

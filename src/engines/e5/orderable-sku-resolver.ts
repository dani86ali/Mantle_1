/**
 * E5 — Bare-model → orderable-SKU resolver.
 *
 * Bare model strings like 'C9300-48P' are not orderable from Cisco — only
 * variants like C9300-48P-A (Network Advantage) or C9300-48P-E (Essentials)
 * are. This pure resolver picks the variant from a spec entry's optional
 * orderable_skus map (see src/engines/e5/device-specs.ts), keyed by tier
 * (Cisco DNA license) or regulatory domain (APs).
 *
 * Fallback chain (deterministic):
 *   1. requested `tier` matches a key in orderable_skus → that SKU
 *   2. orderable_skus has any keys → first key in sorted order
 *   3. otherwise → the bare model (preserves current behavior, no regression)
 */

export interface ResolverInput {
  model: string;
  orderable_skus?: Record<string, string>;
  /** 'advantage' | 'essentials' | 'premier' | 'domain_e' | 'domain_a' | 'standard' */
  tier?: string;
}

export function resolveOrderableSku(spec: ResolverInput): string {
  if (!spec.orderable_skus || Object.keys(spec.orderable_skus).length === 0) {
    return spec.model;
  }
  if (spec.tier && spec.orderable_skus[spec.tier]) {
    return spec.orderable_skus[spec.tier];
  }
  const sortedKeys = Object.keys(spec.orderable_skus).sort();
  return spec.orderable_skus[sortedKeys[0]] ?? spec.model;
}

/** Coordinator → E3 helpers for RFI-mode artifacts.
 *  Pure mappers that parse E4 / E5 artifact JSON into the optional E3 input
 *  shapes. On any parse failure or missing fields, returns undefined so E3
 *  falls back to RFP-mode behavior (E1/E2 only).
 */

import type { E3E4Data, E3E5Data } from '@/engines/e3/orchestrator';
import type { E4Artifacts, E5Artifacts } from '@/coordinator/types';

function safeParse<T>(s: string | undefined): T | undefined {
  if (!s) return undefined;
  try { return JSON.parse(s) as T; } catch { return undefined; }
}

export function mapE4(e4?: E4Artifacts): E3E4Data | undefined {
  if (!e4) return undefined;
  const baseline = safeParse<E3E4Data['requirementsBaseline']>(e4.requirementsBaseline);
  if (!baseline || typeof baseline !== 'object') return undefined;
  return {
    requirementsBaseline: {
      business: Array.isArray(baseline.business) ? baseline.business : [],
      functional: Array.isArray(baseline.functional) ? baseline.functional : [],
      nonFunctional: Array.isArray(baseline.nonFunctional) ? baseline.nonFunctional : [],
      constraints: Array.isArray(baseline.constraints) ? baseline.constraints : [],
      assumptions: Array.isArray(baseline.assumptions) ? baseline.assumptions : [],
    },
  };
}

interface DesignSummary {
  designApproach?: E3E5Data['designApproach'];
  sizing?: E3E5Data['sizing'];
  hldSections?: E3E5Data['hldSections'];
}

export function mapE5(e5?: E5Artifacts): E3E5Data | undefined {
  if (!e5) return undefined;
  const summary = safeParse<DesignSummary>(e5.designSummary);
  if (!summary) return undefined;
  const data: E3E5Data = {};
  if (summary.designApproach && typeof summary.designApproach === 'object') {
    data.designApproach = summary.designApproach;
  }
  if (summary.sizing && typeof summary.sizing === 'object') {
    data.sizing = summary.sizing;
  }
  if (Array.isArray(summary.hldSections)) {
    data.hldSections = summary.hldSections;
  }
  if (!data.designApproach && !data.sizing && !data.hldSections) return undefined;
  return data;
}

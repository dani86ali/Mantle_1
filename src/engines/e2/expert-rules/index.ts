import type {
  BomLineItem,
  ProjectContext,
  AnomalyDetectionOptions,
} from '../bom-anomaly-detector';
import { missingCategoriesRule } from './missing-categories';
import { componentRatiosRule } from './component-ratios';
import { densityRulesRule } from './density-rules';
import { riskFlagPairsRule } from './risk-flag-pairs';
import type { RawAnomaly } from './types';

export type { RawAnomaly } from './types';

export function runExpertRules(
  bom: BomLineItem[],
  ctx: ProjectContext,
  options?: AnomalyDetectionOptions,
): RawAnomaly[] {
  return [
    ...missingCategoriesRule(bom, ctx),
    ...componentRatiosRule(bom),
    ...densityRulesRule(bom, ctx),
    ...riskFlagPairsRule(bom, options?.riskFlags ?? []),
  ];
}

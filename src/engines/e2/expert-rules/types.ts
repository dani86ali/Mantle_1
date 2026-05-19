import type { AnomalyType, AnomalySeverity } from '../bom-anomaly-detector';

export type RawAnomaly = {
  type: AnomalyType;
  description: string;
  severity: AnomalySeverity;
  affectedSkus: string[];
  suggestion: string;
};

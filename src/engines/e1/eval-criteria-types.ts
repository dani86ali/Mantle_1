export type EvalMethodology =
  | 'sequential_envelope'
  | 'weighted_score'
  | 'pass_fail'
  | 'best_value'
  | 'unknown';

export interface Envelope {
  name: string;
  weight: number;
  passThreshold: number;
  criteria: string[];
}

export interface EvalCriteriaResult {
  methodology: EvalMethodology;
  envelopes: Envelope[];
  passingThreshold?: number;
  iktvaRequired: boolean;
  source: string;
}

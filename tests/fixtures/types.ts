export interface EngineExpectations {
  requirementCount?: number;
  lineItemCount?: number;
  totalSellRange?: [number, number];
}

export interface ExpectedOutputs {
  e1?: EngineExpectations;
  e2?: EngineExpectations;
  e3?: EngineExpectations;
  e4?: EngineExpectations;
  e5?: EngineExpectations;
}

export interface TestFixture {
  opportunityId: string;
  projectType: string;
  mode: string;
  sector: string;
  country: string;
  expectedOutputs?: ExpectedOutputs;
}

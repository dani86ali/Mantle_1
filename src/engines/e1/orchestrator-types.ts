import type { FileClassification } from '@/engines/e1/file-classifier';
import type { MissingDocument } from '@/engines/e1/missing-doc-detector';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import type {
  RiskFlag,
  ComplianceDeadline,
} from '@/engines/e1/legal-trap-flagger';
import type { EvalCriteriaResult } from '@/engines/e1/eval-criteria-types';
import type { VendorPreference } from '@/engines/e1/vendor-extractor';
import type { SectorDetection } from '@/engines/e1/sector-detector';
import type { SelectedFramework } from '@/engines/e1/framework-selector';
import type { ComplianceMatrixResult } from '@/engines/e1/compliance-matrix';
import type { ClarificationResult } from '@/engines/e1/clarification-generator';
import type { DocumentType } from '@/types/document-type';

export interface E1InputFile {
  path: string;
  content?: string;
  documentType?: DocumentType;
}

export interface E1Input {
  files: E1InputFile[];
  clientName?: string;
  country?: string;
  solutionContext?: string;
}

export interface E1ClassifiedFile extends FileClassification {
  path: string;
  filename: string;
  documentType?: DocumentType;
}

export interface E1Stats {
  totalFiles: number;
  totalRequirements: number;
  mandatoryCount: number;
  criticalRisks: number;
}

export interface E1Output {
  fileClassifications: E1ClassifiedFile[];
  missingDocuments: MissingDocument[];
  requirements: Requirement[];
  riskFlags: RiskFlag[];
  deadlines: ComplianceDeadline[];
  evalCriteria: EvalCriteriaResult;
  vendorPreferences: VendorPreference[];
  sectorDetection: SectorDetection;
  frameworks: SelectedFramework[];
  complianceMatrix: ComplianceMatrixResult;
  clarifications: ClarificationResult;
  stats: E1Stats;
}

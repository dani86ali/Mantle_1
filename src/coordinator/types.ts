/** Coordinator pipeline types — all inter-engine state flows through here */

export type IntakeMode = 'rfp' | 'rfi' | 'quick_bom';

export type EngineId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5';

export type CheckpointStatus =
  | 'pending'
  | 'approved'
  | 'revision_requested'
  | 'rejected';

// Per-engine artifact shapes (Runtime Architecture §6.1–6.2)
export interface E1Artifacts {
  complianceMatrix?: string;
  requirementsBaseline?: string;
  riskFlags?: string[];
  vendorList?: string[];
  sector?: string;
}

export interface E2Artifacts {
  bomWorkbook?: string;
  filledClientBoq?: string;
  /** Path to the client BoQ XLSX that fed E2 (so re-runs can re-fill it). */
  clientBoqInputPath?: string;
  distributorExport?: string;
  pricingSummary?: string;
  /** Honesty signal surfaced to UI/downstream consumers. Mirrors E2Output. */
  validationStatus?: "validated" | "unvalidated" | "partial";
  validationWarnings?: string[];
}

export interface E3Artifacts {
  technicalProposal?: string;
  financialProposal?: string;
  submissionPdf?: string;
}

export interface E4Artifacts {
  questionnaire?: string;
  requirementsBaseline?: string;
}

export interface E5Artifacts {
  hldDocument?: string;
  lldDocument?: string;
  diagrams?: string[];
  ipVlanPlan?: string;
  componentList?: string;
  /** JSON: { designApproach, sizing, hldSections } from phase1 — for E3 grounding. */
  designSummary?: string;
}

/** Indexed by engine — engines write here, downstream engines read from here */
export interface ArtifactRegistry {
  e1: E1Artifacts;
  e2: E2Artifacts;
  e3: E3Artifacts;
  e4: E4Artifacts;
  e5: E5Artifacts;
}

export interface Checkpoint {
  id: string;
  engine: EngineId;
  label: string;
  status: CheckpointStatus;
  revisionsUsed: number;
  revisionNotes?: string;
  decidedAt?: Date;
}

export interface EngineCall {
  id: string;
  engine: EngineId;
  step: string;
  model: string;
  startedAt: Date;
  completedAt?: Date;
  retryCount: number;
  outcome: 'pass' | 'flagged' | 'failed';
}

export interface PipelineTotalsSnapshot {
  hardwareTotal: number;
  softwareTotal: number;
  serviceTotal: number;
  subscriptionTotal: number;
  grandTotalExVat: number;
  vatAmount: number;
  grandTotalIncVat: number;
}

export interface PipelineState {
  id: string;
  opportunityId: string;
  intakeId?: string;
  mode: IntakeMode;
  currentEngine: EngineId;
  artifacts: ArtifactRegistry;
  checkpoints: Checkpoint[];
  engineCalls: EngineCall[];
  /** Set by re-run flows to power the before/after totals comparison banner. */
  previousTotals?: PipelineTotalsSnapshot;
  timestamps: {
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
  };
  /** Set when the pipeline aborts due to an unrecoverable error (not per-engine failures). */
  error?: { message: string };
}

export interface EngineInput {
  engine: EngineId;
  pipelineState: PipelineState;
  inputData: Record<string, unknown>;
  revisionNotes?: string;
}

export interface EngineOutput<E extends EngineId = EngineId> {
  engine: E;
  artifacts: ArtifactRegistry[E];
  warnings: string[];
  error?: string;
}

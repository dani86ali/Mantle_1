/** Public types for the pipeline orchestrator. Kept here so pipeline.ts
 *  stays focused on the runPipeline / resumePipeline orchestration logic,
 *  and so the engine dispatcher can import shapes without circling back
 *  through pipeline.ts. */

import type { E1Output, E1Input } from '@/engines/e1/orchestrator';
import type { E2Output, E2Input } from '@/engines/e2/orchestrator';
import type { E3Output } from '@/engines/e3/orchestrator';
import type { CheckpointCallback } from '@/coordinator/pipeline-state';
import type { EngineOutput, IntakeMode, PipelineState } from '@/coordinator/types';
import type { DocumentType } from '@/types/document-type';

export interface PipelineInput {
  opportunityId: string;
  /** Tenant scope for catalog credentials + price list lookup. */
  tenantId?: string;
  mode: IntakeMode;
  files?: { path: string; content?: string; documentType?: DocumentType }[];
  devices?: E2Input['devices'];
  pricingConfig?: E2Input['pricingConfig'];
  clientName?: string;
  country?: string;
  solutionContext?: string;
  historicalDeals?: E2Input['historicalDeals'];
  /** E4 inputs (RFI mode). */
  sector?: string;
  existingVendors?: string[];
  projectType?: string;
  responseFilePath?: string;
  responseText?: string;
  /** E5 inputs (RFI mode). */
  vendor?: 'cisco' | 'fortinet';
  projectName?: string;
  isGreenfield?: boolean;
  siteCount?: number;
  buildingCount?: number;
  portCount?: number;
  userCount?: number;
  bandwidthGbps?: number;
  hasOT?: boolean;
  hasHPC?: boolean;
  hasGPON?: boolean;
  hasWireless?: boolean;
  hasVoice?: boolean;
  hasDC?: boolean;
  hasGuest?: boolean;
  isNvidia?: boolean;
  idfRoomsPerFloor?: number;
  baseSubnet?: string;
  vrfEnabled?: boolean;
  hasVideo?: boolean;
  hasRedundancy?: boolean;
  downTimeToleranceHours?: number;
  /** E2 device config overrides sourced from intake. */
  dnaTier?: string;
  licenseTier?: 'essentials' | 'advantage';
  supportTerm?: string;
  redundancyRequired?: boolean;
  onCheckpoint?: CheckpointCallback;
}

export interface PipelineResult {
  state: PipelineState;
  e1Output?: E1Output;
  e2Output?: E2Output;
  e3Output?: E3Output;
  e4Output?: EngineOutput<'e4'>;
  e5Output?: EngineOutput<'e5'>;
}

// Re-export E1Input so callers using PipelineInput's E1-shaped overrides
// (e.g. via the dispatcher) don't have to dual-import.
export type { E1Input };

/**
 * E4 orchestrator input/output shapes.
 * Kept separate from orchestrator.ts so phase 1 / phase 2 helpers can import
 * E4InputData without creating a circular dep.
 */

import type { CheckpointStatus } from '@/coordinator/types';
import type { ClientResponse, ProjectType, Question } from './types';

export type CheckpointDecision = {
  decision: CheckpointStatus;
  notes?: string;
};

export type CheckpointCallback = (
  checkpointId: 'e4-questionnaire' | 'e4-baseline',
  artifact: string,
  revision: number,
) => Promise<CheckpointDecision> | CheckpointDecision;

export interface E4InputData {
  clientName: string;
  country: string;
  sector?: string;
  description?: string;
  existingVendors?: string[];
  projectType?: ProjectType;
  /** If true and confidence is low, project type detection uses the AI path. */
  ambiguous?: boolean;

  /** Phase 2 triggers — presence of any of these routes the orchestrator into phase 2. */
  clientResponses?: ClientResponse[];
  responseFilePath?: string;
  responseText?: string;
  questions?: Question[];
  projectContext?: string;

  /** Sizing hints from intake — feed phase-1 preliminary baseline so E5 can design
   *  before customer responses arrive. Phase-2 baseline (built from real responses)
   *  supersedes these. */
  siteCount?: number;
  portCount?: number;
  userCount?: number;
  bandwidthGbps?: number;
  vendor?: 'cisco' | 'fortinet';
  isGreenfield?: boolean;
  hasWireless?: boolean;
  hasVoice?: boolean;
  hasDC?: boolean;
  hasOT?: boolean;
  hasGPON?: boolean;
  hasHPC?: boolean;

  /** Optional engineer review hook — return revision_requested to trigger an internal retry. */
  onCheckpoint?: CheckpointCallback;
}

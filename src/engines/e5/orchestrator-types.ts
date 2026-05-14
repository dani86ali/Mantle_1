/**
 * E5 orchestrator input/output shapes.
 * Kept separate from orchestrator.ts so phase 1 / phase 2 helpers can import
 * E5InputData without creating a circular dep.
 */

import type { CheckpointStatus } from '@/coordinator/types';

export type CheckpointDecision = {
  decision: CheckpointStatus;
  notes?: string;
};

export type E5CheckpointId = 'e5-design-approach' | 'e5-hld' | 'e5-lld';

export type CheckpointCallback = (
  checkpointId: E5CheckpointId,
  artifact: string,
  revision: number,
) => Promise<CheckpointDecision> | CheckpointDecision;

export type E5Phase = 'hld' | 'lld' | 'full';

export interface E5InputData {
  requirementsBaseline: any;
  vendor: 'cisco' | 'fortinet';
  customerName: string;
  projectName: string;
  projectType: string;
  isGreenfield?: boolean;
  siteCount: number;
  buildingCount: number;
  portCount: number;
  userCount: number;
  bandwidthGbps: number;
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
  phase?: E5Phase;

  /** Per-intake directory where HLD/LLD .docx files should be written. Falls back to './out'. */
  outputDir?: string;

  /** Optional engineer review hook — return revision_requested to trigger an internal retry. */
  onCheckpoint?: CheckpointCallback;

  /** Phase-2-only input: when running phase 2 standalone, prior HLD outputs. */
  hldHandoff?: Phase1Handoff;
}

import type {
  CompatibilityResult,
  DesignApproach,
  SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';

export interface Phase1Handoff {
  designApproach: DesignApproach;
  topology: TopologyPattern;
  sizing: SizingResult;
  compatibility: CompatibilityResult;
}

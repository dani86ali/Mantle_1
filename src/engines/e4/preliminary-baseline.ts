/**
 * E4 — Preliminary requirements baseline.
 * Built during phase 1 from intake metadata + project-type emphasis so E5
 * can design when the pipeline runs end-to-end before customer responses
 * arrive. Every entry is tagged source: 'preliminary' so phase 2 (real
 * responses) and downstream consumers can distinguish inferred from validated.
 */

import { getEmphasis } from './emphasis-matrix';
import type {
  BaselineEntry,
  BaselinePriority,
  EmphasisLevel,
  ProjectType,
  RequirementsBaseline,
} from './types';
import type { E4InputData } from './orchestrator-types';

type Category = keyof RequirementsBaseline;

export function buildPreliminaryBaseline(
  projectType: ProjectType | string,
  emphasisMatrix: Record<string, EmphasisLevel>,
  inputData: E4InputData,
): Record<string, unknown> {
  const baseline: RequirementsBaseline = {
    business: [],
    functional: [],
    nonFunctional: [],
    constraints: [],
    assumptions: [],
  };

  let counter = 1;
  const add = (
    category: Category,
    text: string,
    priority: BaselinePriority = 'medium',
  ): void => {
    const entry: BaselineEntry = {
      id: `RB-PRE-${String(counter++).padStart(3, '0')}`,
      text,
      source: 'preliminary',
      priority,
      validated: false,
    };
    baseline[category].push(entry);
  };

  add('business', `Project type: ${projectType}`, 'high');
  add('business', `Customer: ${inputData.clientName}`, 'medium');
  add('business', `Country: ${inputData.country}`, 'medium');
  if (inputData.sector) add('business', `Sector: ${inputData.sector}`, 'medium');
  if (inputData.description) {
    add('business', `Engagement summary: ${inputData.description}`, 'low');
  }

  if (typeof inputData.siteCount === 'number') {
    add('functional', `Sites in scope: ${inputData.siteCount}`, 'high');
  }
  if (typeof inputData.portCount === 'number') {
    add('functional', `Access ports required: ${inputData.portCount}`, 'high');
  }
  if (typeof inputData.userCount === 'number') {
    add('functional', `User population: ${inputData.userCount}`, 'medium');
  }
  if (typeof inputData.bandwidthGbps === 'number') {
    add('nonFunctional', `Aggregate bandwidth target: ${inputData.bandwidthGbps} Gbps`, 'high');
  }

  const networkEmphasis = emphasisMatrix.B ?? 'medium';
  if (inputData.hasWireless) {
    add('functional', 'Wireless coverage required', priorityFromEmphasis(networkEmphasis));
  }
  if (inputData.hasVoice) {
    add('functional', 'Voice/VoIP services required', 'medium');
  }
  if (inputData.hasDC) {
    add('functional', 'Data center connectivity required', priorityFromEmphasis(networkEmphasis));
  }
  if (inputData.hasOT) {
    add('functional', 'Operational Technology (OT) network segment required', 'high');
  }
  if (inputData.hasGPON) {
    add('functional', 'GPON / passive optical access required', 'medium');
  }
  if (inputData.hasHPC) {
    add('functional', 'High-performance computing fabric required', 'high');
  }

  if (inputData.vendor) {
    add('constraints', `Preferred vendor: ${inputData.vendor}`, 'high');
  }
  if (inputData.existingVendors && inputData.existingVendors.length > 0) {
    add('constraints', `Incumbent vendors: ${inputData.existingVendors.join(', ')}`, 'medium');
  }
  if (typeof inputData.isGreenfield === 'boolean') {
    add(
      'constraints',
      inputData.isGreenfield
        ? 'Greenfield deployment — no incumbent gear to integrate'
        : 'Brownfield — must integrate with existing infrastructure',
      'high',
    );
  }

  if ((emphasisMatrix.E ?? 'medium') === 'high') {
    add(
      'constraints',
      'Compliance / regulatory framework applies (high emphasis from project type)',
      'high',
    );
  }
  if ((emphasisMatrix.D ?? 'medium') === 'high') {
    add(
      'nonFunctional',
      'Future-state SLAs and growth headroom emphasized',
      'high',
    );
  }
  if ((emphasisMatrix.A ?? 'medium') === 'high') {
    add('business', 'Business context heavily weighted (greenfield/branch rollout)', 'medium');
  }

  add(
    'assumptions',
    'Baseline derived from intake metadata; superseded by phase-2 customer responses.',
    'low',
  );

  return baseline as unknown as Record<string, unknown>;
}

function priorityFromEmphasis(level: EmphasisLevel): BaselinePriority {
  switch (level) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    case 'skip':
      return 'low';
  }
}

export function buildPreliminaryBaselineFromProjectType(
  projectType: ProjectType,
  inputData: E4InputData,
): Record<string, unknown> {
  return buildPreliminaryBaseline(projectType, getEmphasis(projectType), inputData);
}

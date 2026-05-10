import type { Requirement } from '@/engines/e1/requirements-extractor';
import type { SelectedFramework } from '@/engines/e1/framework-selector';
import { linkToTPSection } from '@/engines/e1/xref-linker';
import {
  CONTROL_TOPICS,
  frameworkControls,
} from '@/engines/e1/compliance-matrix-controls';
import {
  assignStatuses,
  pairKey,
  DEFAULT_STATUS,
  DEFAULT_NOTES,
  type ComplianceStatus,
  type RawMatch,
} from '@/engines/e1/compliance-matrix-status';

export type { ComplianceStatus } from '@/engines/e1/compliance-matrix-status';

export interface MatrixRow {
  requirementId: string;
  requirementText: string;
  classification: string;
  frameworkId: string;
  controlId: string;
  controlName: string;
  status: ComplianceStatus;
  notes: string;
  tpSection: string;
}

export interface CoverageGap {
  frameworkId: string;
  controlId: string;
  controlName: string;
}

export interface OrphanRequirement {
  requirementId: string;
  requirementText: string;
}

export interface ComplianceMatrixStats {
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  alternative: number;
}

export interface ComplianceMatrixResult {
  rows: MatrixRow[];
  gaps: { coverageGaps: CoverageGap[]; orphanRequirements: OrphanRequirement[] };
  stats: ComplianceMatrixStats;
}

function keywordMatch(
  requirements: Requirement[],
  frameworks: SelectedFramework[],
): { matches: RawMatch[]; orphans: Requirement[] } {
  const matches: RawMatch[] = [];
  const orphans: Requirement[] = [];
  const seen = new Set<string>();

  for (const req of requirements) {
    let matched = false;
    for (const topic of CONTROL_TOPICS) {
      if (!topic.keywords.test(req.text)) continue;
      for (const fw of frameworks) {
        const ctrl = topic.controls[fw.id];
        if (!ctrl) continue;
        const key = `${req.id}#${fw.id}#${ctrl.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ requirement: req, frameworkId: fw.id, control: ctrl });
        matched = true;
      }
    }
    if (!matched) orphans.push(req);
  }
  return { matches, orphans };
}

function detectCoverageGaps(
  matches: RawMatch[],
  frameworks: SelectedFramework[],
): CoverageGap[] {
  const matchedPerFw = new Map<string, Set<string>>();
  for (const m of matches) {
    if (!matchedPerFw.has(m.frameworkId)) matchedPerFw.set(m.frameworkId, new Set());
    matchedPerFw.get(m.frameworkId)!.add(m.control.id);
  }

  const gaps: CoverageGap[] = [];
  for (const fw of frameworks) {
    const controls = frameworkControls(fw.id);
    if (controls.size === 0) continue;
    const matched = matchedPerFw.get(fw.id) ?? new Set<string>();
    controls.forEach((c, id) => {
      if (!matched.has(id)) {
        gaps.push({ frameworkId: fw.id, controlId: id, controlName: c.name });
      }
    });
  }
  return gaps;
}

export async function generateComplianceMatrix(
  requirements: Requirement[],
  frameworks: SelectedFramework[],
  solutionContext?: string,
): Promise<ComplianceMatrixResult> {
  const { matches, orphans } = keywordMatch(requirements, frameworks);
  const statusMap = await assignStatuses(matches, solutionContext);
  const fallback = { status: DEFAULT_STATUS, notes: DEFAULT_NOTES };

  const rows: MatrixRow[] = matches.map((m) => {
    const tp = linkToTPSection(m.requirement.text);
    const s = statusMap.get(pairKey(m)) ?? fallback;
    return {
      requirementId: m.requirement.id,
      requirementText: m.requirement.text,
      classification: m.requirement.classification,
      frameworkId: m.frameworkId,
      controlId: m.control.id,
      controlName: m.control.name,
      status: s.status,
      notes: s.notes,
      tpSection: tp.section,
    };
  });

  const stats: ComplianceMatrixStats = {
    total: rows.length,
    compliant: rows.filter((r) => r.status === 'Compliant').length,
    partial: rows.filter((r) => r.status === 'Partially Compliant').length,
    nonCompliant: rows.filter((r) => r.status === 'Non-Compliant').length,
    alternative: rows.filter((r) => r.status === 'Alternative Proposed').length,
  };

  return {
    rows,
    gaps: {
      coverageGaps: detectCoverageGaps(matches, frameworks),
      orphanRequirements: orphans.map((r) => ({
        requirementId: r.id,
        requirementText: r.text,
      })),
    },
    stats,
  };
}

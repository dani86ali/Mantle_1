/**
 * E5 — Methodology selector (deterministic).
 *
 * Encodes the decision tree from Design_Patterns.md §6 (PPDIOO baseline +
 * supplementary frameworks) and Playbook §3.1 (top-down vs bottom-up).
 *
 * Pure function — no I/O, no AI calls, no side effects.
 */
import { z } from 'zod';
import type { DesignApproach, DesignFramework } from '@/engines/e5/types';

const RequirementsSchema = z.object({
  hasOT: z.boolean().optional(),
  siteCount: z.number().int().nonnegative().optional(),
  isGreenfield: z.boolean().optional(),
  hasDC: z.boolean().optional(),
  hasHPC: z.boolean().optional(),
  hasUCaaS: z.boolean().optional(),
  hasGPON: z.boolean().optional(),
});
export type MethodologyRequirements = z.infer<typeof RequirementsSchema>;

const ProjectTypeSchema = z.string().min(1);

/**
 * Select the design approach for an E5 run.
 *
 * Decision tree (Design_Patterns.md §6, Playbook §3.1):
 * - approach: greenfield → top_down; brownfield → bottom_up; unknown → hybrid.
 * - frameworks: always PPDIOO; +TOGAF if siteCount > 3; +Cisco SAFE if OT or DC;
 *   +NIST SP 800-207 if OT; +ITIL v4 if siteCount > 5.
 * - topologyPattern: null here; filled by the topology recommender step.
 * - vendor: defaults to Cisco (overridden later by per-deal vendor lock).
 */
export function selectMethodology(
  projectType: string,
  requirements: MethodologyRequirements,
): DesignApproach {
  const pt = ProjectTypeSchema.parse(projectType);
  const r = RequirementsSchema.parse(requirements);

  const approach: DesignApproach['approach'] =
    r.isGreenfield === true ? 'top_down'
    : r.isGreenfield === false ? 'bottom_up'
    : 'hybrid';

  const frameworks: DesignFramework[] = ['ppdioo'];
  const sites = r.siteCount ?? 0;
  if (sites > 3) frameworks.push('togaf_adm');
  if (r.hasOT || r.hasDC) frameworks.push('cisco_safe');
  if (r.hasOT) frameworks.push('nist_sp800_207');
  if (sites > 5) frameworks.push('itil_v4');

  return {
    methodology: 'ppdioo',
    approach,
    frameworks,
    topologyPattern: null,
    vendor: 'cisco',
    projectType: pt,
  };
}

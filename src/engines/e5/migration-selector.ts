/**
 * E5 — Deterministic migration-approach selector.
 *
 * Pure function. Maps a {@link MigrationInput} to a {@link MigrationApproach}
 * via a flat decision tree (Playbook §3.7 item 13, Design_Patterns migration
 * guidance).
 *
 * Decision order (first match wins):
 *   1. Greenfield                                                    → cutover / low
 *   2. Brownfield + hasRedundancy + downTimeToleranceHours ≥ 4       → parallel_run / medium
 *   3. Brownfield + siteCount > 3                                    → phased / medium
 *   4. Brownfield + !hasRedundancy + downTimeToleranceHours < 4      → cutover / high
 *   5. Default brownfield                                            → cutover / medium
 *
 * No I/O, no AI calls, no side effects (BOMATIC §1).
 */
import { z } from 'zod';
import type { MigrationApproach, MigrationPhase } from '@/engines/e5/types';

export const MigrationInputSchema = z.object({
  isGreenfield: z.boolean(),
  siteCount: z.number().int().nonnegative(),
  hasRedundancy: z.boolean(),
  downTimeToleranceHours: z.number().nonnegative(),
  deviceCount: z.number().int().nonnegative(),
});
export type MigrationInput = z.infer<typeof MigrationInputSchema>;

function phase(
  name: string,
  description: string,
  durationDays: number,
  rollbackPlan: string,
): MigrationPhase {
  return { name, description, durationDays, rollbackPlan };
}

function greenfieldPlan(): MigrationApproach {
  return {
    method: 'cutover',
    riskLevel: 'low',
    phases: [
      phase(
        'Staging',
        'Pre-build new equipment in staging racks, load base configs and golden images.',
        5,
        'Staging is isolated from production — pause and review before go-live.',
      ),
      phase(
        'Go-Live',
        'Move equipment to final racks, attach endpoints, enable upstream uplinks.',
        1,
        'Power down new equipment and reschedule go-live in the next maintenance window.',
      ),
    ],
    reasoning: 'Greenfield deployment — no existing traffic to preserve, single staged cutover.',
  };
}

function parallelRunPlan(): MigrationApproach {
  return {
    method: 'parallel_run',
    riskLevel: 'medium',
    phases: [
      phase(
        'Parallel Install',
        'Install new network alongside existing infrastructure without disrupting production traffic.',
        10,
        'Decommission new equipment; existing network remains untouched.',
      ),
      phase(
        'Traffic Migration',
        'Migrate VLANs/segments to new infrastructure one at a time across maintenance windows.',
        14,
        'Reroute migrated VLANs back to legacy switches via pre-staged trunk uplinks.',
      ),
      phase(
        'Decommission',
        'Power down and remove legacy infrastructure after a 7-day stability soak.',
        5,
        'Rollback not feasible after decommission — verify stability before this phase begins.',
      ),
    ],
    reasoning:
      'Brownfield with redundant paths and ≥4h downtime budget — parallel run minimises traffic risk.',
  };
}

function phasedPlan(siteCount: number): MigrationApproach {
  const groups = Math.ceil(siteCount / 3);
  const phases: MigrationPhase[] = [];
  for (let g = 1; g <= groups; g++) {
    const first = (g - 1) * 3 + 1;
    const last = Math.min(g * 3, siteCount);
    phases.push(phase(
      `Site Group ${g}`,
      `Migrate sites ${first}–${last} (rolling 3-site deployment).`,
      5,
      `Revert site ${first}–${last} uplinks to legacy stack; remaining sites unaffected.`,
    ));
  }
  phases.push(phase(
    'Final Cutover',
    'Switch shared services (DNS, AAA, SNMP collectors, NMS) to the new infrastructure.',
    1,
    'Re-point shared services back to legacy targets — per-site reroute already executed in prior phases.',
  ));
  return {
    method: 'phased',
    riskLevel: 'medium',
    phases,
    reasoning: `Brownfield with ${siteCount} sites (>3) — phased rollout in groups of 3 limits simultaneous blast radius.`,
  };
}

function highRiskCutoverPlan(): MigrationApproach {
  return {
    method: 'cutover',
    riskLevel: 'high',
    phases: [
      phase(
        'Staging',
        'Pre-config new equipment, dry-run cutover steps in lab, freeze change.',
        7,
        'Staging is isolated — abort before the maintenance window if dry-run fails.',
      ),
      phase(
        'Maintenance-Window Cutover',
        'Hard cutover during approved maintenance window — swap uplinks and reconverge.',
        1,
        'Restore physical connections to legacy gear; reload pre-cutover configs from backup.',
      ),
      phase(
        'Rollback Window',
        'Standby period to monitor traffic and execute rollback if regressions appear.',
        1,
        'Trigger rollback procedure from the previous phase — pre-staged legacy gear remains powered for 24h.',
      ),
    ],
    reasoning:
      'Brownfield with no redundancy and tight downtime budget (<4h) — single-shot cutover, high risk.',
  };
}

function defaultBrownfieldPlan(): MigrationApproach {
  return {
    method: 'cutover',
    riskLevel: 'medium',
    phases: [
      phase(
        'Staging',
        'Pre-config new equipment and dry-run the cutover steps.',
        5,
        'Staging is isolated — abort before the maintenance window if dry-run fails.',
      ),
      phase(
        'Cutover',
        'Swap uplinks during maintenance window and validate traffic.',
        1,
        'Restore physical connections to legacy gear and reload prior configs.',
      ),
    ],
    reasoning:
      'Brownfield default path — no parallel run option but no extreme constraints either.',
  };
}

/**
 * Select migration approach (method, phases, risk) for the LLD migration plan.
 *
 * @param input  Greenfield/brownfield, sites, redundancy, downtime budget, devices.
 * @returns      A typed {@link MigrationApproach} with phase plan and reasoning.
 */
export function selectMigrationApproach(input: MigrationInput): MigrationApproach {
  const i = MigrationInputSchema.parse(input);

  if (i.isGreenfield) return greenfieldPlan();
  if (i.hasRedundancy && i.downTimeToleranceHours >= 4) return parallelRunPlan();
  if (i.siteCount > 3) return phasedPlan(i.siteCount);
  if (!i.hasRedundancy && i.downTimeToleranceHours < 4) return highRiskCutoverPlan();
  return defaultBrownfieldPlan();
}

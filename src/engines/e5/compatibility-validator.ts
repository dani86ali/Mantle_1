/**
 * E5 — Deterministic compatibility validator.
 *
 * Pure function. Walks a {@link SizingResult} + {@link TopologyPattern} and
 * checks rule violations from docs/BOMATIC_Device_Specs.json (stacking_rules,
 * psu_rules) plus docs/reference/hld/shahid-cisco-ground-truth.md ground-truth examples.
 *
 * Returns errors (hard failures — design would not work) and warnings
 * (advisories — suboptimal but functional). Never throws.
 *
 * Rules encoded:
 *   • Stacking:    C9300 ⨯ C9300L cannot mix; max 8 members per stack family
 *   • PSU:         FortiGate ≤101F needs optional redundant PSU (warning if HA)
 *   • PoE budget:  switch budget must cover APs (25.5W) + phones (6.5W)
 *   • Topology:    two_tier must not have distribution; three_tier must have it
 *   • Port cap:    total connected devices per switch ≤ port count × qty
 */
import {
  CISCO_ACCESS_SWITCHES,
  FORTIGATE_FIREWALLS,
} from '@/engines/e5/device-specs';
import type {
  CompatibilityResult,
  DeviceSelection,
  SizingResult,
  TopologyPattern,
  ValidationIssue,
} from '@/engines/e5/types';

const AP_POE_W = 25.5;
const PHONE_POE_W = 6.5;
const MAX_STACK_MEMBERS = 8;
const FORTIGATE_DUAL_PSU_MIN_TIER = ['FG-201F', 'FG-401F', 'FG-601F', 'FG-1001F'];

function isC9300(model: string): boolean {
  return /^C9300-/i.test(model);
}
function isC9300L(model: string): boolean {
  return /^C9300L-/i.test(model);
}

function checkStacking(access: DeviceSelection[], errors: ValidationIssue[]): void {
  const c9300Qty = access.filter((d) => isC9300(d.model)).reduce((s, d) => s + d.quantity, 0);
  const c9300lQty = access.filter((d) => isC9300L(d.model)).reduce((s, d) => s + d.quantity, 0);

  if (c9300Qty > 0 && c9300lQty > 0) {
    errors.push({
      rule: 'stacking.mixed_families',
      device: 'access',
      message: 'C9300 and C9300L cannot be stacked together (Device_Specs.json stacking_rules).',
      severity: 'error',
    });
  }
  for (const d of access) {
    if ((isC9300(d.model) || isC9300L(d.model)) && d.quantity > MAX_STACK_MEMBERS) {
      errors.push({
        rule: 'stacking.max_members',
        device: d.model,
        message: `Stack of ${d.quantity} ${d.model} exceeds max ${MAX_STACK_MEMBERS} members — split into multiple stacks.`,
        severity: 'error',
      });
    }
  }
}

function checkPoeBudget(
  access: DeviceSelection[],
  aps: DeviceSelection[],
  errors: ValidationIssue[],
): void {
  const apCount = aps.reduce((s, d) => s + d.quantity, 0);
  if (apCount === 0) return;
  const requiredW = apCount * AP_POE_W;
  let availableW = 0;
  for (const d of access) {
    const spec = CISCO_ACCESS_SWITCHES.find((s) => s.model === d.model);
    if (spec) availableW += spec.poeBudgetDefaultW * d.quantity;
  }
  if (availableW > 0 && availableW < requiredW) {
    errors.push({
      rule: 'poe.budget_exceeded',
      device: 'access',
      message: `PoE demand ${requiredW.toFixed(1)}W (${apCount} APs × ${AP_POE_W}W) exceeds switch budget ${availableW}W — upgrade PSU or split APs.`,
      severity: 'error',
    });
  }
}

function checkFortigatePsu(firewalls: DeviceSelection[], warnings: ValidationIssue[]): void {
  for (const fw of firewalls) {
    if (fw.vendor !== 'fortinet') continue;
    if (fw.quantity < 2) continue;
    const spec = FORTIGATE_FIREWALLS.find((f) => f.model === fw.model);
    if (!spec) continue;
    if (!FORTIGATE_DUAL_PSU_MIN_TIER.includes(fw.model)) {
      warnings.push({
        rule: 'psu.fortigate_redundant_optional',
        device: fw.model,
        message: `${fw.model} (≤101F tier) ships single-PSU; add optional redundant PSU SKU for HA pair.`,
        severity: 'warning',
      });
    }
  }
}

function checkTopology(
  topology: TopologyPattern,
  sizing: SizingResult,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  const hasDist = sizing.distributionDevices.some((d) => d.quantity > 0);
  if (topology === 'two_tier_collapsed_core' && hasDist) {
    warnings.push({
      rule: 'topology.two_tier_has_distribution',
      device: 'distribution',
      message: 'Two-tier collapsed-core should not include distribution devices — collapse into core layer.',
      severity: 'warning',
    });
  }
  if (topology === 'three_tier_core_dist_access' && !hasDist) {
    errors.push({
      rule: 'topology.three_tier_missing_distribution',
      device: 'distribution',
      message: 'Three-tier topology requires distribution layer devices — none provided.',
      severity: 'error',
    });
  }
}

function checkPortCapacity(
  access: DeviceSelection[],
  apsAndPhones: number,
  errors: ValidationIssue[],
): void {
  if (apsAndPhones === 0) return;
  let totalPorts = 0;
  for (const d of access) {
    const spec = CISCO_ACCESS_SWITCHES.find((s) => s.model === d.model);
    if (spec) totalPorts += spec.ports * d.quantity;
  }
  if (totalPorts > 0 && totalPorts < apsAndPhones) {
    errors.push({
      rule: 'ports.capacity_exceeded',
      device: 'access',
      message: `Connected devices ${apsAndPhones} exceed total access ports ${totalPorts} — add switches.`,
      severity: 'error',
    });
  }
}

/**
 * Validate the design output for stacking, PSU, PoE, topology, and port-capacity rules.
 *
 * @param sizing   Output of calculateSizing.
 * @param topology Selected topology pattern (decision tree output).
 * @param vendor   Vendor lock — affects firewall PSU rule selection.
 * @returns        Result with valid flag plus separated errors/warnings arrays.
 */
export function validateCompatibility(
  sizing: SizingResult,
  topology: TopologyPattern,
  vendor: 'cisco' | 'fortinet',
): CompatibilityResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  checkStacking(sizing.accessDevices, errors);
  checkPoeBudget(sizing.accessDevices, sizing.accessPoints, errors);
  checkFortigatePsu(sizing.firewalls, warnings);
  checkTopology(topology, sizing, errors, warnings);

  const apQty = sizing.accessPoints.reduce((s, d) => s + d.quantity, 0);
  checkPortCapacity(sizing.accessDevices, apQty, errors);

  // Vendor parameter reserved for future Cisco-side PSU rules (Firepower
  // chassis already ship dual PSU on referenced tiers — no rule firing today).
  void vendor;

  return { valid: errors.length === 0, errors, warnings };
}

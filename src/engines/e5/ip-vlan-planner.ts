/**
 * E5 — Deterministic IP/VLAN/VRF planner.
 *
 * Pure function. Maps an {@link IPVlanPlanInput} to an {@link IPVlanPlan}
 * (VLANs + parallel SubnetEntry rows + VRF table when enabled).
 *
 * Rules encoded (Playbook §3.7 items 6–7, Design_Patterns §3.x):
 *   • Standard VLAN template — Management(10), Data(20), Voice(30),
 *     Wireless(40), Guest(50), Servers(60), OT(70), Native(99), Transit(100).
 *   • Multi-site: site N adds ((N-1)%10) × 100 to each VLAN id.
 *   • Subnets: sequential /24 within the base /16 (third octet++ per VLAN).
 *   • Gateway: always the .1 of the subnet.
 *   • VRFs (when enabled): MGMT, CORP, GUEST, OT; RD = 65000:N; RTs are
 *     symmetric import/export on the same RD value.
 *
 * No I/O, no AI calls, no side effects.
 */
import { z } from 'zod';
import {
  TopologyPatternSchema,
  type IPVlanPlan,
  type SubnetEntry,
  type VlanEntry,
  type VrfEntry,
} from '@/engines/e5/types';

export const IPVlanPlanInputSchema = z.object({
  baseSubnet: z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/).default('10.0.0.0/16'),
  siteCount: z.number().int().positive(),
  topology: TopologyPatternSchema,
  hasWireless: z.boolean(),
  hasVoice: z.boolean(),
  hasOT: z.boolean(),
  hasDC: z.boolean(),
  hasGuest: z.boolean(),
  vrfEnabled: z.boolean(),
});
export type IPVlanPlanInput = z.input<typeof IPVlanPlanInputSchema>;
type ValidatedInput = z.output<typeof IPVlanPlanInputSchema>;

type VrfName = 'MGMT' | 'CORP' | 'GUEST' | 'OT';

interface VlanTemplate {
  baseId: number;
  name: string;
  purpose: string;
  enabled: (i: ValidatedInput) => boolean;
  vrf: VrfName;
}

const VLAN_TEMPLATES: readonly VlanTemplate[] = [
  { baseId: 10,  name: 'Management', purpose: 'Network device management',  enabled: () => true,            vrf: 'MGMT'  },
  { baseId: 20,  name: 'Data',       purpose: 'User data / workstations',   enabled: () => true,            vrf: 'CORP'  },
  { baseId: 30,  name: 'Voice',      purpose: 'VoIP phones',                enabled: (i) => i.hasVoice,     vrf: 'CORP'  },
  { baseId: 40,  name: 'Wireless',   purpose: 'Wireless clients',           enabled: (i) => i.hasWireless,  vrf: 'CORP'  },
  { baseId: 50,  name: 'Guest',      purpose: 'Guest internet',             enabled: (i) => i.hasGuest,     vrf: 'GUEST' },
  { baseId: 60,  name: 'Servers',    purpose: 'Data center / servers',      enabled: (i) => i.hasDC,        vrf: 'CORP'  },
  { baseId: 70,  name: 'OT',         purpose: 'OT/SCADA segment',           enabled: (i) => i.hasOT,        vrf: 'OT'    },
  { baseId: 99,  name: 'Native',     purpose: 'Native/unused',              enabled: () => true,            vrf: 'MGMT'  },
  { baseId: 100, name: 'Transit',    purpose: 'Transit/uplink',             enabled: () => true,            vrf: 'CORP'  },
];

const VRF_RD: Record<VrfName, string> = {
  MGMT:  '65000:1',
  CORP:  '65000:2',
  GUEST: '65000:3',
  OT:    '65000:4',
};

function parseBaseSubnet(cidr: string): { o1: number; o2: number } {
  const [ip] = cidr.split('/');
  const [a, b] = ip.split('.').map(Number);
  return { o1: a, o2: b };
}

function subnetCidr(o1: number, o2: number, index: number): string {
  return `${o1}.${o2}.${index}.0/24`;
}

function gatewayIp(o1: number, o2: number, index: number): string {
  return `${o1}.${o2}.${index}.1`;
}

/**
 * Generate VLAN/subnet/VRF plan for a site set.
 *
 * @param input  Topology + segmentation flags + base /16 subnet.
 * @returns      VLAN table, parallel SubnetEntry table, VRF table.
 */
export function planIPVlans(input: IPVlanPlanInput): IPVlanPlan {
  const i = IPVlanPlanInputSchema.parse(input);
  const { o1, o2 } = parseBaseSubnet(i.baseSubnet);

  const enabledTemplates = VLAN_TEMPLATES.filter((t) => t.enabled(i));

  const vlans: VlanEntry[] = [];
  const subnets: SubnetEntry[] = [];
  const vrfMembers: Record<VrfName, number[]> = { MGMT: [], CORP: [], GUEST: [], OT: [] };

  let subnetIndex = 1;
  for (let site = 1; site <= i.siteCount; site++) {
    const offset = ((site - 1) % 10) * 100;
    for (const t of enabledTemplates) {
      const vlanId = t.baseId + offset;
      const cidr = subnetCidr(o1, o2, subnetIndex);
      const gateway = gatewayIp(o1, o2, subnetIndex);
      subnetIndex++;
      const vlanName = i.siteCount > 1 ? `${t.name}-Site${site}` : t.name;
      vlans.push({
        id: vlanId,
        name: vlanName,
        subnet: cidr,
        gateway,
        purpose: t.purpose,
        vrf: i.vrfEnabled ? t.vrf : undefined,
      });
      subnets.push({
        cidr,
        gateway,
        usableHosts: 254,
        assignedTo: `VLAN ${vlanId} (${vlanName})`,
      });
      vrfMembers[t.vrf].push(vlanId);
    }
  }

  const vrfs: VrfEntry[] = [];
  if (i.vrfEnabled) {
    const order: readonly VrfName[] = ['MGMT', 'CORP', 'GUEST', 'OT'];
    for (const name of order) {
      const members = vrfMembers[name];
      if (members.length === 0) continue;
      const rd = VRF_RD[name];
      vrfs.push({
        name,
        routeDistinguisher: rd,
        routeTargets: [`import ${rd}`, `export ${rd}`],
        vlans: members,
      });
    }
  }

  return { vlans, subnets, vrfs };
}

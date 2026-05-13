/**
 * E5 — Deterministic QoS policy generator.
 *
 * Pure function. Produces a vendor-specific {@link QoSPolicy} for the LLD.
 *
 * Cisco — 8-class model (Cisco Enterprise QoS SRND, Playbook §3.7-10):
 *   EF/Voice · AF41/Video · CS3/Signaling · AF21/Critical · AF11/Bulk
 *   · CS1/Scavenger · CS2/Management · 0/Best Effort. Queuing: CBWFQ + LLQ.
 *
 * Fortinet — 6-class priority-weighted model:
 *   EF/Voice · AF41/Video · AF21/Business · CS2/Mgmt · AF11/Bulk · 0/Default.
 *
 * Voice and Video classes are suppressed when their flag is false; the
 * reclaimed bandwidth flows to Best Effort / Default so totals always = 100%.
 *
 * No I/O, no AI calls, no side effects (BOMATIC §1).
 */
import type { QoSClass, QoSPolicy } from '@/engines/e5/types';

type Vendor = 'cisco' | 'fortinet';

interface ClassSpec {
  name: string;
  dscp: number;
  bandwidthPercent: number;
  priority: boolean;
  description: string;
  enabled: boolean;
}

function compact(specs: ClassSpec[]): QoSClass[] {
  return specs
    .filter((s) => s.enabled)
    .map(({ name, dscp, bandwidthPercent, priority, description }) => ({
      name,
      dscp,
      bandwidthPercent,
      priority,
      description,
    }));
}

function ciscoClasses(hasVoice: boolean, hasVideo: boolean): QoSClass[] {
  const specs: ClassSpec[] = [
    { name: 'Voice',         dscp: 46, bandwidthPercent: 10, priority: true,  description: 'EF — RTP voice (G.711/G.729)',     enabled: hasVoice },
    { name: 'Video',         dscp: 34, bandwidthPercent: 15, priority: true,  description: 'AF41 — interactive video',         enabled: hasVideo },
    { name: 'Signaling',     dscp: 24, bandwidthPercent: 5,  priority: false, description: 'CS3 — call/session signaling',     enabled: true },
    { name: 'Critical Data', dscp: 18, bandwidthPercent: 15, priority: false, description: 'AF21 — transactional / ERP',       enabled: true },
    { name: 'Bulk Data',     dscp: 10, bandwidthPercent: 10, priority: false, description: 'AF11 — backups, file transfer',    enabled: true },
    { name: 'Scavenger',     dscp: 8,  bandwidthPercent: 5,  priority: false, description: 'CS1 — P2P / less-than-best-effort',enabled: true },
    { name: 'Management',    dscp: 16, bandwidthPercent: 5,  priority: false, description: 'CS2 — netmgmt (SNMP/SSH/syslog)',  enabled: true },
  ];
  const active = compact(specs);
  const used = active.reduce((s, c) => s + c.bandwidthPercent, 0);
  active.push({
    name: 'Best Effort',
    dscp: 0,
    bandwidthPercent: 100 - used,
    priority: false,
    description: 'Default — untagged user traffic',
  });
  return active;
}

function fortinetClasses(hasVoice: boolean, hasVideo: boolean): QoSClass[] {
  const specs: ClassSpec[] = [
    { name: 'Voice',             dscp: 46, bandwidthPercent: 15, priority: true,  description: 'EF — RTP voice',          enabled: hasVoice },
    { name: 'Video',             dscp: 34, bandwidthPercent: 20, priority: true,  description: 'AF41 — interactive video',enabled: hasVideo },
    { name: 'Business Critical', dscp: 18, bandwidthPercent: 25, priority: false, description: 'AF21 — ERP / CRM',        enabled: true },
    { name: 'Management',        dscp: 16, bandwidthPercent: 5,  priority: false, description: 'CS2 — netmgmt',           enabled: true },
    { name: 'Bulk',              dscp: 10, bandwidthPercent: 10, priority: false, description: 'AF11 — backups',          enabled: true },
  ];
  const active = compact(specs);
  const used = active.reduce((s, c) => s + c.bandwidthPercent, 0);
  active.push({
    name: 'Default',
    dscp: 0,
    bandwidthPercent: 100 - used,
    priority: false,
    description: 'Default — best-effort user traffic',
  });
  return active;
}

/**
 * Build a vendor-specific QoS policy.
 *
 * @param vendor    'cisco' (8-class CBWFQ+LLQ) or 'fortinet' (6-class).
 * @param hasVoice  Voice (RTP) present on the network — enables EF class.
 * @param hasVideo  Interactive video present — enables AF41 class.
 * @returns         A complete QoSPolicy whose bandwidth percentages sum to 100.
 */
export function generateQoSPolicy(
  vendor: Vendor,
  hasVoice: boolean,
  hasVideo: boolean,
): QoSPolicy {
  const classes = vendor === 'cisco'
    ? ciscoClasses(hasVoice, hasVideo)
    : fortinetClasses(hasVoice, hasVideo);
  return {
    vendor,
    classes,
    markingPolicy: vendor === 'cisco' ? 'trust dscp' : 'dscp-based',
    queuingPolicy: vendor === 'cisco' ? 'CBWFQ + LLQ' : 'priority-weighted',
  };
}

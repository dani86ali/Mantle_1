import { describe, it, expect } from 'vitest';
import { planIPVlans, type IPVlanPlanInput } from '@/engines/e5/ip-vlan-planner';

const base: IPVlanPlanInput = {
  siteCount: 1,
  topology: 'two_tier_collapsed_core',
  hasWireless: false,
  hasVoice: false,
  hasOT: false,
  hasDC: false,
  hasGuest: false,
  vrfEnabled: false,
};

describe('planIPVlans — basic plan', () => {
  it('with all flags false → only Management/Data/Native/Transit (4 VLANs)', () => {
    const plan = planIPVlans(base);
    expect(plan.vlans.map((v) => v.id)).toEqual([10, 20, 99, 100]);
    expect(plan.vlans.map((v) => v.name)).toEqual(['Management', 'Data', 'Native', 'Transit']);
  });

  it('subnets parallel VLANs and use the base /16', () => {
    const plan = planIPVlans(base);
    expect(plan.subnets).toHaveLength(plan.vlans.length);
    expect(plan.vlans[0].subnet).toBe('10.0.1.0/24');
    expect(plan.vlans[3].subnet).toBe('10.0.4.0/24');
  });

  it('vrfs empty when vrfEnabled=false', () => {
    expect(planIPVlans(base).vrfs).toEqual([]);
  });

  it('VLAN.vrf is undefined when vrfEnabled=false', () => {
    const plan = planIPVlans(base);
    for (const v of plan.vlans) expect(v.vrf).toBeUndefined();
  });
});

describe('planIPVlans — all flags true', () => {
  const allOn: IPVlanPlanInput = {
    ...base,
    hasWireless: true, hasVoice: true, hasOT: true,
    hasDC: true, hasGuest: true, vrfEnabled: true,
  };

  it('produces all 9 standard VLANs', () => {
    const plan = planIPVlans(allOn);
    expect(plan.vlans.map((v) => v.id)).toEqual([10, 20, 30, 40, 50, 60, 70, 99, 100]);
  });

  it('OT VLAN 70 sits in its own VRF', () => {
    const plan = planIPVlans(allOn);
    const ot = plan.vlans.find((v) => v.id === 70);
    expect(ot?.vrf).toBe('OT');
    const otVrf = plan.vrfs.find((v) => v.name === 'OT');
    expect(otVrf?.vlans).toEqual([70]);
  });

  it('Guest goes to GUEST VRF, data/voice/wireless to CORP, mgmt+native to MGMT', () => {
    const plan = planIPVlans(allOn);
    const get = (id: number) => plan.vlans.find((v) => v.id === id)!;
    expect(get(50).vrf).toBe('GUEST');
    expect(get(20).vrf).toBe('CORP');
    expect(get(30).vrf).toBe('CORP');
    expect(get(40).vrf).toBe('CORP');
    expect(get(10).vrf).toBe('MGMT');
    expect(get(99).vrf).toBe('MGMT');
  });

  it('VRF RDs match 65000:N scheme and RTs are symmetric', () => {
    const plan = planIPVlans(allOn);
    const expected: Record<string, string> = { MGMT: '65000:1', CORP: '65000:2', GUEST: '65000:3', OT: '65000:4' };
    for (const vrf of plan.vrfs) {
      expect(vrf.routeDistinguisher).toBe(expected[vrf.name]);
      expect(vrf.routeTargets).toEqual([`import ${expected[vrf.name]}`, `export ${expected[vrf.name]}`]);
    }
  });
});

describe('planIPVlans — multi-site VLAN offset', () => {
  it('site 2 VLAN ids are shifted by +100', () => {
    const plan = planIPVlans({ ...base, siteCount: 2 });
    expect(plan.vlans).toHaveLength(8);
    expect(plan.vlans.slice(0, 4).map((v) => v.id)).toEqual([10, 20, 99, 100]);
    expect(plan.vlans.slice(4).map((v) => v.id)).toEqual([110, 120, 199, 200]);
  });

  it('VLAN names include site suffix when siteCount > 1', () => {
    const plan = planIPVlans({ ...base, siteCount: 2 });
    expect(plan.vlans[0].name).toBe('Management-Site1');
    expect(plan.vlans[4].name).toBe('Management-Site2');
  });

  it('subnets continue sequentially across sites', () => {
    const plan = planIPVlans({ ...base, siteCount: 2 });
    expect(plan.vlans[0].subnet).toBe('10.0.1.0/24');
    expect(plan.vlans[4].subnet).toBe('10.0.5.0/24');
    expect(plan.vlans[7].subnet).toBe('10.0.8.0/24');
  });

  it('site 11 wraps VLAN ids back to base while subnets continue', () => {
    const plan = planIPVlans({ ...base, siteCount: 11 });
    const site11Vlans = plan.vlans.slice(40, 44); // 10 sites × 4 VLANs = 40
    expect(site11Vlans.map((v) => v.id)).toEqual([10, 20, 99, 100]);
    expect(site11Vlans[0].subnet).toBe('10.0.41.0/24');
  });
});

describe('planIPVlans — invariants', () => {
  it('gateway is always the .1 of its subnet', () => {
    const plan = planIPVlans({ ...base, siteCount: 3 });
    for (const v of plan.vlans) {
      const [octets, _prefix] = v.subnet.split('/');
      const [a, b, c] = octets.split('.');
      expect(v.gateway).toBe(`${a}.${b}.${c}.1`);
    }
  });

  it('every subnet is a valid /24 within the base /16', () => {
    const plan = planIPVlans({ ...base, siteCount: 1 });
    for (const s of plan.subnets) {
      expect(s.cidr).toMatch(/^10\.0\.\d+\.0\/24$/);
      expect(s.usableHosts).toBe(254);
    }
  });

  it('honours a custom baseSubnet', () => {
    const plan = planIPVlans({ ...base, baseSubnet: '172.16.0.0/16' });
    expect(plan.vlans[0].subnet).toBe('172.16.1.0/24');
    expect(plan.vlans[0].gateway).toBe('172.16.1.1');
  });

  it('pure function — identical inputs produce identical outputs', () => {
    const a = planIPVlans(base);
    const b = planIPVlans(base);
    expect(a).toEqual(b);
  });

  it('rejects malformed baseSubnet (Zod)', () => {
    expect(() => planIPVlans({ ...base, baseSubnet: 'not-a-cidr' })).toThrow();
  });

  it('rejects zero / negative siteCount (Zod)', () => {
    expect(() => planIPVlans({ ...base, siteCount: 0 })).toThrow();
  });
});

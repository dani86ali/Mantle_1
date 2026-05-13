import { describe, it, expect } from 'vitest';
import { detectProjectType } from '@/engines/e4/project-type-detector';

describe('detectProjectType — keyword groups', () => {
  it('detects campus_refresh for "campus LAN refresh with 48-port switches"', () => {
    const r = detectProjectType('campus LAN refresh with 48-port switches');
    expect(r.type).toBe('campus_refresh');
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.evidence.some((e) => e.startsWith('campus_refresh:'))).toBe(true);
  });

  it('detects sd_wan for "SD-WAN migration from MPLS"', () => {
    const r = detectProjectType('SD-WAN migration from MPLS');
    expect(r.type).toBe('sd_wan');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('detects sd_wan for "WAN transformation and branch connectivity"', () => {
    const r = detectProjectType('WAN transformation and branch connectivity initiative');
    expect(r.type).toBe('sd_wan');
  });

  it('detects dc_modernization for spine-leaf / ACI', () => {
    const r = detectProjectType('Data center refresh with spine-leaf fabric (ACI).');
    expect(r.type).toBe('dc_modernization');
  });

  it('detects wireless_deployment for "Wi-Fi coverage and AP deployment"', () => {
    const r = detectProjectType('Wireless Wi-Fi coverage and AP deployment across all floors');
    expect(r.type).toBe('wireless_deployment');
  });

  it('detects security_upgrade for "NGFW zero trust segmentation"', () => {
    const r = detectProjectType('Firewall upgrade to NGFW with zero trust segmentation.');
    expect(r.type).toBe('security_upgrade');
  });

  it('detects branch_rollout for "new stores site rollout"', () => {
    const r = detectProjectType('Retail branch new stores site rollout across the kingdom.');
    expect(r.type).toBe('branch_rollout');
  });

  it('detects cloud_connectivity for "hybrid cloud ExpressRoute Direct Connect"', () => {
    const r = detectProjectType('Hybrid cloud connectivity with ExpressRoute and Direct Connect.');
    expect(r.type).toBe('cloud_connectivity');
  });

  it('detects ot_network for "SCADA / OT / ICS"', () => {
    const r = detectProjectType('OT network for SCADA and ICS industrial operational technology zones.');
    expect(r.type).toBe('ot_network');
  });

  it('detects greenfield_campus for "new building greenfield campus"', () => {
    const r = detectProjectType('Greenfield new campus build for new building HQ.');
    expect(r.type).toBe('greenfield_campus');
  });
});

describe('detectProjectType — defaults', () => {
  it('defaults to general at confidence 0.3 for unknown text', () => {
    const r = detectProjectType('The vendor shall deliver the equipment within 90 days of award.');
    expect(r.type).toBe('general');
    expect(r.confidence).toBe(0.3);
  });

  it('defaults to general for empty string', () => {
    const r = detectProjectType('');
    expect(r.type).toBe('general');
    expect(r.confidence).toBe(0.3);
  });

  it('ignores clientName / sector params (description-driven)', () => {
    const r = detectProjectType('SD-WAN migration', 'Saudi Aramco', 'oil_and_gas');
    expect(r.type).toBe('sd_wan');
  });
});

describe('detectProjectType — schema', () => {
  it('returns the documented ProjectTypeDetection shape', () => {
    const r = detectProjectType('SD-WAN migration');
    expect(typeof r.type).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(r.evidence)).toBe(true);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('confidence rises with more matches (campus_refresh 2 vs 1)', () => {
    const one = detectProjectType('Access layer review.');
    const two = detectProjectType('Access layer review and switch replacement.');
    expect(two.confidence).toBeGreaterThan(one.confidence);
  });
});

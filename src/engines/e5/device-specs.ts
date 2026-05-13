/**
 * E5 — Device specification lookup tables.
 *
 * Embedded constants extracted from docs/BOMATIC_Device_Specs.json plus the
 * topology decision-tree reference models from docs/Design_Patterns.md §6.
 *
 * Only the fields needed for sizing are kept — full spec rows live in the JSON.
 * No runtime file reads: sizing must be deterministic and synchronous.
 */

export interface AccessSwitchSpec {
  model: string;
  ports: number;
  portType: string;
  poePerPortW: number;
  poeBudgetDefaultW: number;
  rackUnits: number;
}

export interface CoreSwitchSpec {
  model: string;
  ports: number;
  portType: string;
  throughputGbps: number;
  rackUnits: number;
}

export interface WirelessApSpec {
  model: string;
  wifi: 'Wi-Fi 6' | 'Wi-Fi 6E';
  antenna: 'internal' | 'external';
  poeDraw: number;
  maxClients: number;
  antennasNeeded: number;
}

export interface FortigateFirewallSpec {
  model: string;
  firewallGbps: number;
  ngfwGbps: number;
  threatGbps: number;
  sessionsMax: number;
  segment: string;
  rackUnits: number;
}

export interface CiscoFirewallSpec {
  model: string;
  firewallGbps: number;
  ngfwGbps: number;
  threatGbps: number;
  sessionsMax: number;
  segment: string;
  rackUnits: number;
}

export interface FirewallSizingTier {
  usersMax: number;
  bandwidthMbpsMax: number;
  recommended: string;
}

// ─── Access switches (C9300, C9300L, C9300X, C9200L) ─────────────────────
export const CISCO_ACCESS_SWITCHES: readonly AccessSwitchSpec[] = [
  // C9300 family — modular uplinks
  { model: 'C9300-24P',  ports: 24, portType: '1G PoE+',           poePerPortW: 30, poeBudgetDefaultW: 445,  rackUnits: 1 },
  { model: 'C9300-48P',  ports: 48, portType: '1G PoE+',           poePerPortW: 30, poeBudgetDefaultW: 437,  rackUnits: 1 },
  { model: 'C9300-24T',  ports: 24, portType: '1G data',           poePerPortW: 0,  poeBudgetDefaultW: 0,    rackUnits: 1 },
  { model: 'C9300-48T',  ports: 48, portType: '1G data',           poePerPortW: 0,  poeBudgetDefaultW: 0,    rackUnits: 1 },
  { model: 'C9300-24U',  ports: 24, portType: '1G UPOE',           poePerPortW: 60, poeBudgetDefaultW: 720,  rackUnits: 1 },
  { model: 'C9300-48U',  ports: 48, portType: '1G UPOE',           poePerPortW: 60, poeBudgetDefaultW: 1440, rackUnits: 1 },
  { model: 'C9300-24H',  ports: 24, portType: '1G UPOE+',          poePerPortW: 90, poeBudgetDefaultW: 822,  rackUnits: 1 },
  // C9300L family — fixed 4x10G uplinks
  { model: 'C9300L-24P-4X',   ports: 24, portType: '1G PoE+',      poePerPortW: 30, poeBudgetDefaultW: 445,  rackUnits: 1 },
  { model: 'C9300L-48P-4X',   ports: 48, portType: '1G PoE+',      poePerPortW: 30, poeBudgetDefaultW: 437,  rackUnits: 1 },
  { model: 'C9300L-24T-4X',   ports: 24, portType: '1G data',      poePerPortW: 0,  poeBudgetDefaultW: 0,    rackUnits: 1 },
  { model: 'C9300L-48T-4X',   ports: 48, portType: '1G data',      poePerPortW: 0,  poeBudgetDefaultW: 0,    rackUnits: 1 },
  { model: 'C9300L-24UXG-4X', ports: 24, portType: 'mGig UPOE',    poePerPortW: 60, poeBudgetDefaultW: 720,  rackUnits: 1 },
  // C9300X — Wi-Fi 6E / smart building
  { model: 'C9300X-48HX', ports: 48, portType: 'mGig 90W PoE',     poePerPortW: 90, poeBudgetDefaultW: 1920, rackUnits: 1 },
  // C9200L — cost-optimized access (3-tier hotel/hospitality per Design_Patterns §6.2)
  { model: 'C9200L-24P-4G', ports: 24, portType: '1G PoE+',        poePerPortW: 30, poeBudgetDefaultW: 370,  rackUnits: 1 },
  { model: 'C9200L-48P-4G', ports: 48, portType: '1G PoE+',        poePerPortW: 30, poeBudgetDefaultW: 740,  rackUnits: 1 },
  { model: 'C9200L-24T-4G', ports: 24, portType: '1G data',        poePerPortW: 0,  poeBudgetDefaultW: 0,    rackUnits: 1 },
  { model: 'C9200L-48T-4G', ports: 48, portType: '1G data',        poePerPortW: 0,  poeBudgetDefaultW: 0,    rackUnits: 1 },
];

// ─── Core switches (C9500 family) — reference models from Design_Patterns §6 ─
export const CISCO_CORE_SWITCHES: readonly CoreSwitchSpec[] = [
  { model: 'C9500-40X-2Q',  ports: 40, portType: '10G SFP+ + 2x 40G',  throughputGbps: 480,  rackUnits: 1 },
  { model: 'C9500-24Y4C',   ports: 24, portType: '25G + 4x 100G',      throughputGbps: 1000, rackUnits: 1 },
  { model: 'C9500-48Y4C',   ports: 48, portType: '25G + 4x 100G',      throughputGbps: 1600, rackUnits: 1 },
  { model: 'C9500-32C',     ports: 32, portType: '100G QSFP28',        throughputGbps: 3200, rackUnits: 1 },
  { model: 'C9500-32QC',    ports: 32, portType: '40G/100G',           throughputGbps: 2400, rackUnits: 1 },
];

// ─── Wireless access points ──────────────────────────────────────────────
export const CISCO_WIRELESS_APS: readonly WirelessApSpec[] = [
  { model: 'C9120AXI', wifi: 'Wi-Fi 6',  antenna: 'internal', poeDraw: 25.5, maxClients: 200, antennasNeeded: 0 },
  { model: 'C9120AXE', wifi: 'Wi-Fi 6',  antenna: 'external', poeDraw: 25.5, maxClients: 200, antennasNeeded: 4 },
  { model: 'C9130AXI', wifi: 'Wi-Fi 6',  antenna: 'internal', poeDraw: 30,   maxClients: 400, antennasNeeded: 0 },
  { model: 'C9136I',   wifi: 'Wi-Fi 6E', antenna: 'internal', poeDraw: 35,   maxClients: 500, antennasNeeded: 0 },
];

// ─── FortiGate firewalls ─────────────────────────────────────────────────
export const FORTIGATE_FIREWALLS: readonly FortigateFirewallSpec[] = [
  { model: 'FG-60F',   firewallGbps: 10,   ngfwGbps: 1,    threatGbps: 0.7,  sessionsMax: 700000,  segment: 'branch/SOHO',          rackUnits: 0 },
  { model: 'FG-81F',   firewallGbps: 10,   ngfwGbps: 1,    threatGbps: 0.9,  sessionsMax: 1500000, segment: 'branch',                rackUnits: 0 },
  { model: 'FG-101F',  firewallGbps: 20,   ngfwGbps: 1.6,  threatGbps: 1,    sessionsMax: 1500000, segment: 'mid-enterprise',        rackUnits: 1 },
  { model: 'FG-201F',  firewallGbps: 27,   ngfwGbps: 3.5,  threatGbps: 3,    sessionsMax: 3000000, segment: 'enterprise',            rackUnits: 1 },
  { model: 'FG-401F',  firewallGbps: 79.5, ngfwGbps: 10,   threatGbps: 9,    sessionsMax: 7800000, segment: 'large enterprise / DC edge', rackUnits: 1 },
  { model: 'FG-601F',  firewallGbps: 139,  ngfwGbps: 11.5, threatGbps: 10.5, sessionsMax: 8000000, segment: 'large enterprise / DC', rackUnits: 1 },
  { model: 'FG-1001F', firewallGbps: 198,  ngfwGbps: 15,   threatGbps: 13,   sessionsMax: 7500000, segment: 'data center',           rackUnits: 1 },
];

// ─── Cisco Firepower firewalls — reference tiers from Design_Patterns §6.2 ─
// Not in Device_Specs.json; values are catalog reference points (NGFW @ AVC+IPS).
export const CISCO_FIREWALLS: readonly CiscoFirewallSpec[] = [
  { model: 'FPR3110', firewallGbps: 17,  ngfwGbps: 2,   threatGbps: 2,   sessionsMax: 2000000,  segment: 'mid-enterprise',     rackUnits: 1 },
  { model: 'FPR3120', firewallGbps: 25,  ngfwGbps: 4,   threatGbps: 4,   sessionsMax: 4000000,  segment: 'enterprise',         rackUnits: 1 },
  { model: 'FPR3140', firewallGbps: 45,  ngfwGbps: 8,   threatGbps: 8,   sessionsMax: 8000000,  segment: 'large enterprise',   rackUnits: 1 },
  { model: 'FPR4215', firewallGbps: 65,  ngfwGbps: 15,  threatGbps: 15,  sessionsMax: 12000000, segment: 'DC edge',            rackUnits: 1 },
];

// ─── Firewall sizing tiers (Fortinet, from sizing_guidelines.firewalls.tiers) ─
export const FIREWALL_SIZING_TIERS: readonly FirewallSizingTier[] = [
  { usersMax: 100,   bandwidthMbpsMax: 500,   recommended: 'FG-81F' },
  { usersMax: 500,   bandwidthMbpsMax: 2000,  recommended: 'FG-201F' },
  { usersMax: 2000,  bandwidthMbpsMax: 5000,  recommended: 'FG-401F' },
  { usersMax: 5000,  bandwidthMbpsMax: 10000, recommended: 'FG-601F' },
  { usersMax: 10000, bandwidthMbpsMax: 15000, recommended: 'FG-1001F' },
];

// ─── Wireless AP density rules (sizing_guidelines.wireless_aps) ──────────
export const AP_DENSITY = {
  office: 40,         // users per AP — office density (mid-point of 30-50)
  highDensity: 20,    // users per AP — auditorium/conference
  coverageSqmPerAp: {
    office: 150,
    warehouse: 250,
    outdoor: 500,
  },
} as const;

// ─── Sizing headroom (sizing_guidelines.switches.rule — 20%) ─────────────
export const SWITCH_HEADROOM = 1.2;

// ─── Bandwidth growth factor (sizing_guidelines.firewalls.rule — 3yr) ────
export const FIREWALL_GROWTH_FACTOR = 1.5;

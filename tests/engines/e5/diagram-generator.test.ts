import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { generateDiagrams } from '@/engines/e5/diagram-generator';
import type { SizingResult } from '@/engines/e5/types';

function sizingTwoTier(): SizingResult {
  return {
    coreDevices: [{ role: 'core', model: 'C9500-48Y4C', vendor: 'cisco', quantity: 2, reasoning: '' }],
    distributionDevices: [],
    accessDevices: [{ role: 'access', model: 'C9300-48P', vendor: 'cisco', quantity: 8, reasoning: '' }],
    firewalls: [{ role: 'firewall', model: 'FPR-2110', vendor: 'cisco', quantity: 2, reasoning: '' }],
    wirelessControllers: [{ role: 'wlc', model: 'C9800-40', vendor: 'cisco', quantity: 1, reasoning: '' }],
    accessPoints: [{ role: 'ap', model: 'C9120AXI', vendor: 'cisco', quantity: 40, reasoning: '' }],
  };
}

function sizingThreeTier(): SizingResult {
  return {
    coreDevices: [{ role: 'core', model: 'N9504', vendor: 'cisco', quantity: 2, reasoning: '' }],
    distributionDevices: [{ role: 'dist', model: 'C9606R', vendor: 'cisco', quantity: 4, reasoning: '' }],
    accessDevices: [{ role: 'access', model: 'C9200L-48P', vendor: 'cisco', quantity: 24, reasoning: '' }],
    firewalls: [{ role: 'firewall', model: 'FPR-3110', vendor: 'cisco', quantity: 2, reasoning: '' }],
    wirelessControllers: [],
    accessPoints: [],
  };
}

function sizingFatTree(): SizingResult {
  return {
    coreDevices: [{ role: 'spine', model: 'Quantum-2 QM9700', vendor: 'nvidia', quantity: 8, reasoning: '' }],
    distributionDevices: [],
    accessDevices: [{ role: 'leaf', model: 'Quantum-2 QM9700', vendor: 'nvidia', quantity: 32, reasoning: '' }],
    firewalls: [],
    wirelessControllers: [],
    accessPoints: [],
  };
}

const parser = new XMLParser({ ignoreAttributes: false });

describe('generateDiagrams', () => {
  it('two_tier_collapsed_core: emits parseable mxGraphModel XML', () => {
    const out = generateDiagrams('two_tier_collapsed_core', sizingTwoTier());
    expect(out.logicalTopology).toContain('<mxGraphModel');
    // Parses without throwing.
    const parsed = parser.parse(out.logicalTopology);
    expect(parsed.mxfile).toBeDefined();
    expect(parsed.mxfile.diagram).toBeDefined();
    expect(parsed.mxfile.diagram.mxGraphModel).toBeDefined();
  });

  it('three_tier_core_dist_access: includes distribution layer nodes', () => {
    const out = generateDiagrams('three_tier_core_dist_access', sizingThreeTier());
    expect(out.logicalTopology).toContain('Distribution');
    expect(out.logicalTopology).toContain('C9606R');
  });

  it('two_tier topology: all populated device roles appear as nodes', () => {
    const out = generateDiagrams('two_tier_collapsed_core', sizingTwoTier());
    expect(out.logicalTopology).toContain('C9500-48Y4C');
    expect(out.logicalTopology).toContain('C9300-48P');
    expect(out.logicalTopology).toContain('FPR-2110');
    expect(out.logicalTopology).toContain('C9800-40');
    expect(out.logicalTopology).toContain('C9120AXI');
  });

  it('three_tier topology: edges connect core to firewall', () => {
    const out = generateDiagrams('three_tier_core_dist_access', sizingThreeTier());
    // Edges in our model have source/target attributes; core-* → fw-*.
    expect(out.logicalTopology).toMatch(/source="core-\d+" target="fw-\d+"/);
  });

  it('fat_tree_superpod: generates InfiniBand fabric nodes', () => {
    const out = generateDiagrams('fat_tree_superpod', sizingFatTree());
    expect(out.logicalTopology).toContain('InfiniBand');
    expect(out.logicalTopology).toContain('Spine');
    expect(out.logicalTopology).toContain('Leaf');
    const parsed = parser.parse(out.logicalTopology);
    expect(parsed.mxfile.diagram.mxGraphModel).toBeDefined();
  });

  it('output XML escapes special characters in labels', () => {
    const sizing = sizingTwoTier();
    sizing.coreDevices[0] = { ...sizing.coreDevices[0], model: 'C&9500<X>' };
    const out = generateDiagrams('two_tier_collapsed_core', sizing);
    expect(out.logicalTopology).toContain('C&amp;9500&lt;X&gt;');
    // Still parseable.
    expect(() => parser.parse(out.logicalTopology)).not.toThrow();
  });

  it('hub_and_spoke_gpon: falls back to generic builder and produces valid XML', () => {
    const out = generateDiagrams('hub_and_spoke_gpon', sizingTwoTier());
    const parsed = parser.parse(out.logicalTopology);
    expect(parsed.mxfile.diagram.mxGraphModel).toBeDefined();
  });
});

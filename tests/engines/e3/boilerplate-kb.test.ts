import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_BOILERPLATE,
  BoilerplateEntrySchema,
  renderBoilerplate,
  getBoilerplate,
  type BoilerplateEntry,
} from '@/engines/e3/boilerplate-kb';

const FULL_VARS = {
  customerName: 'Aramco',
  projectName: 'DataCenter Refresh',
  tenantName: 'NexusGlobal',
  date: '2026-05-11',
};

describe('renderBoilerplate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces all variables when all values are supplied', () => {
    const entry: BoilerplateEntry = {
      key: 'test',
      title: 'T',
      content: 'Hello {{customerName}} from {{tenantName}} on {{date}}',
      variables: ['customerName', 'date', 'tenantName'],
    };
    const out = renderBoilerplate(entry, FULL_VARS);
    expect(out).toBe('Hello Aramco from NexusGlobal on 2026-05-11');
    expect(out).not.toContain('{{');
  });

  it('replaces repeated occurrences of the same variable', () => {
    const entry: BoilerplateEntry = {
      key: 'test',
      title: 'T',
      content: '{{tenantName}} / {{tenantName}}',
      variables: ['tenantName'],
    };
    expect(renderBoilerplate(entry, { tenantName: 'Nx' })).toBe('Nx / Nx');
  });

  it('leaves missing placeholders as-is and emits a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry: BoilerplateEntry = {
      key: 'test',
      title: 'T',
      content: 'Hello {{customerName}}, signed by {{tenantName}}',
      variables: ['customerName', 'tenantName'],
    };
    const out = renderBoilerplate(entry, { customerName: 'Aramco' });
    expect(out).toBe('Hello Aramco, signed by {{tenantName}}');
    expect(warn).toHaveBeenCalledOnce();
    const warnArg = warn.mock.calls[0][0] as string;
    expect(warnArg).toContain('tenantName');
  });

  it('does not warn when nothing is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry: BoilerplateEntry = {
      key: 'test',
      title: 'T',
      content: 'Hi {{customerName}}',
      variables: ['customerName'],
    };
    renderBoilerplate(entry, { customerName: 'Aramco' });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('getBoilerplate', () => {
  it('returns the default entry when no overrides are supplied', () => {
    const e = getBoilerplate('cover_page');
    expect(e).toEqual(DEFAULT_BOILERPLATE.cover_page);
    expect(e).toBe(DEFAULT_BOILERPLATE.cover_page);
  });

  it('merges override content with the default fields', () => {
    const e = getBoilerplate('warranty_terms', {
      content: 'Custom warranty for {{customerName}} by {{tenantName}}.',
    });
    expect(e.key).toBe('warranty_terms');
    expect(e.title).toBe(DEFAULT_BOILERPLATE.warranty_terms.title);
    expect(e.content).toBe('Custom warranty for {{customerName}} by {{tenantName}}.');
    expect(e.variables).toEqual(['customerName', 'tenantName']);
  });

  it('honours an explicit variables override', () => {
    const e = getBoilerplate('cover_page', {
      content: 'New content with {{foo}}',
      variables: ['foo'],
    });
    expect(e.variables).toEqual(['foo']);
  });

  it('throws for an unknown slug', () => {
    expect(() => getBoilerplate('does_not_exist')).toThrow(/no default entry/);
  });
});

describe('DEFAULT_BOILERPLATE', () => {
  it('includes all required slugs', () => {
    const required = [
      'cover_page',
      'scope_assumptions',
      'company_profile',
      'references',
      'warranty_terms',
      'signature_page',
    ];
    for (const slug of required) {
      expect(DEFAULT_BOILERPLATE[slug]).toBeDefined();
    }
  });

  it('every entry has a key matching its record slug', () => {
    for (const [slug, entry] of Object.entries(DEFAULT_BOILERPLATE)) {
      expect(entry.key).toBe(slug);
    }
  });

  it('every entry passes Zod validation', () => {
    for (const entry of Object.values(DEFAULT_BOILERPLATE)) {
      expect(() => BoilerplateEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it('declared variables match the placeholders in the content', () => {
    const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    for (const entry of Object.values(DEFAULT_BOILERPLATE)) {
      const found = new Set<string>();
      for (const m of Array.from(entry.content.matchAll(re))) found.add(m[1]);
      const declared = new Set(entry.variables);
      expect(declared).toEqual(found);
    }
  });

  it('scope_assumptions covers customer-provided facilities, exclusions, and dependencies', () => {
    const c = DEFAULT_BOILERPLATE.scope_assumptions.content.toLowerCase();
    expect(c).toContain('rack space');
    expect(c).toContain('power');
    expect(c).toContain('cooling');
    expect(c).toContain('dns');
    expect(c).toContain('structured cabling');
    expect(c).toContain('civil works');
    expect(c).toContain('10 business days');
  });

  it('signature_page has both customer and SI signature blocks and a PO number line', () => {
    const c = DEFAULT_BOILERPLATE.signature_page.content;
    expect(c).toMatch(/customer acceptance/i);
    expect(c).toMatch(/systems integrator/i);
    expect(c).toMatch(/purchase order number/i);
  });
});

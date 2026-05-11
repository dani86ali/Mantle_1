/** E3 boilerplate KB — tenant-configurable text blocks for deterministic
 *  proposal sections. Pure functions, no AI calls (per First Commandment).
 *  Outline source: docs/Network_PreSales_Playbook_Final_Consolidated.md §6.1/6.3/6.4
 */

import { z } from 'zod';

export const BoilerplateEntrySchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  variables: z.array(z.string()),
});

export type BoilerplateEntry = z.infer<typeof BoilerplateEntrySchema>;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractVariables(content: string): string[] {
  const found = new Set<string>();
  const matches = Array.from(content.matchAll(PLACEHOLDER_RE));
  for (const match of matches) {
    found.add(match[1]);
  }
  return Array.from(found).sort();
}

export const DEFAULT_BOILERPLATE: Record<string, BoilerplateEntry> = {
  cover_page: {
    key: 'cover_page',
    title: 'Cover Page',
    content:
      'PROPOSAL FOR {{customerName}}\n' +
      'Project: {{projectName}}\n' +
      'Prepared by: {{tenantName}}\n' +
      'Date: {{date}}\n\n' +
      'CONFIDENTIAL — This document contains proprietary information of ' +
      '{{tenantName}} and is intended solely for {{customerName}}. ' +
      'Reproduction or disclosure without written consent is prohibited.',
    variables: ['customerName', 'date', 'projectName', 'tenantName'],
  },
  scope_assumptions: {
    key: 'scope_assumptions',
    title: 'Scope, Assumptions, Exclusions, Dependencies',
    content:
      'ASSUMPTIONS\n' +
      '- Customer provides rack space, power, cooling, and physical security at all delivery sites.\n' +
      '- Customer provides DNS, DHCP, NTP, and AAA infrastructure unless explicitly scoped.\n' +
      '- Customer grants site access during agreed working hours and arranges site induction.\n' +
      '- Existing cabling, patch panels, and structured cabling are fit for purpose.\n\n' +
      'EXCLUSIONS\n' +
      '- Structured cabling, civil works, and electrical/mechanical fit-out.\n' +
      '- Third-party application or platform integration not listed in the BoM.\n' +
      '- Out-of-warranty hardware support and end-of-life device remediation.\n' +
      '- Migration of data or configuration from non-supported legacy systems.\n\n' +
      'DEPENDENCIES\n' +
      '- Customer sign-off on HLD/LLD within 10 business days of submission.\n' +
      '- Visa, work permits, and site access permits issued on time for {{tenantName}} engineers.\n' +
      '- Customer-provided WAN circuits and ISP services ready by the agreed cutover date.\n' +
      '- Stakeholder availability for design workshops, UAT, and acceptance testing.',
    variables: ['tenantName'],
  },
  company_profile: {
    key: 'company_profile',
    title: 'Company Profile',
    content:
      '{{tenantName}} OVERVIEW\n' +
      '{{tenantName}} is a regional systems integrator with proven delivery ' +
      'across the MENA region. Our engineering teams hold vendor accreditations ' +
      'and certifications relevant to this engagement.\n\n' +
      'CERTIFICATIONS & PARTNER TIERS\n' +
      '- ISO 9001 / ISO 27001 (where applicable)\n' +
      '- Vendor partner tiers: [populated by tenant configuration]\n' +
      '- Engineer certifications: [populated by tenant configuration]\n\n' +
      'REGIONAL PRESENCE\n' +
      '- Offices and delivery teams across the MENA region.\n' +
      '- Local Saudization / Emiratization and In-Country Value scoring evidence available on request.',
    variables: ['tenantName'],
  },
  references: {
    key: 'references',
    title: 'References / Case Studies',
    content:
      'REFERENCE CASE STUDIES\n\n' +
      'Banking — [Customer], [Country], [Year]: [scope summary, scale, vendor mix, outcome].\n\n' +
      'Government — [Customer], [Country], [Year]: [scope summary, scale, vendor mix, outcome].\n\n' +
      'Oil & Gas — [Customer], [Country], [Year]: [scope summary, scale, vendor mix, outcome].\n\n' +
      'Healthcare — [Customer], [Country], [Year]: [scope summary, scale, vendor mix, outcome].\n\n' +
      'Telco — [Customer], [Country], [Year]: [scope summary, scale, vendor mix, outcome].\n\n' +
      'Detailed reference letters are available on request, subject to customer NDA.',
    variables: [],
  },
  warranty_terms: {
    key: 'warranty_terms',
    title: 'Warranty Terms',
    content:
      'WARRANTY\n' +
      '{{tenantName}} warrants delivered services against defects in workmanship ' +
      'for a period of twelve (12) months from the date of acceptance.\n\n' +
      'VENDOR WARRANTY PASS-THROUGH\n' +
      'All hardware and software warranties provided by the original equipment ' +
      'manufacturer are passed through to {{customerName}} on the terms published ' +
      'by the respective vendor. {{tenantName}} will facilitate vendor RMA and ' +
      'support escalation during the contracted support period.',
    variables: ['customerName', 'tenantName'],
  },
  signature_page: {
    key: 'signature_page',
    title: 'Signature Page',
    content:
      'CUSTOMER ACCEPTANCE\n\n' +
      'Customer: {{customerName}}\n' +
      'Project: {{projectName}}\n' +
      'Purchase Order Number: ____________________________\n\n' +
      'Name:        ____________________________\n' +
      'Title:       ____________________________\n' +
      'Signature:   ____________________________\n' +
      'Date:        ____________________________\n\n' +
      'SYSTEMS INTEGRATOR\n\n' +
      'Company: {{tenantName}}\n\n' +
      'Name:        ____________________________\n' +
      'Title:       ____________________________\n' +
      'Signature:   ____________________________\n' +
      'Date:        ____________________________',
    variables: ['customerName', 'projectName', 'tenantName'],
  },
};

for (const entry of Object.values(DEFAULT_BOILERPLATE)) {
  BoilerplateEntrySchema.parse(entry);
}

export interface RenderResult {
  text: string;
  missing: string[];
}

export function renderBoilerplate(
  entry: BoilerplateEntry,
  variables: Record<string, string>,
): string {
  const missing: string[] = [];
  const rendered = entry.content.replace(PLACEHOLDER_RE, (match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      missing.push(name);
      return match;
    }
    return value;
  });
  if (missing.length > 0) {
    const unique = Array.from(new Set(missing));
    console.warn(
      `[boilerplate-kb] ${entry.key}: unresolved placeholders ${unique.join(', ')}`,
    );
  }
  return rendered;
}

export function getBoilerplate(
  slug: string,
  overrides?: Partial<BoilerplateEntry>,
): BoilerplateEntry {
  const base = DEFAULT_BOILERPLATE[slug];
  if (!base) {
    throw new Error(`[boilerplate-kb] no default entry for slug "${slug}"`);
  }
  if (!overrides) return base;
  const merged: BoilerplateEntry = {
    key: overrides.key ?? base.key,
    title: overrides.title ?? base.title,
    content: overrides.content ?? base.content,
    variables: overrides.variables ?? (
      overrides.content ? extractVariables(overrides.content) : base.variables
    ),
  };
  return BoilerplateEntrySchema.parse(merged);
}

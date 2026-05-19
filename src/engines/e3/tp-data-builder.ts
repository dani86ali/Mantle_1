/** Maps E3 inputs to the docxtemplater data shape expected by the TP template.
 *  Template tag inventory (kept in sync with scripts/build-tp-template.ts):
 *    Scalars: customerName, customerFullName, opportunityNumber, rfqNumber,
 *             documentDate, projectName, contactName, contactDesignation,
 *             contactMobile, contactEmail
 *    Loops:   revisions[{revisionDescription,revisionDate,revisionReviewer,revisionVersion}]
 *             bom[{partNumber,description,unit,qty}]
 *             executiveSummaryBody[string], understandingBody[string],
 *             assumptionsBody[string]
 */

import type { ProposalMetadata, ProposalSection } from './types';
import type { E3BomLine, E3E1Data, E3E2Data, E3E4Data, E3E5Data } from './orchestrator-types';

/** A BOM line that may carry an orderableSku (E5 enrichment) on top of the
 *  stable E3BomLine shape. Forward-compat for when E2/E3 wire it through. */
type BomLineMaybeOrderable = E3BomLine & { orderableSku?: string };

export interface TpDataBuilderInput {
  metadata: ProposalMetadata;
  e1: E3E1Data;
  e2: E3E2Data;
  sections: ProposalSection[];
  e4?: E3E4Data;
  e5?: E3E5Data;
  contactName?: string;
  /** Customer's RFQ reference. Surfaced verbatim in the rendered template. */
  rfqNumber?: string;
}

export interface TpTemplateData {
  customerName: string;
  customerFullName: string;
  opportunityNumber: string;
  rfqNumber: string;
  documentDate: string;
  projectName: string;
  contactName: string;
  contactDesignation: string;
  contactMobile: string;
  contactEmail: string;
  revisions: Array<{
    revisionDescription: string;
    revisionDate: string;
    revisionReviewer: string;
    revisionVersion: string;
  }>;
  bom: Array<{ partNumber: string; description: string; unit: string; qty: number }>;
  executiveSummaryBody: string[];
  understandingBody: string[];
  assumptionsBody: string[];
}

/** Split a markdown/plain-text section body into paragraph chunks for a
 *  docxtemplater paragraph-loop. Splits on blank lines; falls back to a single
 *  chunk if the body is non-empty but has no blank-line separators. */
export function splitSectionBody(body: string | undefined): string[] {
  if (!body) return [];
  const chunks = body
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (chunks.length > 0) return chunks;
  const single = body.trim();
  return single ? [single] : [];
}

function findSectionContent(sections: ProposalSection[], slug: string): string {
  return sections.find((s) => s.slug === slug)?.content ?? '';
}

function mapBomLine(line: BomLineMaybeOrderable): {
  partNumber: string;
  description: string;
  unit: string;
  qty: number;
} {
  return {
    partNumber: line.orderableSku ?? line.sku ?? '',
    description: line.description ?? '',
    // E3BomLine doesn't carry a unit field; default to "Each" so the rendered
    // BOQ table never has a blank Unit column.
    unit: 'Each',
    qty: line.qty ?? 0,
  };
}

export function buildTpData(input: TpDataBuilderInput): TpTemplateData {
  const { metadata, e1: _e1, e2, sections, contactName, rfqNumber } = input;
  void _e1;

  const today = metadata.date && metadata.date.length > 0 ? metadata.date : new Date().toISOString().slice(0, 10);

  return {
    customerName: metadata.customerName ?? '',
    customerFullName: metadata.customerName ?? '',
    opportunityNumber: metadata.estimateId ?? '',
    rfqNumber: rfqNumber ?? '',
    documentDate: today,
    projectName: metadata.projectName ?? '',
    contactName: contactName ?? '',
    contactDesignation: 'Account Manager',
    contactMobile: '',
    contactEmail: '',
    revisions: [
      {
        revisionDescription: 'Initial proposal',
        revisionDate: today,
        revisionReviewer: contactName ?? metadata.tenantName ?? '',
        revisionVersion: '1.0',
      },
    ],
    bom: (e2.bom ?? []).map((line) => mapBomLine(line as BomLineMaybeOrderable)),
    executiveSummaryBody: splitSectionBody(findSectionContent(sections, 'executive_summary')),
    understandingBody: splitSectionBody(findSectionContent(sections, 'requirements')),
    assumptionsBody: splitSectionBody(findSectionContent(sections, 'scope_assumptions')),
  };
}

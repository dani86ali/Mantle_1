/** Sanity tests for the TP template-build script output. Does NOT re-run the
 *  script in CI — assumes the committed `src/templates/TP-template.docx` is the
 *  output of `npx tsx scripts/build-tp-template.ts`. Re-run that script when
 *  the source DOCX changes; these tests will catch drift.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const TEMPLATE_PATH = join(process.cwd(), 'src/templates/TP-template.docx');

async function loadDocXml(): Promise<string> {
  const buf = await readFile(TEMPLATE_PATH);
  return new PizZip(buf).files['word/document.xml'].asText();
}

describe('TP-template.docx (build-tp-template output)', () => {
  it('exists on disk', () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
  });

  it('loads with docxtemplater without parse errors', async () => {
    const buf = await readFile(TEMPLATE_PATH);
    const zip = new PizZip(buf);
    expect(() => new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })).not.toThrow();
  });

  it('contains the expected scalar placeholders', async () => {
    const xml = await loadDocXml();
    // Substituted into preamble + §1 + §2 + §3 + §4.3 — total 9 hits per the
    // build script (Aramco/Saudi Aramco mentions in those scopes).
    expect((xml.match(/\{customerName\}/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((xml.match(/\{rfqNumber\}/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('contains the three prose-body loops', async () => {
    const xml = await loadDocXml();
    expect(xml).toContain('{#executiveSummaryBody}');
    expect(xml).toContain('{/executiveSummaryBody}');
    expect(xml).toContain('{#understandingBody}');
    expect(xml).toContain('{/understandingBody}');
    expect(xml).toContain('{#assumptionsBody}');
    expect(xml).toContain('{/assumptionsBody}');
  });

  it('contains the BOQ loop with the four cell placeholders', async () => {
    const xml = await loadDocXml();
    expect(xml).toContain('{#bom}');
    expect(xml).toContain('{/bom}');
    expect(xml).toContain('{partNumber}');
    expect(xml).toContain('{description}');
    expect(xml).toContain('{unit}');
    expect(xml).toContain('{qty}');
  });

  it('contains the revisions loop and contacts ATOMs', async () => {
    const xml = await loadDocXml();
    expect(xml).toContain('{#revisions}');
    expect(xml).toContain('{/revisions}');
    expect(xml).toContain('{revisionDescription}');
    expect(xml).toContain('{contactName}');
    expect(xml).toContain('{contactEmail}');
  });

  it('leaves §8 References Aramco case-studies STATIC (F3)', async () => {
    const xml = await loadDocXml();
    // Per the recon, §8.8 has 5 "Saudi Aramco" / "Aramco" case-study mentions
    // that MUST NOT be templated. They survive verbatim in the template.
    const aramcoHits = (xml.match(/Aramco/g) ?? []).length;
    expect(aramcoHits).toBeGreaterThanOrEqual(4);
    // Confirm the §8 heading is present (so the static span exists in output).
    expect(xml).toContain('rofile'); // "Solutions Profile" heading is fragmented; "rofile" suffix is enough
  });

  it('renders end-to-end with a minimal data set without throwing', async () => {
    const buf = await readFile(TEMPLATE_PATH);
    const zip = new PizZip(buf);
    const dt = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    dt.render({
      customerName: 'TEST_CUSTOMER',
      customerFullName: 'TEST_CUSTOMER',
      opportunityNumber: 'OP-TEST',
      rfqNumber: 'RFQ-TEST',
      documentDate: '2026-05-19',
      projectName: 'TEST_PROJECT',
      contactName: 'Tester',
      contactDesignation: 'AM',
      contactMobile: '+0',
      contactEmail: 't@t.com',
      revisions: [
        { revisionDescription: 'v1', revisionDate: '2026-05-19', revisionReviewer: 'T', revisionVersion: '1.0' },
      ],
      executiveSummaryBody: ['p1', 'p2'],
      understandingBody: ['u1'],
      assumptionsBody: ['a1'],
      bom: [
        { partNumber: 'PN-1', description: 'd1', unit: 'Each', qty: 1 },
        { partNumber: 'PN-2', description: 'd2', unit: 'Each', qty: 2 },
      ],
    });
    const outBuf = dt.getZip().generate({ type: 'nodebuffer' }) as Buffer;
    const renderedXml = new PizZip(outBuf).files['word/document.xml'].asText();
    expect(renderedXml).toContain('TEST_CUSTOMER');
    expect(renderedXml).toContain('PN-1');
    expect(renderedXml).toContain('PN-2');
    expect(renderedXml).not.toContain('{customerName}');
    expect(renderedXml).not.toContain('{partNumber}');
  });
});

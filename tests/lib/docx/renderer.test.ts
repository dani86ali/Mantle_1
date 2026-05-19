import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderDocxFromTemplate } from '@/lib/docx/renderer';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'bomatic-renderer-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

/** Build a minimal valid .docx containing a single paragraph with the given
 *  inline body XML — used to construct synthetic templates per test. */
function buildSyntheticDocx(documentBodyXml: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${documentBodyXml}<w:sectPr/></w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

function readDocXml(buf: Buffer): string {
  return new PizZip(buf).files['word/document.xml'].asText();
}

describe('renderDocxFromTemplate', () => {
  it('substitutes a single placeholder', async () => {
    const tpl = buildSyntheticDocx(
      '<w:p><w:r><w:t xml:space="preserve">Hello {customerName}!</w:t></w:r></w:p>',
    );
    const tplPath = join(tmpDir, 'simple.docx');
    const outPath = join(tmpDir, 'simple-out.docx');
    await writeFile(tplPath, tpl);

    const result = await renderDocxFromTemplate(tplPath, { customerName: 'ACME Bank' }, outPath);
    expect(result).toBe(outPath);
    const xml = readDocXml(await readFile(outPath));
    expect(xml).toContain('Hello ACME Bank');
    expect(xml).not.toContain('{customerName}');
  });

  it('throws a descriptive error on an unclosed tag', async () => {
    const tpl = buildSyntheticDocx(
      '<w:p><w:r><w:t xml:space="preserve">Broken {customerName tag never closed</w:t></w:r></w:p>',
    );
    const tplPath = join(tmpDir, 'broken.docx');
    await writeFile(tplPath, tpl);

    await expect(
      renderDocxFromTemplate(tplPath, { customerName: 'x' }, join(tmpDir, 'broken-out.docx')),
    ).rejects.toThrow(/template parse failed|template render failed/);
  });

  it('renders multi-paragraph paragraph-loop with each item as its own paragraph', async () => {
    // {#items} and {/items} on their own paragraphs collapse with paragraphLoop:true;
    // the BETWEEN paragraph (containing {.}) is repeated for each item.
    const tpl = buildSyntheticDocx(
      '<w:p><w:r><w:t xml:space="preserve">{#items}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">{.}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">{/items}</w:t></w:r></w:p>',
    );
    const tplPath = join(tmpDir, 'loop.docx');
    const outPath = join(tmpDir, 'loop-out.docx');
    await writeFile(tplPath, tpl);

    await renderDocxFromTemplate(tplPath, { items: ['Alpha', 'Beta', 'Gamma'] }, outPath);
    const xml = readDocXml(await readFile(outPath));
    expect(xml).toContain('Alpha');
    expect(xml).toContain('Beta');
    expect(xml).toContain('Gamma');
    // Each item should render in its own <w:p> — three paragraphs after the
    // loop bounds collapse.
    const paraCount = (xml.match(/<w:p[ >]/g) ?? []).length;
    expect(paraCount).toBeGreaterThanOrEqual(3);
  });

  it('marks missing scalar placeholders when markMissing is supplied', async () => {
    const tpl = buildSyntheticDocx(
      '<w:p><w:r><w:t xml:space="preserve">Hi {customerName}, ref {missingField}.</w:t></w:r></w:p>',
    );
    const tplPath = join(tmpDir, 'missing.docx');
    const outPath = join(tmpDir, 'missing-out.docx');
    await writeFile(tplPath, tpl);

    await renderDocxFromTemplate(
      tplPath,
      { customerName: 'ACME' },
      outPath,
      { markMissing: (tag) => `<<MISSING:${tag}>>` },
    );
    const xml = readDocXml(await readFile(outPath));
    expect(xml).toContain('ACME');
    // docxtemplater XML-escapes substituted text — angle brackets appear as
    // &lt; / &gt; in the rendered document.xml. The STRICT scan downstream
    // can match either form.
    expect(xml).toMatch(/(<<MISSING:missingField>>|&lt;&lt;MISSING:missingField&gt;&gt;)/);
  });

  it('writes a valid zip that other tools can re-read', async () => {
    const tpl = buildSyntheticDocx('<w:p><w:r><w:t>{x}</w:t></w:r></w:p>');
    const tplPath = join(tmpDir, 'roundtrip.docx');
    const outPath = join(tmpDir, 'roundtrip-out.docx');
    await writeFile(tplPath, tpl);

    await renderDocxFromTemplate(tplPath, { x: 'value-1' }, outPath);
    // Round-trip: load the rendered file and check docxtemplater can parse it.
    const renderedBuf = await readFile(outPath);
    const zip = new PizZip(renderedBuf);
    expect(() => new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })).not.toThrow();
  });
});

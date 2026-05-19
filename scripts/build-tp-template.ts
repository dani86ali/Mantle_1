/**
 * Build the BOMatic Technical Proposal (TP) docxtemplater template from STC's
 * benchmark TP. Reads ../bomatic_planning/reference_documents/OP-2024-148262-TP-V2.docx,
 * applies scoped ATOM substitutions + table loop injection, and writes
 *   • src/templates/TP-template.docx           (deployed with the code)
 *   • ../bomatic_planning/templates/TP-template.docx (analyst review copy)
 *
 * Scope per bomatic_planning/template_recon/tp-section-inventory.md:
 *   • ATOM substitution: preamble + §1 + §2 + §3 + §4.3 only (offset < §8 start)
 *   • §8 References stays STATIC (case studies, F3)
 *   • §1 / §2 / §4.3 prose paragraphs collapse to a paragraph-loop placeholder
 *   • Contacts (T0) + revisions (T1) preamble tables get ATOMs
 *   • BOQ §6.1 (T3) becomes a {#bom} loop fed by E2
 *   • Compliance §3 (T2) stays STATIC structure (E4 doesn't produce matching cells)
 *
 * Deferred (per advisor + recon F1):
 *   • Cover-page text-box ATOMs (OP-2024-148262, "3rd of June 2024") — text is
 *     split across <w:t> runs so simple substitution doesn't find them
 *   • Cover-page swap from OneDrive/cover_page.docx — image/relationship merge
 *     out of scope for B5
 *
 * Run: npx tsx scripts/build-tp-template.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const SOURCE = '../bomatic_planning/reference_documents/OP-2024-148262-TP-V2.docx';
const OUT_REPO = 'src/templates/TP-template.docx';
const OUT_PLANNING = '../bomatic_planning/templates/TP-template.docx';

// Section H1 headings — used to find boundaries by visible text in headings.
const REFERENCES_HEADING_TEXT = 'References';
// §8 Solutions Profile sub-heading; §8.8 inside it. We split at the §8 H1 to be
// safe — nothing in §8 should get any ATOM substitution.
const SOLUTIONS_PROFILE_HEADING_TEXT = 'Solutions Profile';

interface ParaIndex {
  index: number; // paragraph index in document order
  start: number; // byte offset of <w:p> opening
  end: number;   // byte offset just past </w:p>
  style: string | null;
  text: string;
}

function indexParagraphs(xml: string): ParaIndex[] {
  const out: ParaIndex[] = [];
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const pStyleRe = /<w:pStyle\s+w:val="([^"]+)"/;
  const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pRe.exec(xml)) !== null) {
    const inner = m[0];
    const styleMatch = pStyleRe.exec(inner);
    let text = '';
    textRe.lastIndex = 0;
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(inner)) !== null) text += tm[1];
    // Decode the minimal XML entities that appear in heading text.
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    out.push({ index: i, start: m.index, end: m.index + inner.length, style: styleMatch?.[1] ?? null, text });
    i++;
  }
  return out;
}

function findHeadingIndex(paras: ParaIndex[], text: string): number {
  const idx = paras.findIndex((p) =>
    p.style != null &&
    /Heading|STCH|D3/.test(p.style) &&
    p.text.trim() === text,
  );
  if (idx < 0) throw new Error(`heading not found: "${text}"`);
  return idx;
}

function nextHeadingAfter(paras: ParaIndex[], startIdx: number, levels: ('H1' | 'H2')[]): number {
  const isWanted = (style: string | null): boolean => {
    if (!style) return false;
    if (levels.includes('H1') && /Heading1|STCH1|^D3$/.test(style)) return true;
    if (levels.includes('H2') && /Heading2|STCH2/.test(style)) return true;
    return false;
  };
  for (let i = startIdx + 1; i < paras.length; i++) {
    if (isWanted(paras[i].style)) return i;
  }
  return paras.length;
}

/** Build a plain paragraph containing a single text run with the given text.
 *  Uses xml:space="preserve" so leading/trailing braces survive. */
function buildPlainPara(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<w:p><w:r><w:t xml:space="preserve">${esc}</w:t></w:r></w:p>`;
}

/** Build a 3-paragraph docxtemplater paragraph-loop block:
 *    {#name}
 *    {.}     ← repeated for each item; receives the array element as text
 *    {/name}
 *  Requires { paragraphLoop: true } at render time. */
function buildParagraphLoop(name: string): string {
  return buildPlainPara(`{#${name}}`) + buildPlainPara('{.}') + buildPlainPara(`{/${name}}`);
}

/** Replace the closed paragraph range [fromIdx .. toIdx] (inclusive on both
 *  ends) with the given replacement XML. */
function spliceParagraphs(xml: string, paras: ParaIndex[], fromIdx: number, toIdx: number, replacement: string): string {
  const from = paras[fromIdx].start;
  const to = paras[toIdx].end;
  return xml.slice(0, from) + replacement + xml.slice(to);
}

/** Substitute the ATOMs we can reliably find as contiguous strings.
 *  Operates only on the supplied XML slice (caller scopes to pre-§8 region). */
function substituteAtoms(xml: string): string {
  // Order: longest / most specific first.
  return xml
    .replace(/Saudi Aramco/g, '{customerName}')
    .replace(/Aramco/g, '{customerName}')
    .replace(/4203145328/g, '{rfqNumber}');
}

/** Walk backwards from `from` to the nearest <w:tbl> element open (NOT a
 *  child element like <w:tblPr>). Throws if none exists in the prefix. */
function findEnclosingTableStart(xml: string, from: number): number {
  // Search the prefix [0..from] for the rightmost `<w:tbl>` or `<w:tbl ...>`.
  const prefix = xml.slice(0, from);
  let candidate = -1;
  const re = /<w:tbl(?:>|\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prefix)) !== null) candidate = m.index;
  if (candidate < 0) throw new Error(`no enclosing <w:tbl> before offset ${from}`);
  return candidate;
}

/** Locate the first <w:tbl> at or after `from` in xml. Matches the literal
 *  `<w:tbl>` element open — NOT `<w:tblPr>`, `<w:tblGrid>`, etc. */
function findTableBounds(xml: string, from: number): { start: number; end: number } {
  const tblOpenRe = /<w:tbl(?:>|\s)/g;
  tblOpenRe.lastIndex = from;
  const m = tblOpenRe.exec(xml);
  if (!m) throw new Error(`no <w:tbl> found at/after offset ${from}`);
  const start = m.index;
  const closeTag = '</w:tbl>';
  const close = xml.indexOf(closeTag, start);
  if (close < 0) throw new Error(`no </w:tbl> found after ${start}`);
  return { start, end: close + closeTag.length };
}

/** Match closed <w:tr ...>...</w:tr> rows inside a table. Excludes <w:trPr>. */
const TR_RE = /<w:tr\s[^>]*>[\s\S]*?<\/w:tr>/g;

/** Replace the first text run inside a cell with the given placeholder. Returns
 *  the new cell XML. We rewrite the run text but preserve the surrounding rPr. */
function replaceCellFirstText(tcXml: string, placeholder: string): string {
  // Find first <w:t ...>text</w:t> and rewrite its contents. If none, inject a run.
  const tRe = /<w:t\b[^>]*>[\s\S]*?<\/w:t>/;
  if (tRe.test(tcXml)) {
    return tcXml.replace(tRe, `<w:t xml:space="preserve">${placeholder}</w:t>`);
  }
  // Cell has no text run — append one inside the first <w:p>
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/;
  return tcXml.replace(pRe, (full, inner) =>
    full.replace(inner, inner + `<w:r><w:t xml:space="preserve">${placeholder}</w:t></w:r>`),
  );
}

/** Replace the text of each cell in a row, in order, with the supplied
 *  placeholders. Cells beyond the placeholder count are left untouched. */
function replaceRowCellTexts(rowXml: string, placeholders: string[]): string {
  const tcRe = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  let i = 0;
  return rowXml.replace(tcRe, (tc) => {
    if (i >= placeholders.length) { i++; return tc; }
    const next = replaceCellFirstText(tc, placeholders[i]);
    i++;
    return next;
  });
}

/** Apply the contacts-table transform (T0, 2 rows × 4 cols): header preserved,
 *  data row gets {contactName}/{contactDesignation}/{contactMobile}/{contactEmail}. */
function transformContactsTable(xml: string, tblStart: number, tblEnd: number): string {
  const tbl = xml.slice(tblStart, tblEnd);
  const rows: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  TR_RE.lastIndex = 0;
  while ((m = TR_RE.exec(tbl)) !== null) {
    rows.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  if (rows.length < 2) throw new Error(`contacts table: expected ≥2 rows, got ${rows.length}`);
  const dataRow = replaceRowCellTexts(rows[1].text, [
    '{contactName}', '{contactDesignation}', '{contactMobile}', '{contactEmail}',
  ]);
  const newTbl =
    tbl.slice(0, rows[1].start) + dataRow + tbl.slice(rows[1].end);
  return xml.slice(0, tblStart) + newTbl + xml.slice(tblEnd);
}

/** Apply the revisions-table transform (T1, 3 rows × 4 cols): header preserved;
 *  first data row becomes a `{#revisions}…{/revisions}` loop row; extra rows dropped. */
function transformRevisionsTable(xml: string, tblStart: number, tblEnd: number): string {
  const tbl = xml.slice(tblStart, tblEnd);
  const rows: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  TR_RE.lastIndex = 0;
  while ((m = TR_RE.exec(tbl)) !== null) {
    rows.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  if (rows.length < 2) throw new Error(`revisions table: expected ≥2 rows, got ${rows.length}`);
  const loopRow = replaceRowCellTexts(rows[1].text, [
    '{#revisions}{revisionDescription}',
    '{revisionDate}',
    '{revisionReviewer}',
    '{revisionVersion}{/revisions}',
  ]);
  // Header + loop row only — drop rows[2..]
  const newTbl =
    tbl.slice(0, rows[1].start) + loopRow + tbl.slice(rows[rows.length - 1].end);
  return xml.slice(0, tblStart) + newTbl + xml.slice(tblEnd);
}

/** Apply the BOQ-table transform (T3, 71 rows × 4 cols): header preserved;
 *  first data row becomes a `{#bom}…{/bom}` loop row; rows 3..71 dropped. */
function transformBoqTable(xml: string, tblStart: number, tblEnd: number): string {
  const tbl = xml.slice(tblStart, tblEnd);
  const rows: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  TR_RE.lastIndex = 0;
  while ((m = TR_RE.exec(tbl)) !== null) {
    rows.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  if (rows.length < 2) throw new Error(`BOQ table: expected ≥2 rows, got ${rows.length}`);
  // Use the *third* row (rows[2]) as the loop-row template — rows[1] is a
  // category divider ("RTR CORE/DMZ SWITCH REPLACEMENT") with empty cells in
  // cols 1/3/4, which would render an empty row at the top of every BOM.
  const sourceRowIdx = rows.length > 2 ? 2 : 1;
  const loopRow = replaceRowCellTexts(rows[sourceRowIdx].text, [
    '{#bom}{partNumber}',
    '{description}',
    '{unit}',
    '{qty}{/bom}',
  ]);
  const newTbl =
    tbl.slice(0, rows[1].start) + loopRow + tbl.slice(rows[rows.length - 1].end);
  return xml.slice(0, tblStart) + newTbl + xml.slice(tblEnd);
}

function main(): void {
  console.log('[build-tp-template] reading source:', SOURCE);
  const srcBuf = readFileSync(SOURCE);
  const zip = new PizZip(srcBuf);
  const docXmlOrig = zip.files['word/document.xml'].asText();
  console.log(`[build-tp-template] document.xml length: ${docXmlOrig.length}`);

  let xml = docXmlOrig;
  const paras = indexParagraphs(xml);
  console.log(`[build-tp-template] paragraphs indexed: ${paras.length}`);

  // (1) Locate section boundaries.
  const execSumIdx = findHeadingIndex(paras, 'Executive Summary');
  const understandingIdx = findHeadingIndex(paras, 'Our Understanding of The Requirement');
  const assumptionsIdx = findHeadingIndex(paras, 'Assumptions & Exclusions');
  const solutionsProfileIdx = findHeadingIndex(paras, SOLUTIONS_PROFILE_HEADING_TEXT);

  const execSumEnd = nextHeadingAfter(paras, execSumIdx, ['H1', 'H2']);
  const understandingEnd = nextHeadingAfter(paras, understandingIdx, ['H1', 'H2']);
  const assumptionsEnd = nextHeadingAfter(paras, assumptionsIdx, ['H1', 'H2']);

  console.log(`[build-tp-template] §1 prose: p#${execSumIdx + 1}..p#${execSumEnd - 1}`);
  console.log(`[build-tp-template] §2 prose: p#${understandingIdx + 1}..p#${understandingEnd - 1}`);
  console.log(`[build-tp-template] §4.3 prose: p#${assumptionsIdx + 1}..p#${assumptionsEnd - 1}`);

  // (2) Prose body replacements — go bottom-up to keep earlier offsets valid.
  xml = spliceParagraphs(xml, paras, assumptionsIdx + 1, assumptionsEnd - 1, buildParagraphLoop('assumptionsBody'));
  xml = spliceParagraphs(xml, paras, understandingIdx + 1, understandingEnd - 1, buildParagraphLoop('understandingBody'));
  xml = spliceParagraphs(xml, paras, execSumIdx + 1, execSumEnd - 1, buildParagraphLoop('executiveSummaryBody'));

  // (3) Re-index paragraphs after splicing; locate the §8 Solutions Profile
  // H1 by its (text-fragmented) heading paragraph. indexParagraphs concatenates
  // all <w:t> children so "S|olutions| P|rofile" reassembles to a clean match.
  const parasAfterSplice = indexParagraphs(xml);
  const solutionsProfileParaIdx = findHeadingIndex(parasAfterSplice, SOLUTIONS_PROFILE_HEADING_TEXT);
  const solutionsProfileStart = parasAfterSplice[solutionsProfileParaIdx].start;

  // (4) ATOM substitution — substitute on the prefix only, leave §8 (Awards /
  // Certs / Clients / References) untouched.
  const prefix = xml.slice(0, solutionsProfileStart);
  const suffix = xml.slice(solutionsProfileStart);
  const preAramco = (prefix.match(/Aramco/g) ?? []).length;
  console.log(`[build-tp-template] pre-§8 Aramco=${preAramco}, prefix-bytes=${prefix.length}`);
  const substituted = substituteAtoms(prefix);
  const postSubBraces = (substituted.match(/\{customerName\}/g) ?? []).length;
  console.log(`[build-tp-template] post-substitute {customerName}=${postSubBraces}`);
  xml = substituted + suffix;

  // (5) Table transforms. Re-index paragraphs since the BOQ-heading lookup must
  // skip the TOC entry (which has the same visible text). The H2-styled
  // "Detailed (BOQ)" paragraph is the anchor, immediately followed by T3.
  const parasNow = indexParagraphs(xml);
  const boqHeadingIdx = parasNow.findIndex((p) =>
    p.style != null && /Heading2|STCH2/.test(p.style) && p.text.trim() === 'Detailed (BOQ)',
  );
  if (boqHeadingIdx < 0) throw new Error('Detailed (BOQ) H2 heading not found');
  const boqBounds = findTableBounds(xml, parasNow[boqHeadingIdx].end);
  xml = transformBoqTable(xml, boqBounds.start, boqBounds.end);

  // T1 revisions — find table whose header cells contain "Reviewer". Locate via
  // a contiguous `>Reviewer<` text run (table-header cells are not styled
  // headings, so they aren't fragmented).
  const reviewerPos = xml.indexOf('>Reviewer<');
  if (reviewerPos < 0) throw new Error('Reviewer header not found');
  // Walk back to the enclosing <w:tbl> opening using the literal element open
  // (so we don't match <w:tblPr>, <w:tblGrid>, etc.).
  const revTblStart = findEnclosingTableStart(xml, reviewerPos);
  const revTblEnd = xml.indexOf('</w:tbl>', revTblStart) + '</w:tbl>'.length;
  xml = transformRevisionsTable(xml, revTblStart, revTblEnd);

  // T0 contacts — find table containing the "Designation" header cell.
  const designationPos = xml.indexOf('>Designation<');
  if (designationPos < 0) throw new Error('Designation header not found');
  const contactsTblStart = findEnclosingTableStart(xml, designationPos);
  const contactsTblEnd = xml.indexOf('</w:tbl>', contactsTblStart) + '</w:tbl>'.length;
  xml = transformContactsTable(xml, contactsTblStart, contactsTblEnd);

  // (6) Write back into zip.
  zip.file('word/document.xml', xml);

  // (7) Validate by loading with docxtemplater.
  let buf: Buffer;
  try {
    // Use a fresh zip from the modified buffer so docxtemplater sees the change.
    buf = zip.generate({ type: 'nodebuffer' }) as Buffer;
    const checkZip = new PizZip(buf);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _dt = new Docxtemplater(checkZip, { paragraphLoop: true, linebreaks: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[build-tp-template] output template failed docxtemplater validation: ${msg}`);
  }

  // (8) Write outputs.
  mkdirSync('src/templates', { recursive: true });
  mkdirSync('../bomatic_planning/templates', { recursive: true });
  writeFileSync(OUT_REPO, buf);
  writeFileSync(OUT_PLANNING, buf);
  console.log(`[build-tp-template] wrote: ${OUT_REPO} (${buf.length} bytes)`);
  console.log(`[build-tp-template] wrote: ${OUT_PLANNING} (${buf.length} bytes)`);

  // (9) Sanity summary.
  const newDoc = xml;
  const customerNameHits = (newDoc.match(/\{customerName\}/g) ?? []).length;
  const aramcoLeft = (newDoc.match(/Aramco/g) ?? []).length;
  console.log(`[build-tp-template] {customerName} occurrences in template: ${customerNameHits}`);
  console.log(`[build-tp-template] residual "Aramco" mentions (should be §8 References only): ${aramcoLeft}`);
}

main();

export {};

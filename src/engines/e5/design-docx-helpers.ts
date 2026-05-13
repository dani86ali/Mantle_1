/**
 * E5 — shared docx rendering helpers for HLD and LLD generators.
 *
 * Minimal markdown subset: paragraphs separated by blank lines, "- " bullet
 * lists. No tables (E5 narrative templates never emit pipe-tables). Mirrors
 * the E3 docx structure (title page, TOC, page-numbered footer) but does not
 * import from e3 (engine isolation rule, CLAUDE.md).
 */

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

export interface DesignDocMetadata {
  customerName: string;
  projectName: string;
  version: string;
  date: string;
}

export interface DesignDocSection {
  sectionNumber: number;
  title: string;
  content: string;
  diagrams?: string[];
}

const BODY_FONT = 'Calibri';
const BODY_SIZE = 22; // 11pt
const TITLE_SIZE = 56; // 28pt
const SUBTITLE_SIZE = 32; // 16pt

function centered(text: string, size: number, bold = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text, bold, size, font: BODY_FONT })],
  });
}

function titlePage(docTitle: string, metadata: DesignDocMetadata): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    centered(docTitle, TITLE_SIZE, true),
    centered(`Prepared for ${metadata.customerName}`, SUBTITLE_SIZE),
    centered(metadata.projectName, SUBTITLE_SIZE),
    new Paragraph({ spacing: { before: 1200 }, children: [] }),
    centered(`Version ${metadata.version}`, BODY_SIZE),
    centered(metadata.date, BODY_SIZE),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function tocBlock(): (Paragraph | TableOfContents)[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Table of Contents', font: BODY_FONT })],
    }),
    new TableOfContents('Sections', { hyperlink: true, headingStyleRange: '1-3' }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function renderContent(content: string): Paragraph[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Paragraph[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') { i++; continue; }
    if (/^[-*]\s+/.test(trimmed)) {
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^[-*]\s+/, '');
        blocks.push(new Paragraph({
          children: [new TextRun({ text: item, font: BODY_FONT, size: BODY_SIZE })],
          bullet: { level: 0 },
        }));
        i++;
      }
      continue;
    }
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const nt = lines[i].trim();
      if (nt === '' || /^[-*]\s+/.test(nt)) break;
      para.push(nt);
      i++;
    }
    const runs: TextRun[] = [];
    for (let k = 0; k < para.length; k++) {
      runs.push(new TextRun({
        text: para[k], font: BODY_FONT, size: BODY_SIZE,
        break: k === 0 ? 0 : 1,
      }));
    }
    blocks.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: runs,
    }));
  }
  return blocks;
}

function sectionBlocks(section: DesignDocSection, isLast: boolean): Paragraph[] {
  const heading = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({
      text: `${section.sectionNumber}. ${section.title}`,
      font: BODY_FONT,
    })],
  });
  const body = renderContent(section.content);
  const diagramRefs: Paragraph[] = (section.diagrams ?? []).map((name) =>
    new Paragraph({
      children: [new TextRun({
        text: `See diagram: ${name}`,
        italics: true, font: BODY_FONT, size: BODY_SIZE,
      })],
    }),
  );
  const tail: Paragraph[] = isLast ? [] : [new Paragraph({ children: [new PageBreak()] })];
  return [heading, ...body, ...diagramRefs, ...tail];
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Page ', font: BODY_FONT, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 18 }),
          new TextRun({ text: ' of ', font: BODY_FONT, size: 18 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: BODY_FONT, size: 18 }),
        ],
      }),
    ],
  });
}

/**
 * Build a design document (HLD or LLD) as a .docx file at outputPath.
 * Returns the output path.
 */
export async function generateDesignDocx(
  docTitle: string,
  sections: DesignDocSection[],
  metadata: DesignDocMetadata,
  outputPath: string,
): Promise<string> {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('generateDesignDocx: outputPath must be a non-empty string');
  }
  const ordered = [...sections].sort((a, b) => a.sectionNumber - b.sectionNumber);
  const body: (Paragraph | TableOfContents)[] = [
    ...titlePage(docTitle, metadata),
    ...tocBlock(),
  ];
  for (let idx = 0; idx < ordered.length; idx++) {
    body.push(...sectionBlocks(ordered[idx], idx === ordered.length - 1));
  }
  const doc = new Document({
    creator: 'BOMATIC',
    title: `${metadata.projectName} — ${docTitle}`,
    description: `${docTitle} for ${metadata.customerName}`,
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: BODY_SIZE } },
        heading1: { run: { font: BODY_FONT, size: 36, bold: true } },
        heading2: { run: { font: BODY_FONT, size: 28, bold: true } },
        heading3: { run: { font: BODY_FONT, size: 24, bold: true } },
      },
    },
    sections: [{
      footers: { default: buildFooter() },
      children: body,
    }],
  });
  const buf = await Packer.toBuffer(doc);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buf);
  return outputPath;
}

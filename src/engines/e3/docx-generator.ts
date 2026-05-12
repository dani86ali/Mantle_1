/** E3 Word proposal writer.
 *  Tone rules (Playbook §6.3): tables over prose for specs, numbered pages /
 *  figures / tables, professional Calibri body 11pt. Header carries tenant
 *  name on the left and "CONFIDENTIAL" on the right; footer carries the
 *  page number.
 */

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';
import { writeFile } from 'fs/promises';
import type { ProposalMetadata, ProposalSection } from './types';
import { markdownToDocxBlocks } from './markdown-to-docx';

const BODY_FONT = 'Calibri';
const BODY_SIZE = 22; // half-points → 11pt
const TITLE_SIZE = 56; // 28pt
const SUBTITLE_SIZE = 32; // 16pt

function centered(text: string, size: number, bold = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text, bold, size, font: BODY_FONT })],
  });
}

function titlePage(metadata: ProposalMetadata): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    centered(metadata.projectName, TITLE_SIZE, true),
    centered(`Prepared for ${metadata.customerName}`, SUBTITLE_SIZE),
    new Paragraph({ spacing: { before: 1200 }, children: [] }),
    centered(`By ${metadata.tenantName}`, SUBTITLE_SIZE),
    centered(metadata.date, BODY_SIZE),
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    centered(
      'CONFIDENTIAL — This proposal contains commercially sensitive information and is intended solely for the named recipient. Redistribution is not permitted without written consent.',
      BODY_SIZE,
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function tocBlock(): (Paragraph | TableOfContents)[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Table of Contents', font: BODY_FONT })],
    }),
    new TableOfContents('Sections', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function sectionBlocks(section: ProposalSection, isLast: boolean): (Paragraph | import('docx').Table)[] {
  const heading = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: section.title, font: BODY_FONT })],
  });
  const body = markdownToDocxBlocks(section.content);
  const tail: Paragraph[] = isLast ? [] : [new Paragraph({ children: [new PageBreak()] })];
  return [heading, ...body, ...tail];
}

function buildHeader(tenantName: string): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: tenantName, font: BODY_FONT, size: 18 }),
          new TextRun({ text: '\t\tCONFIDENTIAL', font: BODY_FONT, size: 18, bold: true }),
        ],
      }),
    ],
  });
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

export async function generateProposalDocx(
  sections: ProposalSection[],
  metadata: ProposalMetadata,
  outputPath: string,
): Promise<string> {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('generateProposalDocx: outputPath must be a non-empty string');
  }
  const ordered = [...sections].sort((a, b) => a.id - b.id);
  const body: (Paragraph | TableOfContents | import('docx').Table)[] = [
    ...titlePage(metadata),
    ...tocBlock(),
  ];
  for (let idx = 0; idx < ordered.length; idx++) {
    body.push(...sectionBlocks(ordered[idx], idx === ordered.length - 1));
  }
  const doc = new Document({
    creator: metadata.tenantName,
    title: `${metadata.projectName} — Proposal`,
    description: `Proposal for ${metadata.customerName}`,
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: BODY_SIZE } },
        heading1: { run: { font: BODY_FONT, size: 36, bold: true } },
        heading2: { run: { font: BODY_FONT, size: 28, bold: true } },
        heading3: { run: { font: BODY_FONT, size: 24, bold: true } },
      },
    },
    sections: [
      {
        headers: { default: buildHeader(metadata.tenantName) },
        footers: { default: buildFooter() },
        children: body,
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  await writeFile(outputPath, buf);
  return outputPath;
}

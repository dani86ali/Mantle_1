import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import JSZip from "jszip";
import { readPdf, readDocx, readDocument } from "@/lib/io/document-reader";

function buildMinimalPdf(text: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const streamContent = `BT /F1 24 Tf 50 700 Td (${text}) Tj ET`;
  objects.push(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function buildMinimalDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file("word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`);
  return await zip.generateAsync({ type: "nodebuffer" });
}

let tmpDir: string;
let pdfPath: string;
let docxPath: string;
let emptyPdfPath: string;
let emptyDocxPath: string;
let unknownPath: string;
let docPath: string;

const PDF_TEXT = "Hello PDF World";
const DOCX_TEXT = "Hello DOCX World";

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-docreader-"));
  pdfPath = join(tmpDir, "sample.pdf");
  docxPath = join(tmpDir, "sample.docx");
  emptyPdfPath = join(tmpDir, "empty.pdf");
  emptyDocxPath = join(tmpDir, "empty.docx");
  unknownPath = join(tmpDir, "sample.rtf");
  docPath = join(tmpDir, "legacy.doc");

  await writeFile(pdfPath, buildMinimalPdf(PDF_TEXT));
  await writeFile(docxPath, await buildMinimalDocx(DOCX_TEXT));
  await writeFile(emptyPdfPath, Buffer.alloc(0));
  await writeFile(emptyDocxPath, Buffer.alloc(0));
  await writeFile(unknownPath, "not supported");
  await writeFile(docPath, "this is not a real docx");
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("readPdf", () => {
  it("extracts text from a PDF", async () => {
    const text = await readPdf(pdfPath);
    expect(text).toContain(PDF_TEXT);
  });

  it("returns empty string for an empty file", async () => {
    const text = await readPdf(emptyPdfPath);
    expect(text).toBe("");
  });

  it("returns empty string for a corrupt PDF", async () => {
    const text = await readPdf(unknownPath);
    expect(text).toBe("");
  });

  it("throws on empty filePath", async () => {
    await expect(readPdf("")).rejects.toThrow();
  });
});

describe("readDocx", () => {
  it("extracts text from a DOCX", async () => {
    const text = await readDocx(docxPath);
    expect(text).toContain(DOCX_TEXT);
  });

  it("returns empty string for an empty file", async () => {
    const text = await readDocx(emptyDocxPath);
    expect(text).toBe("");
  });

  it("returns empty string for a non-docx file", async () => {
    const text = await readDocx(unknownPath);
    expect(text).toBe("");
  });
});

describe("readDocument", () => {
  it("dispatches to PDF reader for .pdf", async () => {
    const r = await readDocument(pdfPath);
    expect(r.format).toBe("pdf");
    expect(r.text).toContain(PDF_TEXT);
  });

  it("dispatches to DOCX reader for .docx", async () => {
    const r = await readDocument(docxPath);
    expect(r.format).toBe("docx");
    expect(r.text).toContain(DOCX_TEXT);
  });

  it("throws on unknown extension", async () => {
    await expect(readDocument(unknownPath)).rejects.toThrow(/unsupported/i);
  });

  it("throws legacy-format error for .doc", async () => {
    await expect(readDocument(docPath)).rejects.toThrow(/Legacy \.doc format/);
  });

  it("returns empty string with format for an empty PDF (does not throw)", async () => {
    const r = await readDocument(emptyPdfPath);
    expect(r.format).toBe("pdf");
    expect(r.text).toBe("");
  });

  it("returns empty string with format for an empty DOCX (does not throw)", async () => {
    const r = await readDocument(emptyDocxPath);
    expect(r.format).toBe("docx");
    expect(r.text).toBe("");
  });
});

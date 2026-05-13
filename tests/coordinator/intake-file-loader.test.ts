import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReadDocument } = vi.hoisted(() => ({
  mockReadDocument: vi.fn(),
}));

vi.mock("@/lib/io/document-reader", () => ({
  readDocument: mockReadDocument,
}));

import { enrichFileContent } from "@/coordinator/intake-file-loader";

beforeEach(() => {
  mockReadDocument.mockReset();
});

describe("enrichFileContent", () => {
  it("returns empty when no files provided", async () => {
    const r = await enrichFileContent(undefined);
    expect(r.files).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(mockReadDocument).not.toHaveBeenCalled();
  });

  it("populates content for PDF files", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "PDF body text", format: "pdf" });
    const r = await enrichFileContent([{ path: "/uploads/spec.pdf", filename: "spec.pdf" }]);
    expect(mockReadDocument).toHaveBeenCalledWith("/uploads/spec.pdf");
    expect(r.files).toEqual([{ path: "/uploads/spec.pdf", content: "PDF body text" }]);
    expect(r.warnings).toEqual([]);
  });

  it("populates content for DOCX files", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "DOCX paragraph", format: "docx" });
    const r = await enrichFileContent([{ path: "/uploads/rfp.docx" }]);
    expect(mockReadDocument).toHaveBeenCalledWith("/uploads/rfp.docx");
    expect(r.files[0].content).toBe("DOCX paragraph");
  });

  it("leaves non-extractable extensions (xlsx) without content", async () => {
    const r = await enrichFileContent([{ path: "/uploads/boq.xlsx" }]);
    expect(mockReadDocument).not.toHaveBeenCalled();
    expect(r.files).toEqual([{ path: "/uploads/boq.xlsx" }]);
    expect(r.warnings).toEqual([]);
  });

  it("handles extraction failure: content empty, warning added, pipeline can proceed", async () => {
    mockReadDocument.mockRejectedValueOnce(new Error("pdf-parse blew up"));
    const r = await enrichFileContent([{ path: "/uploads/broken.pdf" }]);
    expect(r.files).toEqual([{ path: "/uploads/broken.pdf", content: "" }]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("/uploads/broken.pdf");
    expect(r.warnings[0]).toContain("pdf-parse blew up");
  });

  it("processes a mix of extractable and pass-through files", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "pdf1", format: "pdf" });
    mockReadDocument.mockResolvedValueOnce({ text: "doc1", format: "docx" });
    const r = await enrichFileContent([
      { path: "/u/a.pdf" },
      { path: "/u/b.xlsx" },
      { path: "/u/c.docx" },
    ]);
    expect(r.files).toEqual([
      { path: "/u/a.pdf", content: "pdf1" },
      { path: "/u/b.xlsx" },
      { path: "/u/c.docx", content: "doc1" },
    ]);
  });

  it("is case-insensitive on extensions", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "upper", format: "pdf" });
    const r = await enrichFileContent([{ path: "/uploads/SPEC.PDF" }]);
    expect(mockReadDocument).toHaveBeenCalledWith("/uploads/SPEC.PDF");
    expect(r.files[0].content).toBe("upper");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReadDocument, mockReadExcelFile, mockReadFile } = vi.hoisted(() => ({
  mockReadDocument: vi.fn(),
  mockReadExcelFile: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock("@/lib/io/document-reader", () => ({
  readDocument: mockReadDocument,
}));

vi.mock("@/lib/io/excel-reader", () => ({
  readExcelFile: mockReadExcelFile,
}));

vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
}));

import { enrichFileContent } from "@/coordinator/intake-file-loader";

beforeEach(() => {
  mockReadDocument.mockReset();
  mockReadExcelFile.mockReset();
  mockReadFile.mockReset();
});

describe("enrichFileContent", () => {
  it("returns empty when no files provided", async () => {
    const r = await enrichFileContent(undefined);
    expect(r.files).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(mockReadDocument).not.toHaveBeenCalled();
    expect(mockReadExcelFile).not.toHaveBeenCalled();
  });

  it("populates content for PDF files", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "PDF body text", format: "pdf", warnings: [] });
    const r = await enrichFileContent([{ path: "/uploads/spec.pdf", filename: "spec.pdf" }]);
    expect(mockReadDocument).toHaveBeenCalledWith("/uploads/spec.pdf");
    expect(r.files).toEqual([{ path: "/uploads/spec.pdf", content: "PDF body text" }]);
    expect(r.warnings).toEqual([]);
  });

  it("populates content for DOCX files", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "DOCX paragraph", format: "docx", warnings: [] });
    const r = await enrichFileContent([{ path: "/uploads/rfp.docx" }]);
    expect(mockReadDocument).toHaveBeenCalledWith("/uploads/rfp.docx");
    expect(r.files[0].content).toBe("DOCX paragraph");
  });

  it("populates content for XLSX files by flattening sheets", async () => {
    mockReadExcelFile.mockReturnValueOnce({
      fileName: "boq.xlsx",
      sheetNames: ["BoQ", "Notes"],
      sheets: {
        BoQ: [
          ["SKU", "Description", "Qty", "Unit Price"],
          ["C9300-24P", "Switch", "10", "5000"],
          ["", "", "", ""],
          ["C9300-48P", "Switch", "2", "7500"],
        ],
        Notes: [["Reviewed by", "DA"]],
      },
    });
    const r = await enrichFileContent([{ path: "/uploads/boq.xlsx" }]);
    expect(mockReadExcelFile).toHaveBeenCalledWith("/uploads/boq.xlsx");
    expect(mockReadDocument).not.toHaveBeenCalled();
    const content = r.files[0].content ?? "";
    expect(content).toContain("--- Sheet: BoQ ---");
    expect(content).toContain("--- Sheet: Notes ---");
    expect(content).toContain("SKU\tDescription\tQty\tUnit Price");
    expect(content).toContain("C9300-24P\tSwitch\t10\t5000");
    expect(content).toContain("Reviewed by\tDA");
    // Empty row should be filtered out.
    expect(content).not.toMatch(/\n\n\n/);
    expect(r.warnings).toEqual([]);
  });

  it("populates content for XLS files", async () => {
    mockReadExcelFile.mockReturnValueOnce({
      fileName: "legacy.xls",
      sheetNames: ["Sheet1"],
      sheets: { Sheet1: [["a", "b"]] },
    });
    const r = await enrichFileContent([{ path: "/uploads/legacy.xls" }]);
    expect(mockReadExcelFile).toHaveBeenCalledWith("/uploads/legacy.xls");
    expect(r.files[0].content).toContain("--- Sheet: Sheet1 ---");
    expect(r.files[0].content).toContain("a\tb");
  });

  it("populates content for CSV files via fs/promises readFile utf8", async () => {
    mockReadFile.mockResolvedValueOnce("sku,qty\nC9300,10\n");
    const r = await enrichFileContent([{ path: "/uploads/list.csv" }]);
    expect(mockReadFile).toHaveBeenCalledWith("/uploads/list.csv", "utf8");
    expect(r.files[0].content).toBe("sku,qty\nC9300,10\n");
  });

  it("records warning and empty content when XLSX read throws", async () => {
    mockReadExcelFile.mockImplementationOnce(() => {
      throw new Error("xlsx parse failed");
    });
    const r = await enrichFileContent([{ path: "/uploads/broken.xlsx" }]);
    expect(r.files).toEqual([{ path: "/uploads/broken.xlsx", content: "" }]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("/uploads/broken.xlsx");
    expect(r.warnings[0]).toContain("xlsx parse failed");
  });

  it("records warning and empty content when CSV read throws", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    const r = await enrichFileContent([{ path: "/uploads/missing.csv" }]);
    expect(r.files).toEqual([{ path: "/uploads/missing.csv", content: "" }]);
    expect(r.warnings[0]).toContain("/uploads/missing.csv");
    expect(r.warnings[0]).toContain("ENOENT");
  });

  it("leaves truly unsupported extensions (dwg) without content", async () => {
    const r = await enrichFileContent([{ path: "/uploads/plan.dwg" }]);
    expect(mockReadDocument).not.toHaveBeenCalled();
    expect(mockReadExcelFile).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(r.files).toEqual([{ path: "/uploads/plan.dwg" }]);
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

  it("processes a mix of file types in one call", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "pdf1", format: "pdf", warnings: [] });
    mockReadExcelFile.mockReturnValueOnce({
      fileName: "b.xlsx",
      sheetNames: ["S"],
      sheets: { S: [["x", "y"]] },
    });
    mockReadDocument.mockResolvedValueOnce({ text: "doc1", format: "docx", warnings: [] });
    const r = await enrichFileContent([
      { path: "/u/a.pdf" },
      { path: "/u/b.xlsx" },
      { path: "/u/c.docx" },
    ]);
    expect(r.files[0]).toEqual({ path: "/u/a.pdf", content: "pdf1" });
    expect(r.files[1].path).toBe("/u/b.xlsx");
    expect(r.files[1].content).toContain("--- Sheet: S ---");
    expect(r.files[1].content).toContain("x\ty");
    expect(r.files[2]).toEqual({ path: "/u/c.docx", content: "doc1" });
  });

  it("is case-insensitive on extensions", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "upper", format: "pdf", warnings: [] });
    const r = await enrichFileContent([{ path: "/uploads/SPEC.PDF" }]);
    expect(mockReadDocument).toHaveBeenCalledWith("/uploads/SPEC.PDF");
    expect(r.files[0].content).toBe("upper");
  });

  it("propagates documentType from UploadedFile to LoadedFile across all branches", async () => {
    mockReadDocument.mockResolvedValueOnce({ text: "pdf", format: "pdf", warnings: [] });
    mockReadExcelFile.mockReturnValueOnce({
      fileName: "boq.xlsx",
      sheetNames: ["S"],
      sheets: { S: [["a"]] },
    });
    mockReadFile.mockResolvedValueOnce("sku,qty");
    const r = await enrichFileContent([
      { path: "/u/spec.pdf", documentType: "rfp" },
      { path: "/u/client.xlsx", documentType: "boq" },
      { path: "/u/list.csv", documentType: "bom" },
      { path: "/u/plan.dwg", documentType: "other" },
    ]);
    expect(r.files[0].documentType).toBe("rfp");
    expect(r.files[1].documentType).toBe("boq");
    expect(r.files[2].documentType).toBe("bom");
    expect(r.files[3].documentType).toBe("other");
  });

  it("propagates documentType even when extraction fails", async () => {
    mockReadExcelFile.mockImplementationOnce(() => {
      throw new Error("xlsx parse failed");
    });
    const r = await enrichFileContent([
      { path: "/u/broken.xlsx", documentType: "boq" },
    ]);
    expect(r.files[0].documentType).toBe("boq");
    expect(r.files[0].content).toBe("");
  });
});

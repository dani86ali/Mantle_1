import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { parseBomFromUploadedFiles } from "@/coordinator/intake-to-e2";

const FIXTURE_DIR = resolve(__dirname, "../fixtures/boq");

describe("parseBomFromUploadedFiles", () => {
  it("returns [] when no files supplied", async () => {
    expect(await parseBomFromUploadedFiles(undefined)).toEqual([]);
    expect(await parseBomFromUploadedFiles([])).toEqual([]);
  });

  it("ignores files without xlsx/xls/csv extension", async () => {
    expect(
      await parseBomFromUploadedFiles([
        { filename: "rfp.pdf", path: "/uploads/rfp.pdf" },
        { filename: "notes.txt", path: "/uploads/notes.txt" },
      ]),
    ).toEqual([]);
  });

  it("parses a real Aramco XLSX BoQ into { sku, quantity } lines", async () => {
    const lines = await parseBomFromUploadedFiles([
      {
        filename: "Aramco_4203079088.xlsx",
        path: resolve(FIXTURE_DIR, "Aramco_4203079088.xlsx"),
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ sku: "CS-DESKPRO-K9", quantity: 2 });
  });

  it("falls back gracefully (empty array) on a missing file path", async () => {
    const lines = await parseBomFromUploadedFiles([
      { filename: "boq.xlsx", path: resolve(FIXTURE_DIR, "does-not-exist.xlsx") },
    ]);
    expect(lines).toEqual([]);
  });

  it("derives extension from path when filename is absent", async () => {
    const lines = await parseBomFromUploadedFiles([
      { path: resolve(FIXTURE_DIR, "Aramco_4203079088.xlsx") },
    ]);
    expect(lines.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import {
  parseBomFromUploadedFiles,
  parseBomText,
} from "@/coordinator/intake-to-e2";

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

describe("parseBomText", () => {
  it("returns [] for empty input", () => {
    expect(parseBomText("")).toEqual([]);
    expect(parseBomText("   \n\n   ")).toEqual([]);
  });

  it("parses 'SKU qty' (space-separated)", () => {
    expect(parseBomText("C9300-48P-A 4")).toEqual([
      { sku: "C9300-48P-A", quantity: 4 },
    ]);
  });

  it("parses 'SKU,qty' (comma-separated)", () => {
    expect(parseBomText("C9300-48P-A,4")).toEqual([
      { sku: "C9300-48P-A", quantity: 4 },
    ]);
  });

  it("parses 'SKU\\tqty' (tab-separated)", () => {
    expect(parseBomText("C9300-48P-A\t4")).toEqual([
      { sku: "C9300-48P-A", quantity: 4 },
    ]);
  });

  it("defaults quantity to 1 when missing or invalid", () => {
    expect(parseBomText("C9300-48P-A")).toEqual([
      { sku: "C9300-48P-A", quantity: 1 },
    ]);
    expect(parseBomText("C9300-48P-A,abc")).toEqual([
      { sku: "C9300-48P-A", quantity: 1 },
    ]);
  });

  it("parses multi-line mixed input and skips blank lines", () => {
    const text = "C9300-48P-A 2\n\nC9500-24Y4C,1\nAIR-AP9120-K9\t3";
    expect(parseBomText(text)).toEqual([
      { sku: "C9300-48P-A", quantity: 2 },
      { sku: "C9500-24Y4C", quantity: 1 },
      { sku: "AIR-AP9120-K9", quantity: 3 },
    ]);
  });
});

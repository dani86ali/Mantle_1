import { describe, it, expect } from "vitest";
import * as evidence from "@/lib/projects/evidence";
import {
  calculateEvidenceRetainUntil,
  materializeProjectEvidenceItem,
  type MaterializeProjectEvidenceItemInput,
} from "@/lib/projects/evidence";

describe("calculateEvidenceRetainUntil", () => {
  it("returns extractedAt + 1 year", () => {
    const extractedAt = new Date("2026-05-21T08:00:00.000Z");
    const retainUntil = calculateEvidenceRetainUntil(extractedAt);
    expect(retainUntil.toISOString()).toBe("2027-05-21T08:00:00.000Z");
  });

  it("does not mutate the input Date", () => {
    const extractedAt = new Date("2026-05-21T08:00:00.000Z");
    const before = extractedAt.getTime();
    calculateEvidenceRetainUntil(extractedAt);
    expect(extractedAt.getTime()).toBe(before);
  });
});

describe("materializeProjectEvidenceItem", () => {
  const base: MaterializeProjectEvidenceItemInput = {
    projectId: "proj-1",
    tenantId: "tenant-1",
    sourceFileId: "file-1",
    kind: "boq_summary",
    content: { lineCount: 42 },
  };

  it("defaults extractedAt when omitted", () => {
    const before = Date.now();
    const record = materializeProjectEvidenceItem(base);
    const after = Date.now();
    expect(record.extractedAt).toBeInstanceOf(Date);
    expect(record.extractedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(record.extractedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("sets retainUntil as extractedAt + 1 year", () => {
    const extractedAt = new Date("2026-05-21T08:00:00.000Z");
    const record = materializeProjectEvidenceItem({ ...base, extractedAt });
    expect(record.extractedAt.getTime()).toBe(extractedAt.getTime());
    expect(record.retainUntil).toEqual(calculateEvidenceRetainUntil(extractedAt));
    expect(record.retainUntil.toISOString()).toBe("2027-05-21T08:00:00.000Z");
  });

  it("preserves projectId, tenantId, sourceFileId, kind, and content", () => {
    const record = materializeProjectEvidenceItem(base);
    expect(record.projectId).toBe("proj-1");
    expect(record.tenantId).toBe("tenant-1");
    expect(record.sourceFileId).toBe("file-1");
    expect(record.kind).toBe("boq_summary");
    expect(record.content).toEqual({ lineCount: 42 });
  });

  it("omits the id field (DB-generated)", () => {
    const record = materializeProjectEvidenceItem(base) as unknown as Record<
      string,
      unknown
    >;
    expect("id" in record).toBe(false);
  });

  it("does not mutate its input object", () => {
    const input: MaterializeProjectEvidenceItemInput = {
      ...base,
      content: { lineCount: 42 },
    };
    const snapshot = structuredClone(input);
    materializeProjectEvidenceItem(input);
    expect(input).toEqual(snapshot);
  });

  it("copies content so later caller mutation does not alter the returned row", () => {
    const content: Record<string, unknown> = { lineCount: 42 };
    const record = materializeProjectEvidenceItem({ ...base, content });
    content.lineCount = 999;
    content.added = true;
    expect(record.content).toEqual({ lineCount: 42 });
  });
});

describe("module surface", () => {
  it("does not expose parser/BoQ/artifact functions", () => {
    expect(Object.keys(evidence).sort()).toEqual(
      ["calculateEvidenceRetainUntil", "materializeProjectEvidenceItem"].sort()
    );
  });
});

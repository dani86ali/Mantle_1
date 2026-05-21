import { describe, it, expect } from "vitest";
import {
  calculateRetainUntil,
  materializeProjectFileRecord,
  type MaterializeProjectFileRecordInput,
} from "@/lib/projects/files";

describe("calculateRetainUntil", () => {
  it("returns uploadedAt + 1 year", () => {
    const uploadedAt = new Date("2026-05-21T08:00:00.000Z");
    const retainUntil = calculateRetainUntil(uploadedAt);
    expect(retainUntil.toISOString()).toBe("2027-05-21T08:00:00.000Z");
  });

  it("does not mutate the input Date", () => {
    const uploadedAt = new Date("2026-05-21T08:00:00.000Z");
    const before = uploadedAt.getTime();
    calculateRetainUntil(uploadedAt);
    expect(uploadedAt.getTime()).toBe(before);
  });
});

describe("materializeProjectFileRecord", () => {
  const base: MaterializeProjectFileRecordInput = {
    projectId: "proj-1",
    tenantId: "tenant-1",
    fileRole: "boq",
    fileName: "EnergyTech_BoQ.xlsx",
    storagePath: "s3://bucket/proj-1/EnergyTech_BoQ.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 20480,
  };

  it("defaults uploadedAt when omitted", () => {
    const before = Date.now();
    const record = materializeProjectFileRecord(base);
    const after = Date.now();
    expect(record.uploadedAt).toBeInstanceOf(Date);
    expect(record.uploadedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(record.uploadedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("sets retainUntil from uploadedAt", () => {
    const uploadedAt = new Date("2026-05-21T08:00:00.000Z");
    const record = materializeProjectFileRecord({ ...base, uploadedAt });
    expect(record.uploadedAt.getTime()).toBe(uploadedAt.getTime());
    expect(record.retainUntil).toEqual(calculateRetainUntil(uploadedAt));
    expect(record.retainUntil.toISOString()).toBe("2027-05-21T08:00:00.000Z");
  });

  it("preserves fileRole, fileName, storagePath, mimeType, and sizeBytes", () => {
    const record = materializeProjectFileRecord(base);
    expect(record.projectId).toBe("proj-1");
    expect(record.tenantId).toBe("tenant-1");
    expect(record.fileRole).toBe("boq");
    expect(record.fileName).toBe("EnergyTech_BoQ.xlsx");
    expect(record.storagePath).toBe("s3://bucket/proj-1/EnergyTech_BoQ.xlsx");
    expect(record.mimeType).toBe(base.mimeType);
    expect(record.sizeBytes).toBe(20480);
  });

  it("omits optional fields that were not provided", () => {
    const record = materializeProjectFileRecord({
      projectId: "proj-1",
      tenantId: "tenant-1",
      fileRole: "rfp",
      fileName: "rfp.pdf",
      storagePath: "s3://bucket/proj-1/rfp.pdf",
    });
    expect("mimeType" in record).toBe(false);
    expect("sizeBytes" in record).toBe(false);
  });

  it("does not include file content/blob data", () => {
    const record = materializeProjectFileRecord(base) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of ["content", "blob", "buffer", "bytes", "data", "file"]) {
      expect(forbidden in record).toBe(false);
    }
  });

  it("does not mutate its input object", () => {
    const input: MaterializeProjectFileRecordInput = { ...base };
    const snapshot = structuredClone(input);
    materializeProjectFileRecord(input);
    expect(input).toEqual(snapshot);
  });
});

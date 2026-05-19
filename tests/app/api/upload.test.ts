import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

import { POST } from "@/app/api/upload/route";
import { NextRequest } from "next/server";

function mockFile(name: string, content = "x", type = "application/octet-stream"): File {
  return new File([content], name, { type });
}

function multipartReq(form: FormData): NextRequest {
  return {
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-type"
          ? "multipart/form-data; boundary=x"
          : null,
    },
    cookies: { get: (_k: string) => undefined },
    formData: async () => form,
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockWriteFile.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/upload — explicit document types", () => {
  it("accepts a types[] array parallel-indexed with files and stamps documentType per entry", async () => {
    const form = new FormData();
    form.append("files", mockFile("client-boq.xlsx"));
    form.append("files", mockFile("rfp.docx"));
    form.append("files", mockFile("compliance.pdf"));
    form.append("types", JSON.stringify(["boq", "rfp", "compliance"]));

    const res = await POST(multipartReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.files).toHaveLength(3);
    expect(body.files[0].filename).toBe("client-boq.xlsx");
    expect(body.files[0].documentType).toBe("boq");
    expect(body.files[1].filename).toBe("rfp.docx");
    expect(body.files[1].documentType).toBe("rfp");
    expect(body.files[2].filename).toBe("compliance.pdf");
    expect(body.files[2].documentType).toBe("compliance");
    expect(body.warnings).toBeUndefined();
    expect(typeof body.intakeId).toBe("string");
    expect(body.intakeId.length).toBeGreaterThan(0);
  });

  it("defaults to 'other' and returns a warning when types[] is missing", async () => {
    const form = new FormData();
    form.append("files", mockFile("anything.xlsx"));

    const res = await POST(multipartReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.files[0].documentType).toBe("other");
    expect(body.warnings).toBeDefined();
    expect(body.warnings[0]).toMatch(/types/);
  });

  it("defaults to 'other' for every file when types[] length does not match", async () => {
    const form = new FormData();
    form.append("files", mockFile("a.pdf"));
    form.append("files", mockFile("b.pdf"));
    form.append("types", JSON.stringify(["boq"]));

    const res = await POST(multipartReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.files).toHaveLength(2);
    expect(body.files[0].documentType).toBe("other");
    expect(body.files[1].documentType).toBe("other");
    expect(body.warnings[0]).toMatch(/did not match/);
  });

  it("defaults to 'other' when types[] contains an invalid value", async () => {
    const form = new FormData();
    form.append("files", mockFile("a.pdf"));
    form.append("types", JSON.stringify(["bogus_type"]));

    const res = await POST(multipartReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.files[0].documentType).toBe("other");
    expect(body.warnings[0]).toMatch(/validation/);
  });

  it("rejects when no files are provided", async () => {
    const form = new FormData();
    const res = await POST(multipartReq(form));
    expect(res.status).toBe(400);
  });
});

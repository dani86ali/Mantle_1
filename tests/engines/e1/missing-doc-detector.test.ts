import { describe, it, expect } from "vitest";
import {
  extractReferences,
  classifySeverity,
  detectMissingDocuments,
} from "@/engines/e1/missing-doc-detector";

describe("extractReferences — Group 1: internal cross-refs (MD-001)", () => {
  it("detects 'refer to Annex A'", () => {
    const refs = extractReferences("Please refer to Annex A for details.", "doc.pdf");
    expect(refs).toHaveLength(1);
    expect(refs[0].ref).toBe("Annex A");
    expect(refs[0].pattern).toBe("internal_cross_ref");
    expect(refs[0].normalized).toBe("annexa");
  });

  it("detects 'see Schedule 1'", () => {
    const refs = extractReferences("See Schedule 1 for pricing terms.", "doc.pdf");
    expect(refs).toHaveLength(1);
    expect(refs[0].ref).toMatch(/Schedule 1/i);
    expect(refs[0].pattern).toBe("internal_cross_ref");
  });

  it("detects 'in accordance with Appendix B'", () => {
    const refs = extractReferences("In accordance with Appendix B of this document.", "doc.pdf");
    expect(refs[0].pattern).toBe("internal_cross_ref");
    expect(refs[0].ref).toMatch(/Appendix B/i);
  });

  it("detects 'as per Attachment C'", () => {
    const refs = extractReferences("As per Attachment C, the following applies.", "doc.pdf");
    expect(refs[0].pattern).toBe("internal_cross_ref");
    expect(refs[0].ref).toMatch(/Attachment C/i);
  });
});

describe("extractReferences — Group 2: all 6 Aramco standards (MD-002)", () => {
  it("detects all 6 Aramco standard patterns in one text", () => {
    const text =
      "Comply with SACS-002, SAES-A-030, SAEP-14, GI-0002.100, CAP-001, and SAMSS-051.";
    const refs = extractReferences(text, "requirements.pdf");
    const aramcoRefs = refs.filter((r) => r.pattern === "aramco_standard");
    expect(aramcoRefs).toHaveLength(6);
    const detected = aramcoRefs.map((r) => r.ref);
    expect(detected).toContain("SACS-002");
    expect(detected).toContain("SAES-A-030");
    expect(detected).toContain("SAEP-14");
    expect(detected).toContain("GI-0002.100");
    expect(detected).toContain("CAP-001");
    expect(detected).toContain("SAMSS-051");
  });
});

describe("extractReferences — Group 3: external standards (MD-003)", () => {
  it("detects ISO 27001:2022", () => {
    const refs = extractReferences("Comply with ISO 27001:2022 requirements.", "doc.pdf");
    expect(refs[0].pattern).toBe("external_standard");
    expect(refs[0].ref).toMatch(/ISO 27001/i);
  });

  it("detects NIST SP 800-53", () => {
    const refs = extractReferences("See NIST SP 800-53 for controls.", "doc.pdf");
    expect(refs[0].pattern).toBe("external_standard");
    expect(refs[0].ref).toMatch(/NIST/i);
  });

  it("detects NCA ECC", () => {
    const refs = extractReferences("Must comply with NCA ECC standards.", "doc.pdf");
    expect(refs[0].pattern).toBe("external_standard");
    expect(refs[0].ref).toBe("NCA ECC");
  });

  it("detects NFPA 72", () => {
    const refs = extractReferences("Fire system per NFPA 72.", "doc.pdf");
    expect(refs[0].pattern).toBe("external_standard");
  });

  it("detects API 570", () => {
    const refs = extractReferences("Piping per API 570.", "doc.pdf");
    expect(refs[0].pattern).toBe("external_standard");
  });
});

describe("extractReferences — Group 4: generic references (MD-004)", () => {
  it("detects 'the attached'", () => {
    const refs = extractReferences("Please review the attached document.", "doc.pdf");
    expect(refs[0].pattern).toBe("generic");
  });

  it("detects 'as defined in'", () => {
    const refs = extractReferences("As defined in the scope document.", "doc.pdf");
    expect(refs[0].pattern).toBe("generic");
  });

  it("detects 'pursuant to'", () => {
    const refs = extractReferences("Pursuant to the requirements herein.", "doc.pdf");
    expect(refs[0].pattern).toBe("generic");
  });
});

describe("classifySeverity (MD-005)", () => {
  it("SACS → critical", () => {
    expect(classifySeverity({ ref: "SACS-002", normalized: "sacs002", pattern: "aramco_standard" })).toBe("critical");
  });

  it("SAES → critical", () => {
    expect(classifySeverity({ ref: "SAES-A-030", normalized: "saesa030", pattern: "aramco_standard" })).toBe("critical");
  });

  it("CAP → critical", () => {
    expect(classifySeverity({ ref: "CAP-001", normalized: "cap001", pattern: "aramco_standard" })).toBe("critical");
  });

  it("SAEP → high", () => {
    expect(classifySeverity({ ref: "SAEP-14", normalized: "saep14", pattern: "aramco_standard" })).toBe("high");
  });

  it("GI → high", () => {
    expect(classifySeverity({ ref: "GI-0002.100", normalized: "gi0002100", pattern: "aramco_standard" })).toBe("high");
  });

  it("SAMSS → high", () => {
    expect(classifySeverity({ ref: "SAMSS-051", normalized: "samss051", pattern: "aramco_standard" })).toBe("high");
  });

  it("Annex internal cross-ref → critical", () => {
    expect(classifySeverity({ ref: "Annex A", normalized: "annexa", pattern: "internal_cross_ref" })).toBe("critical");
  });

  it("Appendix internal cross-ref → critical", () => {
    expect(classifySeverity({ ref: "Appendix B", normalized: "appendixb", pattern: "internal_cross_ref" })).toBe("critical");
  });

  it("Schedule internal cross-ref → high", () => {
    expect(classifySeverity({ ref: "Schedule 1", normalized: "schedule1", pattern: "internal_cross_ref" })).toBe("high");
  });

  it("Attachment internal cross-ref → high", () => {
    expect(classifySeverity({ ref: "Attachment C", normalized: "attachmentc", pattern: "internal_cross_ref" })).toBe("high");
  });

  it("ISO external standard → medium", () => {
    expect(classifySeverity({ ref: "ISO 27001:2022", normalized: "iso270012022", pattern: "external_standard" })).toBe("medium");
  });

  it("NIST external standard → medium", () => {
    expect(classifySeverity({ ref: "NIST SP 800-53", normalized: "nistsp80053", pattern: "external_standard" })).toBe("medium");
  });

  it("NCA ECC external standard → medium", () => {
    expect(classifySeverity({ ref: "NCA ECC", normalized: "ncaecc", pattern: "external_standard" })).toBe("medium");
  });

  it("generic reference → low", () => {
    expect(classifySeverity({ ref: "the attached", normalized: "theattached", pattern: "generic" })).toBe("low");
  });
});

describe("detectMissingDocuments (MD-006)", () => {
  it("SACS-002 reference + no matching file = 1 critical missing document", () => {
    const files = [{ filename: "requirements.pdf" }, { filename: "terms.pdf" }];
    const text = new Map([["requirements.pdf", "Vendor shall comply with SACS-002 standards."]]);
    const missing = detectMissingDocuments(files, text);
    expect(missing).toHaveLength(1);
    expect(missing[0].referencedDoc).toBe("SACS-002");
    expect(missing[0].severity).toBe("critical");
    expect(missing[0].referencedIn).toBe("requirements.pdf");
    expect(missing[0].pattern).toBe("aramco_standard");
  });

  it("Annex A reference + Annex_A.pdf present = not flagged", () => {
    const files = [{ filename: "requirements.pdf" }, { filename: "Annex_A.pdf" }];
    const text = new Map([["requirements.pdf", "Please refer to Annex A for the detailed scope."]]);
    const missing = detectMissingDocuments(files, text);
    expect(missing).toHaveLength(0);
  });

  it("Annex A reference + no matching file = flagged as critical (double-sided check)", () => {
    const files = [{ filename: "requirements.pdf" }];
    const text = new Map([["requirements.pdf", "Please refer to Annex A for the detailed scope."]]);
    const missing = detectMissingDocuments(files, text);
    expect(missing).toHaveLength(1);
    expect(missing[0].referencedDoc).toBe("Annex A");
    expect(missing[0].severity).toBe("critical");
  });

  it("ISO reference + no matching file = medium severity missing document", () => {
    const files = [{ filename: "requirements.pdf" }];
    const text = new Map([["requirements.pdf", "Must comply with ISO 27001:2022 standard."]]);
    const missing = detectMissingDocuments(files, text);
    const isoMissing = missing.find((m) => m.referencedDoc.includes("ISO"));
    expect(isoMissing).toBeDefined();
    expect(isoMissing?.severity).toBe("medium");
  });

  it("generic reference + no matching file = low severity", () => {
    const files = [{ filename: "requirements.pdf" }];
    const text = new Map([["requirements.pdf", "Please review the attached document for details."]]);
    const missing = detectMissingDocuments(files, text);
    expect(missing[0].severity).toBe("low");
  });

  it("mixed references — Annex A present, SACS-002 and ISO missing", () => {
    const files = [{ filename: "Annex_A.pdf" }, { filename: "scope.pdf" }];
    const text = new Map([
      ["scope.pdf", "Refer to Annex A for scope. Comply with SACS-002. See ISO 27001 for security."],
    ]);
    const missing = detectMissingDocuments(files, text);
    expect(missing.some((m) => m.referencedDoc === "SACS-002")).toBe(true);
    expect(missing.some((m) => m.referencedDoc.includes("ISO"))).toBe(true);
    expect(missing.every((m) => m.referencedDoc !== "Annex A")).toBe(true);
  });

  it("empty extractedText returns no missing documents", () => {
    const files = [{ filename: "doc.pdf" }];
    const missing = detectMissingDocuments(files, new Map());
    expect(missing).toHaveLength(0);
  });

  it("empty classifiedFiles with references = all flagged missing", () => {
    const text = new Map([["scope.pdf", "Comply with SACS-002 and CAP-001."]]);
    const missing = detectMissingDocuments([], text);
    expect(missing).toHaveLength(2);
    expect(missing.every((m) => m.severity === "critical")).toBe(true);
  });
});

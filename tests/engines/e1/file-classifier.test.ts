import { describe, it, expect } from "vitest";
import {
  classifyFile,
  detectFileFormat,
  matchFilenamePatterns,
  matchFolderPatterns,
  scanContentKeywords,
} from "@/engines/e1/file-classifier";

describe("matchFilenamePatterns — 10 rules (FC-001)", () => {
  it("Rule 1: compliance/cybersecurity_standard — SACS-3 filename", () => {
    const r = matchFilenamePatterns("SACS-3_Network_Security.pdf");
    expect(r.type).toBe("compliance");
    expect(r.subtype).toBe("cybersecurity_standard");
    expect(r.confidence).toBe(0.9);
    expect(r.stage).toBe(1);
  });

  it("Rule 1: compliance/cybersecurity_standard — SAES_B variant", () => {
    const r = matchFilenamePatterns("SAES_B_Electrical_Standard.pdf");
    expect(r.type).toBe("compliance");
    expect(r.subtype).toBe("cybersecurity_standard");
  });

  it("Rule 2: commercial/boq_template — BOQ in filename", () => {
    const r = matchFilenamePatterns("Project_BOQ_v2.xlsx");
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("boq_template");
    expect(r.confidence).toBe(0.9);
  });

  it("Rule 3: legal/nda — NDA in filename", () => {
    const r = matchFilenamePatterns("Vendor_NDA_2024.pdf");
    expect(r.type).toBe("legal");
    expect(r.subtype).toBe("nda");
  });

  it("Rule 4: legal/bid_bond — Bid_Bond in filename", () => {
    const r = matchFilenamePatterns("Bid_Bond_Form.pdf");
    expect(r.type).toBe("legal");
    expect(r.subtype).toBe("bid_bond");
  });

  it("Rule 5: administrative/certificate — ZATCA in filename", () => {
    const r = matchFilenamePatterns("ZATCA_Registration_2024.pdf");
    expect(r.type).toBe("administrative");
    expect(r.subtype).toBe("certificate");
  });

  it("Rule 6: commercial/evaluation_criteria — evaluation in filename", () => {
    const r = matchFilenamePatterns("Vendor_Evaluation_Criteria.xlsx");
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("evaluation_criteria");
  });

  it("Rule 7: legal/terms — T&C in filename", () => {
    const r = matchFilenamePatterns("T&C_Contract.pdf");
    expect(r.type).toBe("legal");
    expect(r.subtype).toBe("terms");
  });

  it("Rule 8: technical/requirements — SOW in filename", () => {
    const r = matchFilenamePatterns("Project_SOW_v1.docx");
    expect(r.type).toBe("technical");
    expect(r.subtype).toBe("requirements");
  });

  it("Rule 9: technical/engineering_drawing — .dwg extension", () => {
    const r = matchFilenamePatterns("Network_Riser_Diagram.dwg");
    expect(r.type).toBe("technical");
    expect(r.subtype).toBe("engineering_drawing");
  });

  it("Rule 10: compliance/local_content — IKTVA in filename", () => {
    const r = matchFilenamePatterns("IKTVA_Commitment_Form.pdf");
    expect(r.type).toBe("compliance");
    expect(r.subtype).toBe("local_content");
  });

  it("no match — returns unknown with confidence 0.0 at stage 1", () => {
    const r = matchFilenamePatterns("random_document.pdf");
    expect(r.type).toBe("unknown");
    expect(r.confidence).toBe(0.0);
    expect(r.stage).toBe(1);
  });
});

describe("matchFolderPatterns — 5 rules (FC-002)", () => {
  it("Rule 1: technical/requirements — RFP folder", () => {
    const r = matchFolderPatterns("RFP Documents");
    expect(r.type).toBe("technical");
    expect(r.subtype).toBe("requirements");
    expect(r.confidence).toBe(0.75);
    expect(r.stage).toBe(2);
  });

  it("Rule 2: commercial/boq_template — BOQ folder", () => {
    const r = matchFolderPatterns("BOQ");
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("boq_template");
  });

  it("Rule 3: legal/general — Legal folder", () => {
    const r = matchFolderPatterns("Legal");
    expect(r.type).toBe("legal");
    expect(r.subtype).toBe("general");
  });

  it("Rule 4: compliance/general — Compliance folder", () => {
    const r = matchFolderPatterns("Compliance");
    expect(r.type).toBe("compliance");
    expect(r.subtype).toBe("general");
  });

  it("Rule 5: administrative/certificate — Certificates folder", () => {
    const r = matchFolderPatterns("Certificates");
    expect(r.type).toBe("administrative");
    expect(r.subtype).toBe("certificate");
  });

  it("no match — returns unknown with confidence 0.0 at stage 2", () => {
    const r = matchFolderPatterns("Miscellaneous");
    expect(r.type).toBe("unknown");
    expect(r.confidence).toBe(0.0);
    expect(r.stage).toBe(2);
  });
});

describe("scanContentKeywords — 5 categories (FC-003)", () => {
  it("Category 1: technical/requirements — compliance language", () => {
    const r = scanContentKeywords(
      "Vendors shall comply with all requirements. Failure to submit will be disqualified. Mandatory forms attached."
    );
    expect(r.type).toBe("technical");
    expect(r.subtype).toBe("requirements");
    expect(r.confidence).toBe(0.6);
    expect(r.stage).toBe(3);
  });

  it("Category 2: commercial/pricing — pricing language", () => {
    const r = scanContentKeywords(
      "Unit price must be stated in SAR. Total price includes all taxes. QTY and amount to be confirmed."
    );
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("pricing");
  });

  it("Category 3: legal/general — contract language", () => {
    const r = scanContentKeywords(
      "Whereas the parties hereby agrees to indemnify each other. Liability and jurisdiction clauses apply."
    );
    expect(r.type).toBe("legal");
    expect(r.subtype).toBe("general");
  });

  it("Category 4: compliance/general — cybersecurity language", () => {
    const r = scanContentKeywords(
      "Cybersecurity controls include access control and encryption. NCA and ISO 27001 compliance required. Vulnerability scanning mandatory."
    );
    expect(r.type).toBe("compliance");
    expect(r.subtype).toBe("general");
  });

  it("Category 5: administrative/certificate — registration language", () => {
    const r = scanContentKeywords(
      "Authorized signatory must sign. Chamber of commerce and registration number required."
    );
    expect(r.type).toBe("administrative");
    expect(r.subtype).toBe("certificate");
  });

  it("no keywords — returns unknown with confidence 0.3 and needsReview true", () => {
    const r = scanContentKeywords("Lorem ipsum dolor sit amet.");
    expect(r.type).toBe("unknown");
    expect(r.confidence).toBe(0.3);
    expect(r.needsReview).toBe(true);
  });
});

describe("classifyFile — cascade logic (FC-004)", () => {
  it("stage 1 match exits early — folder and content are not consulted", () => {
    const r = classifyFile("Project_BOQ.xlsx", "Miscellaneous", "lorem ipsum");
    expect(r.type).toBe("commercial");
    expect(r.stage).toBe(1);
  });

  it("stage 2 fallback — filename no match, folder matches", () => {
    const r = classifyFile("random_file.pdf", "Legal", "lorem ipsum");
    expect(r.type).toBe("legal");
    expect(r.stage).toBe(2);
    expect(r.format).toBe("pdf");
  });

  it("stage 3 fallback — filename and folder no match, content keywords match", () => {
    const r = classifyFile(
      "random_file.pdf",
      "Miscellaneous",
      "Unit price in SAR. Total price and amount confirmed."
    );
    expect(r.type).toBe("commercial");
    expect(r.stage).toBe(3);
    expect(r.format).toBe("pdf");
  });
});

describe("classifyFile — spreadsheet normalization to boq_template (FC-004b)", () => {
  it("spreadsheet + pricing keywords → subtype boq_template at 0.6 (no needsReview)", () => {
    const r = classifyFile(
      "Aramco_4203079088.xlsx",
      "Misc",
      "Unit Price\tQty\tAmount\tSAR\nC9300-24P\t10\t5000"
    );
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("boq_template");
    expect(r.confidence).toBe(0.6);
    expect(r.stage).toBe(3);
    expect(r.format).toBe("xlsx");
    expect(r.needsReview).toBeUndefined();
  });

  it("spreadsheet with no keywords → subtype boq_template at 0.4 with needsReview", () => {
    const r = classifyFile("Aramco_4203079088.xlsx", "Misc", "C9300-24P\t10\t5000");
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("boq_template");
    expect(r.confidence).toBe(0.4);
    expect(r.needsReview).toBe(true);
  });

  it("non-spreadsheet with pricing keywords → stays commercial/pricing", () => {
    const r = classifyFile(
      "ProposalNotes.pdf",
      "Misc",
      "Unit price must be stated in SAR. Total price includes all taxes. QTY and amount to be confirmed."
    );
    expect(r.type).toBe("commercial");
    expect(r.subtype).toBe("pricing");
  });

  it("spreadsheet with legal keywords → stays legal (not promoted to BoQ)", () => {
    const r = classifyFile(
      "data.xlsx",
      "Misc",
      "Whereas the parties hereby agrees to indemnify each other. Liability and jurisdiction clauses apply."
    );
    expect(r.type).toBe("legal");
  });
});

describe("classifyFile — needsReview flag (FC-005)", () => {
  it("sets needsReview when all three stages fail", () => {
    const r = classifyFile("random_file.pdf", "Miscellaneous", "lorem ipsum dolor");
    expect(r.needsReview).toBe(true);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("does NOT set needsReview when stage 1 matches", () => {
    const r = classifyFile("Project_NDA.pdf", "Miscellaneous");
    expect(r.needsReview).toBeUndefined();
    expect(r.confidence).toBe(0.9);
  });

  it("does NOT set needsReview when stage 3 matches with sufficient keywords", () => {
    const r = classifyFile(
      "random_file.pdf",
      "Miscellaneous",
      "cybersecurity access control encryption NCA ISO 27001 vulnerability"
    );
    expect(r.needsReview).toBeUndefined();
    expect(r.confidence).toBe(0.6);
  });
});

describe("detectFileFormat (FC-006)", () => {
  it("detects pdf", () => expect(detectFileFormat("doc.pdf")).toBe("pdf"));
  it("detects docx", () => expect(detectFileFormat("doc.docx")).toBe("docx"));
  it("maps .doc → docx", () => expect(detectFileFormat("doc.doc")).toBe("docx"));
  it("detects xlsx", () => expect(detectFileFormat("data.xlsx")).toBe("xlsx"));
  it("maps .xls → xlsx", () => expect(detectFileFormat("data.xls")).toBe("xlsx"));
  it("detects dwg", () => expect(detectFileFormat("plan.dwg")).toBe("dwg"));
  it("detects msg", () => expect(detectFileFormat("email.msg")).toBe("msg"));
  it("detects vsdx", () => expect(detectFileFormat("diagram.vsdx")).toBe("vsdx"));
  it("returns unknown for unrecognized extension", () => expect(detectFileFormat("file.txt")).toBe("unknown"));
  it("returns unknown for no extension", () => expect(detectFileFormat("noextension")).toBe("unknown"));
});

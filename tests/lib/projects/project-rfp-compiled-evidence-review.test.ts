import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  compileCompiledEvidenceReview,
  type CompileCompiledEvidenceReviewInput,
  type CompiledEvidenceTableInput,
  type CompiledEvidenceTextInput,
} from "@/lib/projects/project-rfp-compiled-evidence-review";

const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

function textInput(
  overrides: Partial<CompiledEvidenceTextInput> = {}
): CompiledEvidenceTextInput {
  return {
    evidenceId: "txt-ev",
    evidenceKind: TEXT_KIND,
    sourceFileId: "file-uuid-aaa",
    inputPackageArtifactId: "pkg-uuid-bbb",
    sourceFileName: "RFP.pdf",
    sourceFileRole: "rfp",
    chunkIndex: 0,
    chunkCount: 1,
    charCount: 24,
    text: "Some requirement text.",
    ...overrides,
  };
}

function tableInput(
  overrides: Partial<CompiledEvidenceTableInput> = {}
): CompiledEvidenceTableInput {
  return {
    evidenceId: "tbl-ev",
    evidenceKind: TABLE_KIND,
    sourceFileId: "file-uuid-ccc",
    inputPackageArtifactId: "pkg-uuid-bbb",
    sourceFileName: "BoQ.xlsx",
    sourceFileRole: "boq",
    tableId: "file-uuid-ccc:table:7",
    sheetName: "Pricing",
    pageNumber: 3,
    rowCount: 2,
    columnCount: 2,
    rows: [
      ["SKU", "Qty"],
      ["C9300", "5"],
    ],
    ...overrides,
  };
}

function compile(input: CompileCompiledEvidenceReviewInput) {
  return compileCompiledEvidenceReview(input);
}

describe("compileCompiledEvidenceReview - text grouping", () => {
  it("groups chunks of one document, role, and topic into a single finding in source order", () => {
    const review = compile({
      deterministicEvidence: [
        textInput({
          evidenceId: "t1",
          chunkIndex: 0,
          chunkCount: 2,
          text: "First clause about SLA.",
        }),
        textInput({
          evidenceId: "t2",
          chunkIndex: 1,
          chunkCount: 2,
          text: "Second clause about uptime.",
        }),
      ],
    });

    expect(review.findings).toHaveLength(1);
    const finding = review.findings[0];
    expect(finding.kind).toBe("text");
    expect(finding.title).toBe("RFP.pdf");
    expect(finding.documentName).toBe("RFP.pdf");
    expect(finding.role).toBe("rfp");
    expect(finding.body).toBe(
      "First clause about SLA.\n\nSecond clause about uptime."
    );
    expect(finding.citations).toEqual([
      { passageLabel: "Passage 1 of 2" },
      { passageLabel: "Passage 2 of 2" },
    ]);
    expect(review.accounting.textFindingCount).toBe(1);
    expect(review.accounting.accountedInPrimaryCount).toBe(2);
    expect(review.accounting.balanced).toBe(true);
  });

  it("splits findings when the topic differs even within one document and role", () => {
    const review = compile({
      deterministicEvidence: [
        textInput({ evidenceId: "t1", topic: "Networking", text: "Network rule." }),
        textInput({ evidenceId: "t2", topic: "Security", text: "Security rule." }),
      ],
    });

    expect(review.findings).toHaveLength(2);
    expect(review.findings[0].title).toBe("Networking");
    expect(review.findings[1].title).toBe("Security");
    expect(review.findings[0].audit).toHaveLength(1);
    expect(review.findings[1].audit).toHaveLength(1);
  });

  it("retains the raw chunk locator only in the finding audit array, one entry per input", () => {
    const review = compile({
      deterministicEvidence: [
        textInput({ evidenceId: "t1", chunkIndex: 0, chunkCount: 3, text: "Alpha." }),
        textInput({ evidenceId: "t2", chunkIndex: 1, chunkCount: 3, text: "Beta." }),
      ],
    });

    const finding = review.findings[0];
    expect(finding.audit).toEqual([
      {
        evidenceId: "t1",
        evidenceKind: TEXT_KIND,
        sourceFileId: "file-uuid-aaa",
        inputPackageArtifactId: "pkg-uuid-bbb",
        chunkIndex: 0,
        chunkCount: 3,
        charCount: 24,
      },
      {
        evidenceId: "t2",
        evidenceKind: TEXT_KIND,
        sourceFileId: "file-uuid-aaa",
        inputPackageArtifactId: "pkg-uuid-bbb",
        chunkIndex: 1,
        chunkCount: 3,
        charCount: 24,
      },
    ]);
  });
});

describe("compileCompiledEvidenceReview - suppression and accounting", () => {
  const LONG_BODY =
    "The supplier shall guarantee ninety nine point nine percent availability across all core network devices.";

  it("suppresses extraction noise into the audit and balances every deterministic input exactly once", () => {
    const review = compile({
      deterministicEvidence: [
        textInput({ evidenceId: "k1", text: "Contractor shall provide redundant power feeds." }),
        textInput({ evidenceId: "s1", text: "   " }),
        textInput({ evidenceId: "s2", text: "----" }),
        textInput({ evidenceId: "s3", text: "Page 12" }),
        textInput({ evidenceId: "s4", text: "   7   " }),
        textInput({ evidenceId: "s5", text: "CONFIDENTIAL - Do not distribute." }),
        textInput({ evidenceId: "s6", text: "fi" }),
        textInput({ evidenceId: "k2", text: LONG_BODY }),
        textInput({ evidenceId: "s7", text: LONG_BODY }),
        textInput({ evidenceId: "k3", text: "Section 4 Requirements" }),
        textInput({ evidenceId: "s8", text: "Section 4 Requirements" }),
      ],
    });

    // The three kept bodies share document + role + topic, so one finding.
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].audit).toHaveLength(3);

    expect(review.suppressed).toHaveLength(8);
    expect(review.accounting.suppressedByReason).toEqual({
      empty_fragment: 2,
      tiny_fragment: 1,
      duplicate_body: 1,
      page_only: 2,
      proprietary_notice: 1,
      repeated_header: 1,
    });
    expect(review.accounting.deterministicInputCount).toBe(11);
    expect(review.accounting.accountedInPrimaryCount).toBe(3);
    expect(review.accounting.suppressedCount).toBe(8);
    expect(review.accounting.balanced).toBe(true);
    expect(
      review.accounting.accountedInPrimaryCount +
        review.accounting.suppressedCount
    ).toBe(review.accounting.deterministicInputCount);

    const pageOnly = review.suppressed.find((entry) => entry.audit.evidenceId === "s3");
    expect(pageOnly?.reason).toBe("page_only");
    expect(pageOnly?.preview).toBe("Page 12");
    expect(pageOnly?.audit.chunkIndex).toBe(0);
  });
});

describe("compileCompiledEvidenceReview - tables", () => {
  it("renders a table as a readable finding and keeps raw ids and chunk out of primary fields", () => {
    const review = compile({
      deterministicEvidence: [
        textInput({ evidenceId: "t1", text: "Requirement clause." }),
        tableInput({ evidenceId: "tbl-ev-1" }),
      ],
    });

    expect(review.findings).toHaveLength(2);
    const table = review.findings[1];
    expect(table.kind).toBe("table");
    expect(table.title).toBe("Table - Pricing");
    expect(table.citations).toEqual([
      { tableLabel: "Table 1", pageLabel: "Page 3", sheetLabel: "Sheet: Pricing" },
    ]);
    expect(table.table).toEqual({
      rows: [
        ["SKU", "Qty"],
        ["C9300", "5"],
      ],
    });
    expect(table.flags).toEqual({
      tableRepaired: false,
      aiRefined: false,
      missingFromDeterministic: false,
    });
    expect(table.audit[0].tableId).toBe("file-uuid-ccc:table:7");

    // Display fields (everything except the audit array) must hide raw ids.
    const displayOnly = review.findings.map(({ audit, ...rest }) => rest);
    const serialized = JSON.stringify(displayOnly);
    for (const raw of [
      "tbl-ev-1",
      "file-uuid-ccc:table:7",
      "file-uuid-aaa",
      "file-uuid-ccc",
      "pkg-uuid-bbb",
      "chunk",
    ]) {
      expect(serialized).not.toContain(raw);
    }
  });

  it("does not leak the table id into the finding even when the raw id is in audit", () => {
    const review = compile({ deterministicEvidence: [tableInput({ evidenceId: "x" })] });
    const audit = JSON.stringify(review.findings[0].audit);
    expect(audit).toContain("file-uuid-ccc:table:7");
    expect(review.findings[0].title).not.toContain("file-uuid-ccc");
  });
});

describe("compileCompiledEvidenceReview - refinement and missing candidates", () => {
  it("marks a caller-provided repaired table as a primary finding flagged tableRepaired and aiRefined", () => {
    const review = compile({
      deterministicEvidence: [
        tableInput({
          evidenceId: "tbl-ev-1",
          rows: [
            ["A", "B"],
            ["1", "2"],
          ],
        }),
      ],
      refinement: {
        repairedTables: [
          {
            evidenceId: "tbl-ev-1",
            rows: [
              ["A", "B"],
              ["1", "2 (repaired)"],
            ],
          },
        ],
      },
    });

    expect(review.findings).toHaveLength(1);
    const table = review.findings[0];
    expect(table.flags).toEqual({
      tableRepaired: true,
      aiRefined: true,
      missingFromDeterministic: false,
    });
    expect(table.table?.rows[1][1]).toBe("2 (repaired)");
    // The deterministic table is still accounted for in the audit.
    expect(table.audit[0].evidenceId).toBe("tbl-ev-1");
    expect(review.accounting.repairedTableFindingCount).toBe(1);
    expect(review.accounting.accountedInPrimaryCount).toBe(1);
    expect(review.accounting.balanced).toBe(true);
  });

  it("emits an unmatched repaired table as a proposal-only finding with empty deterministic audit", () => {
    const review = compile({
      deterministicEvidence: [],
      refinement: {
        repairedTables: [
          { evidenceId: "ghost", sourceFileName: "R.pdf", rows: [["x"]] },
        ],
      },
    });

    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].flags.tableRepaired).toBe(true);
    expect(review.findings[0].flags.aiRefined).toBe(true);
    expect(review.findings[0].audit).toEqual([]);
    expect(review.accounting.repairedTableFindingCount).toBe(1);
    expect(review.accounting.deterministicInputCount).toBe(0);
    expect(review.accounting.accountedInPrimaryCount).toBe(0);
    expect(review.accounting.balanced).toBe(true);
  });

  it("adds missing candidates as proposal-only findings flagged missingFromDeterministic and aiRefined", () => {
    const review = compile({
      deterministicEvidence: [textInput({ evidenceId: "t1", text: "Kept clause." })],
      missingCandidates: [
        {
          candidateId: "c1",
          title: "Missing SLA evidence",
          description: "RFP section 4 requires an SLA.",
          sourceFileName: "RFP.pdf",
          sourceFileRole: "rfp",
          passageLabel: "Section 4",
        },
      ],
    });

    expect(review.findings).toHaveLength(2);
    const missing = review.findings[1];
    expect(missing.kind).toBe("text");
    expect(missing.title).toBe("Missing SLA evidence");
    expect(missing.body).toBe("RFP section 4 requires an SLA.");
    expect(missing.citations).toEqual([{ passageLabel: "Section 4" }]);
    expect(missing.flags).toEqual({
      tableRepaired: false,
      aiRefined: true,
      missingFromDeterministic: true,
    });
    expect(missing.audit).toEqual([]);
    expect(review.accounting.missingCandidateFindingCount).toBe(1);
    // The missing proposal does not change the deterministic balance.
    expect(review.accounting.deterministicInputCount).toBe(1);
    expect(review.accounting.accountedInPrimaryCount).toBe(1);
    expect(review.accounting.balanced).toBe(true);
  });
});

describe("compileCompiledEvidenceReview - purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compiled-evidence-review.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compiled-evidence-review.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("has no runtime imports or requires", () => {
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toContain("require(");
  });

  it("uses no clock or randomness so it stays deterministic", () => {
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("new Date");
    expect(source).not.toContain("Math.random");
  });

  it("keeps the source and test files ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });
});

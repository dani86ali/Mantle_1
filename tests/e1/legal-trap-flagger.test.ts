import { describe, it, expect } from "vitest";
import { flagLegalTraps, extractDeadlines } from "@/engines/e1/legal-trap-flagger";

describe("flagLegalTraps", () => {
  describe("Category 1 — disqualification (critical)", () => {
    it("flags bid bond language as critical", () => {
      const flags = flagLegalTraps(
        "A bid bond is required for all bidders participating in this tender.",
        "T&C §3.2"
      );
      const flag = flags.find((f) => f.pattern === "bid-financial-guarantee");
      expect(flag).toBeDefined();
      expect(flag?.category).toBe("disqualification");
      expect(flag?.severity).toBe("critical");
      expect(flag?.source).toBe("T&C §3.2");
    });

    it("flags cause-for-disqualification language as critical", () => {
      const flags = flagLegalTraps(
        "FAILURE TO ATTEND THE JOB EXPLANATION MEETING SHALL BE CAUSE FOR DISQUALIFICATION.",
        "SIB Section 5"
      );
      const flag = flags.find((f) => f.pattern === "cause-for-disqualification");
      expect(flag).toBeDefined();
      expect(flag?.severity).toBe("critical");
    });

    it("flags submission deadline language as critical", () => {
      const flags = flagLegalTraps(
        "The closing date for submission of bids is 15-March-2026.",
        "GIB §2"
      );
      expect(flags.some((f) => f.pattern === "submission-deadline")).toBe(true);
      expect(flags.find((f) => f.pattern === "submission-deadline")?.severity).toBe("critical");
    });

    it("flags sealed envelope format requirement as critical", () => {
      const flags = flagLegalTraps(
        "Proposals must be submitted in a sealed envelope clearly marked with the bid reference.",
        "SIB §4"
      );
      expect(flags.some((f) => f.pattern === "sealed-hardcopy-format")).toBe(true);
    });

    it("flags automatic disqualification language as critical", () => {
      const flags = flagLegalTraps(
        "Any bid including commercial information in the Technical Proposal will be automatically disqualified.",
        "SIB §3"
      );
      expect(flags.some((f) => f.pattern === "automatic-disqualification")).toBe(true);
    });
  });

  describe("Category 2 — discretionary (high)", () => {
    it("flags experience requirements as high", () => {
      const flags = flagLegalTraps(
        "Vendors must demonstrate minimum 5 years experience in similar projects.",
        "Tech Specs §4"
      );
      const flag = flags.find((f) => f.pattern === "experience-requirement");
      expect(flag).toBeDefined();
      expect(flag?.category).toBe("discretionary");
      expect(flag?.severity).toBe("high");
    });

    it("flags audited financial statements as high", () => {
      const flags = flagLegalTraps(
        "Bidders must provide audited financial statements for the last three fiscal years.",
        "GIB §3"
      );
      const flag = flags.find((f) => f.pattern === "financial-requirement");
      expect(flag).toBeDefined();
      expect(flag?.severity).toBe("high");
    });

    it("flags incomplete submission language as high", () => {
      const flags = flagLegalTraps(
        "Any incomplete submission may be rejected; the client reserves the right to disqualify.",
        "SIB §2"
      );
      expect(flags.some((f) => f.pattern === "incomplete-submission")).toBe(true);
    });

    it("flags minimum score threshold as high", () => {
      const flags = flagLegalTraps(
        "The minimum score required to pass the technical evaluation is 70 points.",
        "Evaluation Criteria §1"
      );
      expect(flags.some((f) => f.pattern === "minimum-score-threshold")).toBe(true);
    });

    it("flags 'shall not be accepted' language as high", () => {
      const flags = flagLegalTraps(
        "Bids received after the deadline shall not be accepted under any circumstances.",
        "GIB §5"
      );
      expect(flags.some((f) => f.pattern === "shall-not-be-accepted")).toBe(true);
    });
  });

  describe("Category 3 — breach (medium)", () => {
    it("flags IP ownership as medium", () => {
      const flags = flagLegalTraps(
        "All intellectual property developed under this agreement shall become property of the client.",
        "Schedule A §8"
      );
      const flag = flags.find((f) => f.pattern === "ip-ownership");
      expect(flag).toBeDefined();
      expect(flag?.category).toBe("breach");
      expect(flag?.severity).toBe("medium");
    });

    it("flags liquidated damages clause as medium", () => {
      const flags = flagLegalTraps(
        "Liquidated damages of 0.5% per week will apply, not to exceed 10% SAR of the contract value.",
        "Schedule H §5"
      );
      const flag = flags.find((f) => f.pattern === "liquidated-damages");
      expect(flag).toBeDefined();
      expect(flag?.severity).toBe("medium");
    });

    it("flags material breach language as medium", () => {
      const flags = flagLegalTraps(
        "Failure to obtain the CCC within 90 days shall constitute a material breach of contract.",
        "Schedule X §3"
      );
      expect(flags.some((f) => f.pattern === "material-breach")).toBe(true);
    });

    it("flags right to terminate as medium", () => {
      const flags = flagLegalTraps(
        "SAUDI ARAMCO reserves the right to terminate this agreement for any reason.",
        "Schedule A §12"
      );
      expect(flags.some((f) => f.pattern === "right-to-terminate")).toBe(true);
    });

    it("flags professional indemnity insurance as medium", () => {
      const flags = flagLegalTraps(
        "Professional indemnity insurance with a minimum coverage of 10 million SAR is required.",
        "Schedule H §7"
      );
      expect(flags.some((f) => f.pattern === "insurance-requirement")).toBe(true);
    });
  });

  describe("no-risk text → empty array", () => {
    it("returns empty array for generic technical text", () => {
      const flags = flagLegalTraps(
        "The vendor shall provide 24x7 technical support. The solution should integrate with existing infrastructure. Performance benchmarks will be validated during acceptance testing.",
        "Tech Specs"
      );
      expect(flags).toHaveLength(0);
    });

    it("returns empty array for empty string", () => {
      expect(flagLegalTraps("", "source")).toHaveLength(0);
    });
  });
});

describe("extractDeadlines", () => {
  it("extracts closing date with time and timezone", () => {
    const deadlines = extractDeadlines(
      "Bids received after the closing date of 15-March-2026 at 14:00 AST will not be considered.",
      "T&C Section 3.2"
    );
    expect(deadlines.length).toBeGreaterThanOrEqual(1);
    expect(deadlines[0].event).toBe("closing date");
    expect(deadlines[0].deadline).toBe("15-March-2026 at 14:00 AST");
    expect(deadlines[0].source).toBe("T&C Section 3.2");
  });

  it("extracts submission deadline with date", () => {
    const deadlines = extractDeadlines(
      "The submission deadline is 30-April-2026 for all bidders.",
      "GIB §2"
    );
    expect(deadlines.length).toBeGreaterThanOrEqual(1);
    expect(deadlines[0].event).toBe("submission deadline");
    expect(deadlines[0].deadline).toBe("30-April-2026");
  });

  it("extracts bid validity period", () => {
    const deadlines = extractDeadlines(
      "The bid validity period expires on 15-June-2026.",
      "SIB §6"
    );
    expect(deadlines.length).toBeGreaterThanOrEqual(1);
    expect(deadlines[0].event).toBe("bid validity");
  });

  it("returns empty array when no deadline keywords present", () => {
    const deadlines = extractDeadlines(
      "The vendor shall provide technical support and documentation.",
      "Tech Specs"
    );
    expect(deadlines).toHaveLength(0);
  });

  it("returns empty array when deadline keyword has no adjacent date", () => {
    const deadlines = extractDeadlines(
      "The closing date will be communicated separately.",
      "GIB §2"
    );
    expect(deadlines).toHaveLength(0);
  });
});

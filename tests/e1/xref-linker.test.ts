import { describe, it, expect } from "vitest";
import { linkToTPSection } from "@/engines/e1/xref-linker";

// --- Task-specified test cases ---

describe("linkToTPSection — security requirement → §10", () => {
  it("maps 'access control' requirement to §10", () => {
    const result = linkToTPSection("Vendor shall implement access control for all administrative interfaces.");
    expect(result.section).toBe("§10");
    expect(result.sectionName).toBe("Security");
  });

  it("maps encryption requirement to §10", () => {
    const result = linkToTPSection("All data at rest shall use AES-256 encryption.");
    expect(result.section).toBe("§10");
  });

  it("maps cybersecurity requirement to §10", () => {
    const result = linkToTPSection("The solution must comply with cybersecurity hardening guidelines.");
    expect(result.section).toBe("§10");
  });

  it("maps firewall requirement to §10", () => {
    const result = linkToTPSection("Vendor shall install and configure a next-generation firewall.");
    expect(result.section).toBe("§10");
  });

  it("security wins over support when both keywords present", () => {
    // 'security support' should still go to §10, not §8
    const result = linkToTPSection("Vendor shall provide 24x7 security support and vulnerability management.");
    expect(result.section).toBe("§10");
  });
});

describe("linkToTPSection — SLA requirement → §8", () => {
  it("maps SLA requirement to §8", () => {
    const result = linkToTPSection("Vendor shall maintain a 4-hour response SLA for critical incidents.");
    expect(result.section).toBe("§8");
    expect(result.sectionName).toBe("SLA / Support");
  });

  it("maps uptime requirement to §8", () => {
    const result = linkToTPSection("The proposed solution shall achieve 99.9% uptime.");
    expect(result.section).toBe("§8");
  });

  it("maps warranty requirement to §8", () => {
    const result = linkToTPSection("All hardware shall carry a minimum 3-year warranty.");
    expect(result.section).toBe("§8");
  });

  it("maps maintenance requirement to §8", () => {
    const result = linkToTPSection("Vendor shall provide annual preventive maintenance.");
    expect(result.section).toBe("§8");
  });

  it("maps availability requirement to §8", () => {
    const result = linkToTPSection("The system shall ensure high availability with no single point of failure.");
    expect(result.section).toBe("§8");
  });
});

describe("linkToTPSection — default → §6", () => {
  it("generic technical requirement defaults to §6", () => {
    const result = linkToTPSection("Vendor shall provide a 48-port Layer 3 switch with 10GbE uplinks.");
    expect(result.section).toBe("§6");
    expect(result.sectionName).toBe("Proposed Solution");
  });

  it("design/architecture requirement maps to §6 (default catch-all)", () => {
    const result = linkToTPSection("Proposed network topology shall include redundant core switches.");
    expect(result.section).toBe("§6");
  });

  it("hardware specification defaults to §6", () => {
    const result = linkToTPSection("All servers shall be rack-mounted with dual power supplies.");
    expect(result.section).toBe("§6");
  });
});

describe("linkToTPSection — payment → commercial", () => {
  it("maps payment terms to commercial", () => {
    const result = linkToTPSection("Payment terms shall be net 30 days from invoice date.");
    expect(result.section).toBe("commercial");
    expect(result.sectionName).toBe("Commercial Proposal (not in TP)");
  });

  it("maps pricing requirement to commercial", () => {
    const result = linkToTPSection("Vendor shall provide unit pricing for all line items in the BoQ.");
    expect(result.section).toBe("commercial");
  });

  it("maps billing requirement to commercial", () => {
    const result = linkToTPSection("Billing shall be milestone-based upon delivery acceptance.");
    expect(result.section).toBe("commercial");
  });
});

describe("linkToTPSection — compliance/standards → §9", () => {
  it("maps ISO 27001 compliance requirement to §9", () => {
    const result = linkToTPSection("The solution shall be certified against ISO 27001:2022.");
    expect(result.section).toBe("§9");
  });

  it("maps NCA ECC compliance requirement to §9", () => {
    const result = linkToTPSection("Vendor shall demonstrate compliance with NCA ECC controls.");
    expect(result.section).toBe("§9");
  });

  it("maps IKTVA/local content requirement to §9", () => {
    const result = linkToTPSection("Vendor shall meet the minimum IKTVA score of 30%.");
    expect(result.section).toBe("§9");
  });

  it("maps Saudization requirement to §9", () => {
    const result = linkToTPSection("Saudization ratio shall not fall below 25% at any time.");
    expect(result.section).toBe("§9");
  });
});

describe("linkToTPSection — implementation/training → §7", () => {
  it("maps implementation timeline to §7", () => {
    const result = linkToTPSection("Vendor shall complete implementation within 90 days of contract award.");
    expect(result.section).toBe("§7");
  });

  it("maps training requirement to §7", () => {
    const result = linkToTPSection("Vendor shall provide two weeks of on-site training for system administrators.");
    expect(result.section).toBe("§7");
  });

  it("maps knowledge transfer requirement to §7", () => {
    const result = linkToTPSection("Knowledge transfer sessions shall be conducted before project handover.");
    expect(result.section).toBe("§7");
  });
});

describe("linkToTPSection — experience/references → §15", () => {
  it("maps experience requirement to §15", () => {
    const result = linkToTPSection("Vendor shall demonstrate minimum 5 years of experience in similar projects.");
    expect(result.section).toBe("§15");
  });

  it("maps reference requirement to §15", () => {
    const result = linkToTPSection("Vendor shall provide at least three customer reference letters.");
    expect(result.section).toBe("§15");
  });
});

describe("linkToTPSection — Zod schema validation", () => {
  it("result always has section and sectionName strings", () => {
    const texts = [
      "Vendor shall provide support.",
      "Payment terms are net 30.",
      "Some random text with no keywords.",
    ];
    for (const text of texts) {
      const result = linkToTPSection(text);
      expect(typeof result.section).toBe("string");
      expect(typeof result.sectionName).toBe("string");
      expect(result.section.length).toBeGreaterThan(0);
      expect(result.sectionName.length).toBeGreaterThan(0);
    }
  });
});

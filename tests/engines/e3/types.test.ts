import { describe, it, expect } from "vitest";
import { PROPOSAL_SECTIONS } from "@/engines/e3/types";

describe("PROPOSAL_SECTIONS", () => {
  it("has 15 entries (ids 0-14)", () => {
    expect(PROPOSAL_SECTIONS).toHaveLength(15);
  });

  it("contains every id from 0 to 14 exactly once", () => {
    const ids = PROPOSAL_SECTIONS.map((s) => s.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("each section has id, title, slug, generationMethod populated", () => {
    for (const s of PROPOSAL_SECTIONS) {
      expect(typeof s.id).toBe("number");
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.slug.length).toBeGreaterThan(0);
      expect(["deterministic", "ai", "semi"]).toContain(s.generationMethod);
    }
  });

  it("has 10 deterministic sections", () => {
    const count = PROPOSAL_SECTIONS.filter((s) => s.generationMethod === "deterministic").length;
    expect(count).toBe(10);
  });

  it("has 3 ai sections", () => {
    const count = PROPOSAL_SECTIONS.filter((s) => s.generationMethod === "ai").length;
    expect(count).toBe(3);
  });

  it("has 2 semi sections", () => {
    const count = PROPOSAL_SECTIONS.filter((s) => s.generationMethod === "semi").length;
    expect(count).toBe(2);
  });

  it("maps the playbook §6.1 slugs to the correct method", () => {
    const bySlug = Object.fromEntries(PROPOSAL_SECTIONS.map((s) => [s.slug, s.generationMethod]));
    expect(bySlug["cover_page"]).toBe("deterministic");
    expect(bySlug["cover_letter"]).toBe("ai");
    expect(bySlug["executive_summary"]).toBe("ai");
    expect(bySlug["requirements"]).toBe("deterministic");
    expect(bySlug["proposed_solution"]).toBe("ai");
    expect(bySlug["technical_specs"]).toBe("deterministic");
    expect(bySlug["implementation"]).toBe("semi");
    expect(bySlug["service_levels"]).toBe("deterministic");
    expect(bySlug["commercial"]).toBe("deterministic");
    expect(bySlug["scope_assumptions"]).toBe("semi");
    expect(bySlug["compliance_matrix"]).toBe("deterministic");
    expect(bySlug["references"]).toBe("deterministic");
    expect(bySlug["company_profile"]).toBe("deterministic");
    expect(bySlug["appendices"]).toBe("deterministic");
    expect(bySlug["signature_page"]).toBe("deterministic");
  });
});

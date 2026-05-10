import { describe, it, expect } from "vitest";
import { loadFixture } from "./loader";

describe("loadFixture('aramco-storage')", () => {
  it("loads without throwing", () => {
    expect(() => loadFixture("aramco-storage")).not.toThrow();
  });

  it("has correct opportunityId", () => {
    expect(loadFixture("aramco-storage").opportunityId).toBe("OP-2025-154381");
  });

  it("has correct projectType", () => {
    expect(loadFixture("aramco-storage").projectType).toBe("hpc");
  });

  it("has correct mode", () => {
    expect(loadFixture("aramco-storage").mode).toBe("rfp");
  });

  it("has correct sector", () => {
    expect(loadFixture("aramco-storage").sector).toBe("oil_and_gas");
  });

  it("has correct country", () => {
    expect(loadFixture("aramco-storage").country).toBe("SA");
  });

  it("contains all required fields", () => {
    const fixture = loadFixture("aramco-storage");
    expect(fixture).toMatchObject({
      opportunityId: expect.any(String),
      projectType: expect.any(String),
      mode: expect.any(String),
      sector: expect.any(String),
      country: expect.any(String),
    });
  });

  it("throws on unknown fixture name", () => {
    expect(() => loadFixture("does-not-exist")).toThrow();
  });
});

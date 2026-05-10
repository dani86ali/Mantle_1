import { describe, it, expect } from "vitest";
import { normalizeModel } from "@/lib/utils/normalize-model";

describe("normalizeModel", () => {
  it("strips -A from C9300L-24UXG-4X-A", () => {
    expect(normalizeModel("C9300L-24UXG-4X-A")).toBe("C9300L-24UXG-4X");
  });

  it("strips -E from C9120AXE-E", () => {
    expect(normalizeModel("C9120AXE-E")).toBe("C9120AXE");
  });

  it("strips -A from C9300L-48P-4G-A (preserves middle 48P)", () => {
    expect(normalizeModel("C9300L-48P-4G-A")).toBe("C9300L-48P-4G");
  });

  it("strips -A from C9300X-24HX-A", () => {
    expect(normalizeModel("C9300X-24HX-A")).toBe("C9300X-24HX");
  });

  it("does not strip when last segment is multi-char (FG-601F unchanged)", () => {
    expect(normalizeModel("FG-601F")).toBe("FG-601F");
  });

  it("does not strip when last segment is part of base model (C9300L-48P unchanged)", () => {
    expect(normalizeModel("C9300L-48P")).toBe("C9300L-48P");
  });

  it("returns already-clean model unchanged", () => {
    expect(normalizeModel("C9300L-24UXG-4X")).toBe("C9300L-24UXG-4X");
  });

  it("returns empty string unchanged", () => {
    expect(normalizeModel("")).toBe("");
  });

  it("FortiGate-201F-A passes through unchanged", () => {
    expect(normalizeModel("FortiGate-201F-A")).toBe("FortiGate-201F-A");
  });

  it("model with no dashes returns unchanged", () => {
    expect(normalizeModel("C9120AXE")).toBe("C9120AXE");
  });

  it("strips -P (premier) suffix", () => {
    expect(normalizeModel("C9300L-48T-P")).toBe("C9300L-48T");
  });

  it("case-insensitive: -a stripped", () => {
    expect(normalizeModel("C9300L-24UXG-4X-a")).toBe("C9300L-24UXG-4X");
  });
});

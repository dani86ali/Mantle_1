/**
 * Unit tests for the pure catalog-polish transforms.
 *
 * Behavioral expectations on the three exported functions —
 * isolated from the JSON file. Integration assertions over the
 * polished catalog live in cisco-catalog.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  isPlaceholderSku,
  normalizeVendor,
  inferCategory,
  VENDOR_CANONICAL,
} from "./catalog-polish";

describe("isPlaceholderSku", () => {
  it.each([
    ["PM", true],
    ["pm", true],
    ["PS", true],
    ["MRC", true],
    ["OTC", true],
    ["M&S", true],
    ["LOCAL", true],
    ["local", true],
  ])("treats exact placeholder %s as drop=%s", (sku, expected) => {
    expect(isPlaceholderSku(sku, "Cisco", "desc")).toBe(expected);
  });

  it.each([
    "STCS-PM-2024",
    "PM-STCS-CLD",
    "PS-CAB-F",
    "EXC-20-40",
    "TSS-3",
    "TSS3",
    "MS-12345",
    "SVC-99",
  ])("matches placeholder pattern %s", (sku) => {
    expect(isPlaceholderSku(sku, "Cisco", "desc")).toBe(true);
  });

  it("drops SKUs longer than 30 characters", () => {
    expect(isPlaceholderSku("A".repeat(31), "Cisco", "desc")).toBe(true);
    expect(isPlaceholderSku("A".repeat(30), "Cisco", "desc")).toBe(false);
  });

  it("drops SKUs containing whitespace", () => {
    expect(isPlaceholderSku("ABC 123", "Cisco", "desc")).toBe(true);
  });

  it("drops entries where sku equals description (corruption)", () => {
    expect(isPlaceholderSku("identical", "Cisco", "identical")).toBe(true);
  });

  it.each(["Blank", "blank", "", null, undefined])(
    "drops entries where vendor is non-vendor: %s",
    (vendor) => {
      expect(isPlaceholderSku("C9300-48P", vendor, "desc")).toBe(true);
    },
  );

  it("preserves real Cisco-shaped SKUs", () => {
    expect(isPlaceholderSku("C9400-LC-48XS", "Cisco", "desc")).toBe(false);
    expect(isPlaceholderSku("CON-SNT-C9410R", "Cisco", "desc")).toBe(false);
    expect(isPlaceholderSku("C9400-DNA-A-5Y", "Cisco", "desc")).toBe(false);
  });

  it("preserves legitimate SKUs that happen to start with PM (anchored regex)", () => {
    // PM-STCS pattern requires STCS suffix; bare PM-prefix SKUs survive.
    expect(isPlaceholderSku("PMP450-12345", "Cisco", "desc")).toBe(false);
  });
});

describe("normalizeVendor", () => {
  it("returns null for explicit non-vendor strings in the table", () => {
    expect(normalizeVendor("Blank")).toBeNull();
    expect(normalizeVendor("Giza")).toBeNull();
    expect(normalizeVendor("Edwards")).toBeNull();
    expect(normalizeVendor("STC")).toBeNull();
  });

  it("canonicalizes case variants of known vendors", () => {
    expect(normalizeVendor("CISCO")).toBe("Cisco");
    expect(normalizeVendor("cisco")).toBe("Cisco");
    expect(normalizeVendor("FIREEYE")).toBe("FireEye");
    expect(normalizeVendor("MICROSOFT")).toBe("Microsoft");
  });

  it("collapses Palo Alto variants to canonical multi-word form", () => {
    expect(normalizeVendor("PaloAlto")).toBe("Palo Alto Networks");
    expect(normalizeVendor("Palo Alto")).toBe("Palo Alto Networks");
    expect(normalizeVendor("PALO ALTO")).toBe("Palo Alto Networks");
  });

  it("passes unknown vendors through unchanged for caller-side handling", () => {
    expect(normalizeVendor("NewVendor")).toBe("NewVendor");
    expect(normalizeVendor("Hikvision")).toBe("Hikvision");
  });

  it("passes through null/undefined", () => {
    expect(normalizeVendor(null)).toBeNull();
    expect(normalizeVendor(undefined)).toBeNull();
  });

  it("exposes the canonical table for inspection", () => {
    expect(Object.keys(VENDOR_CANONICAL).length).toBeGreaterThan(10);
  });
});

describe("inferCategory", () => {
  it("classifies CON- prefix as service", () => {
    expect(inferCategory("CON-SNT-C9410R", "Smart Net 8x5", "hardware")).toBe(
      "service",
    );
  });

  it("classifies year-suffixed SKUs as subscription before falling to license rules", () => {
    // C9400-DNA-A-5Y would otherwise match the -DNA- license rule.
    expect(
      inferCategory("C9400-DNA-A-5Y", "Cisco Catalyst DNA Advantage 5Y", "subscription"),
    ).toBe("subscription");
  });

  it("classifies -DNA- without year suffix as license", () => {
    expect(inferCategory("C9300-DNA-A", "DNA Advantage", "hardware")).toBe(
      "license",
    );
  });

  it("classifies -PWR- as accessory", () => {
    expect(
      inferCategory("C9400-PWR-2100AC", "2100W AC Power Supply", "hardware"),
    ).toBe("accessory");
  });

  it("classifies C9-family device-shaped SKUs as hardware", () => {
    expect(inferCategory("C9400X-SUP-2XL", "Supervisor Module", "hardware")).toBe(
      "hardware",
    );
    expect(inferCategory("C9400-LC-48XS", "48-port line card", "hardware")).toBe(
      "hardware",
    );
  });

  it("uses description fallback for license when SKU shape is silent", () => {
    expect(inferCategory("VENDOR-ABC", "Perpetual license", "other")).toBe(
      "license",
    );
  });

  it("classifies SmartNet keyword in description as service", () => {
    expect(inferCategory("ANY-SKU", "SmartNet 8x5xNBD", "hardware")).toBe(
      "service",
    );
  });

  it("falls through to current category if it is a known value", () => {
    expect(inferCategory("WEIRDFORMAT", "some thing", "software")).toBe(
      "software",
    );
  });

  it("falls through to 'other' when current is unknown/missing", () => {
    expect(inferCategory("WEIRDFORMAT", "some thing", "unknown")).toBe("other");
    expect(inferCategory("WEIRDFORMAT", "some thing", "")).toBe("other");
  });
});

import { describe, it, expect } from "vitest";
import { selectBoQFilePath, resolveE2Devices, devicesFromComponentList } from "@/coordinator/pipeline-e2";
import type { E1Output } from "@/engines/e1/orchestrator";
import type { E1ClassifiedFile } from "@/engines/e1/orchestrator-types";
import type { ComponentListItem } from "@/engines/e5/types";

function mkClassified(
  overrides: Partial<E1ClassifiedFile> & {
    path: string;
    filename: string;
  },
): E1ClassifiedFile {
  return {
    type: "unknown",
    subtype: "unknown",
    confidence: 0.5,
    stage: 1,
    format: "xlsx",
    ...overrides,
  };
}

function mkE1Output(classified: E1ClassifiedFile[]): E1Output {
  // selectBoQFilePath only reads fileClassifications; the rest is filler to
  // satisfy the E1Output shape. Cast through unknown so we don't have to
  // import every nested type.
  return {
    fileClassifications: classified,
    missingDocuments: [],
    requirements: [],
    riskFlags: [],
    deadlines: [],
    evalCriteria: {
      methodology: "unknown",
      envelopes: [],
      iktvaRequired: false,
      source: "default",
    },
    vendorPreferences: [],
    sectorDetection: {
      sector: "general",
      confidence: 0,
      method: "content_keywords",
      evidence: "",
    },
    frameworks: [],
    complianceMatrix: {} as unknown as E1Output["complianceMatrix"],
    clarifications: {} as unknown as E1Output["clarifications"],
    stats: {
      totalFiles: classified.length,
      totalRequirements: 0,
      mandatoryCount: 0,
      criticalRisks: 0,
    },
  } as E1Output;
}

describe("selectBoQFilePath", () => {
  it("returns undefined when no E1 output is provided", () => {
    expect(selectBoQFilePath(undefined)).toBeUndefined();
  });

  it("returns undefined when fileClassifications is empty", () => {
    expect(selectBoQFilePath(mkE1Output([]))).toBeUndefined();
  });

  it("prefers documentType='boq' over heuristic-only matches", () => {
    const heuristicBoq = mkClassified({
      path: "/u/Project_BOQ.xlsx",
      filename: "Project_BOQ.xlsx",
      type: "commercial",
      subtype: "boq_template",
      confidence: 0.9,
    });
    const explicitBoq = mkClassified({
      path: "/u/Aramco_4203079088.xlsx",
      filename: "Aramco_4203079088.xlsx",
      type: "commercial",
      subtype: "boq_template",
      confidence: 1.0,
      documentType: "boq",
    });
    const e1 = mkE1Output([heuristicBoq, explicitBoq]);
    expect(selectBoQFilePath(e1)).toBe("/u/Aramco_4203079088.xlsx");
  });

  it("multi-XLSX upload: explicit boq wins, unknown XLSX is ignored", () => {
    const explicitBoq = mkClassified({
      path: "/u/client-pricing.xlsx",
      filename: "client-pricing.xlsx",
      type: "commercial",
      subtype: "boq_template",
      confidence: 1.0,
      documentType: "boq",
    });
    const unknownXlsx = mkClassified({
      path: "/u/network-inventory.xlsx",
      filename: "network-inventory.xlsx",
      type: "commercial",
      subtype: "boq_template",
      confidence: 0.4,
      needsReview: true,
    });
    const e1 = mkE1Output([unknownXlsx, explicitBoq]);
    expect(selectBoQFilePath(e1)).toBe("/u/client-pricing.xlsx");
  });

  it("falls back to subtype heuristic when no documentType='boq' is set", () => {
    const heuristicBoq = mkClassified({
      path: "/u/Project_BOQ.xlsx",
      filename: "Project_BOQ.xlsx",
      type: "commercial",
      subtype: "boq_template",
      confidence: 0.9,
    });
    const e1 = mkE1Output([heuristicBoq]);
    expect(selectBoQFilePath(e1)).toBe("/u/Project_BOQ.xlsx");
  });

  it("ignores documentType='boq' on a non-spreadsheet file", () => {
    const pdfMarkedBoq = mkClassified({
      path: "/u/notes.pdf",
      filename: "notes.pdf",
      format: "pdf",
      type: "commercial",
      subtype: "boq_template",
      confidence: 1.0,
      documentType: "boq",
    });
    const e1 = mkE1Output([pdfMarkedBoq]);
    expect(selectBoQFilePath(e1)).toBeUndefined();
  });

  it("returns undefined when no boq-typed and no boq_template subtype match", () => {
    const rfp = mkClassified({
      path: "/u/sow.docx",
      filename: "sow.docx",
      format: "docx",
      type: "technical",
      subtype: "requirements",
      documentType: "rfp",
    });
    expect(selectBoQFilePath(mkE1Output([rfp]))).toBeUndefined();
  });
});

describe("resolveE2Devices — orderableSku threading", () => {
  it("uses orderableSku when set on the ComponentListItem", () => {
    const items: ComponentListItem[] = [{
      model: "C9300-48P",
      orderableSku: "C9300-48P-A",
      vendor: "cisco",
      quantity: 3,
      role: "access",
      fromDesignStep: "sizing-calculator",
    }];
    const devices = resolveE2Devices({ pricingConfig: {} as never }, { componentList: JSON.stringify(items) });
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("C9300-48P-A");
    expect(devices[0].qty).toBe(3);
  });

  it("falls back to bare model when ComponentListItem lacks orderableSku", () => {
    const items: ComponentListItem[] = [{
      model: "C9300-48P",
      vendor: "cisco",
      quantity: 3,
      role: "access",
      fromDesignStep: "sizing-calculator",
    }];
    const devices = resolveE2Devices({ pricingConfig: {} as never }, { componentList: JSON.stringify(items) });
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("C9300-48P");
  });

  it("devicesFromComponentList: parses a minimal component list (rerun fallback shape)", () => {
    // Mirrors the rerun-route fallback path: when intake has no devices but
    // state.artifacts.e5.componentList exists, this helper rebuilds the
    // E2Device list so the operator's rerun can still price.
    const json = JSON.stringify([
      { model: "C9300-48P-A", vendor: "cisco", quantity: 2, role: "access", fromDesignStep: "sizing-calculator" },
    ]);
    const devices = devicesFromComponentList(json);
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("C9300-48P-A");
    expect(devices[0].qty).toBe(2);
    expect(devices[0].config.vendor).toBe("cisco");
  });

  it("devicesFromComponentList: returns [] on malformed JSON", () => {
    expect(devicesFromComponentList("not-json")).toEqual([]);
  });

  it("explicit input.devices take precedence over E5 component list", () => {
    const items: ComponentListItem[] = [{
      model: "C9300-48P",
      orderableSku: "C9300-48P-A",
      vendor: "cisco",
      quantity: 3,
      role: "access",
      fromDesignStep: "sizing-calculator",
    }];
    const explicit = [{ model: "MANUAL-SKU", qty: 1, config: { vendor: "cisco" as const, dnaTier: "advantage" as const, networkTier: "advantage" as const, licenseTerm: 5 as const, supportCriticality: "standard" as const } }];
    const devices = resolveE2Devices({ pricingConfig: {} as never, devices: explicit }, { componentList: JSON.stringify(items) });
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("MANUAL-SKU");
  });
});

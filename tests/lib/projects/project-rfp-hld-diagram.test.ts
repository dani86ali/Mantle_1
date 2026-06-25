import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
  validateRfpHldDiagramDraftPayload,
  isValidRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";

const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";

/** A valid topology diagram draft: 2 nodes, 1 link, 1 zone, 4 source refs. */
function validPayload(): RfpHldDiagramDraftPayload {
  return {
    payloadKind: RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
    createdAt: "2026-06-24T00:00:00.000Z",
    createdBy: "eng-1",
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceReviewArtifactId: REVIEW_ID,
    sourceModelVersion: 2,
    diagramType: "topology",
    title: "HLD Topology Diagram Draft",
    nodes: [
      {
        id: "n1",
        label: "Core Switch",
        nodeType: "switch",
        domain: "campus_switching",
        zoneId: "z1",
        sourceRefIds: ["ref-model"],
      },
      { id: "n2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["ref-model"] },
    ],
    links: [
      {
        id: "l1",
        label: "Uplink",
        fromNodeId: "n1",
        toNodeId: "n2",
        linkType: "ethernet",
        sourceRefIds: ["ref-model"],
      },
    ],
    zones: [{ id: "z1", label: "Campus Core", nodeIds: ["n1"], sourceRefIds: ["ref-bundle"] }],
    sourceReferences: [
      {
        id: "ref-model",
        artifactId: MODEL_ID,
        artifactType: "hld_design_model",
        sourcePath: "hld_design_model:ref-model",
        label: "Model topology reference",
      },
      { id: "ref-bundle", artifactId: MODEL_ID, artifactType: "hld_design_model" },
      { id: "diagram-source-bundle", artifactId: BUNDLE_ID, artifactType: "hld_source_bundle" },
      { id: "diagram-source-review", artifactId: REVIEW_ID, artifactType: "hld_design_model_review" },
    ],
    validationFindings: [],
  };
}

function clone(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateRfpHldDiagramDraftPayload - happy path", () => {
  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND).toBe("rfp_hld_diagram_draft");
  });

  it("accepts a valid topology diagram draft", () => {
    const result = validateRfpHldDiagramDraftPayload(validPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldDiagramDraftPayload(validPayload())).toBe(true);
  });

  it("accepts a draft with advisory warning/suggestion/info findings", () => {
    const p = validPayload();
    p.validationFindings = [
      { id: "vf-1", severity: "warning", code: "sparse_topology", message: "Few nodes.", sourceRefIds: ["ref-model"] },
      { id: "vf-2", severity: "suggestion", code: "label_clarity", message: "Clarify labels.", sourceRefIds: [] },
      { id: "vf-3", severity: "info", code: "draft", message: "Draft for review.", sourceRefIds: [] },
    ];
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid cases
// ---------------------------------------------------------------------------

describe("validateRfpHldDiagramDraftPayload - rejects malformed drafts", () => {
  it("rejects a non-object payload", () => {
    for (const bad of [null, undefined, 1, "x", [], true]) {
      expect(validateRfpHldDiagramDraftPayload(bad).valid).toBe(false);
    }
  });

  it("rejects a wrong payloadKind", () => {
    const p = clone();
    p.payloadKind = "rfp_hld_diagram";
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
  });

  it("rejects sourceArtifactIds in the wrong order", () => {
    const p = clone();
    p.sourceArtifactIds = [BUNDLE_ID, MODEL_ID, REVIEW_ID];
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("sourceArtifactIds"))).toBe(true);
  });

  it("rejects a blank source model id", () => {
    const p = clone();
    p.sourceHldDesignModelArtifactId = "   ";
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
  });

  it("rejects non-distinct source ids", () => {
    const p = clone();
    p.sourceHldSourceBundleArtifactId = MODEL_ID;
    p.sourceArtifactIds = [MODEL_ID, MODEL_ID, REVIEW_ID];
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
  });

  it("rejects a non-integer / non-positive sourceModelVersion", () => {
    for (const v of [0, -1, 1.5, "2", null]) {
      const p = clone();
      p.sourceModelVersion = v as unknown;
      expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
    }
  });

  it("rejects an unsupported diagramType", () => {
    const p = clone();
    p.diagramType = "logical";
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("diagramType"))).toBe(true);
  });

  it("rejects a blank title", () => {
    const p = clone();
    p.title = "   ";
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
  });

  it("rejects an empty nodes array", () => {
    const p = clone();
    p.nodes = [];
    p.links = [];
    p.zones = [];
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("nodes: must not be empty"))).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    const p = clone();
    (p.nodes as Array<Record<string, unknown>>)[1].id = "n1";
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("nodes: duplicate ids"))).toBe(true);
  });

  it("rejects duplicate link ids", () => {
    const p = clone();
    (p.links as Array<Record<string, unknown>>).push({
      id: "l1",
      fromNodeId: "n2",
      toNodeId: "n1",
      linkType: "ethernet",
      sourceRefIds: ["ref-model"],
    });
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("links: duplicate ids"))).toBe(true);
  });

  it("rejects duplicate zone ids", () => {
    const p = clone();
    (p.zones as Array<Record<string, unknown>>).push({
      id: "z1",
      label: "Second",
      nodeIds: ["n2"],
      sourceRefIds: ["ref-bundle"],
    });
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("zones: duplicate ids"))).toBe(true);
  });

  it("rejects an orphan link endpoint", () => {
    const p = clone();
    (p.links as Array<Record<string, unknown>>)[0].toNodeId = "n-missing";
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("toNodeId not in nodes"))).toBe(true);
  });

  it("rejects an orphan zone node id", () => {
    const p = clone();
    (p.zones as Array<Record<string, unknown>>)[0].nodeIds = ["n-missing"];
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("not in nodes"))).toBe(true);
  });

  it("rejects a node zoneId that does not resolve to a zone", () => {
    const p = clone();
    (p.nodes as Array<Record<string, unknown>>)[0].zoneId = "z-missing";
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("zoneId not in zones"))).toBe(true);
  });

  it("rejects a node with no source references", () => {
    const p = clone();
    (p.nodes as Array<Record<string, unknown>>)[0].sourceRefIds = [];
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("must not be empty"))).toBe(true);
  });

  it("rejects a sourceRefId that does not resolve to sourceReferences", () => {
    const p = clone();
    (p.links as Array<Record<string, unknown>>)[0].sourceRefIds = ["ref-nope"];
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("not in sourceReferences"))).toBe(true);
  });

  it("rejects a source reference pointing outside the approved model/bundle/review", () => {
    const p = clone();
    (p.sourceReferences as Array<Record<string, unknown>>)[0].artifactId = "OUTSIDE-ARTIFACT";
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("not one of the approved"))).toBe(true);
  });

  it("rejects a source reference whose artifactType does not match its artifactId role", () => {
    const p = clone();
    (p.sourceReferences as Array<Record<string, unknown>>)[2].artifactType = "hld_design_model";
    const r = validateRfpHldDiagramDraftPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("does not match its artifactId role"))).toBe(true);
  });

  it("rejects an unknown source-reference artifactType", () => {
    const p = clone();
    (p.sourceReferences as Array<Record<string, unknown>>)[0].artifactType = "evidence_package";
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forbidden / final-output / certification content
// ---------------------------------------------------------------------------

describe("validateRfpHldDiagramDraftPayload - rejects forbidden content", () => {
  it("rejects pricing/SKU/catalog/config keys anywhere", () => {
    for (const key of ["sku", "unitPrice", "pricing", "catalogDecision", "configurationDecision"]) {
      const p = clone();
      (p.nodes as Array<Record<string, unknown>>)[0][key] = "X";
      expect(validateRfpHldDiagramDraftPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects raw-document / source-file / storage keys anywhere", () => {
    for (const key of ["rawText", "documentText", "evidenceText", "filePath", "sourceFilePath", "storagePath"]) {
      const p = clone();
      (p as Record<string, unknown>)[key] = "X";
      expect(validateRfpHldDiagramDraftPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects provider/AI output keys anywhere", () => {
    for (const key of ["providerText", "providerResponse", "aiResponse", "llmResponse", "prompt", "completion"]) {
      const p = clone();
      (p.links as Array<Record<string, unknown>>)[0][key] = "X";
      expect(validateRfpHldDiagramDraftPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects strings that resemble generated diagram markup or final output", () => {
    for (const marker of [
      "<svg>",
      "<mxfile>",
      "<?xml version",
      "graph TD",
      "flowchart LR",
      "sequenceDiagram",
      "mermaid graph",
      "draw.io export",
      "technical proposal",
      "export package",
      "final hld document",
      "customer deliverable",
      "cisco-certified",
      "cvd-certified",
      "bomatic-certified",
      "ai-certified",
    ]) {
      const p = clone();
      (p.nodes as Array<Record<string, unknown>>)[0].label = marker;
      expect(validateRfpHldDiagramDraftPayload(p).valid, marker).toBe(false);
    }
  });

  it("rejects a blocker/blocking validation finding in a persisted draft", () => {
    for (const sev of ["blocker", "blocking"]) {
      const p = clone();
      p.validationFindings = [
        { id: "vf-1", severity: sev, code: "c", message: "m", sourceRefIds: [] },
      ];
      const r = validateRfpHldDiagramDraftPayload(p);
      expect(r.valid, sev).toBe(false);
      expect(r.errors.some((e) => e.includes("blocking finding not allowed"))).toBe(true);
    }
  });

  it("rejects an unexpected top-level key", () => {
    const p = clone();
    p.extra = "nope";
    expect(validateRfpHldDiagramDraftPayload(p).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-diagram contract - source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-diagram.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-diagram.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("is a self-contained closed contract with no imports", () => {
    expect(source).not.toContain('from "');
    expect(source).not.toContain("import ");
  });

  it("source and test files are ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});

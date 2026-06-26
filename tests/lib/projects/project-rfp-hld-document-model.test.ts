import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
  validateRfpHldDocumentModelPayload,
  isValidRfpHldDocumentModelPayload,
  type RfpHldDocumentModelPayload,
} from "@/lib/projects/project-rfp-hld-document-model";
import * as documentModelModule from "@/lib/projects/project-rfp-hld-document-model";

const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";

/** A rich, valid document model exercising every nested shape. */
function validPayload(): RfpHldDocumentModelPayload {
  return {
    payloadKind: RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
    createdAt: "2026-06-26T00:00:00.000Z",
    createdBy: "eng-1",
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceModelVersion: 2,
    sourceDiagramVersion: 3,
    title: "HLD Document Model",
    documentPurpose: "Internal structured HLD document spine for engineer review.",
    coveredDomains: ["campus_switching", "wan_routing"],
    excludedDomains: ["wireless"],
    assumptions: [
      { id: "as-1", text: "Existing power and rack space are sufficient.", sourceRefIds: [MODEL_ID] },
    ],
    designSummary: [
      {
        id: "ds-1",
        title: "Core Design",
        items: [
          { id: "ds-1-i1", text: "Collapsed core with redundant uplinks.", sourceRefIds: [MODEL_ID] },
        ],
        sourceRefIds: [MODEL_ID],
      },
    ],
    topologySummary: [
      {
        id: "ts-1",
        title: "Topology Overview",
        items: [
          { id: "ts-1-i1", text: "Two-tier campus topology.", sourceRefIds: [DIAGRAM_ID] },
        ],
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    siteOrScopeSummary: [
      {
        id: "ss-1",
        title: "Single Site",
        items: [{ id: "ss-1-i1", text: "One primary data hall.", sourceRefIds: [BUNDLE_ID] }],
        sourceRefIds: [BUNDLE_ID],
      },
    ],
    implementationNotes: [
      { id: "in-1", text: "Stage migration after hours.", sourceRefIds: [MODEL_ID] },
    ],
    dependencies: [
      { id: "dp-1", text: "Depends on the approved cabling plan.", sourceRefIds: [BUNDLE_ID] },
    ],
    risksAndCaveats: [
      { id: "rk-1", text: "Lead times may shift the schedule.", sourceRefIds: [MODEL_ID] },
    ],
    complianceTraceSummary: [
      { id: "ct-1", label: "Mapped compliance items", referencedCount: 12, sourceRefIds: [BUNDLE_ID] },
    ],
    boqTraceSummary: [
      { id: "bt-1", label: "Referenced BoQ groups", referencedCount: 5, sourceRefIds: [BUNDLE_ID] },
    ],
    diagramReferences: [
      {
        id: "dr-1",
        diagramArtifactId: DIAGRAM_ID,
        diagramTitle: "HLD Topology Diagram",
        diagramType: "topology",
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    validationFindings: [
      { id: "vf-1", severity: "info", code: "draft", message: "Draft for review.", sourceRefIds: [] },
    ],
  };
}

/** The smallest valid model: required fields, empty optional sections, one diagram ref. */
function minimalPayload(): RfpHldDocumentModelPayload {
  return {
    payloadKind: RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
    createdAt: "2026-06-26T00:00:00.000Z",
    createdBy: "eng-1",
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceModelVersion: 1,
    sourceDiagramVersion: 1,
    title: "HLD Document Model",
    documentPurpose: "Internal structured HLD document spine for engineer review.",
    coveredDomains: ["campus_switching"],
    excludedDomains: [],
    assumptions: [],
    designSummary: [],
    topologySummary: [],
    siteOrScopeSummary: [],
    implementationNotes: [],
    dependencies: [],
    risksAndCaveats: [],
    complianceTraceSummary: [],
    boqTraceSummary: [],
    diagramReferences: [
      {
        id: "dr-1",
        diagramArtifactId: DIAGRAM_ID,
        diagramTitle: "HLD Topology Diagram",
        diagramType: "topology",
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    validationFindings: [],
  };
}

function clone(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const arr = (p: Record<string, unknown>, key: string) => p[key] as Array<Obj>;

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateRfpHldDocumentModelPayload - happy path", () => {
  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND).toBe("rfp_hld_document_model");
  });

  it("accepts a rich valid document model", () => {
    const result = validateRfpHldDocumentModelPayload(validPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldDocumentModelPayload(validPayload())).toBe(true);
  });

  it("accepts a minimal valid document model (empty optional sections, one diagram ref)", () => {
    const result = validateRfpHldDocumentModelPayload(minimalPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts advisory warning/suggestion/info findings", () => {
    const p = validPayload();
    p.validationFindings = [
      { id: "vf-1", severity: "warning", code: "sparse", message: "Few sections.", sourceRefIds: [MODEL_ID] },
      { id: "vf-2", severity: "suggestion", code: "clarity", message: "Clarify scope.", sourceRefIds: [] },
      { id: "vf-3", severity: "info", code: "draft", message: "Draft for review.", sourceRefIds: [] },
    ];
    expect(validateRfpHldDocumentModelPayload(p).valid).toBe(true);
  });

  it("this slice adds a structured document-model contract, not final HLD document generation", () => {
    // The runtime export surface is pinned to the pure contract/validator helpers;
    // no generator/renderer/exporter is exported. (Checks export names, not source
    // text, so it does not false-match on doc comments.)
    expect(Object.keys(documentModelModule).sort()).toEqual(
      [
        "RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND",
        "isValidRfpHldDocumentModelPayload",
        "validateRfpHldDocumentModelPayload",
      ].sort()
    );
    for (const name of Object.keys(documentModelModule)) {
      expect(name).not.toMatch(/generate|render|build|export|download|html|pdf|docx|drawio|mermaid|svg/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Structural rejections
// ---------------------------------------------------------------------------

describe("validateRfpHldDocumentModelPayload - structural rejections", () => {
  it("rejects a non-object payload", () => {
    for (const bad of [null, undefined, 1, "x", [], true]) {
      expect(validateRfpHldDocumentModelPayload(bad).valid).toBe(false);
    }
  });

  it("rejects an unknown top-level key", () => {
    const p = clone();
    p.extra = "nope";
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('unexpected key "extra"'))).toBe(true);
  });

  it("rejects a missing required top-level key", () => {
    const p = clone();
    delete p.documentPurpose;
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('missing key "documentPurpose"'))).toBe(true);
  });

  it("rejects a wrong payloadKind", () => {
    const p = clone();
    p.payloadKind = "rfp_hld_document";
    expect(validateRfpHldDocumentModelPayload(p).valid).toBe(false);
  });

  it("rejects a blank createdBy and a non-ISO createdAt", () => {
    const blank = clone();
    blank.createdBy = "   ";
    expect(validateRfpHldDocumentModelPayload(blank).valid).toBe(false);
    const badDate = clone();
    badDate.createdAt = "2026-06-26";
    expect(validateRfpHldDocumentModelPayload(badDate).valid).toBe(false);
  });

  it("rejects a blank title or documentPurpose", () => {
    for (const key of ["title", "documentPurpose"]) {
      const p = clone();
      p[key] = "   ";
      expect(validateRfpHldDocumentModelPayload(p).valid, key).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Source provenance
// ---------------------------------------------------------------------------

describe("validateRfpHldDocumentModelPayload - source provenance", () => {
  it("rejects a blank source id", () => {
    for (const key of [
      "sourceHldSourceBundleArtifactId",
      "sourceHldDesignModelArtifactId",
      "sourceHldDiagramArtifactId",
    ]) {
      const p = clone();
      p[key] = "   ";
      expect(validateRfpHldDocumentModelPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects non-distinct source ids", () => {
    const p = clone();
    p.sourceHldDesignModelArtifactId = BUNDLE_ID;
    p.sourceArtifactIds = [BUNDLE_ID, BUNDLE_ID, DIAGRAM_ID];
    expect(validateRfpHldDocumentModelPayload(p).valid).toBe(false);
  });

  it("rejects sourceArtifactIds in the wrong order", () => {
    const p = clone();
    // Required order is [bundle, model, diagram]; this swaps bundle and model.
    p.sourceArtifactIds = [MODEL_ID, BUNDLE_ID, DIAGRAM_ID];
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("sourceArtifactIds"))).toBe(true);
  });

  it("rejects a sourceArtifactIds list of the wrong length", () => {
    const p = clone();
    p.sourceArtifactIds = [BUNDLE_ID, MODEL_ID];
    expect(validateRfpHldDocumentModelPayload(p).valid).toBe(false);
  });

  it("rejects a non-integer / non-positive source version", () => {
    for (const key of ["sourceModelVersion", "sourceDiagramVersion"]) {
      for (const v of [0, -1, 1.5, "2", null]) {
        const p = clone();
        p[key] = v as unknown;
        expect(validateRfpHldDocumentModelPayload(p).valid, `${key}=${String(v)}`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Domains, diagram references, findings, and ref resolution
// ---------------------------------------------------------------------------

describe("validateRfpHldDocumentModelPayload - sections and references", () => {
  it("rejects coveredDomains/excludedDomains overlap", () => {
    const p = clone();
    p.excludedDomains = ["campus_switching", "wireless"];
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("overlaps"))).toBe(true);
  });

  it("rejects duplicate covered domains and blank domains", () => {
    const dup = clone();
    dup.coveredDomains = ["campus_switching", "campus_switching"];
    expect(validateRfpHldDocumentModelPayload(dup).valid).toBe(false);
    const blank = clone();
    blank.coveredDomains = ["campus_switching", "  "];
    expect(validateRfpHldDocumentModelPayload(blank).valid).toBe(false);
  });

  it("requires at least one diagramReference", () => {
    const p = clone();
    p.diagramReferences = [];
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("diagramReferences: must not be empty"))).toBe(true);
  });

  it("requires diagramReferences to point at sourceHldDiagramArtifactId", () => {
    const p = clone();
    arr(p, "diagramReferences")[0].diagramArtifactId = MODEL_ID;
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("must equal sourceHldDiagramArtifactId"))).toBe(true);
  });

  it("rejects an unknown diagramType on a diagram reference", () => {
    const p = clone();
    arr(p, "diagramReferences")[0].diagramType = "logical";
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("unknown diagramType"))).toBe(true);
  });

  it("rejects a non-negative-integer referencedCount on a trace summary", () => {
    for (const v of [-1, 1.5, "5", null]) {
      const p = clone();
      arr(p, "complianceTraceSummary")[0].referencedCount = v as unknown;
      expect(validateRfpHldDocumentModelPayload(p).valid, String(v)).toBe(false);
    }
  });

  it("rejects a sourceRefId that does not resolve to a coarse source artifact id", () => {
    const p = clone();
    arr(p, "assumptions")[0].sourceRefIds = ["ref-nope"];
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("not one of the coarse source artifact ids"))).toBe(true);
  });

  it("rejects an unresolved sourceRefId nested inside a summary-section item", () => {
    const p = clone();
    const section = arr(p, "designSummary")[0];
    (section.items as Array<Obj>)[0].sourceRefIds = ["ref-nope"];
    expect(validateRfpHldDocumentModelPayload(p).valid).toBe(false);
  });

  it("rejects an empty sourceRefIds on a content entry", () => {
    const p = clone();
    arr(p, "implementationNotes")[0].sourceRefIds = [];
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("must not be empty"))).toBe(true);
  });

  it("rejects duplicate ids within a section array", () => {
    const p = clone();
    arr(p, "assumptions").push({
      id: "as-1",
      text: "Duplicate id assumption.",
      sourceRefIds: [MODEL_ID],
    });
    const r = validateRfpHldDocumentModelPayload(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("assumptions: duplicate ids"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Forbidden / final-output / certification content
// ---------------------------------------------------------------------------

describe("validateRfpHldDocumentModelPayload - rejects forbidden content", () => {
  it("rejects SKU/pricing/catalog/config authority keys anywhere", () => {
    for (const key of [
      "sku", "acceptedSku", "replacementSku", "skuSubstitution",
      "unitPrice", "totalPrice", "pricing", "price",
      "catalogDecision", "configurationDecision",
    ]) {
      const p = clone();
      arr(p, "boqTraceSummary")[0][key] = "X";
      expect(validateRfpHldDocumentModelPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects raw text / document / evidence / file / storage keys anywhere", () => {
    for (const key of [
      "rawText", "documentText", "evidenceText", "sourceText", "rawEvidence",
      "fileBytes", "sourceBytes", "filePath", "sourceFilePath", "storagePath",
    ]) {
      const p = clone();
      (p as Obj)[key] = "X";
      expect(validateRfpHldDocumentModelPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects provider/AI output keys anywhere", () => {
    for (const key of [
      "providerText", "providerResponse", "aiResponse", "llmResponse", "prompt", "completion",
    ]) {
      const p = clone();
      arr(p, "assumptions")[0][key] = "X";
      expect(validateRfpHldDocumentModelPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects strings that resemble generated markup or final output", () => {
    for (const marker of [
      "<html>",
      "<body>",
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
      p.title = marker;
      expect(validateRfpHldDocumentModelPayload(p).valid, marker).toBe(false);
    }
  });

  it("rejects a blocker/blocking validation finding in a persisted model", () => {
    for (const sev of ["blocker", "blocking"]) {
      const p = clone();
      p.validationFindings = [
        { id: "vf-1", severity: sev, code: "c", message: "m", sourceRefIds: [] },
      ];
      const r = validateRfpHldDocumentModelPayload(p);
      expect(r.valid, sev).toBe(false);
      expect(r.errors.some((e) => e.includes("blocking finding not allowed"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Static purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-document-model contract - source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document-model.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-document-model.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("is a self-contained closed contract with no imports", () => {
    expect(source).not.toContain('from "');
    expect(source).not.toContain("import ");
  });

  it("imports no provider/AI, raw-reader, pricing/SKU/catalog/config, API/UI/store/approval, or final-output module", () => {
    // Match module specifiers only in import/require position, so the module's own
    // forbidden-key list and doc comments (which mention sku/pricing/catalog) do
    // not false-match. A self-contained contract has zero specifiers.
    const specifiers = Array.from(
      source.matchAll(/(?:from|require\()\s*["']([^"']+)["']/g)
    ).map((m) => m[1]);
    expect(specifiers).toEqual([]);
    const forbidden =
      /\bai\b|llm|anthropic|openai|pdf-parse|mammoth|xlsx|file-store|evidence-store|catalog|pricing|sku|configuration|provider|engine|next\/server|react|drizzle|approval|docx|draw|render/i;
    for (const s of specifiers) {
      expect(forbidden.test(s), s).toBe(false);
    }
  });

  it("source and test files are ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});

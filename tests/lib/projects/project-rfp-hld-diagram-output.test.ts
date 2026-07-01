import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND,
  RFP_HLD_DIAGRAM_OUTPUT_FORMAT,
  validateRfpHldDiagramOutputPayload,
  isValidRfpHldDiagramOutputPayload,
  type RfpHldDiagramOutputPayload,
} from "@/lib/projects/project-rfp-hld-diagram-output";

const SOURCE_ID = "diagram-art-1";

/** A minimal, valid topology output payload. */
function validPayload(): RfpHldDiagramOutputPayload {
  return {
    payloadKind: RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND,
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "engineer-1",
    sourceArtifactIds: [SOURCE_ID],
    sourceHldDiagramArtifactId: SOURCE_ID,
    sourceDiagramVersion: 2,
    outputFormat: RFP_HLD_DIAGRAM_OUTPUT_FORMAT,
    diagramType: "topology",
    title: "Core Topology Output",
    canvas: { width: 1200, height: 800, gridSize: 10 },
    zones: [
      {
        id: "zone-core",
        label: "Core",
        geometry: { x: 0, y: 0, width: 400, height: 300 },
        sourceRefIds: [SOURCE_ID],
      },
    ],
    nodes: [
      {
        id: "node-a",
        label: "Router A",
        zoneId: "zone-core",
        geometry: { x: 10, y: 10, width: 80, height: 40 },
        sourceRefIds: [SOURCE_ID],
      },
      {
        id: "node-b",
        label: "Switch B",
        geometry: { x: 200, y: 10, width: 80, height: 40 },
        sourceRefIds: [SOURCE_ID],
      },
    ],
    links: [
      {
        id: "link-1",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        label: "uplink",
        sourceRefIds: [SOURCE_ID],
      },
    ],
    validationFindings: [
      {
        id: "f-1",
        code: "LAYOUT_OK",
        message: "spacing within tolerance",
        severity: "info",
        sourceRefIds: [],
      },
    ],
  };
}

/** Deep-clone helper so mutations do not leak between cases. */
function clone(p: RfpHldDiagramOutputPayload): RfpHldDiagramOutputPayload {
  return structuredClone(p);
}

function mutable(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function mutableArray(value: unknown): Array<Record<string, unknown>> {
  return value as Array<Record<string, unknown>>;
}

describe("validateRfpHldDiagramOutputPayload - happy path", () => {
  it("accepts a valid topology output", () => {
    const res = validateRfpHldDiagramOutputPayload(validPayload());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.diagramType).toBe("topology");
    expect(isValidRfpHldDiagramOutputPayload(validPayload())).toBe(true);
  });

  it("accepts advisory warning/suggestion/info findings only", () => {
    for (const severity of ["warning", "suggestion", "info"] as const) {
      const p = clone(validPayload());
      p.validationFindings = [
        { id: "f-1", code: "C", message: "m", severity, sourceRefIds: [SOURCE_ID] },
      ];
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(true);
    }
  });

  it("accepts an empty findings array and empty finding sourceRefIds", () => {
    const p = clone(validPayload());
    p.validationFindings = [];
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(true);
  });

  it("exposes the stable payloadKind and format constants", () => {
    expect(RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND).toBe("rfp_hld_diagram_output");
    expect(RFP_HLD_DIAGRAM_OUTPUT_FORMAT).toBe("drawio_compatible_v1");
  });
});

describe("validateRfpHldDiagramOutputPayload - structural fail-closed", () => {
  it("rejects a non-object", () => {
    for (const bad of [null, undefined, 42, "x", [], true]) {
      const res = validateRfpHldDiagramOutputPayload(bad);
      expect(res.ok).toBe(false);
    }
  });

  it("rejects a missing required key", () => {
    const p = mutable(clone(validPayload()));
    delete p.title;
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects an unexpected top-level key", () => {
    const p = mutable(clone(validPayload()));
    p.somethingExtra = 1;
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects the wrong payloadKind", () => {
    const p = clone(validPayload());
    mutable(p).payloadKind = "other_kind";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects the wrong outputFormat", () => {
    const p = clone(validPayload());
    mutable(p).outputFormat = "drawio_compatible_v2";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a non-topology diagramType", () => {
    const p = clone(validPayload());
    mutable(p).diagramType = "sequence";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a non-ISO-UTC createdAt and a blank createdBy", () => {
    const bad1 = clone(validPayload());
    bad1.createdAt = "2026-07-01";
    expect(isValidRfpHldDiagramOutputPayload(bad1)).toBe(false);
    const bad2 = clone(validPayload());
    bad2.createdBy = "   ";
    expect(isValidRfpHldDiagramOutputPayload(bad2)).toBe(false);
  });
});

describe("validateRfpHldDiagramOutputPayload - provenance", () => {
  it("rejects a non-trimmed sourceHldDiagramArtifactId", () => {
    const p = clone(validPayload());
    p.sourceHldDiagramArtifactId = " diagram-art-1 ";
    // sourceArtifactIds still holds the trimmed value, so both provenance checks fail.
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a blank sourceHldDiagramArtifactId", () => {
    const p = clone(validPayload());
    p.sourceHldDiagramArtifactId = "";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a non-positive / non-integer sourceDiagramVersion", () => {
    for (const v of [0, -1, 1.5, "1"]) {
      const p = clone(validPayload());
      mutable(p).sourceDiagramVersion = v;
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });

  it("rejects sourceArtifactIds that is not exactly [sourceHldDiagramArtifactId]", () => {
    const extra = clone(validPayload());
    extra.sourceArtifactIds = [SOURCE_ID, "other-art"];
    expect(isValidRfpHldDiagramOutputPayload(extra)).toBe(false);

    const mismatch = clone(validPayload());
    mismatch.sourceArtifactIds = ["other-art"];
    expect(isValidRfpHldDiagramOutputPayload(mismatch)).toBe(false);

    const empty = clone(validPayload());
    empty.sourceArtifactIds = [];
    expect(isValidRfpHldDiagramOutputPayload(empty)).toBe(false);
  });

  it("rejects a node/link/zone sourceRefId that does not resolve to the source id", () => {
    const zoneBad = clone(validPayload());
    zoneBad.zones[0].sourceRefIds = ["some-other-id"];
    expect(isValidRfpHldDiagramOutputPayload(zoneBad)).toBe(false);

    const nodeBad = clone(validPayload());
    nodeBad.nodes[0].sourceRefIds = ["some-other-id"];
    expect(isValidRfpHldDiagramOutputPayload(nodeBad)).toBe(false);

    const linkBad = clone(validPayload());
    linkBad.links[0].sourceRefIds = ["some-other-id"];
    expect(isValidRfpHldDiagramOutputPayload(linkBad)).toBe(false);
  });

  it("rejects an empty sourceRefIds on a node/link/zone", () => {
    const p = clone(validPayload());
    p.nodes[0].sourceRefIds = [];
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a finding sourceRefId that does not resolve to the source id", () => {
    const p = clone(validPayload());
    p.validationFindings[0].sourceRefIds = ["some-other-id"];
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });
});

describe("validateRfpHldDiagramOutputPayload - references and duplicates", () => {
  it("rejects an empty nodes array", () => {
    const p = clone(validPayload());
    p.nodes = [];
    p.links = [];
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects duplicate node ids", () => {
    const p = clone(validPayload());
    p.nodes[1].id = "node-a";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects duplicate zone, link, and finding ids", () => {
    const zoneDup = clone(validPayload());
    zoneDup.zones = [zoneDup.zones[0], clone(validPayload()).zones[0]];
    expect(isValidRfpHldDiagramOutputPayload(zoneDup)).toBe(false);

    const linkDup = clone(validPayload());
    linkDup.links = [linkDup.links[0], clone(validPayload()).links[0]];
    expect(isValidRfpHldDiagramOutputPayload(linkDup)).toBe(false);

    const findingDup = clone(validPayload());
    findingDup.validationFindings = [
      findingDup.validationFindings[0],
      clone(validPayload()).validationFindings[0],
    ];
    expect(isValidRfpHldDiagramOutputPayload(findingDup)).toBe(false);
  });

  it("rejects a link referencing an unknown node", () => {
    const p = clone(validPayload());
    p.links[0].targetNodeId = "node-missing";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a node referencing an unknown zone", () => {
    const p = clone(validPayload());
    p.nodes[0].zoneId = "zone-missing";
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });
});

describe("validateRfpHldDiagramOutputPayload - geometry", () => {
  it("rejects non-finite coordinates", () => {
    const p = clone(validPayload());
    p.nodes[0].geometry.x = Number.POSITIVE_INFINITY;
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects out-of-bound coordinates and dimensions", () => {
    const big = clone(validPayload());
    big.nodes[0].geometry.x = 20001;
    expect(isValidRfpHldDiagramOutputPayload(big)).toBe(false);

    const bigCanvas = clone(validPayload());
    bigCanvas.canvas.width = 999999;
    expect(isValidRfpHldDiagramOutputPayload(bigCanvas)).toBe(false);
  });

  it("rejects non-positive width/height", () => {
    const p = clone(validPayload());
    p.nodes[0].geometry.width = 0;
    expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
  });

  it("rejects a blocking/blocker/error finding severity", () => {
    for (const severity of ["blocking", "blocker", "error", "critical"]) {
      const p = clone(validPayload());
      mutable(p.validationFindings[0]).severity = severity;
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });
});

describe("validateRfpHldDiagramOutputPayload - forbidden authority/output leakage", () => {
  it("rejects pricing/SKU/catalog/config keys anywhere", () => {
    for (const key of [
      "pricing",
      "sku",
      "catalog",
      "configuration",
      "unitPrice",
    ]) {
      const p = mutable(clone(validPayload()));
      mutableArray(p.nodes)[0][key] = "x";
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });

  it("rejects raw-doc/source-file/storage keys anywhere", () => {
    for (const key of ["rawText", "documentText", "sourceFile", "filePath", "storageKey"]) {
      const p = mutable(clone(validPayload()));
      p[key] = "x";
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });

  it("rejects provider/model/AI/prompt/raw-response keys anywhere", () => {
    for (const key of ["provider", "model", "prompt", "completion", "rawResponse", "reasoning"]) {
      const p = mutable(clone(validPayload()));
      p[key] = "x";
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });

  it("rejects XML/draw.io/SVG/mermaid/final/download/upload/export keys anywhere", () => {
    for (const key of [
      "xml",
      "drawioXml",
      "mxfile",
      "svg",
      "mermaid",
      "downloadUrl",
      "uploadPath",
      "finalHld",
      "export",
    ]) {
      const p = mutable(clone(validPayload()));
      p[key] = "x";
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });

  it("rejects string values that look like generated markup or deliverables", () => {
    const cases = [
      "<mxfile><diagram/></mxfile>",
      "<svg width='1'></svg>",
      "<?xml version='1.0'?>",
      "graph TD; A-->B",
      "flowchart LR",
      "this is the technical proposal",
      "final HLD for the customer",
      "Cisco-certified design",
    ];
    for (const value of cases) {
      const p = clone(validPayload());
      p.title = value;
      expect(isValidRfpHldDiagramOutputPayload(p)).toBe(false);
    }
  });
});

describe("project-rfp-hld-diagram-output module purity", () => {
  const sourcePath = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-diagram-output.ts"
  );
  const testPath = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-diagram-output.test.ts"
  );

  it("source is a self-contained module with no imports", () => {
    const source = readFileSync(sourcePath, "utf8");
    const froms = Array.from(source.matchAll(/from\s+["']([^"']+)["']/g)).map(
      (m) => m[1]
    );
    expect(froms).toEqual([]);
    // No import statements at all.
    expect(source.split("\n").filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it("source file is ASCII-only", () => {
    const source = readFileSync(sourcePath, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("test file is ASCII-only", () => {
    const test = readFileSync(testPath, "utf8");
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});

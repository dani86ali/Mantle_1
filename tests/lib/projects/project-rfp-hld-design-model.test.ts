import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  validateRfpHldDesignModelPayload,
  isValidRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";

const CREATED_AT = "2026-06-23T00:00:00.000Z";
const BUNDLE_ID = "hsb-1";

function validPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: [BUNDLE_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [
      { id: "sr-1", kind: "source_bundle", artifactId: BUNDLE_ID },
    ],
    assumptionRefs: [{ refId: "sr-1" }],
    constraintRefs: [{ refId: "sr-1" }],
    designSections: [
      {
        id: "ds-1",
        domain: "campus_switching",
        title: "Campus Switching Design",
        sourceRefIds: ["sr-1"],
        decisions: [
          { id: "dec-1", label: "Use C9300 series", sourceRefIds: ["sr-1"] },
        ],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "Core Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
      ],
      links: [
        {
          id: "l-1", label: "Core to Access", fromNodeId: "n-1", toNodeId: "n-2",
          linkType: "ethernet", sourceRefIds: ["sr-1"],
        },
      ],
      zones: [
        { id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] },
      ],
    },
    diagramIntents: [
      { id: "di-1", title: "Campus Topology", intentType: "physical", sourceRefIds: ["sr-1"] },
    ],
    traceability: {
      requirementRefs: [{ refId: "sr-1" }],
      complianceRefs: [{ refId: "sr-1" }],
      configurationRefs: [{ refId: "sr-1" }],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [
      {
        id: "vf-1", severity: "warning", code: "PARTIAL_DETAIL",
        message: "Some rack detail missing.", sourceRefIds: ["sr-1"],
      },
    ],
    engineerReview: { status: "pending", requiredActions: ["Review topology diagram"] },
  };
}

function mutable(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - happy path", () => {
  it("accepts a fully valid payload", () => {
    const result = validateRfpHldDesignModelPayload(validPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldDesignModelPayload(validPayload())).toBe(true);
  });

  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND).toBe("rfp_hld_design_model");
  });
});

// ---------------------------------------------------------------------------
// Top-level shape
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - top-level shape", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(isValidRfpHldDesignModelPayload(bad)).toBe(false);
    }
  });

  it("rejects the wrong payloadKind", () => {
    const p = mutable();
    p.payloadKind = "rfp_hld_source_bundle";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    const p = mutable();
    p.extra = true;
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourceArtifactIds
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - sourceArtifactIds", () => {
  it("accepts exactly [sourceHldSourceBundleArtifactId]", () => {
    expect(isValidRfpHldDesignModelPayload(validPayload())).toBe(true);
  });

  it("rejects when sourceArtifactIds has more than one entry", () => {
    const p = mutable();
    (p.sourceArtifactIds as string[]).push("extra-1");
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects when sourceArtifactIds does not match the bundle id", () => {
    const p = mutable();
    p.sourceArtifactIds = ["other-bundle"];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects empty sourceArtifactIds", () => {
    const p = mutable();
    p.sourceArtifactIds = [];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourceBundlePayloadKind and sourceBundleVersion
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - bundle kind and version", () => {
  it("rejects wrong sourceBundlePayloadKind", () => {
    const p = mutable();
    p.sourceBundlePayloadKind = "rfp_hld_design_model";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects invalid sourceBundleVersion (zero)", () => {
    const p = mutable();
    p.sourceBundleVersion = 0;
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects invalid sourceBundleVersion (non-integer)", () => {
    const p = mutable();
    p.sourceBundleVersion = 1.5;
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects invalid sourceBundleVersion (string)", () => {
    const p = mutable();
    p.sourceBundleVersion = "1";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - domains", () => {
  it("rejects duplicate coveredDomains", () => {
    const p = mutable();
    (p.coveredDomains as string[]).push("campus_switching");
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects an unknown domain in coveredDomains", () => {
    const p = mutable();
    (p.coveredDomains as string[]).push("telepathy");
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects overlap between covered and excluded domains", () => {
    const p = mutable();
    (p.excludedDomains as string[]).push("campus_switching");
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// designSections
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - designSections", () => {
  it("rejects a design section whose domain is not in coveredDomains", () => {
    const p = mutable();
    (p.designSections as Record<string, unknown>[])[0].domain = "wireless";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a design section whose domain is in excludedDomains", () => {
    const p = mutable();
    (p.designSections as Record<string, unknown>[])[0].domain = "service_only";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourceReferences
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - sourceReferences", () => {
  it("rejects a sourceReference with an invalid kind", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[0].kind = "made_up";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a sourceReference with an optional blank label", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[0].label = "  ";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a refId in assumptionRefs that does not exist in sourceReferences", () => {
    const p = mutable();
    (p.assumptionRefs as Record<string, unknown>[])[0].refId = "ghost-99";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Topology - links
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - topology links", () => {
  it("rejects a link whose fromNodeId is not in topology.nodes", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).links as Record<string, unknown>[])[0].fromNodeId = "ghost";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a link whose toNodeId is not in topology.nodes", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).links as Record<string, unknown>[])[0].toNodeId = "ghost";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Topology - zones
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - topology zones", () => {
  it("rejects a zone with an unknown nodeId", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).zones as Record<string, unknown>[])[0].nodeIds = ["ghost"];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a zone with an empty nodeIds array", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).zones as Record<string, unknown>[])[0].nodeIds = [];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a zone with a blank nodeId entry", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).zones as Record<string, unknown>[])[0].nodeIds = ["  "];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a zone with duplicate nodeIds", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).zones as Record<string, unknown>[])[0].nodeIds = [
      "n-1", "n-1",
    ];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Topology - missing sourceRefs
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - topology sourceRefs required", () => {
  it("rejects a topology node without sourceRefIds", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).nodes as Record<string, unknown>[])[0].sourceRefIds = [];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a topology link without sourceRefIds", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).links as Record<string, unknown>[])[0].sourceRefIds = [];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a topology zone without sourceRefIds", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).zones as Record<string, unknown>[])[0].sourceRefIds = [];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a diagramIntent without sourceRefIds", () => {
    const p = mutable();
    (p.diagramIntents as Record<string, unknown>[])[0].sourceRefIds = [];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Duplicate IDs
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - duplicate IDs", () => {
  it("rejects duplicate sourceReference ids", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[]).push({ id: "sr-1", kind: "authority" });
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects duplicate designSection ids", () => {
    const p = mutable();
    const sec = structuredClone((p.designSections as Record<string, unknown>[])[0]);
    (p.designSections as Record<string, unknown>[]).push(sec);
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects duplicate topology node ids", () => {
    const p = mutable();
    const node = structuredClone(
      ((p.topology as Record<string, unknown>).nodes as Record<string, unknown>[])[0]
    );
    ((p.topology as Record<string, unknown>).nodes as Record<string, unknown>[]).push(node);
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validationFindings
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - validationFindings", () => {
  it("rejects a blocker finding", () => {
    const p = mutable();
    (p.validationFindings as Record<string, unknown>[]).push({
      id: "vf-blocker", severity: "blocker", code: "BLOCK", message: "Blocked.", sourceRefIds: ["sr-1"],
    });
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects an invalid finding severity", () => {
    const p = mutable();
    (p.validationFindings as Record<string, unknown>[])[0].severity = "critical";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forbidden keys
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - forbidden keys", () => {
  it("rejects sku at top level", () => {
    const p = mutable();
    (p as Record<string, unknown>).sku = "C9300-48T";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects pricing inside a nested object", () => {
    const p = mutable();
    (p.validationFindings as Record<string, unknown>[])[0].pricing = { total: 0 };
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects catalogDecision anywhere in the payload", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).nodes as Record<string, unknown>[])[0].catalogDecision = "approved";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Generated-output strings
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - generated-output strings", () => {
  it("rejects a triple-backtick string at top level", () => {
    const p = mutable();
    p.createdBy = "```markdown\n# doc\n```";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a Mermaid diagram string in a section title", () => {
    const p = mutable();
    (p.designSections as Record<string, unknown>[])[0].title = "graph TD A-->B";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a Mermaid flowchart string in a diagramIntent title", () => {
    const p = mutable();
    (p.diagramIntents as Record<string, unknown>[])[0].title = "flowchart LR";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects an SVG string in a topology node label", () => {
    const p = mutable();
    ((p.topology as Record<string, unknown>).nodes as Record<string, unknown>[])[0].label =
      "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects a generated-output string in validationFindings[].message", () => {
    const p = mutable();
    (p.validationFindings as Record<string, unknown>[])[0].message =
      "<?xml version='1.0'?><root/>";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects draw.io XML in a sourceReference label", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[0].label = "<mxfile host='app'></mxfile>";
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// engineerReview
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelPayload - engineerReview", () => {
  it("accepts a valid engineerReview", () => {
    expect(isValidRfpHldDesignModelPayload(validPayload())).toBe(true);
  });

  it("accepts a payload without engineerReview", () => {
    const p = validPayload();
    delete p.engineerReview;
    expect(isValidRfpHldDesignModelPayload(p)).toBe(true);
  });

  it("rejects engineerReview.requiredActions with a blank entry", () => {
    const p = mutable();
    (p.engineerReview as Record<string, unknown>).requiredActions = ["Valid action", "  "];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });

  it("rejects engineerReview.requiredActions with a non-string entry", () => {
    const p = mutable();
    (p.engineerReview as Record<string, unknown>).requiredActions = ["Valid action", 42];
    expect(isValidRfpHldDesignModelPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-design-model module purity", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/project-rfp-hld-design-model.ts"),
    "utf8"
  );

  it("imports only the two allowed modules (handles multiline declarations)", () => {
    const froms = Array.from(source.matchAll(/from\s+["']([^"']+)["']/g)).map((m) => m[1]);
    expect(froms.sort()).toEqual(
      [
        "@/lib/projects/project-rfp-hld-domain-readiness",
        "@/lib/projects/project-rfp-hld-source-bundle",
      ].sort()
    );
  });

  it("does not import stores, fs/path, routes, React, AI, catalog, pricing, or config services", () => {
    const forbidden = [
      "/db/", "project-store", "artifact-store", "file-store",
      "node:fs", "node:path", "next/server", "next/navigation", "react",
      "anthropic", "@anthropic", "/adapters/", "catalog", "pricing", "sku",
      "config-expansion", "configuration-expansion",
    ];
    const importLines = source
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l) || /from\s+["']/.test(l));
    for (const needle of forbidden) {
      for (const line of importLines) {
        expect(line.includes(needle)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ASCII-only
// ---------------------------------------------------------------------------

describe("ASCII-only files", () => {
  it("source file is ASCII-only", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/projects/project-rfp-hld-design-model.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });

  it("test file is ASCII-only", () => {
    const tst = readFileSync(
      join(process.cwd(), "tests/lib/projects/project-rfp-hld-design-model.test.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(tst)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
  validateRfpHldDesignModelReviewPayload,
  isValidRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewPayload,
} from "@/lib/projects/project-rfp-hld-design-model-review";

const REVIEWED_AT = "2026-06-24T00:00:00.000Z";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";

/** Smallest valid review: no source references, no findings, proceed. */
function minimalPayload(): RfpHldDesignModelReviewPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: REVIEWED_AT,
    reviewer: { type: "deterministic" },
    sourceReferences: [],
    findings: [],
    recommendation: "proceed_to_engineer_review",
  };
}

/** Richer valid review: refs + a warning finding, recommends proceeding. */
function validPayload(): RfpHldDesignModelReviewPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: REVIEWED_AT,
    reviewer: { type: "ai_advisory", id: "advisor-1", label: "Advisory checker" },
    sourceReferences: [
      { id: "sr-1", artifactId: MODEL_ID, domain: "campus_switching" },
      { id: "sr-2", artifactId: BUNDLE_ID, sectionId: "assumptions" },
    ],
    findings: [
      {
        id: "f-1",
        severity: "warning",
        category: "missing_assumption",
        message: "Campus switching narrative omits an approved assumption reference.",
        sourceReferenceIds: ["sr-1", "sr-2"],
        recommendedAction: "Cite the approved assumption for the access layer.",
      },
    ],
    recommendation: "proceed_to_engineer_review",
  };
}

/** Valid review that recommends a bounded redraft. */
function validRebuildPayload(): RfpHldDesignModelReviewPayload {
  return {
    ...validPayload(),
    findings: [
      {
        id: "f-1",
        severity: "warning",
        category: "source_mismatch",
        message: "The access-layer description does not match the approved inputs.",
        sourceReferenceIds: ["sr-1"],
      },
    ],
    recommendation: "rebuild_recommended",
    boundedRebuildInstructions: {
      summary: "Redraft the design model to resolve flagged source-alignment gaps.",
      instructions:
        "Re-run the design model draft from the same approved inputs only. Fix the " +
        "flagged narrative and assumption issues without adding anything new.",
      maxAttempts: 1,
    },
  };
}

function mutable(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - happy path", () => {
  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND).toBe("rfp_hld_design_model_review");
  });

  it("accepts a minimal deterministic review payload", () => {
    const result = validateRfpHldDesignModelReviewPayload(minimalPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldDesignModelReviewPayload(minimalPayload())).toBe(true);
  });

  it("accepts a payload with warning and suggestion findings and source refs", () => {
    const p = validPayload();
    p.findings.push({
      id: "f-2",
      severity: "suggestion",
      category: "unclear_narrative",
      message: "Clarify the resiliency description for the distribution layer.",
      sourceReferenceIds: ["sr-2"],
    });
    const result = validateRfpHldDesignModelReviewPayload(p);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid rebuild-recommended payload with bounded instructions", () => {
    const result = validateRfpHldDesignModelReviewPayload(validRebuildPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts reject_required with and without bounded instructions", () => {
    const without = validPayload();
    without.recommendation = "reject_required";
    expect(isValidRfpHldDesignModelReviewPayload(without)).toBe(true);

    const withInstr = validRebuildPayload();
    withInstr.recommendation = "reject_required";
    expect(isValidRfpHldDesignModelReviewPayload(withInstr)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Top-level shape and identity
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - top-level shape", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(isValidRfpHldDesignModelReviewPayload(bad)).toBe(false);
    }
  });

  it("rejects the wrong payloadKind", () => {
    const p = mutable();
    p.payloadKind = "rfp_hld_design_model";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    const p = mutable();
    p.extra = true;
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a blank sourceHldDesignModelArtifactId", () => {
    const p = mutable();
    p.sourceHldDesignModelArtifactId = "   ";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a blank sourceHldSourceBundleArtifactId", () => {
    const p = mutable();
    p.sourceHldSourceBundleArtifactId = "";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects equal model and source-bundle artifact ids", () => {
    const p = mutable();
    p.sourceHldDesignModelArtifactId = BUNDLE_ID;
    p.sourceArtifactIds = [BUNDLE_ID, BUNDLE_ID];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a non-UTC reviewedAt", () => {
    const p = mutable();
    p.reviewedAt = "2026-06-24 00:00:00";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourceArtifactIds
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - sourceArtifactIds", () => {
  it("requires exactly [model, bundle] in that order", () => {
    expect(isValidRfpHldDesignModelReviewPayload(validPayload())).toBe(true);
  });

  it("rejects reversed order", () => {
    const p = mutable();
    p.sourceArtifactIds = [BUNDLE_ID, MODEL_ID];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a missing entry", () => {
    const p = mutable();
    p.sourceArtifactIds = [MODEL_ID];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an extra (e.g. source file) entry", () => {
    const p = mutable();
    p.sourceArtifactIds = [MODEL_ID, BUNDLE_ID, "file-1"];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reviewer
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - reviewer", () => {
  it("accepts each valid reviewer type", () => {
    for (const type of ["deterministic", "ai_advisory", "engineer"] as const) {
      const p = mutable();
      (p.reviewer as Record<string, unknown>).type = type;
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(true);
    }
  });

  it("rejects an invalid reviewer type", () => {
    const p = mutable();
    (p.reviewer as Record<string, unknown>).type = "robot";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a blank reviewer id", () => {
    const p = mutable();
    (p.reviewer as Record<string, unknown>).id = "  ";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a blank reviewer label", () => {
    const p = mutable();
    (p.reviewer as Record<string, unknown>).label = "";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a provider/model/prompt field on the reviewer", () => {
    const p = mutable();
    (p.reviewer as Record<string, unknown>).provider = "anthropic";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourceReferences
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - sourceReferences", () => {
  it("rejects duplicate source reference ids", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[]).push({
      id: "sr-1",
      artifactId: BUNDLE_ID,
    });
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an artifactId that is neither the model nor the bundle", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[0].artifactId = "other-art";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an unknown domain", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[0].domain = "telepathy";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a blank sectionId", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[1].sectionId = "  ";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a raw-document / source-file field on a source reference", () => {
    for (const key of ["rawText", "filePath", "sourceFileId", "pageText", "rowNumber"]) {
      const p = mutable();
      (p.sourceReferences as Record<string, unknown>[])[0][key] = "leak";
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("rejects an unexpected key on a source reference", () => {
    const p = mutable();
    (p.sourceReferences as Record<string, unknown>[])[0].note = "extra";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - findings", () => {
  it("rejects an invalid severity", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].severity = "critical";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an invalid category", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].category = "made_up";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects duplicate finding ids", () => {
    const p = mutable();
    const f = structuredClone((p.findings as Record<string, unknown>[])[0]);
    (p.findings as Record<string, unknown>[]).push(f);
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an empty sourceReferenceIds list", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].sourceReferenceIds = [];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a sourceReferenceId not present in sourceReferences", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].sourceReferenceIds = ["ghost"];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects duplicate sourceReferenceIds within a finding", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].sourceReferenceIds = ["sr-1", "sr-1"];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an overlong message (> 600 chars)", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].message = "a".repeat(601);
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an overlong recommendedAction (> 400 chars)", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].recommendedAction = "a".repeat(401);
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects an unexpected key on a finding", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].owner = "x";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recommendation rules
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - recommendation rules", () => {
  it("rejects an invalid recommendation value", () => {
    const p = mutable();
    p.recommendation = "ship_it";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("forces a blocking finding away from proceed_to_engineer_review", () => {
    const p = mutable();
    (p.findings as Record<string, unknown>[])[0].severity = "blocking";
    p.recommendation = "proceed_to_engineer_review";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("allows a blocking finding with rebuild_recommended (plus bounded instructions)", () => {
    const p = validRebuildPayload();
    p.findings[0].severity = "blocking";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(true);
  });

  it("allows a blocking finding with reject_required (no bounded instructions required)", () => {
    const p = validPayload();
    p.findings[0].severity = "blocking";
    p.recommendation = "reject_required";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(true);
  });

  it("rejects proceed_to_engineer_review carrying boundedRebuildInstructions", () => {
    const p = mutable();
    p.recommendation = "proceed_to_engineer_review";
    p.boundedRebuildInstructions = {
      summary: "Redraft the model.",
      instructions: "Re-run the draft from the same approved inputs only.",
    };
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects rebuild_recommended without boundedRebuildInstructions", () => {
    const p = mutable();
    p.recommendation = "rebuild_recommended";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// boundedRebuildInstructions
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - boundedRebuildInstructions", () => {
  it("rejects an overlong summary (> 300 chars)", () => {
    const p = validRebuildPayload();
    p.boundedRebuildInstructions!.summary = "a".repeat(301);
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects overlong instructions (> 1200 chars)", () => {
    const p = validRebuildPayload();
    p.boundedRebuildInstructions!.instructions = "a".repeat(1201);
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects a maxAttempts other than 1", () => {
    for (const bad of [0, 2, 1.5, "1"]) {
      const p = validRebuildPayload();
      (p.boundedRebuildInstructions as unknown as Record<string, unknown>).maxAttempts = bad;
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("accepts maxAttempts === 1", () => {
    const p = validRebuildPayload();
    p.boundedRebuildInstructions!.maxAttempts = 1;
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(true);
  });

  it("rejects an unexpected key on boundedRebuildInstructions", () => {
    const p = validRebuildPayload();
    (p.boundedRebuildInstructions as unknown as Record<string, unknown>).priority = "high";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects instructions that introduce new scope/SKU/pricing/catalog/config/sizing/topology/output/cert", () => {
    const forbidden = [
      "Add a new SKU C9300-48T to the access layer.",
      "Adjust the pricing for the core switches.",
      "Change the unit price of each access switch.",
      "Expand the catalog with extra optics.",
      "Modify the configuration expansion for the stack.",
      "Increase the hardware sizing for the core.",
      "Invent a new spine-leaf topology fact for the data center.",
      "Broaden the project scope to include wireless.",
      "Produce the final HLD document for the customer.",
      "Render the Mermaid diagram of the topology.",
      "Emit the export package for delivery.",
      "State that the design is Cisco-certified.",
    ];
    for (const text of forbidden) {
      const p = validRebuildPayload();
      p.boundedRebuildInstructions!.instructions = text;
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("rejects a forbidden marker in the bounded rebuild summary", () => {
    const p = validRebuildPayload();
    p.boundedRebuildInstructions!.summary = "Redraft and adjust the pricing table.";
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Global forbidden-content scan
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelReviewPayload - global forbidden scan", () => {
  it("rejects forbidden raw-document keys anywhere", () => {
    for (const key of ["rawText", "documentText", "extractedText", "storagePath", "sourceRowNumber"]) {
      const p = mutable();
      (p as Record<string, unknown>)[key] = "leak";
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("rejects sourceFileIds at the top level", () => {
    const p = mutable();
    (p as Record<string, unknown>).sourceFileIds = ["file-1"];
    expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
  });

  it("rejects pricing/catalog/configuration authority keys anywhere", () => {
    for (const key of [
      "sku",
      "acceptedSku",
      "unitPrice",
      "totalPrice",
      "pricing",
      "price",
      "catalogDecision",
      "configurationDecision",
      "quantityChange",
    ]) {
      const p = mutable();
      (p.findings as Record<string, unknown>[])[0][key] = "x";
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("rejects generated-output markers in a finding message", () => {
    for (const marker of [
      "```json\n{}\n```",
      "graph TD; A-->B",
      "flowchart LR",
      "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
      "<mxfile host='app'></mxfile>",
    ]) {
      const p = mutable();
      (p.findings as Record<string, unknown>[])[0].message = marker;
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("rejects proposal / final-output markers in a finding message", () => {
    for (const marker of [
      "See the technical proposal for context.",
      "The export package is ready for delivery.",
      "Use the final HLD as the basis.",
    ]) {
      const p = mutable();
      (p.findings as Record<string, unknown>[])[0].message = marker;
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });

  it("rejects certification claims in a finding message", () => {
    for (const marker of [
      "This is Cisco-certified.",
      "The result is a Cisco Validated Design certified topology.",
      "Marked BOMATIC-certified.",
    ]) {
      const p = mutable();
      (p.findings as Record<string, unknown>[])[0].message = marker;
      expect(isValidRfpHldDesignModelReviewPayload(p)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Module purity
// ---------------------------------------------------------------------------

const SOURCE_PATH = "src/lib/projects/project-rfp-hld-design-model-review.ts";
const source = readFileSync(join(process.cwd(), SOURCE_PATH), "utf8");

describe("project-rfp-hld-design-model-review module purity", () => {
  it("imports only project-rfp-hld-domain-readiness (and canonical types if needed)", () => {
    const froms = Array.from(source.matchAll(/from\s+["']([^"']+)["']/g)).map((m) => m[1]);
    const allowed = new Set([
      "@/lib/projects/project-rfp-hld-domain-readiness",
      "@/types/project",
    ]);
    for (const f of froms) {
      expect(allowed.has(f)).toBe(true);
    }
    expect(froms).toContain("@/lib/projects/project-rfp-hld-domain-readiness");
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

  it("contains no forbidden runtime primitives", () => {
    const lower = source.toLowerCase();
    for (const needle of ["process.env", "node:fs", "node:path", "anthropic", "fetch(", "drizzle"]) {
      expect(lower.includes(needle)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ASCII-only
// ---------------------------------------------------------------------------

describe("ASCII-only files", () => {
  it("source file is ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("test file is ASCII-only", () => {
    const tst = readFileSync(
      join(process.cwd(), "tests/lib/projects/project-rfp-hld-design-model-review.test.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(tst)).toBe(false);
  });
});

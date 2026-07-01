import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_DOCUMENT_PAYLOAD_KIND,
  RFP_HLD_DOCUMENT_SOURCE_MODE,
  RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
  RFP_HLD_DOCUMENT_SOURCE_MODE_MANUAL,
  RFP_HLD_DOCUMENT_AUTHORITY_KIND,
  RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
  RFP_HLD_DOCUMENT_AUTHORITY_KIND_MANUAL,
  RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
  validateRfpHldDocumentPayload,
  isValidRfpHldDocumentPayload,
  type RfpHldDocumentPayload,
} from "@/lib/projects/project-rfp-hld-document";

const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const DOCMODEL_ID = "hdocm-1";

const VALID_DRAWIO =
  `<mxfile host="app.diagrams.net"><diagram id="d1" name="Page-1">` +
  `<mxGraphModel dx="800" dy="600"><root><mxCell id="0"/>` +
  `<mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;

function validPayload(overrides: Partial<RfpHldDocumentPayload> = {}): RfpHldDocumentPayload {
  return {
    payloadKind: RFP_HLD_DOCUMENT_PAYLOAD_KIND,
    sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE,
    createdAt: "2026-06-30T00:00:00.000Z",
    createdBy: "u-se-9",
    title: "Final HLD Topology",
    uploadedFileName: "acme-hld.drawio",
    drawioXml: VALID_DRAWIO,
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceHldDocumentModelArtifactId: DOCMODEL_ID,
    sourceBundleVersion: 1,
    sourceModelVersion: 1,
    sourceDiagramVersion: 1,
    sourceDocumentModelVersion: 1,
    finalAuthority: {
      authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND,
      effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
    },
    supersedesArtifactIds: [DIAGRAM_ID, DOCMODEL_ID],
    ...overrides,
  };
}

describe("validateRfpHldDocumentPayload - accepts a valid manual upload", () => {
  it("accepts a fully valid SE manual draw.io upload payload", () => {
    const result = validateRfpHldDocumentPayload(validPayload());
    expect(result).toEqual({ valid: true, errors: [] });
    expect(isValidRfpHldDocumentPayload(validPayload())).toBe(true);
  });

  it("accepts an optional nonblank note and a bundle superseded too", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          note: "Adjusted spine layout per SE review.",
          supersedesArtifactIds: [BUNDLE_ID, DIAGRAM_ID, DOCMODEL_ID],
        })
      )
    ).toBe(true);
  });
});

describe("validateRfpHldDocumentPayload - generated + manual source modes", () => {
  it("accepts a generated_drawio_output paired with se_approved_generated_hld", () => {
    const result = validateRfpHldDocumentPayload(
      validPayload({
        sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
        finalAuthority: {
          authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
          effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
        },
      })
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("accepts a manual_drawio_upload paired with se_manual_drawio_upload", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_MANUAL,
          finalAuthority: {
            authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_MANUAL,
            effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
          },
        })
      )
    ).toBe(true);
  });

  it("rejects a mismatched sourceMode/authorityKind pair (both directions)", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
          finalAuthority: {
            authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_MANUAL,
            effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
          },
        })
      )
    ).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_MANUAL,
          finalAuthority: {
            authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
            effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
          },
        })
      )
    ).toBe(false);
  });

  it("rejects an unknown sourceMode or authorityKind", () => {
    expect(
      isValidRfpHldDocumentPayload(validPayload({ sourceMode: "ai_render" as never }))
    ).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          finalAuthority: {
            authorityKind: "ai_generated" as never,
            effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
          },
        })
      )
    ).toBe(false);
  });
});

describe("validateRfpHldDocumentPayload - draw.io XML gate", () => {
  it("rejects non-draw.io XML (wrong root element)", () => {
    for (const xml of [
      "<svg><rect/></svg>",
      "<html><body>x</body></html>",
      "<diagram></diagram>",
    ]) {
      expect(isValidRfpHldDocumentPayload(validPayload({ drawioXml: xml }))).toBe(false);
    }
  });

  it("rejects unsafe XML constructs (doctype, entity, script, javascript, event handler)", () => {
    for (const xml of [
      `<mxfile><!DOCTYPE x><diagram/></mxfile>`,
      `<mxfile><diagram>&custom;</diagram></mxfile>`,
      `<mxfile><script>alert(1)</script></mxfile>`,
      `<mxfile><diagram href="javascript:alert(1)"/></mxfile>`,
      `<mxfile><diagram onclick="x"/></mxfile>`,
      `<mxfile><![CDATA[raw]]></mxfile>`,
    ]) {
      expect(isValidRfpHldDocumentPayload(validPayload({ drawioXml: xml }))).toBe(false);
    }
  });

  it("rejects malformed XML (unclosed, mismatched, multi-root)", () => {
    for (const xml of [
      `<mxfile><diagram></mxfile>`,
      `<mxfile><a></b></mxfile>`,
      `<mxfile></mxfile><mxfile></mxfile>`,
    ]) {
      expect(isValidRfpHldDocumentPayload(validPayload({ drawioXml: xml }))).toBe(false);
    }
  });

  it("rejects a blank or non-string drawioXml", () => {
    expect(isValidRfpHldDocumentPayload(validPayload({ drawioXml: "   " }))).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(validPayload({ drawioXml: 5 as unknown as string }))
    ).toBe(false);
  });

  it("never echoes the drawio XML body in any error string", () => {
    const secret = "SECRET-DRAWIO-BODY-MARKER";
    const result = validateRfpHldDocumentPayload(
      validPayload({ drawioXml: `<mxfile>${secret}<diagram></mxfile>` })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).not.toContain(secret);
  });

  it("permits draw.io markup ONLY in drawioXml, not in other strings", () => {
    expect(
      isValidRfpHldDocumentPayload(validPayload({ title: "<mxfile>Topology</mxfile>" }))
    ).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(validPayload({ note: "see <diagram> below" }))
    ).toBe(false);
  });
});

describe("validateRfpHldDocumentPayload - fails closed on shape and authority", () => {
  it("rejects unknown top-level keys", () => {
    expect(
      isValidRfpHldDocumentPayload({ ...validPayload(), surprise: true } as unknown)
    ).toBe(false);
  });

  it("rejects an unknown key inside finalAuthority", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          finalAuthority: {
            authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND,
            effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
            extra: "x",
          } as unknown as RfpHldDocumentPayload["finalAuthority"],
        })
      )
    ).toBe(false);
  });

  it("rejects a wrong authorityKind or effective status", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          finalAuthority: {
            authorityKind: "ai_generated" as never,
            effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
          },
        })
      )
    ).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          finalAuthority: {
            authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND,
            effectiveWhenArtifactStatus: "generated" as never,
          },
        })
      )
    ).toBe(false);
  });

  it("rejects certification claims anywhere outside drawioXml", () => {
    for (const claim of [
      "Cisco-certified HLD",
      "CVD-certified topology",
      "BOMATIC-certified design",
      "AI-certified layout",
    ]) {
      expect(isValidRfpHldDocumentPayload(validPayload({ title: claim }))).toBe(false);
    }
  });

  it("rejects provider/prompt/raw-response and raw-file/storage fields", () => {
    for (const key of [
      "providerResponse",
      "aiResponse",
      "prompt",
      "completion",
      "modelName",
      "rawText",
      "filePath",
      "storagePath",
      "sourceFileIds",
      "unitPrice",
      "acceptedSku",
      "configurationDecision",
    ]) {
      expect(
        isValidRfpHldDocumentPayload({ ...validPayload(), [key]: "x" } as unknown)
      ).toBe(false);
    }
  });

  it("rejects a wrong payloadKind or sourceMode", () => {
    expect(isValidRfpHldDocumentPayload(validPayload({ payloadKind: "other" as never }))).toBe(false);
    expect(isValidRfpHldDocumentPayload(validPayload({ sourceMode: "ai_render" as never }))).toBe(false);
  });
});

describe("validateRfpHldDocumentPayload - source ids and supersession", () => {
  it("rejects a bad source order or a fifth id", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({ sourceArtifactIds: [MODEL_ID, BUNDLE_ID, DIAGRAM_ID, DOCMODEL_ID] })
      )
    ).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID, "x"] })
      )
    ).toBe(false);
  });

  it("rejects duplicate source ids", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({
          sourceHldDesignModelArtifactId: BUNDLE_ID,
          sourceArtifactIds: [BUNDLE_ID, BUNDLE_ID, DIAGRAM_ID, DOCMODEL_ID],
        })
      )
    ).toBe(false);
  });

  it("rejects supersedesArtifactIds missing the diagram or document-model id", () => {
    expect(
      isValidRfpHldDocumentPayload(validPayload({ supersedesArtifactIds: [DOCMODEL_ID] }))
    ).toBe(false);
    expect(
      isValidRfpHldDocumentPayload(validPayload({ supersedesArtifactIds: [DIAGRAM_ID] }))
    ).toBe(false);
  });

  it("rejects supersedesArtifactIds referencing an id outside the four source ids", () => {
    expect(
      isValidRfpHldDocumentPayload(
        validPayload({ supersedesArtifactIds: [DIAGRAM_ID, DOCMODEL_ID, "stranger"] })
      )
    ).toBe(false);
  });
});

describe("validateRfpHldDocumentPayload - primitive fields", () => {
  it("rejects a non-ISO createdAt and a blank createdBy/title", () => {
    expect(isValidRfpHldDocumentPayload(validPayload({ createdAt: "2026-06-30" }))).toBe(false);
    expect(isValidRfpHldDocumentPayload(validPayload({ createdBy: "  " }))).toBe(false);
    expect(isValidRfpHldDocumentPayload(validPayload({ title: "" }))).toBe(false);
  });

  it("rejects a non-draw.io uploadedFileName", () => {
    for (const name of ["acme-hld.pdf", "acme-hld", "sub/dir/acme.drawio", ""]) {
      expect(isValidRfpHldDocumentPayload(validPayload({ uploadedFileName: name }))).toBe(false);
    }
  });

  it("rejects non-positive-integer versions", () => {
    for (const key of [
      "sourceBundleVersion",
      "sourceModelVersion",
      "sourceDiagramVersion",
      "sourceDocumentModelVersion",
    ] as const) {
      expect(isValidRfpHldDocumentPayload(validPayload({ [key]: 0 }))).toBe(false);
      expect(isValidRfpHldDocumentPayload(validPayload({ [key]: 1.5 }))).toBe(false);
      expect(
        isValidRfpHldDocumentPayload(validPayload({ [key]: -1 as unknown as number }))
      ).toBe(false);
    }
  });

  it("rejects a present but blank note", () => {
    expect(isValidRfpHldDocumentPayload(validPayload({ note: "   " }))).toBe(false);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-document.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("is self-contained (imports nothing)", () => {
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

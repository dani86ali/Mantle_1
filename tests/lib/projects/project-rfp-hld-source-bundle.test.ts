import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER,
  validateRfpHldSourceBundlePayload,
  isValidRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import { RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND } from "@/lib/projects/project-rfp-hld-design-knowledge-content";

const CREATED_AT = "2026-06-23T00:00:00.000Z";

/** A coherent, fully-valid bundle payload. Fresh object per call. */
function validPayload(): RfpHldSourceBundlePayload {
  return {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    },
    authorities: {
      evidencePackage: {
        artifactId: "evp-1", artifactType: "evidence_package",
        stageId: "intake_package_review", status: "approved", version: 1,
      },
      requirementsBaseline: {
        artifactId: "req-1", artifactType: "requirements_baseline",
        stageId: "requirements_baseline_review", status: "approved", version: 1,
      },
      complianceMatrix: {
        artifactId: "cmx-1", artifactType: "compliance_matrix",
        stageId: "compliance_matrix_review", status: "approved", version: 1,
      },
      configurationAuthority: {
        artifactId: "cfg-1", artifactType: "configuration_expansion",
        stageId: "configuration_expansion_review", status: "approved", version: 1,
        sourceKind: "configuration_expansion",
      },
      hldIntake: {
        artifactId: "hint-1", artifactType: "hld_intake",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
      },
      hldReadinessSnapshot: {
        artifactId: "hrs-1", artifactType: "hld_readiness_snapshot",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_readiness_snapshot",
      },
    },
    designKnowledgePackRefs: [
      {
        artifactId: "dkp-1", artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack", domain: "campus_switching",
      },
    ],
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [
      { id: "a1", statement: "Existing core remains.", sourceArtifactId: "req-1" },
    ],
    constraints: [
      { id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" },
    ],
    warnings: [
      { id: "w1", code: "PARTIAL_DETAIL", message: "Some rack detail missing.", severity: "warning" },
    ],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

/** Clone the valid payload as a mutable record for negative mutations. */
function mutable(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

describe("validateRfpHldSourceBundlePayload - happy path", () => {
  it("accepts a fully valid payload", () => {
    const result = validateRfpHldSourceBundlePayload(validPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldSourceBundlePayload(validPayload())).toBe(true);
  });

  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND).toBe("rfp_hld_source_bundle");
    expect(RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER).toBe(
      "rfp_no_boq_service_only_exception"
    );
  });
});

describe("validateRfpHldSourceBundlePayload - top-level shape", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(isValidRfpHldSourceBundlePayload(bad)).toBe(false);
    }
  });

  it("rejects the wrong payloadKind", () => {
    const p = mutable();
    p.payloadKind = "something_else";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a blank creator", () => {
    const p = mutable();
    p.createdBy = "   ";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a non-ISO-UTC createdAt", () => {
    const p = mutable();
    p.createdAt = "2026-06-23 00:00:00";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects unexpected top-level keys", () => {
    const p = mutable();
    p.extra = true;
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("validateRfpHldSourceBundlePayload - authority references", () => {
  it("rejects a missing required authority", () => {
    const p = mutable();
    delete (p.authorities as Record<string, unknown>).evidencePackage;
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a wrong artifact type on a reference", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).evidencePackage.artifactType =
      "requirements_baseline";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a wrong stage on a reference", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).requirementsBaseline.stageId =
      "compliance_matrix_review";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a non-approved reference", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).complianceMatrix.status =
      "needs_review";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a bad version", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).hldIntake.version = 0;
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a blank artifactId on a required reference", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).evidencePackage.artifactId = "  ";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a readiness snapshot reference missing its payloadKind marker", () => {
    const p = mutable();
    delete (p.authorities as Record<string, Record<string, unknown>>).hldReadinessSnapshot
      .payloadKind;
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("validateRfpHldSourceBundlePayload - configuration authority", () => {
  it("accepts a reviewed configuration_expansion WITHOUT a payloadKind", () => {
    const p = validPayload();
    expect("payloadKind" in p.authorities.configurationAuthority).toBe(false);
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
  });

  it("accepts the no-BoQ service-only exception with its marker", () => {
    const p = mutable();
    const cfg = (p.authorities as Record<string, Record<string, unknown>>).configurationAuthority;
    cfg.sourceKind = "no_boq_service_only_exception";
    cfg.payloadKind = "rfp_no_boq_service_only_exception";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
  });

  it("rejects the no-BoQ exception WITHOUT the rfp_no_boq_service_only_exception marker", () => {
    const p = mutable();
    const cfg = (p.authorities as Record<string, Record<string, unknown>>).configurationAuthority;
    cfg.sourceKind = "no_boq_service_only_exception";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a blank artifactId on the configuration authority", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).configurationAuthority.artifactId =
      "";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a bad sourceKind", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).configurationAuthority.sourceKind =
      "made_up";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("validateRfpHldSourceBundlePayload - knowledge packs & domains", () => {
  it("rejects a blank artifactId on a design knowledge-pack reference", () => {
    const p = mutable();
    (p.designKnowledgePackRefs as Record<string, unknown>[])[0].artifactId = "";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a wrong payloadKind on a knowledge-pack reference", () => {
    const p = mutable();
    (p.designKnowledgePackRefs as Record<string, unknown>[])[0].payloadKind = "nope";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a covered domain that has no knowledge pack", () => {
    const p = mutable();
    (p.coveredDomains as string[]).push("wireless");
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a knowledge-pack domain that is not covered", () => {
    const p = mutable();
    (p.designKnowledgePackRefs as Record<string, unknown>[])[0].domain = "wireless";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects covered/excluded overlap", () => {
    const p = mutable();
    (p.excludedDomains as string[]).push("campus_switching");
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects non-empty missingDomains", () => {
    const p = mutable();
    (p.missingDomains as string[]).push("security");
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

/** A valid approved-DKP content block bijective with the campus pack ref. */
function contentBlock(): Record<string, unknown> {
  return {
    contentKind: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
    artifactId: "dkp-1",
    artifactType: "design_knowledge_pack",
    stageId: "hld_design_delta_review",
    status: "approved",
    version: 1,
    payloadKind: "rfp_hld_design_knowledge_pack",
    domain: "campus_switching",
    title: "Campus switching pack",
    source: "manual_operator_entry",
    designPrinciples: ["Collapsed core for the campus."],
    topologyGuidance: [],
    constraints: [],
    assumptions: [],
    exclusions: [],
    validationNotes: [],
    entryCount: 1,
    sectionCounts: {
      designPrinciples: 1, topologyGuidance: 0, constraints: 0,
      assumptions: 0, exclusions: 0, validationNotes: 0,
    },
  };
}

/** validPayload() plus a matching approved-DKP content array. */
function withContent(): Record<string, unknown> {
  const p = mutable();
  p.designKnowledgePackContents = [contentBlock()];
  return p;
}

describe("validateRfpHldSourceBundlePayload - approved DKP content", () => {
  it("accepts a bundle with valid content bijective with its pack refs", () => {
    const result = validateRfpHldSourceBundlePayload(withContent());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a historical bundle that omits the content field entirely", () => {
    const p = mutable();
    expect("designKnowledgePackContents" in p).toBe(false);
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
  });

  it("rejects a non-array content field", () => {
    const p = mutable();
    p.designKnowledgePackContents = { dkp: "1" };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects content whose version does not match its reference", () => {
    const p = withContent();
    (p.designKnowledgePackContents as Record<string, unknown>[])[0].version = 2;
    (p.designKnowledgePackContents as Record<string, unknown>[])[0].sectionCounts = {
      designPrinciples: 1, topologyGuidance: 0, constraints: 0,
      assumptions: 0, exclusions: 0, validationNotes: 0,
    };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects content whose domain does not match its reference", () => {
    const p = withContent();
    (p.designKnowledgePackContents as Record<string, unknown>[])[0].domain = "wireless";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects duplicate content blocks for the same pack", () => {
    const p = withContent();
    (p.designKnowledgePackContents as Record<string, unknown>[]).push(contentBlock());
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a content block with no matching pack reference", () => {
    const p = withContent();
    const extra = contentBlock();
    extra.artifactId = "dkp-ghost";
    extra.domain = "wireless";
    (p.designKnowledgePackContents as Record<string, unknown>[]).push(extra);
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a pack reference that has no content block (empty content)", () => {
    const p = mutable();
    p.designKnowledgePackContents = [];
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a malformed content object (smuggled extra key)", () => {
    const p = withContent();
    (p.designKnowledgePackContents as Record<string, unknown>[])[0].evil = "leak";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("validateRfpHldSourceBundlePayload - optional hldIntakeSource", () => {
  it("accepts a manual_override provenance object", () => {
    const p = mutable();
    p.hldIntakeSource = { sourceMode: "manual_override", manualOverrideReason: "Engineer entered manually." };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
  });

  it("accepts a questionnaire_assisted provenance object", () => {
    const p = mutable();
    p.hldIntakeSource = { sourceMode: "questionnaire_assisted", sourceQuestionnaireArtifactId: "q-1" };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
  });

  it("accepts a historical bundle that omits hldIntakeSource entirely", () => {
    const p = mutable();
    expect("hldIntakeSource" in p).toBe(false);
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
  });

  it("rejects a manual_override with a blank reason", () => {
    const p = mutable();
    p.hldIntakeSource = { sourceMode: "manual_override", manualOverrideReason: "   " };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a manual_override that carries a questionnaire id", () => {
    const p = mutable();
    p.hldIntakeSource = {
      sourceMode: "manual_override",
      manualOverrideReason: "Engineer entered manually.",
      sourceQuestionnaireArtifactId: "q-1",
    };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a questionnaire_assisted with a blank questionnaire id", () => {
    const p = mutable();
    p.hldIntakeSource = { sourceMode: "questionnaire_assisted", sourceQuestionnaireArtifactId: " " };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a questionnaire_assisted that carries a manual override reason", () => {
    const p = mutable();
    p.hldIntakeSource = {
      sourceMode: "questionnaire_assisted",
      sourceQuestionnaireArtifactId: "q-1",
      manualOverrideReason: "nope",
    };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects an invalid sourceMode", () => {
    const p = mutable();
    p.hldIntakeSource = { sourceMode: "auto" };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("does not add the source questionnaire id to sourceArtifactIds when provenance is questionnaire-assisted", () => {
    const p = mutable();
    p.hldIntakeSource = { sourceMode: "questionnaire_assisted", sourceQuestionnaireArtifactId: "q-1" };
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(true);
    // q-1 is provenance, not an authority reference.
    expect((p.sourceArtifactIds as string[])).not.toContain("q-1");
  });
});

describe("validateRfpHldSourceBundlePayload - source ids & lineage", () => {
  it("rejects duplicate referenced artifact ids across authorities", () => {
    const p = mutable();
    (p.authorities as Record<string, Record<string, unknown>>).requirementsBaseline.artifactId =
      "evp-1";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects sourceArtifactIds that miss a referenced id", () => {
    const p = mutable();
    p.sourceArtifactIds = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1"];
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects sourceArtifactIds with an extra id", () => {
    const p = mutable();
    (p.sourceArtifactIds as string[]).push("ghost-1");
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects lineage.compiledArtifactIds missing a referenced id", () => {
    const p = mutable();
    (p.lineage as Record<string, unknown>).compiledArtifactIds = [
      "evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1",
    ];
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects lineage tied to a different readiness snapshot than the approved reference", () => {
    const p = mutable();
    (p.lineage as Record<string, unknown>).compiledFromReadinessSnapshotArtifactId =
      "other-snapshot";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("validateRfpHldSourceBundlePayload - structured entries & findings", () => {
  it("rejects a malformed assumption (blank statement)", () => {
    const p = mutable();
    (p.assumptions as Record<string, unknown>[])[0].statement = "  ";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a malformed constraint (extra key)", () => {
    const p = mutable();
    (p.constraints as Record<string, unknown>[])[0].markdown = "# blob";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a warning whose severity is info", () => {
    const p = mutable();
    (p.warnings as Record<string, unknown>[])[0].severity = "info";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a blocker whose severity is warning", () => {
    const p = mutable();
    (p.blockers as Record<string, unknown>[]).push({
      id: "b1", code: "X", message: "y", severity: "warning",
    });
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects non-empty blockers even when well-formed", () => {
    const p = mutable();
    (p.blockers as Record<string, unknown>[]).push({
      id: "b1", code: "X", message: "y", severity: "blocker",
    });
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("validateRfpHldSourceBundlePayload - embedded validation", () => {
  it("rejects a non-passing embedded validation", () => {
    const p = mutable();
    (p.validation as Record<string, unknown>).status = "failed";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });

  it("rejects a non-ISO checkedAt", () => {
    const p = mutable();
    (p.validation as Record<string, unknown>).checkedAt = "yesterday";
    expect(isValidRfpHldSourceBundlePayload(p)).toBe(false);
  });
});

describe("project-rfp-hld-source-bundle module purity", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/project-rfp-hld-source-bundle.ts"),
    "utf8"
  );
  const importLines = source
    .split("\n")
    .filter((l) => /^\s*import\b/.test(l) || /from\s+["']/.test(l));

  it("imports only canonical project types and the HLD design-domain/content contracts", () => {
    const froms = Array.from(source.matchAll(/from\s+["']([^"']+)["']/g)).map((m) => m[1]);
    expect(froms.sort()).toEqual(
      [
        "@/lib/projects/project-rfp-hld-design-knowledge-content",
        "@/lib/projects/project-rfp-hld-domain-readiness",
        "@/types/project",
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
    for (const needle of forbidden) {
      for (const line of importLines) {
        expect(line.includes(needle)).toBe(false);
      }
    }
  });
});

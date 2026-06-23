import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  buildRfpOperatorWorkflow,
  type RfpArtifactSummaryInput,
  type RfpConfigurationGateInput,
} from "@/lib/projects/project-rfp-operator-workflow";

const inputApproved: RfpArtifactSummaryInput[] = [
  { id: "ip", status: "approved", version: 1 },
];
const evidenceApproved: RfpArtifactSummaryInput[] = [
  { id: "ep", status: "approved", version: 1 },
];
const requirementsApproved: RfpArtifactSummaryInput[] = [
  { id: "rb", status: "approved", version: 1 },
];

// An approved normal configuration expansion clears the gate (BoQ present).
const satisfiedNormalGate: RfpConfigurationGateInput = {
  required: true,
  satisfied: true,
  waived: false,
  status: "configuration_expansion_approved",
  message: "Configuration expansion is approved for this RFP BoQ package.",
  approvedConfigurationExpansionArtifactId: "ce-approved",
};

// An approved no-BoQ service-only exception waives the gate (no BoQ).
const satisfiedNoBoqExceptionGate: RfpConfigurationGateInput = {
  required: false,
  satisfied: true,
  waived: true,
  status: "no_boq_exception_approved",
  message: "An approved no-BoQ service-only exception waives the configuration gate.",
  noBoqExceptionArtifactId: "exception-1",
  noBoqExceptionReason: "Service-only engagement; no hardware BoQ.",
};

// Requirements satisfied upstream, but the configuration gate is still open.
const unsatisfiedGate: RfpConfigurationGateInput = {
  required: true,
  satisfied: false,
  waived: false,
  status: "requires_configuration_expansion",
  message: "An approved configuration expansion is required for this RFP BoQ package.",
};

describe("buildRfpOperatorWorkflow - active vs history selection", () => {
  it("selects the highest-version reviewable and approved artifacts", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [
        { id: "ep-1", status: "approved", version: 1 },
        { id: "ep-2", status: "approved", version: 3 },
        { id: "ep-3", status: "needs_review", version: 4 },
        { id: "ep-4", status: "generated", version: 2 },
      ],
    });

    // Current is the highest reviewable (v4), latest approved is the highest
    // approved (v3), and the active artifact is the current review work.
    expect(wf.evidencePackage.current?.id).toBe("ep-3");
    expect(wf.evidencePackage.current?.version).toBe(4);
    expect(wf.evidencePackage.latestApproved?.id).toBe("ep-2");
    expect(wf.evidencePackage.latestApproved?.version).toBe(3);
    expect(wf.evidencePackage.active?.id).toBe("ep-3");
  });

  it("routes rejected, stale, and older approved versions to collapsed history", () => {
    const wf = buildRfpOperatorWorkflow({
      requirementsBaselines: [
        { id: "rb-1", status: "approved", version: 1 },
        { id: "rb-2", status: "rejected", version: 2 },
        { id: "rb-3", status: "stale", version: 3 },
        { id: "rb-4", status: "approved", version: 4 },
        { id: "rb-5", status: "needs_review", version: 5 },
      ],
    });
    const track = wf.requirementsBaseline;

    expect(track.current?.id).toBe("rb-5");
    expect(track.latestApproved?.id).toBe("rb-4");
    // History excludes the two featured artifacts and is newest-version first.
    expect(track.history.map((h) => h.id)).toEqual(["rb-3", "rb-2", "rb-1"]);
    const reasons = Object.fromEntries(track.history.map((h) => [h.id, h.reason]));
    expect(reasons["rb-3"]).toBe("stale");
    expect(reasons["rb-2"]).toBe("rejected");
    expect(reasons["rb-1"]).toBe("superseded_approved");
  });

  it("classifies failed and not_applicable versions in history", () => {
    const wf = buildRfpOperatorWorkflow({
      complianceMatrices: [
        { id: "cm-f", status: "failed", version: 1 },
        { id: "cm-na", status: "not_applicable", version: 2 },
        { id: "cm-cur", status: "generated", version: 3 },
      ],
    });
    const reasons = Object.fromEntries(
      wf.complianceMatrix.history.map((h) => [h.id, h.reason])
    );
    expect(reasons["cm-f"]).toBe("failed");
    expect(reasons["cm-na"]).toBe("not_applicable");
    expect(wf.complianceMatrix.current?.id).toBe("cm-cur");
  });
});

describe("buildRfpOperatorWorkflow - extraction delta review counts", () => {
  it("preserves accepted/rejected/waived counts on current and history deltas", () => {
    const wf = buildRfpOperatorWorkflow({
      extractionDeltas: [
        {
          id: "xd-1",
          status: "needs_review",
          version: 1,
          payloadSummary: {
            candidateCount: 5,
            pendingCount: 1,
            acceptedCount: 2,
            rejectedCount: 1,
            waivedCount: 1,
          },
        },
        {
          id: "xd-2",
          status: "needs_review",
          version: 2,
          payloadSummary: {
            candidateCount: 9,
            pendingCount: 4,
            acceptedCount: 3,
            rejectedCount: 1,
            waivedCount: 1,
          },
        },
      ],
    });
    const track = wf.extractionDelta;

    expect(track.current?.id).toBe("xd-2");
    expect(track.current?.reviewCounts).toEqual({
      candidateCount: 9,
      pendingCount: 4,
      acceptedCount: 3,
      rejectedCount: 1,
      waivedCount: 1,
    });
    // The superseded delta keeps its review tallies for history visibility.
    expect(track.history).toHaveLength(1);
    expect(track.history[0].id).toBe("xd-1");
    expect(track.history[0].reviewCounts).toEqual({
      candidateCount: 5,
      pendingCount: 1,
      acceptedCount: 2,
      rejectedCount: 1,
      waivedCount: 1,
    });
  });

  it("leaves reviewCounts undefined for non-delta artifacts", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
    });
    expect(wf.evidencePackage.active?.reviewCounts).toBeUndefined();
  });
});

describe("buildRfpOperatorWorkflow - approved artifacts stay inspectable", () => {
  it("keeps approved evidence/requirements/compliance inspectable after the flow advances", () => {
    const wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      complianceMatrices: [{ id: "cm", status: "approved", version: 1 }],
    });

    // The flow has reached Stage 5, yet each approved gate remains inspectable.
    expect(wf.nextAction.id).toBe("stage_5_ready");
    expect(wf.evidencePackage.latestApproved?.inspectable).toBe(true);
    expect(wf.requirementsBaseline.latestApproved?.inspectable).toBe(true);
    expect(wf.complianceMatrix.latestApproved?.inspectable).toBe(true);
  });

  it("keeps a superseded approved version inspectable in history", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [
        { id: "ep-1", status: "approved", version: 1 },
        { id: "ep-2", status: "approved", version: 2 },
      ],
    });
    const superseded = wf.evidencePackage.history.find((h) => h.id === "ep-1");
    expect(superseded?.reason).toBe("superseded_approved");
    expect(superseded?.inspectable).toBe(true);
  });
});

describe("buildRfpOperatorWorkflow - automatic generation inputs", () => {
  it("auto-uses the latest approved evidence package for requirements, with no selection state", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [
        { id: "ep-1", status: "approved", version: 1 },
        { id: "ep-2", status: "approved", version: 2 },
      ],
    });
    const gen = wf.generationInputs.requirementsBaseline;

    expect(gen.evidencePackageArtifactId).toBe("ep-2");
    expect(gen.evidencePackageArtifactId).toBe(wf.evidencePackage.latestApproved?.id);
    expect(gen.ready).toBe(true);
    // Only the auto-derived id and readiness exist - never a selection field.
    expect(Object.keys(gen).sort()).toEqual([
      "evidencePackageArtifactId",
      "ready",
    ]);
  });

  it("is not ready when no approved evidence package exists", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "needs_review", version: 1 }],
    });
    expect(wf.generationInputs.requirementsBaseline.evidencePackageArtifactId).toBeUndefined();
    expect(wf.generationInputs.requirementsBaseline.ready).toBe(false);
  });

  it("is ready for compliance with a satisfied normal configuration gate and passes the approved config id", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 2 }],
      requirementsBaselines: [{ id: "rb", status: "approved", version: 3 }],
      // The configuration-expansion review track is still surfaced for the UI,
      // but the compliance config id is sourced from the gate, not this track.
      configurationExpansions: [
        { id: "ce-1", status: "approved", version: 1 },
        { id: "ce-2", status: "approved", version: 2 },
      ],
      configurationGate: satisfiedNormalGate,
    });
    const cm = wf.generationInputs.complianceMatrix;

    expect(cm.requirementsBaselineArtifactId).toBe("rb");
    expect(cm.evidencePackageArtifactId).toBe("ep");
    // The approved normal configuration-expansion id flows from the gate, not
    // the track (whose latest approved is "ce-2") - the gate is authoritative.
    expect(wf.configurationExpansion?.latestApproved?.id).toBe("ce-2");
    expect(cm.configurationExpansionArtifactId).toBe("ce-approved");
    expect(cm.ready).toBe(true);
    // The gate is surfaced verbatim so the UI can render its human-readable status.
    expect(wf.configurationGate).toEqual(satisfiedNormalGate);
  });

  it("is ready for compliance with an approved no-BoQ exception gate, waived, passing the exception id", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
      requirementsBaselines: [{ id: "rb", status: "approved", version: 1 }],
      configurationGate: satisfiedNoBoqExceptionGate,
    });
    const cm = wf.generationInputs.complianceMatrix;

    expect(cm.ready).toBe(true);
    // A waived gate authorizes the no-BoQ exception artifact as the config id.
    expect(cm.configurationExpansionArtifactId).toBe("exception-1");
    expect(wf.configurationGate?.waived).toBe(true);
  });

  it("is not ready for compliance without a satisfied configuration gate", () => {
    // No gate provided: be conservative even with both upstream gates approved.
    const noGate = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
      requirementsBaselines: [{ id: "rb", status: "approved", version: 1 }],
    });
    expect(noGate.configurationGate).toBeUndefined();
    expect(noGate.generationInputs.complianceMatrix.configurationExpansionArtifactId).toBeUndefined();
    expect(noGate.generationInputs.complianceMatrix.ready).toBe(false);

    // An unsatisfied gate also leaves compliance not ready and surfaces no id.
    const blocked = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
      requirementsBaselines: [{ id: "rb", status: "approved", version: 1 }],
      configurationGate: unsatisfiedGate,
    });
    expect(blocked.generationInputs.complianceMatrix.ready).toBe(false);
    expect(blocked.generationInputs.complianceMatrix.configurationExpansionArtifactId).toBeUndefined();

    // A satisfied gate without an approved baseline is still not ready.
    const missingBaseline = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
      configurationGate: satisfiedNormalGate,
    });
    expect(missingBaseline.generationInputs.complianceMatrix.ready).toBe(false);
  });
});

describe("buildRfpOperatorWorkflow - next action progression", () => {
  it("progresses from upload through evidence, requirements, compliance, to stage 5", () => {
    expect(buildRfpOperatorWorkflow({}).nextAction.id).toBe("upload_files");
    expect(buildRfpOperatorWorkflow({ uploadedFileCount: 2 }).nextAction.id).toBe(
      "create_input_package"
    );
    expect(
      buildRfpOperatorWorkflow({
        inputPackages: [{ id: "ip", status: "needs_review", version: 1 }],
      }).nextAction.id
    ).toBe("review_input_package");

    let wf = buildRfpOperatorWorkflow({ inputPackages: inputApproved });
    expect(wf.nextAction).toMatchObject({
      id: "prepare_evidence_review",
      stage: "evidence",
    });

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: [{ id: "ep", status: "needs_review", version: 1 }],
    });
    expect(wf.nextAction.id).toBe("review_evidence_package");

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
    });
    expect(wf.nextAction).toMatchObject({
      id: "generate_requirements_baseline",
      stage: "requirements",
    });

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: [{ id: "rb", status: "generated", version: 1 }],
    });
    expect(wf.nextAction.id).toBe("review_requirements_baseline");

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
    });
    // Requirements and evidence are approved, but the BoQ/configuration gate
    // must be completed before compliance can be generated.
    expect(wf.nextAction).toMatchObject({
      id: "complete_boq_configuration",
      stage: "configuration",
    });

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      configurationGate: satisfiedNormalGate,
    });
    expect(wf.nextAction).toMatchObject({
      id: "generate_compliance_matrix",
      stage: "compliance",
    });

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      configurationGate: satisfiedNormalGate,
      complianceMatrices: [{ id: "cm", status: "needs_review", version: 1 }],
    });
    expect(wf.nextAction.id).toBe("review_compliance_matrix");

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      configurationGate: satisfiedNormalGate,
      complianceMatrices: [{ id: "cm", status: "approved", version: 1 }],
    });
    expect(wf.nextAction).toMatchObject({ id: "stage_5_ready", stage: "stage_5" });
  });
});

describe("buildRfpOperatorWorkflow - configuration gate before compliance", () => {
  it("requires completing the BoQ/configuration gate before generating compliance", () => {
    // Requirements and evidence approved, but no configuration gate provided.
    const noGate = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
    });
    expect(noGate.nextAction).toMatchObject({
      id: "complete_boq_configuration",
      stage: "configuration",
      label: "Complete BoQ/configuration review",
    });
    // No gate message available: fall back to a generic human-readable reason.
    expect(noGate.nextAction.reason).toBe(
      "The BoQ/configuration gate must be cleared before compliance."
    );
  });

  it("surfaces the gate's own human-readable reason when the gate is unsatisfied", () => {
    const blocked = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      configurationGate: unsatisfiedGate,
    });
    expect(blocked.nextAction.id).toBe("complete_boq_configuration");
    expect(blocked.nextAction.reason).toBe(unsatisfiedGate.message);
  });

  it("advances to compliance generation once the configuration gate is satisfied", () => {
    const cleared = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      configurationGate: satisfiedNormalGate,
    });
    expect(cleared.nextAction.id).toBe("generate_compliance_matrix");
  });

  it("keeps reviewing an existing compliance draft regardless of the gate", () => {
    const withDraft = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      complianceMatrices: [{ id: "cm", status: "needs_review", version: 1 }],
    });
    // The draft-review behavior is unchanged: an open compliance draft is
    // reviewed even though no configuration gate has been provided.
    expect(withDraft.nextAction.id).toBe("review_compliance_matrix");
  });
});

describe("buildRfpOperatorWorkflow - duplicate draft guard", () => {
  it("prefers continuing an open draft over creating a duplicate", () => {
    const withDraft = buildRfpOperatorWorkflow({
      requirementsBaselines: [
        { id: "rb-1", status: "approved", version: 1 },
        { id: "rb-2", status: "needs_review", version: 2 },
      ],
    });
    expect(withDraft.requirementsBaseline.primaryActionHint).toBe("continue_review");
    expect(withDraft.requirementsBaseline.active?.id).toBe("rb-2");

    const withoutDraft = buildRfpOperatorWorkflow({
      requirementsBaselines: [{ id: "rb-1", status: "approved", version: 1 }],
    });
    expect(withoutDraft.requirementsBaseline.primaryActionHint).toBe("create_draft");

    // The next action continues the existing draft rather than regenerating.
    const flow = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: [
        { id: "rb-1", status: "approved", version: 1 },
        { id: "rb-2", status: "needs_review", version: 2 },
      ],
    });
    expect(flow.nextAction.id).toBe("review_requirements_baseline");
  });
});

describe("buildRfpOperatorWorkflow - persisted evidence status", () => {
  it("derives persisted evidence counts and presence", () => {
    const wf = buildRfpOperatorWorkflow({
      evidence: { evidenceCount: 7, textChunkCount: 5, tableEvidenceCount: 2 },
    });
    expect(wf.evidence).toEqual({
      evidenceCount: 7,
      textChunkCount: 5,
      tableEvidenceCount: 2,
      hasPersistedEvidence: true,
    });
    expect(buildRfpOperatorWorkflow({}).evidence.hasPersistedEvidence).toBe(false);
  });
});

describe("project-rfp-operator-workflow static guards", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-operator-workflow.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-operator-workflow.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });

  it("stays pure: every import is type-only, with no DB/API/fs/storage edges", () => {
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line.trimStart().startsWith("import type ")).toBe(true);
    }
    expect(source).not.toContain("/db/");
    expect(source).not.toContain("/api/");
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("drizzle");
  });

  it("contains no AI / pricing / catalog / sku / config-expansion service strings", () => {
    const forbidden = [
      "@anthropic-ai/sdk",
      "openai",
      "catalog",
      "pricing",
      "sku-resolution",
      "config-expansion",
      "approvals",
    ];
    for (const token of forbidden) {
      expect(source).not.toContain(token);
    }
  });
});

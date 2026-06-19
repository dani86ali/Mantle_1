import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  buildRfpOperatorWorkflow,
  type RfpArtifactSummaryInput,
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

  it("auto-uses latest approved baseline, evidence, and optional config expansion for compliance", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 2 }],
      requirementsBaselines: [{ id: "rb", status: "approved", version: 3 }],
      configurationExpansions: [
        { id: "ce-1", status: "approved", version: 1 },
        { id: "ce-2", status: "approved", version: 2 },
        { id: "ce-draft", status: "needs_review", version: 3 },
      ],
    });
    const cm = wf.generationInputs.complianceMatrix;

    expect(cm.requirementsBaselineArtifactId).toBe("rb");
    expect(cm.evidencePackageArtifactId).toBe("ep");
    // The optional config-expansion input is the highest approved, not the draft.
    expect(cm.configurationExpansionArtifactId).toBe("ce-2");
    expect(cm.ready).toBe(true);
  });

  it("treats configuration expansion as optional for compliance readiness", () => {
    const wf = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
      requirementsBaselines: [{ id: "rb", status: "approved", version: 1 }],
    });
    expect(wf.configurationExpansion).toBeUndefined();
    expect(wf.generationInputs.complianceMatrix.configurationExpansionArtifactId).toBeUndefined();
    expect(wf.generationInputs.complianceMatrix.ready).toBe(true);

    const missingBaseline = buildRfpOperatorWorkflow({
      evidencePackages: [{ id: "ep", status: "approved", version: 1 }],
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
    expect(wf.nextAction).toMatchObject({
      id: "generate_compliance_matrix",
      stage: "compliance",
    });

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      complianceMatrices: [{ id: "cm", status: "needs_review", version: 1 }],
    });
    expect(wf.nextAction.id).toBe("review_compliance_matrix");

    wf = buildRfpOperatorWorkflow({
      inputPackages: inputApproved,
      evidencePackages: evidenceApproved,
      requirementsBaselines: requirementsApproved,
      complianceMatrices: [{ id: "cm", status: "approved", version: 1 }],
    });
    expect(wf.nextAction).toMatchObject({ id: "stage_5_ready", stage: "stage_5" });
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

import { describe, it, expect } from "vitest";
import {
  isArtifactReviewable,
  assertArtifactReviewable,
  getArtifactStatusForApprovalDecision,
  getStageStatusForApprovalDecision,
  materializeProjectApproval,
  type ReviewableProjectArtifact,
} from "@/lib/projects/approvals";
import type { ProjectArtifactStatus } from "@/types/project";

const TENANT = "tenant-1";
const DECIDER = "user-9";

/** Build a reviewable-artifact stub with sensible defaults. */
function artifact(
  overrides: Partial<ReviewableProjectArtifact> = {}
): ReviewableProjectArtifact {
  return {
    id: "art-1",
    projectId: "proj-1",
    stageId: "boq_pricing_review",
    version: 2,
    status: "generated",
    ...overrides,
  };
}

const REVIEWABLE: readonly ProjectArtifactStatus[] = ["generated", "needs_review"];
const NON_REVIEWABLE: readonly ProjectArtifactStatus[] = [
  "missing",
  "approved",
  "rejected",
  "stale",
  "failed",
  "not_applicable",
];

describe("isArtifactReviewable", () => {
  it("is true for generated and needs_review", () => {
    for (const status of REVIEWABLE) {
      expect(isArtifactReviewable({ status })).toBe(true);
    }
  });

  it("is false for every non-reviewable status", () => {
    for (const status of NON_REVIEWABLE) {
      expect(isArtifactReviewable({ status })).toBe(false);
    }
  });
});

describe("assertArtifactReviewable", () => {
  it("does not throw for reviewable statuses", () => {
    for (const status of REVIEWABLE) {
      expect(() => assertArtifactReviewable(artifact({ status }))).not.toThrow();
    }
  });

  it("throws for missing, approved, rejected, stale, failed, not_applicable", () => {
    for (const status of NON_REVIEWABLE) {
      expect(() => assertArtifactReviewable(artifact({ status }))).toThrow(
        /is not reviewable/
      );
    }
  });
});

describe("decision -> status mapping", () => {
  it("maps approved to approved for artifact and stage", () => {
    expect(getArtifactStatusForApprovalDecision("approved")).toBe("approved");
    expect(getStageStatusForApprovalDecision("approved")).toBe("approved");
  });

  it("maps rejected to rejected for artifact and stage", () => {
    expect(getArtifactStatusForApprovalDecision("rejected")).toBe("rejected");
    expect(getStageStatusForApprovalDecision("rejected")).toBe("rejected");
  });
});

describe("materializeProjectApproval", () => {
  it("returns an insert-ready row with no id", () => {
    const row = materializeProjectApproval({
      artifact: artifact(),
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect("id" in row).toBe(false);
  });

  it("points to the exact artifact id and version", () => {
    const target = artifact({ id: "art-42", version: 7 });
    const row = materializeProjectApproval({
      artifact: target,
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect(row.artifactId).toBe("art-42");
    expect(row.artifactVersion).toBe(7);
  });

  it("derives projectId and stageId from the target artifact", () => {
    const target = artifact({
      projectId: "proj-77",
      stageId: "compliance_matrix_review",
    });
    const row = materializeProjectApproval({
      artifact: target,
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect(row.projectId).toBe("proj-77");
    expect(row.stageId).toBe("compliance_matrix_review");
    // tenantId is carried from input, not the artifact (artifact has no tenant).
    expect(row.tenantId).toBe(TENANT);
  });

  it("preserves decidedAt (a Date) and note when provided", () => {
    const decidedAt = new Date("2026-05-21T10:00:00.000Z");
    const row = materializeProjectApproval({
      artifact: artifact(),
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt,
      note: "looks good",
    });
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(row.decidedAt).toBe(decidedAt);
    expect(row.note).toBe("looks good");
  });

  it("omits the note key when no note is provided", () => {
    const row = materializeProjectApproval({
      artifact: artifact(),
      tenantId: TENANT,
      decision: "rejected",
      decidedBy: DECIDER,
    });
    expect("note" in row).toBe(false);
  });

  it("defaults decidedAt to a Date when not provided", () => {
    const row = materializeProjectApproval({
      artifact: artifact(),
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect(row.decidedAt).toBeInstanceOf(Date);
  });

  it("records the decision verbatim", () => {
    const approved = materializeProjectApproval({
      artifact: artifact(),
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    const rejected = materializeProjectApproval({
      artifact: artifact(),
      tenantId: TENANT,
      decision: "rejected",
      decidedBy: DECIDER,
    });
    expect(approved.decision).toBe("approved");
    expect(rejected.decision).toBe("rejected");
  });

  it("throws for every non-reviewable artifact status", () => {
    for (const status of NON_REVIEWABLE) {
      expect(() =>
        materializeProjectApproval({
          artifact: artifact({ status }),
          tenantId: TENANT,
          decision: "approved",
          decidedBy: DECIDER,
        })
      ).toThrow(/is not reviewable/);
    }
  });

  it("does not mutate the target artifact", () => {
    const target = artifact();
    const snapshot = structuredClone(target);
    materializeProjectApproval({
      artifact: target,
      tenantId: TENANT,
      decision: "approved",
      decidedBy: DECIDER,
      note: "n",
    });
    expect(target).toEqual(snapshot);
  });
});

describe("ProjectArtifactStatus now accepts rejected", () => {
  it("typechecks rejected as a valid artifact status", () => {
    const status: ProjectArtifactStatus = "rejected";
    expect(status).toBe("rejected");
  });
});

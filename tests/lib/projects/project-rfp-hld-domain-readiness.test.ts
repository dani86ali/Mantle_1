import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  getRfpHldDomainReadinessReport,
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const PROJECT = "proj-rfp-1";
const OTHER = "proj-other";
const TS = new Date("2026-06-20T00:00:00.000Z");

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  requirements_baseline: "requirements_baseline_review",
  compliance_matrix: "compliance_matrix_review",
  configuration_expansion: "configuration_expansion_review",
  design_knowledge_pack: "hld_design_delta_review",
};

function artifact(
  type: ProjectArtifactType,
  version: number,
  status: ProjectArtifactStatus,
  payload: Record<string, unknown>,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: `${type}-v${version}`,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "hld_design_delta_review",
    type,
    status,
    version,
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function requirements(items: Array<{ id: string; text: string }>): ProjectArtifact {
  return artifact("requirements_baseline", 1, "approved", { requirements: items });
}

function pack(
  domain: string,
  version: number,
  status: ProjectArtifactStatus = "approved",
  payload: Record<string, unknown> = {},
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return artifact(
    "design_knowledge_pack",
    version,
    status,
    {
      payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
      domain,
      title: `${domain} pack v${version}`,
      ...payload,
    },
    overrides
  );
}

function report(artifacts: ProjectArtifact[]) {
  return getRfpHldDomainReadinessReport({ projectId: PROJECT, artifacts });
}

describe("HLD domain detection", () => {
  it("detects switching and wireless from approved requirements/compliance/config with concise evidence", () => {
    const r = report([
      requirements([
        { id: "RFP-REQ-001", text: "Supply campus access switch stack for HQ" },
        { id: "RFP-REQ-002", text: "Deploy enterprise WLAN with Catalyst 9800 controller" },
      ]),
      artifact("compliance_matrix", 1, "approved", {
        rows: [{ id: "RFP-COMP-002", requirementText: "Wireless coverage", response: "Wi-Fi 6 access point per floor" }],
      }),
      artifact("configuration_expansion", 1, "approved", {
        acceptedLines: [{ id: "L1", sku: "C9300-48P", description: "Catalyst 9300 switch" }],
      }),
    ]);

    expect(r.claimedDomains).toEqual(["campus_switching", "wireless"]);
    const ev = r.detectionEvidence.find((e) => e.domain === "wireless");
    expect(ev).toMatchObject({ sourceItemId: "RFP-REQ-002", field: "text", matchedTerm: "wlan" });
    // Evidence is concise: no raw requirement text dumped.
    for (const e of r.detectionEvidence) {
      expect(Object.keys(e).sort()).toEqual(
        ["domain", "field", "matchedTerm", "reason", "sourceArtifactId", "sourceArtifactType", "sourceItemId"].sort()
      );
    }
  });

  it("only inspects approved artifacts of this project", () => {
    const r = report([
      artifact("requirements_baseline", 1, "needs_review", {
        requirements: [{ id: "RFP-REQ-001", text: "campus switch" }],
      }),
      artifact("compliance_matrix", 2, "stale", {
        rows: [{ id: "RFP-COMP-001", requirementText: "wireless wlan", response: "" }],
      }),
      artifact("configuration_expansion", 1, "approved", {
        acceptedLines: [{ id: "L1", sku: "AIR-AP", description: "wireless access point" }],
      }, { projectId: OTHER }),
    ]);

    expect(r.claimedDomains).toEqual([]);
    expect(r.detectionEvidence).toEqual([]);
    expect(r.status).toBe("ready");
  });

  it("physical_installation and documentation_training claim domains but require no packs", () => {
    const r = report([
      requirements([
        { id: "RFP-REQ-001", text: "Rack mounting and structured cabling for the room" },
        { id: "RFP-REQ-002", text: "Provide as-built documentation and operator training" },
      ]),
    ]);

    expect(r.claimedDomains).toEqual(["physical_installation", "documentation_training"]);
    expect(r.requiredKnowledgePackDomains).toEqual([]);
    expect(r.coveredDomains).toEqual(["physical_installation", "documentation_training"]);
    expect(r.status).toBe("ready");
  });
});

describe("HLD per-domain knowledge requirement", () => {
  it("a wireless project requires only a wireless pack, not a blanket switching/Cisco pack", () => {
    const reqs = requirements([{ id: "RFP-REQ-001", text: "Enterprise Wi-Fi WLAN deployment" }]);

    let r = report([reqs]);
    expect(r.requiredKnowledgePackDomains).toEqual(["wireless"]);
    expect(r.missingKnowledgePackDomains).toEqual(["wireless"]);
    expect(r.status).toBe("blocked");

    r = report([reqs, pack("wireless", 1)]);
    expect(r.missingKnowledgePackDomains).toEqual([]);
    expect(r.status).toBe("ready");
    expect(r.knowledgePackSummaries).toEqual([
      { domain: "wireless", artifactId: "design_knowledge_pack-v1", version: 1, title: "wireless pack v1" },
    ]);
  });

  it("a switching+wireless project requires both corresponding packs", () => {
    const reqs = requirements([
      { id: "RFP-REQ-001", text: "Campus switching access layer" },
      { id: "RFP-REQ-002", text: "Wireless WLAN with access point coverage" },
    ]);

    let r = report([reqs, pack("wireless", 1)]);
    expect(r.requiredKnowledgePackDomains).toEqual(["campus_switching", "wireless"]);
    expect(r.missingKnowledgePackDomains).toEqual(["campus_switching"]);
    expect(r.status).toBe("blocked");

    r = report([reqs, pack("wireless", 1), pack("campus_switching", 1)]);
    expect(r.missingKnowledgePackDomains).toEqual([]);
    expect(r.status).toBe("ready");
  });

  it("the latest valid approved pack version wins per domain", () => {
    const reqs = requirements([{ id: "RFP-REQ-001", text: "Wireless WLAN" }]);
    const r = report([reqs, pack("wireless", 1), pack("wireless", 2)]);

    expect(r.knowledgePackSummaries).toEqual([
      { domain: "wireless", artifactId: "design_knowledge_pack-v2", version: 2, title: "wireless pack v2" },
    ]);
  });
});

describe("service-only and no-BoQ exception", () => {
  it("a no-BoQ / service-only exception is not blocked on Cisco/hardware packs", () => {
    const r = report([
      artifact("configuration_expansion", 1, "approved", {
        payloadKind: "rfp_no_boq_service_only_exception",
        reason: "RFP is professional services only",
      }),
      requirements([{ id: "RFP-REQ-001", text: "Provide managed services for the network" }]),
    ]);

    expect(r.claimedDomains).toEqual(["service_only"]);
    expect(r.requiredKnowledgePackDomains).toEqual([]);
    expect(r.status).toBe("ready");
  });

  it("service_only does not replace detected technical domains", () => {
    const r = report([
      requirements([
        { id: "RFP-REQ-001", text: "Managed services wrapper" },
        { id: "RFP-REQ-002", text: "Campus switching access layer" },
      ]),
    ]);

    expect(r.claimedDomains).toEqual(["campus_switching"]);
    expect(r.status).toBe("blocked");
  });
});

describe("invalid design_knowledge_pack artifacts do not satisfy readiness", () => {
  const reqs = requirements([{ id: "RFP-REQ-001", text: "Wireless WLAN" }]);

  const cases: Array<[string, ProjectArtifact]> = [
    ["rejected status", pack("wireless", 1, "rejected")],
    ["stale status", pack("wireless", 1, "stale")],
    ["mismatched domain", pack("campus_switching", 1)],
    ["wrong stage", pack("wireless", 1, "approved", {}, { stageId: "compliance_matrix_review" })],
    ["wrong type", artifact("hld_design_delta", 1, "approved", { payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND, domain: "wireless", title: "x" })],
    ["wrong payloadKind", pack("wireless", 1, "approved", { payloadKind: "something_else" })],
    ["blank title", pack("wireless", 1, "approved", { title: "   " })],
    ["wrong project", pack("wireless", 1, "approved", {}, { projectId: OTHER })],
  ];

  for (const [name, bad] of cases) {
    it(`does not satisfy wireless with ${name}`, () => {
      const r = report([reqs, bad]);
      expect(r.missingKnowledgePackDomains).toEqual(["wireless"]);
      expect(r.status).toBe("blocked");
    });
  }

  it("knowledge pack summaries never leak arbitrary payload fields", () => {
    const r = report([
      reqs,
      pack("wireless", 1, "approved", { secretNotes: "do-not-leak", apiKey: "sk-123" }),
    ]);
    expect(r.knowledgePackSummaries).toHaveLength(1);
    expect(Object.keys(r.knowledgePackSummaries[0]).sort()).toEqual(
      ["artifactId", "domain", "title", "version"].sort()
    );
  });
});

describe("domain definitions contract", () => {
  it("declares exactly the 10 domains in deterministic order", () => {
    expect(RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)).toEqual([
      "campus_switching", "industrial_switching", "wireless", "collaboration",
      "security", "routing_wan", "data_center", "physical_installation",
      "documentation_training", "service_only",
    ]);
    const requiresPacks = RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.filter((d) => d.requiresKnowledgePack).map((d) => d.domain);
    expect(requiresPacks).toEqual([
      "campus_switching", "industrial_switching", "wireless", "collaboration",
      "security", "routing_wan", "data_center",
    ]);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-domain-readiness.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-domain-readiness.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only canonical project types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/types/project"]);
    expect(source).toMatch(/import type \{[\s\S]*?\} from "@\/types\/project";/);
  });

  it("does not read stores/files, price, configure, resolve SKUs, or call AI", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "node:fs',
      'from "node:path',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-rfp-no-boq-exception"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      ".storagePath",
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

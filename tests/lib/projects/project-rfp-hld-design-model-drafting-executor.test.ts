import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

import {
  draftRfpHldDesignModelCandidate,
  getConfiguredRfpHldDesignModelDraftingExecutor,
  type RfpHldDesignModelDraftingExecutor,
  type RfpHldDesignModelDraftingExecutorInput,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import {
  RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
  RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
import { RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-source-bundle";

/** A minimal, well-typed Stage 6D-002 candidate-input bundle fixture. */
function makeBundle(): RfpHldDesignModelCandidateInputBundle {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
    createdBy: "engineer-1",
    createdAt: "2026-06-24T00:00:00.000Z",
    sourceHldSourceBundleArtifactId: "art-source-bundle-1",
    sourceHldSourceBundleVersion: 3,
    sourceHldSourceBundlePayloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    sourceArtifactIds: ["art-source-bundle-1"],
    coveredDomains: [],
    excludedDomains: [],
    authorities: {} as RfpHldDesignModelCandidateInputBundle["authorities"],
    designKnowledgePackRefs: [],
    assumptions: [],
    constraints: [],
    warnings: [],
    instructions: {
      candidateOnly: RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
      forbidden: RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN.slice(),
    },
  };
}

describe("getConfiguredRfpHldDesignModelDraftingExecutor", () => {
  it("returns null safely and constructs/calls no provider", () => {
    expect(getConfiguredRfpHldDesignModelDraftingExecutor()).toBeNull();
    // Stable across calls; no hidden state, no construction.
    expect(getConfiguredRfpHldDesignModelDraftingExecutor()).toBeNull();
  });
});

describe("draftRfpHldDesignModelCandidate", () => {
  it("returns an unavailable result when no executor is supplied (null)", async () => {
    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: makeBundle(),
      executor: null,
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("returns an unavailable result when the executor is absent (undefined)", async () => {
    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: makeBundle(),
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("does not inspect any candidate payload detail when unavailable", async () => {
    // A hostile bundle whose property reads would throw if the boundary touched
    // them. The unavailable path must never read into it.
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error("candidate bundle must not be inspected when unavailable");
        },
      }
    ) as unknown as RfpHldDesignModelCandidateInputBundle;

    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: trap,
      executor: null,
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("passes exactly the Stage 6D-002 candidate input as the executor's only drafting input", async () => {
    const bundle = makeBundle();
    let received: RfpHldDesignModelDraftingExecutorInput | undefined;
    const executor: RfpHldDesignModelDraftingExecutor = vi.fn(async (input) => {
      received = input;
      return { payload: { anything: "untrusted" } };
    });

    await draftRfpHldDesignModelCandidate({ candidateInput: bundle, executor });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(received).toBeDefined();
    // Exactly one key: candidateInput, and it is the SAME bundle reference.
    expect(Object.keys(received as object)).toEqual(["candidateInput"]);
    expect((received as RfpHldDesignModelDraftingExecutorInput).candidateInput).toBe(
      bundle
    );
  });

  it("returns the executor draft verbatim with an untrusted, unvalidated payload", async () => {
    const bundle = makeBundle();
    // A payload that no validator would accept; the boundary must not validate
    // or reshape it - it is carried through untouched.
    const rawPayload = { not: "a-real-design-model", n: 7 };
    const executor: RfpHldDesignModelDraftingExecutor = async () => ({
      payload: rawPayload,
    });

    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: bundle,
      executor,
    });

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") throw new Error("expected drafted");
    // Same payload reference, unchanged: not validated, not persisted, not cloned.
    expect(result.draft.payload).toBe(rawPayload);
  });
});

describe("HLD design-model drafting executor boundary purity (static source check)", () => {
  const SOURCE_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-drafting-executor.ts"
  );
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("imports exactly the candidate-input bundle type, type-only", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/^import type \{/);
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-hld-design-model-candidate-input",
    ]);
  });

  it("imports no provider SDK, store, raw-document, route, or UI module", () => {
    for (const forbidden of [
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      "langchain",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/db',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/validation',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/files',
      "artifact-store",
      "project-file-store",
      "evidence-persistence",
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
      "node:fs",
      "node:path",
      "createProjectArtifactVersion",
      "createProjectApproval",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("performs no network call, dynamic require, env read, or file read", () => {
    for (const forbidden of [
      "fetch(",
      "require(",
      "process.env",
      "readFileSync",
      "readFile",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("makes no final-output, pricing/SKU/catalog/config, or certification/AI-authority claim", () => {
    const lowered = source.toLowerCase();
    for (const forbidden of [
      "draw.io",
      "drawio",
      "html",
      "proposal",
      "rendered diagram",
      "pricing",
      "catalog",
      "certified",
      "certification",
    ]) {
      expect(lowered).not.toContain(forbidden);
    }
  });

  it("keeps the new source file ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

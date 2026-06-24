/**
 * Pure, deterministic RFP HLD design-model readiness helper (Stage 6C-003).
 * Evaluates whether an hld_design_model may be created from the latest approved
 * hld_source_bundle. No DB, FS, AI, pricing, SKU, catalog, config, route, React.
 */
import type { ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  validateRfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";

export type RfpHldDesignModelReadinessStatus = "ready" | "blocked";

export type RfpHldDesignModelBlockedCode =
  | "missing_source_bundle"
  | "latest_source_bundle_not_approved"
  | "invalid_source_bundle_payload"
  | "source_bundle_artifact_mismatch";

export interface RfpHldDesignModelSourceBundleSummary {
  artifactId: string;
  version: number;
  status: string;
  sourceArtifactIds: string[];
  coveredDomains: string[];
  excludedDomains: string[];
}

export interface RfpHldDesignModelExpectedSource {
  sourceHldSourceBundleArtifactId: string;
  sourceBundleVersion: number;
  sourceBundlePayloadKind: typeof RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND;
  sourceArtifactIds: string[];
  coveredDomains: string[];
  excludedDomains: string[];
}

export interface RfpHldDesignModelReadinessReport {
  projectId: string;
  status: RfpHldDesignModelReadinessStatus;
  canCreateDesignModel: boolean;
  blockedCode?: RfpHldDesignModelBlockedCode;
  messages: string[];
  sourceBundle?: RfpHldDesignModelSourceBundleSummary;
  expectedSource?: RfpHldDesignModelExpectedSource;
}

export function getRfpHldDesignModelReadinessReport(input: {
  projectId: string;
  artifacts: readonly ProjectArtifact[];
}): RfpHldDesignModelReadinessReport {
  const { projectId, artifacts } = input;

  const bundles = artifacts.filter(
    (a) => a.projectId === projectId && a.type === "hld_source_bundle"
  );

  if (bundles.length === 0) {
    return {
      projectId,
      status: "blocked",
      canCreateDesignModel: false,
      blockedCode: "missing_source_bundle",
      messages: ["No hld_source_bundle artifact found for this project."],
    };
  }

  const latest = bundles.reduce((best, a) => (a.version > best.version ? a : best));

  if (latest.status !== "approved") {
    return {
      projectId,
      status: "blocked",
      canCreateDesignModel: false,
      blockedCode: "latest_source_bundle_not_approved",
      messages: [
        `Latest hld_source_bundle (version ${latest.version}) has status "${latest.status}"; must be "approved".`,
      ],
    };
  }

  const validation = validateRfpHldSourceBundlePayload(latest.payload);
  if (!validation.valid) {
    return {
      projectId,
      status: "blocked",
      canCreateDesignModel: false,
      blockedCode: "invalid_source_bundle_payload",
      messages: validation.errors,
    };
  }

  const bundlePayload = latest.payload as unknown as RfpHldSourceBundlePayload;
  const payloadSourceIds = bundlePayload.sourceArtifactIds;
  const artifactSourceIds = latest.sourceArtifactIds;

  const match =
    payloadSourceIds.length === artifactSourceIds.length &&
    new Set(payloadSourceIds).size === payloadSourceIds.length &&
    payloadSourceIds.every((id) => artifactSourceIds.includes(id)) &&
    artifactSourceIds.every((id) => payloadSourceIds.includes(id));

  if (!match) {
    return {
      projectId,
      status: "blocked",
      canCreateDesignModel: false,
      blockedCode: "source_bundle_artifact_mismatch",
      messages: [
        "Artifact row sourceArtifactIds does not exactly match payload sourceArtifactIds.",
      ],
    };
  }

  const sourceBundle: RfpHldDesignModelSourceBundleSummary = {
    artifactId: latest.id,
    version: latest.version,
    status: latest.status,
    sourceArtifactIds: [...payloadSourceIds],
    coveredDomains: [...bundlePayload.coveredDomains],
    excludedDomains: [...bundlePayload.excludedDomains],
  };

  const expectedSource: RfpHldDesignModelExpectedSource = {
    sourceHldSourceBundleArtifactId: latest.id,
    sourceBundleVersion: latest.version,
    sourceBundlePayloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    sourceArtifactIds: [latest.id],
    coveredDomains: [...bundlePayload.coveredDomains],
    excludedDomains: [...bundlePayload.excludedDomains],
  };

  return {
    projectId,
    status: "ready",
    canCreateDesignModel: true,
    messages: [],
    sourceBundle,
    expectedSource,
  };
}

export function validateRfpHldDesignModelSourceCompatibility(input: {
  payload: unknown;
  sourceBundleArtifact: ProjectArtifact;
}): { valid: boolean; errors: string[] } {
  const { payload, sourceBundleArtifact } = input;
  const errors: string[] = [];

  const modelResult = validateRfpHldDesignModelPayload(payload);
  if (!modelResult.valid) {
    errors.push(...modelResult.errors);
  }

  const bundleResult = validateRfpHldSourceBundlePayload(sourceBundleArtifact.payload);
  if (!bundleResult.valid) {
    errors.push(...bundleResult.errors.map((e) => `sourceBundleArtifact.payload: ${e}`));
  }

  if (sourceBundleArtifact.type !== "hld_source_bundle") {
    errors.push(`sourceBundleArtifact.type must be "hld_source_bundle"`);
  }

  if (sourceBundleArtifact.status !== "approved") {
    errors.push(`sourceBundleArtifact.status must be "approved"`);
  }

  const bundlePayload = sourceBundleArtifact.payload as unknown as RfpHldSourceBundlePayload;

  if (bundleResult.valid) {
    const payloadSrcIds = bundlePayload.sourceArtifactIds;
    const artifactSrcIds = sourceBundleArtifact.sourceArtifactIds;
    const idMatch =
      payloadSrcIds.length === artifactSrcIds.length &&
      payloadSrcIds.every((id) => artifactSrcIds.includes(id)) &&
      artifactSrcIds.every((id) => payloadSrcIds.includes(id));
    if (!idMatch) {
      errors.push(
        "sourceBundleArtifact: row sourceArtifactIds does not exactly match payload sourceArtifactIds"
      );
    }
  }

  if (modelResult.valid && bundleResult.valid) {
    const model = payload as Record<string, unknown>;

    if (model.sourceHldSourceBundleArtifactId !== sourceBundleArtifact.id) {
      errors.push(
        `model sourceHldSourceBundleArtifactId must equal sourceBundleArtifact.id "${sourceBundleArtifact.id}"`
      );
    }
    if (model.sourceBundleVersion !== sourceBundleArtifact.version) {
      errors.push(
        `model sourceBundleVersion must equal sourceBundleArtifact.version ${sourceBundleArtifact.version}`
      );
    }
    if (model.sourceBundlePayloadKind !== RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND) {
      errors.push(
        `model sourceBundlePayloadKind must be "${RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND}"`
      );
    }

    const modelSrcIds = model.sourceArtifactIds as unknown[];
    if (
      !Array.isArray(modelSrcIds) ||
      modelSrcIds.length !== 1 ||
      modelSrcIds[0] !== sourceBundleArtifact.id
    ) {
      errors.push(
        `model sourceArtifactIds must be exactly ["${sourceBundleArtifact.id}"]`
      );
    }

    const modelCovered = model.coveredDomains as unknown[];
    const bundleCovered = bundlePayload.coveredDomains;
    if (
      !Array.isArray(modelCovered) ||
      modelCovered.length !== bundleCovered.length ||
      !modelCovered.every((d, i) => d === bundleCovered[i])
    ) {
      errors.push("model coveredDomains must exactly match sourceBundleArtifact payload coveredDomains");
    }

    const modelExcluded = model.excludedDomains as unknown[];
    const bundleExcluded = bundlePayload.excludedDomains;
    if (
      !Array.isArray(modelExcluded) ||
      modelExcluded.length !== bundleExcluded.length ||
      !modelExcluded.every((d, i) => d === bundleExcluded[i])
    ) {
      errors.push("model excludedDomains must exactly match sourceBundleArtifact payload excludedDomains");
    }

    const sourceRefs = model.sourceReferences as unknown[];
    const hasBundleRef =
      Array.isArray(sourceRefs) &&
      sourceRefs.some((ref) => {
        const r = ref as Record<string, unknown>;
        return r.kind === "source_bundle" && r.artifactId === sourceBundleArtifact.id;
      });
    if (!hasBundleRef) {
      errors.push(
        `model sourceReferences must include an entry with kind "source_bundle" and artifactId "${sourceBundleArtifact.id}"`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

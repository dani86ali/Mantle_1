/**
 * Pure, deterministic HLD design-domain + knowledge-pack readiness helper.
 * Stage 6 foundation only: detects which technical design domains an RFP claims
 * from APPROVED Project artifacts (requirements_baseline, compliance_matrix,
 * configuration_expansion) and reports whether each claimed domain that needs
 * curated design knowledge has an approved design_knowledge_pack. Knowledge is
 * required per claimed technical domain only - no blanket Cisco gate. Generates no
 * HLD/proposal, reads no raw files, calls no AI, makes no pricing/SKU/config calls.
 */
import type { ProjectArtifact, ProjectArtifactType } from "@/types/project";

/** Deterministic union of HLD design domains. */
export type RfpHldDesignDomain =
  | "campus_switching"
  | "industrial_switching"
  | "wireless"
  | "collaboration"
  | "security"
  | "routing_wan"
  | "data_center"
  | "physical_installation"
  | "documentation_training"
  | "service_only";

export interface RfpHldDesignDomainDefinition {
  domain: RfpHldDesignDomain;
  label: string;
  /** Technical design domains require an approved design_knowledge_pack. */
  requiresKnowledgePack: boolean;
}

/** Payload kind a design_knowledge_pack artifact must declare to count. */
export const RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND =
  "rfp_hld_design_knowledge_pack";

const DESIGN_KNOWLEDGE_PACK_STAGE_ID = "hld_design_delta_review";
/** Local literal (not an import) of the no-BoQ / service-only exception marker. */
const NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND =
  "rfp_no_boq_service_only_exception";

/** Domains in deterministic order: technical (pack-requiring) first, then the rest. */
export const RFP_HLD_DESIGN_DOMAIN_DEFINITIONS: readonly RfpHldDesignDomainDefinition[] = [
  { domain: "campus_switching", label: "Campus switching", requiresKnowledgePack: true },
  { domain: "industrial_switching", label: "Industrial switching", requiresKnowledgePack: true },
  { domain: "wireless", label: "Wireless", requiresKnowledgePack: true },
  { domain: "collaboration", label: "Collaboration", requiresKnowledgePack: true },
  { domain: "security", label: "Security", requiresKnowledgePack: true },
  { domain: "routing_wan", label: "Routing and WAN", requiresKnowledgePack: true },
  { domain: "data_center", label: "Data center", requiresKnowledgePack: true },
  { domain: "physical_installation", label: "Physical installation", requiresKnowledgePack: false },
  { domain: "documentation_training", label: "Documentation and training", requiresKnowledgePack: false },
  { domain: "service_only", label: "Service only", requiresKnowledgePack: false },
];

/** Deterministic word-boundary keyword rules per detectable domain. */
const DOMAIN_TERMS: Partial<Record<RfpHldDesignDomain, readonly string[]>> = {
  campus_switching: ["campus", "switching", "access switch", "distribution switch", "lan switch", "ethernet switch", "stackwise", "catalyst 9200", "catalyst 9300", "catalyst 9400", "catalyst 9500", "c9200", "c9300", "c9400", "c9500"],
  industrial_switching: ["industrial", "rugged", "hardened switch", "din rail", "industrial ethernet", "ie switch", "ie-3300", "ie-3400", "ie-4000", "ie-5000"],
  wireless: ["wireless", "wi-fi", "wifi", "wlan", "access point", "wlc", "802.11", "catalyst 9800", "c9800"],
  collaboration: ["collaboration", "webex", "cucm", "call manager", "unified communications", "ip phone", "telephony", "voip", "video conferencing"],
  security: ["firewall", "ise", "nac", "vpn", "ips", "intrusion", "segmentation", "secure firewall", "ftd", "asa", "anyconnect", "identity services engine", "network access control"],
  routing_wan: ["wan", "router", "routing", "sd-wan", "sdwan", "mpls", "bgp", "ospf", "isr", "asr", "catalyst 8000", "c8000"],
  data_center: ["data center", "datacenter", "nexus", "aci", "spine", "leaf", "ucs", "vxlan", "fabricpath"],
  physical_installation: ["rack", "cabling", "mounting", "labeling", "installation", "patch panel", "pdu", "structured cabling"],
  documentation_training: ["documentation", "training", "knowledge transfer", "as-built", "as built", "handover", "runbook", "operations manual"],
  service_only: ["managed service", "managed services", "professional service", "professional services", "service-only", "services only", "support contract", "staff augmentation"],
};

/** Inspected approved artifact types and where their searchable text lives. */
const INSPECTED: ReadonlyArray<{ type: ProjectArtifactType; arrayKey: string; fields: readonly string[] }> = [
  { type: "requirements_baseline", arrayKey: "requirements", fields: ["text", "title", "notes"] },
  { type: "compliance_matrix", arrayKey: "rows", fields: ["requirementText", "response", "rationale", "notes"] },
  { type: "configuration_expansion", arrayKey: "acceptedLines", fields: ["sku", "description"] },
];

export interface RfpHldDomainDetectionEvidence {
  domain: RfpHldDesignDomain;
  sourceArtifactId: string;
  sourceArtifactType: ProjectArtifactType;
  /** Item id within the approved artifact payload, when available. */
  sourceItemId?: string;
  /** The payload field name that matched (never the full text). */
  field: string;
  matchedTerm: string;
  reason: string;
}

export interface RfpHldDesignKnowledgePackSummary {
  domain: RfpHldDesignDomain;
  artifactId: string;
  version: number;
  title: string;
}

export interface GetRfpHldDomainReadinessReportInput {
  projectId: string;
  artifacts: readonly ProjectArtifact[];
}

export type RfpHldDomainReadinessStatus = "ready" | "blocked";

export interface RfpHldDomainReadinessReport {
  projectId: string;
  claimedDomains: RfpHldDesignDomain[];
  coveredDomains: RfpHldDesignDomain[];
  technicalDomainsRequiringKnowledge: RfpHldDesignDomain[];
  requiredKnowledgePackDomains: RfpHldDesignDomain[];
  missingKnowledgePackDomains: RfpHldDesignDomain[];
  knowledgePackSummaries: RfpHldDesignKnowledgePackSummary[];
  detectionEvidence: RfpHldDomainDetectionEvidence[];
  status: RfpHldDomainReadinessStatus;
  messages: string[];
}

const TERM_RE = new Map<string, RegExp>();
function matchTerm(text: string, terms: readonly string[]): string | undefined {
  const lower = text.toLowerCase();
  for (const term of terms) {
    let re = TERM_RE.get(term);
    if (re === undefined) {
      re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      TERM_RE.set(term, re);
    }
    if (re.test(lower)) return term;
  }
  return undefined;
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is Record<string, unknown> => typeof e === "object" && e !== null
  );
}

const definition = (domain: RfpHldDesignDomain): RfpHldDesignDomainDefinition =>
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.find((d) => d.domain === domain)!;

const orderDomains = (domains: Set<RfpHldDesignDomain>): RfpHldDesignDomain[] =>
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.filter((d) => domains.has(d.domain)).map((d) => d.domain);

/** Best (highest-version) approved valid pack per domain. */
function approvedKnowledgePacks(
  artifacts: readonly ProjectArtifact[],
  projectId: string
): Map<RfpHldDesignDomain, RfpHldDesignKnowledgePackSummary> {
  const best = new Map<RfpHldDesignDomain, RfpHldDesignKnowledgePackSummary>();
  for (const artifact of artifacts) {
    if (
      artifact.projectId !== projectId ||
      artifact.type !== "design_knowledge_pack" ||
      artifact.stageId !== DESIGN_KNOWLEDGE_PACK_STAGE_ID ||
      artifact.status !== "approved" ||
      artifact.payload.payloadKind !== RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND
    )
      continue;
    const domain = artifact.payload.domain;
    const title = asString(artifact.payload.title).trim();
    if (typeof domain !== "string" || title.length === 0) continue;
    if (!RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.some((d) => d.domain === domain)) continue;
    const typed = domain as RfpHldDesignDomain;
    const current = best.get(typed);
    if (current === undefined || artifact.version > current.version) {
      best.set(typed, { domain: typed, artifactId: artifact.id, version: artifact.version, title });
    }
  }
  return best;
}

/** Deterministic keyword detection over approved inspected artifacts. */
function detectDomains(
  artifacts: readonly ProjectArtifact[],
  projectId: string
): { evidence: RfpHldDomainDetectionEvidence[]; serviceOnlyException: boolean } {
  const evidence: RfpHldDomainDetectionEvidence[] = [];
  let serviceOnlyException = false;
  for (const spec of INSPECTED) {
    for (const artifact of artifacts) {
      if (artifact.projectId !== projectId || artifact.type !== spec.type || artifact.status !== "approved")
        continue;
      if (
        spec.type === "configuration_expansion" &&
        artifact.payload.payloadKind === NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND
      )
        serviceOnlyException = true;
      for (const item of asRecordArray(artifact.payload[spec.arrayKey])) {
        const itemId = asString(item.id);
        for (const def of RFP_HLD_DESIGN_DOMAIN_DEFINITIONS) {
          const terms = DOMAIN_TERMS[def.domain];
          if (terms === undefined) continue;
          let matched: { field: string; term: string } | undefined;
          for (const field of spec.fields) {
            const term = matchTerm(asString(item[field]), terms);
            if (term !== undefined) {
              matched = { field, term };
              break;
            }
          }
          if (matched === undefined) continue;
          evidence.push({
            domain: def.domain,
            sourceArtifactId: artifact.id,
            sourceArtifactType: artifact.type,
            ...(itemId.length > 0 ? { sourceItemId: itemId } : {}),
            field: matched.field,
            matchedTerm: matched.term,
            reason: `Matched ${def.domain} term in ${matched.field}.`,
          });
        }
      }
    }
  }
  return { evidence, serviceOnlyException };
}

export function getRfpHldDomainReadinessReport(
  input: GetRfpHldDomainReadinessReportInput
): RfpHldDomainReadinessReport {
  const { projectId, artifacts } = input;
  const { evidence, serviceOnlyException } = detectDomains(artifacts, projectId);

  const detected = new Set<RfpHldDesignDomain>(evidence.map((e) => e.domain));
  const technicalDetected = RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.some(
    (d) => d.requiresKnowledgePack && detected.has(d.domain)
  );

  // service_only is a fallback: it never replaces detected technical domains.
  const claimed = new Set(detected);
  if (technicalDetected) claimed.delete("service_only");
  else if (serviceOnlyException) claimed.add("service_only");

  const claimedDomains = orderDomains(claimed);
  const packs = approvedKnowledgePacks(artifacts, projectId);

  const requiredKnowledgePackDomains = claimedDomains.filter((d) => definition(d).requiresKnowledgePack);
  const missingKnowledgePackDomains = requiredKnowledgePackDomains.filter((d) => !packs.has(d));
  const knowledgePackSummaries = requiredKnowledgePackDomains
    .filter((d) => packs.has(d))
    .map((d) => packs.get(d)!);
  const coveredDomains = claimedDomains.filter(
    (d) => !definition(d).requiresKnowledgePack || packs.has(d)
  );

  const status: RfpHldDomainReadinessStatus =
    missingKnowledgePackDomains.length === 0 ? "ready" : "blocked";

  const messages: string[] = [];
  if (status === "ready") {
    messages.push(
      requiredKnowledgePackDomains.length === 0
        ? "No design knowledge packs are required for the claimed domains."
        : "All required design knowledge packs are approved."
    );
  } else {
    messages.push(
      `HLD is blocked: ${missingKnowledgePackDomains.length} required design knowledge pack(s) missing.`
    );
    for (const d of missingKnowledgePackDomains)
      messages.push(`Missing approved design knowledge pack for ${definition(d).label}.`);
  }

  return {
    projectId,
    claimedDomains,
    coveredDomains,
    technicalDomainsRequiringKnowledge: requiredKnowledgePackDomains,
    requiredKnowledgePackDomains,
    missingKnowledgePackDomains,
    knowledgePackSummaries,
    detectionEvidence: evidence,
    status,
    messages,
  };
}

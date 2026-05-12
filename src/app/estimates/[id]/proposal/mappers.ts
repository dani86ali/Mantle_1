import type { ApiResponse, HubData } from "../hub-mappers";
import { toHubData } from "../hub-mappers";
import type { PricingTier, ProposalSection } from "@/engines/e3/types";

export const COMMERCIAL_SECTION_ID = 8;
export const DEFAULT_VALIDITY_DAYS = 30;

export interface ProposalPageData {
  hub: HubData;
  pipelineId: string | null;
  sections: ProposalSection[];
  tiers: PricingTier[];
  projectName: string;
  validityDays: number;
}

export function toProposalData(json: ApiResponse, fallbackId: string): ProposalPageData {
  const hub = toHubData(json, fallbackId);
  const e3 = json.e3 as Record<string, unknown> | null;
  const sections = (e3?.sections as ProposalSection[] | undefined) ?? [];
  const tiersRaw = e3?.tiers as { tiers?: PricingTier[] } | PricingTier[] | undefined;
  const tiers = Array.isArray(tiersRaw) ? tiersRaw : (tiersRaw?.tiers ?? []);
  const reqJson = (json.estimate as Record<string, unknown>).requirementsJson as Record<string, unknown> | undefined;
  return {
    hub,
    pipelineId: json.pipeline?.id ?? null,
    sections,
    tiers,
    projectName: (reqJson?.projectName as string) ?? hub.customerName,
    validityDays: (reqJson?.validityDays as number | undefined) ?? DEFAULT_VALIDITY_DAYS,
  };
}

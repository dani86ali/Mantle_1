import type { ApiResponse, HubData } from "../hub-mappers";
import { toHubData } from "../hub-mappers";
import type { CheckpointStatus } from "@/coordinator/types";
import type {
  PricedLine,
  ValidationRow,
  Anomalies,
  Totals,
  SimilarDealView,
} from "./sections";

export type PhaseStatus = CheckpointStatus | "not_started";

export interface PageData {
  hub: HubData;
  pipelineId: string | null;
  bom: PricedLine[];
  validationResults: ValidationRow[];
  anomalies: Anomalies | null;
  totals: Totals;
  previousTotals: Totals | null;
  similarDeals: SimilarDealView[];
  skuPhaseStatus: PhaseStatus;
  pricingPhaseStatus: PhaseStatus;
}

const ZERO_TOTALS: Totals = {
  hardwareTotal: 0,
  softwareTotal: 0,
  serviceTotal: 0,
  subscriptionTotal: 0,
  grandTotalExVat: 0,
  vatAmount: 0,
  grandTotalIncVat: 0,
};

interface RawTotals { [k: string]: unknown }

interface RawSimilarDeal {
  opportunityId?: string;
  customerName?: string;
  similarityScore?: number;
  matchFactors?: string[];
  dealValue?: number;
  outcome?: string;
  margin?: number;
}

interface RawE2 {
  bom?: unknown[];
  validationResults?: unknown[];
  anomalies?: {
    anomalies?: unknown[];
    riskLevel?: string;
    summary?: string;
  } | null;
  totals?: RawTotals | null;
  similarDeals?: { matches?: RawSimilarDeal[] } | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
}

function readTotals(t: RawTotals | null | undefined): Totals {
  if (!t) return ZERO_TOTALS;
  return {
    hardwareTotal: (t.hardwareTotal as number) ?? 0,
    softwareTotal: (t.softwareTotal as number) ?? 0,
    serviceTotal: (t.serviceTotal as number) ?? 0,
    subscriptionTotal: (t.subscriptionTotal as number) ?? 0,
    grandTotalExVat: (t.grandTotalExVat as number) ?? 0,
    vatAmount: (t.vatAmount as number) ?? 0,
    grandTotalIncVat: (t.grandTotalIncVat as number) ?? 0,
  };
}

function phaseStatus(
  pipeline: ApiResponse["pipeline"],
  id: "e2-sku-confirmation" | "e2-pricing-review",
): PhaseStatus {
  const cp = pipeline?.checkpoints.find((c) => c.id === id);
  return cp?.status ?? "not_started";
}

export function toPageData(json: ApiResponse, fallbackId: string): PageData {
  const hub = toHubData(json, fallbackId);
  const e2 = (json.e2 ?? {}) as RawE2;
  const bom: PricedLine[] = (e2.bom ?? []).map((raw, i) => {
    const l = asRecord(raw);
    return {
      id: (l.id as string) ?? `L-${i + 1}`,
      lineNumber: (l.lineNumber as number) ?? i + 1,
      sku: (l.sku as string) ?? "",
      description: (l.description as string) ?? "",
      qty: (l.qty as number) ?? 0,
      category: (l.category as string) ?? "other",
      unitListUsd: (l.unitListUsd as number) ?? 0,
      unitListSar: (l.unitListSar as number) ?? 0,
      unitSellPrice: (l.unitSellPrice as number) ?? 0,
      extendedSell: (l.extendedSell as number) ?? 0,
      vatAmount: (l.vatAmount as number) ?? 0,
      totalWithVat: (l.totalWithVat as number) ?? 0,
    };
  });
  const validationResults: ValidationRow[] = (e2.validationResults ?? []).map((raw) => {
    const r = asRecord(raw);
    return {
      ruleId: (r.ruleId as string) ?? "",
      ruleName: (r.ruleName as string) ?? "",
      severity: ((r.severity as string) ?? "info") as ValidationRow["severity"],
      passed: (r.passed as boolean) ?? false,
      message: (r.message as string) ?? "",
      affectedSkus: ((r.affectedSkus as string[]) ?? []).filter(Boolean),
    };
  });
  const anomaliesRaw = e2.anomalies;
  const anomalies: Anomalies | null = anomaliesRaw
    ? {
        anomalies: (anomaliesRaw.anomalies ?? []).map((raw, i) => {
          const a = asRecord(raw);
          return {
            id: (a.id as string) ?? `AN-${i + 1}`,
            type: (a.type as string) ?? "unusual_combination",
            description: (a.description as string) ?? "",
            severity: ((a.severity as string) ?? "warning") as "error" | "warning",
            affectedSkus: ((a.affectedSkus as string[]) ?? []).filter(Boolean),
            suggestion: (a.suggestion as string) ?? "",
          };
        }),
        riskLevel: (anomaliesRaw.riskLevel ?? "low") as Anomalies["riskLevel"],
        summary: anomaliesRaw.summary ?? "",
      }
    : null;
  const similarDeals: SimilarDealView[] = (e2.similarDeals?.matches ?? []).map((d) => ({
    opportunityId: d.opportunityId ?? "",
    customerName: d.customerName ?? "",
    similarityScore: d.similarityScore ?? 0,
    matchFactors: d.matchFactors ?? [],
    dealValue: d.dealValue ?? 0,
    outcome: d.outcome ?? "pending",
    margin: d.margin,
  }));
  const previousTotalsRaw = (json.pipeline as unknown as { previousTotals?: RawTotals } | null)
    ?.previousTotals;
  return {
    hub,
    pipelineId: json.pipeline?.id ?? null,
    bom,
    validationResults,
    anomalies,
    totals: readTotals(e2.totals),
    previousTotals: previousTotalsRaw ? readTotals(previousTotalsRaw) : null,
    similarDeals,
    skuPhaseStatus: phaseStatus(json.pipeline, "e2-sku-confirmation"),
    pricingPhaseStatus: phaseStatus(json.pipeline, "e2-pricing-review"),
  };
}

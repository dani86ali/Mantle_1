import type {
  PricedLine,
  ValidationRow,
  Anomalies,
  Totals,
} from "./sections";

export interface PageData {
  customerName: string;
  pipelineId: string | null;
  bom: PricedLine[];
  validationResults: ValidationRow[];
  anomalies: Anomalies | null;
  totals: Totals;
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

interface RawE2 {
  bom?: Array<Record<string, unknown>>;
  validationResults?: Array<Record<string, unknown>>;
  anomalies?: {
    anomalies?: Array<Record<string, unknown>>;
    riskLevel?: string;
    summary?: string;
  } | null;
  totals?: Record<string, unknown> | null;
}

export function toPageData(json: {
  estimate: Record<string, unknown>;
  e2?: RawE2 | null;
  pipeline?: { id?: string } | null;
}): PageData {
  const e2 = json.e2 ?? {};
  const bom: PricedLine[] = (e2.bom ?? []).map((l, i) => ({
    id: (l.id as string) ?? `L-${i + 1}`,
    lineNumber: (l.lineNumber as number) ?? i + 1,
    sku: (l.sku as string) ?? "",
    description: (l.description as string) ?? "",
    qty: (l.qty as number) ?? 0,
    category: (l.category as string) ?? "other",
    unitListSar: (l.unitListSar as number) ?? 0,
    unitSellPrice: (l.unitSellPrice as number) ?? 0,
    extendedSell: (l.extendedSell as number) ?? 0,
    vatAmount: (l.vatAmount as number) ?? 0,
    totalWithVat: (l.totalWithVat as number) ?? 0,
  }));
  const validationResults: ValidationRow[] = (e2.validationResults ?? []).map((r) => ({
    ruleId: (r.ruleId as string) ?? "",
    ruleName: (r.ruleName as string) ?? "",
    severity: ((r.severity as string) ?? "info") as ValidationRow["severity"],
    passed: (r.passed as boolean) ?? false,
    message: (r.message as string) ?? "",
  }));
  const anomaliesRaw = e2.anomalies;
  const anomalies: Anomalies | null = anomaliesRaw
    ? {
        anomalies: (anomaliesRaw.anomalies ?? []).map((a, i) => ({
          id: (a.id as string) ?? `AN-${i + 1}`,
          type: (a.type as string) ?? "unusual_combination",
          description: (a.description as string) ?? "",
          severity: ((a.severity as string) ?? "warning") as "error" | "warning",
          affectedSkus: ((a.affectedSkus as string[]) ?? []).filter(Boolean),
          suggestion: (a.suggestion as string) ?? "",
        })),
        riskLevel: (anomaliesRaw.riskLevel ?? "low") as Anomalies["riskLevel"],
        summary: anomaliesRaw.summary ?? "",
      }
    : null;
  const t = e2.totals ?? {};
  const totals: Totals = {
    hardwareTotal: (t.hardwareTotal as number) ?? 0,
    softwareTotal: (t.softwareTotal as number) ?? 0,
    serviceTotal: (t.serviceTotal as number) ?? 0,
    subscriptionTotal: (t.subscriptionTotal as number) ?? 0,
    grandTotalExVat: (t.grandTotalExVat as number) ?? 0,
    vatAmount: (t.vatAmount as number) ?? 0,
    grandTotalIncVat: (t.grandTotalIncVat as number) ?? 0,
  };
  return {
    customerName: (json.estimate.customerName as string) ?? "Unknown customer",
    pipelineId: json.pipeline?.id ?? null,
    bom,
    validationResults,
    anomalies,
    totals: e2.totals ? totals : ZERO_TOTALS,
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, toHubData, type ApiResponse, type HubData } from "../hub-mappers";
import {
  PricingForm,
  ImpactPreview,
  ActionBar,
  DEFAULT_CONFIG,
  validate,
  type PricingConfig,
  type BomLineLite,
  type FormErrors,
} from "./pricing-components";

interface PageData {
  hub: HubData;
  pipelineId: string | null;
  savedConfig: PricingConfig;
  bom: BomLineLite[];
  currentTotal: number | null;
  lastRunAt: string | null;
}

function configFromJson(raw: unknown, country: string): PricingConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG, country };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  const mode = o.profitMode === "markup" ? "markup" : "margin";
  return {
    fxRate: num(o.fxRate, DEFAULT_CONFIG.fxRate),
    partnerDiscountPct: num(o.partnerDiscountPct, DEFAULT_CONFIG.partnerDiscountPct),
    dealRegDiscountPct: num(o.dealRegDiscountPct, DEFAULT_CONFIG.dealRegDiscountPct),
    profitMode: mode,
    profitPct: num(o.profitPct, DEFAULT_CONFIG.profitPct),
    vatRate: num(o.vatRate, DEFAULT_CONFIG.vatRate),
    country: typeof o.country === "string" && o.country ? o.country : country,
  };
}

function toPageData(json: ApiResponse, fallbackId: string): PageData {
  const hub = toHubData(json, fallbackId);
  const estimate = json.estimate as Record<string, unknown>;
  const country = (estimate.country as string) ?? "SA";
  const reqJson = estimate.requirementsJson as Record<string, unknown> | undefined;
  const intakeCfg = reqJson?.pricingConfig;
  const savedConfig = configFromJson(intakeCfg, country);
  const bomRaw = (json.e2?.bom ?? []) as Array<Record<string, unknown>>;
  const bom: BomLineLite[] = bomRaw.map((l) => ({
    sku: (l.sku as string) ?? "",
    qty: (l.qty as number) ?? 0,
    unitListUsd: (l.unitListUsd as number) ?? 0,
    category: (l.category as string) ?? "other",
  }));
  const totals = json.e2?.totals as Record<string, unknown> | null | undefined;
  const currentTotal = totals && typeof totals.grandTotalIncVat === "number"
    ? (totals.grandTotalIncVat as number)
    : null;
  const lastRunAt: string | null = null;
  return {
    hub,
    pipelineId: json.pipeline?.id ?? null,
    savedConfig,
    bom,
    currentTotal,
    lastRunAt,
  };
}

function isDirty(a: PricingConfig, b: PricingConfig): boolean {
  return (
    a.fxRate !== b.fxRate ||
    a.partnerDiscountPct !== b.partnerDiscountPct ||
    a.dealRegDiscountPct !== b.dealRegDiscountPct ||
    a.profitMode !== b.profitMode ||
    a.profitPct !== b.profitPct ||
    a.vatRate !== b.vatRate ||
    a.country.trim().toUpperCase() !== b.country.trim().toUpperCase()
  );
}

export default function PricingPage() {
  const params = useParams();
  const id = params.id as string;
  const [page, setPage] = useState<PageData | null>(null);
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        const next = toPageData(json, id);
        setPage(next);
        setConfig(next.savedConfig);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const errors: FormErrors = useMemo(() => (config ? validate(config) : {}), [config]);
  const dirty = !!page && !!config && isDirty(config, page.savedConfig);
  const hasErrors = Object.keys(errors).length > 0;

  const navItems = useMemo(
    () => (page ? buildNavItems(id, page.hub.pipeline, page.hub.mode, page.hub.status) : []),
    [page, id],
  );

  async function handleRerun() {
    if (!page?.pipelineId || !config) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    setRerunning(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/pipeline/${page.pipelineId}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: "e2", pricingConfig: config }),
      });
      if (res.status !== 202 && !res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Re-run failed (${res.status})`);
      }
      setNotice("Re-run accepted. The BoM engine will pick up the new settings shortly.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-run failed");
    } finally {
      setRerunning(false);
    }
  }

  function handleReset() {
    if (page) setConfig({ ...DEFAULT_CONFIG, country: page.savedConfig.country });
  }

  if (loading) return <PricingSkeleton id={id} />;
  if (error && !page) return (
    <div className="p-6">
      <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">{error}</div>
    </div>
  );
  if (!page || !config) return null;

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/pricing`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Pricing Configuration</h1>
          <div className="mt-3 flex items-start gap-2 rounded-card border border-blue/20 bg-blue-muted p-3 text-sm text-text-secondary">
            <Info size={16} className="mt-0.5 shrink-0 text-blue" />
            <p>Adjust pricing parameters. Changes take effect when you re-run the BoM engine.</p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">{error}</div>
          )}
          {notice && (
            <div className="mb-4 rounded-card border border-success/30 bg-success-muted p-3 text-sm text-success">{notice}</div>
          )}
          <div className="mx-auto max-w-5xl space-y-4">
            <PricingForm config={config} errors={errors} onChange={setConfig} />
            <ImpactPreview
              currentTotal={page.currentTotal}
              lines={page.bom}
              config={config}
              dirty={dirty}
            />
          </div>
        </main>
        <ActionBar
          onRerun={handleRerun}
          onReset={handleReset}
          rerunning={rerunning}
          rerunDisabled={hasErrors || !page.pipelineId}
          lastRunAt={page.lastRunAt}
        />
      </div>
    </div>
  );
}

function PricingSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-56" />
          <div className="skeleton mt-3 h-10 w-full" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="skeleton h-64 w-full rounded-card" />
            <div className="skeleton h-40 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}

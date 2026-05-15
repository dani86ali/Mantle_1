"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { EstimateSubNav } from "../hub-components";
import type { IntakeMode } from "@/coordinator/types";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import {
  ArtifactGroup,
  DownloadAllBar,
  type ArtifactRow,
} from "./export-components";

interface DesignState {
  hldDocxPath?: string | null;
  lldDocxPath?: string | null;
  diagramXml?: string | null;
  componentList?: unknown;
}

interface PageData {
  pipeline: ApiResponse["pipeline"];
  mode: IntakeMode;
  status: string;
  groups: { title: string; rows: ArtifactRow[] }[];
}

function row(
  artifact: string,
  name: string,
  format: "xlsx" | "docx" | "pdf" | "xml" | "json",
  ready: boolean,
  comingSoon = false
): ArtifactRow {
  return { artifact, name, format, ready, comingSoon };
}

function buildGroups(json: ApiResponse, design: DesignState | null): PageData["groups"] {
  const e1 = json.e1 as { complianceMatrix?: unknown; requirements?: unknown[] } | null;
  const e2 = json.e2 as { bom?: unknown[]; filledClientBoqPath?: string } | null;
  const e3 = json.e3 as { proposalPath?: string; financialPath?: string } | null;
  const groups: PageData["groups"] = [
    {
      title: "Analysis",
      rows: [
        row("compliance", "Compliance Matrix", "xlsx", !!e1?.complianceMatrix),
        row("requirements", "Requirements Baseline", "xlsx", false, true),
      ],
    },
    {
      title: "Commercial",
      rows: [
        row("bom", "Priced BoM Workbook", "xlsx", !!e2?.bom?.length),
        row("filled_boq", "Filled Client BoQ", "xlsx", !!e2?.filledClientBoqPath),
        row("distributor", "Distributor Export", "xlsx", false, true),
      ],
    },
    {
      title: "Proposal",
      rows: [
        row("proposal", "Technical Proposal", "docx", !!e3?.proposalPath),
        row("financial", "Financial Proposal", "xlsx", !!e3?.financialPath),
        row("submission-pdf", "Submission PDF", "pdf", false, true),
      ],
    },
  ];
  if (design) {
    const designRows: ArtifactRow[] = [];
    if (design.hldDocxPath) designRows.push(row("hld", "HLD Document", "docx", true));
    if (design.lldDocxPath) designRows.push(row("lld", "LLD Document", "docx", true));
    if (design.diagramXml) designRows.push(row("diagram", "Network Diagram", "xml", true));
    if (design.componentList)
      designRows.push(row("component_list", "Component List", "json", true));
    if (designRows.length > 0) groups.push({ title: "Design", rows: designRows });
  }
  return groups;
}

function toPageData(json: ApiResponse, design: DesignState | null): PageData {
  return {
    pipeline: json.pipeline,
    mode: json.pipeline?.mode ?? "rfp",
    status: json.estimate.status ?? "DRAFT",
    groups: buildGroups(json, design),
  };
}

export default function ExportCenterPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [res, designRes] = await Promise.all([
          fetch(`/api/estimates/${id}`),
          fetch(`/api/estimates/${id}/design`),
        ]);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        const design = designRes.ok ? ((await designRes.json()) as DesignState) : null;
        if (cancelled) return;
        setData(toPageData(json, design));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const navItems = useMemo(
    () => (data ? buildNavItems(id, data.pipeline, data.mode, data.status) : []),
    [data, id, data?.mode, data?.status]
  );

  const downloadHref = (artifact: string) =>
    `/api/estimates/${id}/download?artifact=${artifact}`;

  const totals = useMemo(() => {
    if (!data) return { ready: 0, total: 0 };
    let ready = 0;
    let total = 0;
    for (const g of data.groups) {
      for (const r of g.rows) {
        total += 1;
        if (r.ready) ready += 1;
      }
    }
    return { ready, total };
  }, [data]);

  if (loading) return <ExportSkeleton id={id} />;
  if (error && !data)
    return (
      <div className="p-6">
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  if (!data) return null;

  const approved = data.status === "APPROVED";

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/export`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Export Center</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            {!approved && (
              <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning-muted p-4 text-sm text-warning">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  Approve the deal on the{" "}
                  <Link href={`/estimates/${id}/margin`} className="underline">
                    Margin Review page
                  </Link>{" "}
                  to enable downloads.
                </div>
              </div>
            )}
            {data.groups.map((g) => (
              <ArtifactGroup
                key={g.title}
                title={g.title}
                rows={g.rows}
                disabled={!approved}
                hrefFor={downloadHref}
              />
            ))}
          </div>
        </main>

        <DownloadAllBar
          ready={totals.ready}
          total={totals.total}
          disabled={!approved}
          rows={data.groups.flatMap((g) => g.rows)}
          hrefFor={downloadHref}
        />
      </div>
    </div>
  );
}

function ExportSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-56" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="skeleton h-24 w-full rounded-card" />
            <div className="skeleton h-40 w-full rounded-card" />
            <div className="skeleton h-40 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}

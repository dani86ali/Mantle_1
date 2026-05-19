"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import type {
  DesignApproach, SizingResult, CompatibilityResult, HLDSection,
} from "@/engines/e5/types";
import {
  ApproveReviseBar, DesignInputForm, DesignSkeleton, PhaseBadge, Shell, Tabs,
  type DesignInputValues, type DesignPhase, type Tab,
} from "./chrome";
import { DesignApproachTab } from "./design-approach-tab";
import { SizingTab } from "./sizing-tab";
import { HLDTab } from "./hld-tab";

interface DesignData {
  status: DesignPhase;
  designApproach: DesignApproach | null;
  topology: string | null;
  sizingResult: SizingResult | null;
  compatibilityResult: CompatibilityResult | null;
  hldSections: HLDSection[] | null;
  hldDocxPath: string | null;
  diagramXml: string | null;
  revisionNotes: string | null;
}

type Action =
  | "approve_design" | "revise_design"
  | "approve_hld" | "revise_hld";

export default function DesignPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DesignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | "submit" | null>(null);
  const [tab, setTab] = useState<Tab>("approach");
  const [navHub, setNavHub] = useState<ApiResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [d, h] = await Promise.all([
          fetch(`/api/estimates/${id}/design`),
          fetch(`/api/estimates/${id}`),
        ]);
        if (cancelled) return;
        if (h.ok) setNavHub((await h.json()) as ApiResponse);
        if (d.status === 404) { setMissing(true); return; }
        if (!d.ok) throw new Error(`Failed to load (${d.status})`);
        const json = (await d.json()) as DesignData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const navItems = useMemo(() => {
    if (!navHub) return [];
    return buildNavItems(id, navHub.pipeline, navHub.pipeline?.mode ?? "rfp", navHub.estimate.status ?? "DRAFT");
  }, [navHub, id]);

  async function refresh() {
    const r = await fetch(`/api/estimates/${id}/design`);
    if (r.ok) setData((await r.json()) as DesignData);
  }

  async function startDesign(values: DesignInputValues) {
    setBusy("submit"); setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}/design`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setMissing(false);
      await refresh();
      setNotice("Design generation started.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start failed");
    } finally { setBusy(null); }
  }

  async function dispatch(action: Action, revisionNotes?: string) {
    setBusy(action); setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}/design`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revisionNotes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      await refresh();
      setNotice(`${action.replace(/_/g, " ")} succeeded.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally { setBusy(null); }
  }

  function download(type: "hld" | "diagram") {
    window.open(`/api/estimates/${id}/design/documents?type=${type}`, "_blank");
  }

  if (loading) return <DesignSkeleton id={id} />;
  if (missing) {
    return (
      <Shell id={id} navItems={navItems}>
        <DesignInputForm busy={busy === "submit"} onSubmit={startDesign} error={error} />
      </Shell>
    );
  }
  if (error && !data) {
    return (
      <Shell id={id} navItems={navItems}>
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">{error}</div>
      </Shell>
    );
  }
  if (!data) return null;

  const tabs: Tab[] = [];
  if (data.designApproach) tabs.push("approach");
  if (data.sizingResult) tabs.push("sizing");
  if (data.hldSections) tabs.push("hld");
  const active: Tab = tabs.includes(tab) ? tab : (tabs[0] ?? "approach");
  const isBusy = busy !== null;

  return (
    <Shell id={id} navItems={navItems} headerExtras={<PhaseBadge phase={data.status} />}>
      {error && <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="mb-4 rounded-card border border-success/30 bg-success-muted p-3 text-sm text-success">{notice}</div>}
      <Tabs active={active} onChange={setTab} tabs={tabs} />
      <div className="mt-4 space-y-4">
        {active === "approach" && <DesignApproachTab approach={data.designApproach} topology={data.topology} />}
        {active === "sizing" && <SizingTab sizing={data.sizingResult} compatibility={data.compatibilityResult} />}
        {active === "hld" && <HLDTab sections={data.hldSections} hldDocxPath={data.hldDocxPath} diagramXml={data.diagramXml} onDownload={download} />}
      </div>
      {active === "approach" && (
        <ApproveReviseBar approveLabel="Approve Design" reviseLabel="Revise Design"
          busyApprove={busy === "approve_design"} busyRevise={busy === "revise_design"} busy={isBusy}
          onApprove={() => dispatch("approve_design")} onRevise={(n) => dispatch("revise_design", n)} />
      )}
      {active === "hld" && (
        <ApproveReviseBar approveLabel="Approve HLD" reviseLabel="Revise HLD"
          busyApprove={busy === "approve_hld"} busyRevise={busy === "revise_hld"} busy={isBusy}
          onApprove={() => dispatch("approve_hld")} onRevise={(n) => dispatch("revise_hld", n)} />
      )}
    </Shell>
  );
}

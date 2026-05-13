"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import type { ProjectType, QuestionnaireSection } from "@/engines/e4/types";
import {
  QuestionnaireActionBar,
  SectionCard,
  StatusBadge,
  type QuestionnaireStatus,
} from "./sections";
import { EmptyState, QuestionnaireSkeleton, Shell } from "./chrome";

interface PageData {
  sections: QuestionnaireSection[];
  markdown: string;
  projectType: ProjectType;
  status: QuestionnaireStatus;
}

interface ApiQuestionnaire {
  questionnaire: QuestionnaireSection[];
  markdown: string;
  projectType: ProjectType;
  status: QuestionnaireStatus;
}

function toPageData(json: ApiQuestionnaire): PageData {
  return {
    sections: json.questionnaire,
    markdown: json.markdown,
    projectType: json.projectType,
    status: json.status,
  };
}

type BusyAction = "approve" | "revision" | "regenerate";

export default function QuestionnairePage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [missing, setMissing] = useState(false);
  const [navHub, setNavHub] = useState<ApiResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [qRes, hubRes] = await Promise.all([
          fetch(`/api/estimates/${id}/questionnaire`),
          fetch(`/api/estimates/${id}`),
        ]);
        const hub = hubRes.ok ? ((await hubRes.json()) as ApiResponse) : null;
        if (cancelled) return;
        setNavHub(hub);
        if (qRes.status === 404) {
          setMissing(true);
          return;
        }
        if (!qRes.ok) throw new Error(`Failed to load (${qRes.status})`);
        const json = (await qRes.json()) as ApiQuestionnaire;
        if (!cancelled) setData(toPageData(json));
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

  async function generate() {
    setBusy("regenerate"); setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}/questionnaire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setData(toPageData((await res.json()) as ApiQuestionnaire));
      setMissing(false);
      setNotice("Questionnaire generated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally { setBusy(null); }
  }

  async function patch(status: "approved" | "sent", revisionNotes?: string) {
    const res = await fetch(`/api/estimates/${id}/questionnaire`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, revisionNotes }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed (${res.status})`);
    }
    const body = (await res.json()) as { status: QuestionnaireStatus };
    setData((d) => (d ? { ...d, status: body.status } : d));
  }

  async function approve() {
    setBusy("approve"); setError(null);
    try { await patch("approved"); setNotice("Questionnaire approved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Approve failed"); }
    finally { setBusy(null); }
  }

  async function requestRevision() {
    const notes = window.prompt("What revisions are required?");
    if (notes === null) return;
    setBusy("revision"); setError(null);
    try { await patch("approved", notes); setNotice("Revision notes saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Revision failed"); }
    finally { setBusy(null); }
  }

  async function copyMarkdown() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.markdown);
      setNotice("Copied questionnaire markdown to clipboard.");
    } catch { setError("Clipboard access denied."); }
  }

  if (loading) return <QuestionnaireSkeleton id={id} />;

  if (missing) {
    return (
      <Shell id={id} navItems={navItems} title="Discovery Questionnaire">
        <EmptyState
          message="No questionnaire generated yet"
          description="Run E4 phase 1 to generate the discovery questionnaire for this estimate."
          ctaLabel="Generate Now"
          busy={busy !== null}
          onCta={generate}
          error={error}
        />
      </Shell>
    );
  }

  if (error && !data) {
    return (
      <Shell id={id} navItems={navItems} title="Discovery Questionnaire">
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">
          {error}
        </div>
      </Shell>
    );
  }

  if (!data) return null;

  return (
    <Shell
      id={id}
      navItems={navItems}
      title="Discovery Questionnaire"
      headerExtras={
        <>
          <span className="rounded-full bg-blue-muted px-2.5 py-0.5 text-xs font-medium text-blue">
            {data.projectType.replace(/_/g, " ")}
          </span>
          <StatusBadge status={data.status} />
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-card border border-success/30 bg-success-muted p-3 text-sm text-success">
          {notice}
        </div>
      )}
      <div className="space-y-3">
        {data.sections.map((s) => <SectionCard key={s.id} section={s} />)}
      </div>
      <QuestionnaireActionBar
        status={data.status}
        busy={busy}
        onApprove={approve}
        onRequestRevision={requestRevision}
        onRegenerate={generate}
        onCopyMarkdown={copyMarkdown}
        onExport={() => setNotice("Export coming soon.")}
      />
    </Shell>
  );
}

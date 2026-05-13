"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import type {
  ClientResponse,
  RequirementsBaseline,
  QuestionnaireSection,
} from "@/engines/e4/types";
import type { EnhancedGapAnalysis } from "@/engines/e4/gap-detector-ai";
import { BaselineView } from "./baseline-view";
import {
  GapsList,
  ResponsesTable,
  StatusBadge,
  type ResponseStatus,
} from "./sections";
import {
  ResponsesActionBar,
  ResponsesSkeleton,
  Shell,
  Tabs,
  UploadPanel,
  type Tab,
} from "./chrome";

interface PageData {
  responses: ClientResponse[];
  gaps: EnhancedGapAnalysis;
  baseline: RequirementsBaseline;
  status: ResponseStatus;
}

type BusyAction = "validate" | "revision" | "reprocess" | "upload";

export default function ResponsesPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<PageData | null>(null);
  const [questionText, setQuestionText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("responses");
  const [navHub, setNavHub] = useState<ApiResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [rRes, qRes, hubRes] = await Promise.all([
          fetch(`/api/estimates/${id}/responses`),
          fetch(`/api/estimates/${id}/questionnaire`),
          fetch(`/api/estimates/${id}`),
        ]);
        if (cancelled) return;
        if (hubRes.ok) setNavHub((await hubRes.json()) as ApiResponse);
        if (qRes.ok) {
          const qJson = (await qRes.json()) as { questionnaire?: QuestionnaireSection[] };
          const map: Record<string, string> = {};
          (qJson.questionnaire ?? []).forEach((s) =>
            s.questions.forEach((q) => { map[q.id] = q.text; }),
          );
          if (!cancelled) setQuestionText(map);
        }
        if (rRes.status === 404) {
          if (!cancelled) setMissing(true);
          return;
        }
        if (!rRes.ok) throw new Error(`Failed to load (${rRes.status})`);
        const json = (await rRes.json()) as PageData;
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

  async function submit(body: BodyInit, headers?: Record<string, string>) {
    setBusy(missing ? "upload" : "reprocess");
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}/responses`, {
        method: "POST",
        headers,
        body,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Failed (${res.status})`);
      }
      const json = (await res.json()) as Omit<PageData, "status">;
      setData({ ...json, status: "processed" });
      setMissing(false);
      setNotice("Responses processed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Process failed");
    } finally {
      setBusy(null);
    }
  }

  function submitText(text: string) {
    void submit(JSON.stringify({ responseText: text }), { "Content-Type": "application/json" });
  }

  function submitFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    void submit(form);
  }

  async function patch(body: { action: "validate" | "reprocess"; revisionNotes?: string }) {
    const res = await fetch(`/api/estimates/${id}/responses`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Failed (${res.status})`);
    }
    return (await res.json()) as PageData;
  }

  async function validate() {
    setBusy("validate"); setError(null);
    try {
      const updated = await patch({ action: "validate" });
      setData(updated);
      setNotice("Requirements baseline validated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validate failed");
    } finally { setBusy(null); }
  }

  async function reprocess() {
    const notes = window.prompt("Revision notes for re-processing?");
    if (notes === null) return;
    const trimmed = notes.trim();
    if (trimmed.length === 0) {
      setError("Revision notes cannot be empty.");
      return;
    }
    setBusy("reprocess"); setError(null);
    try {
      const updated = await patch({ action: "reprocess", revisionNotes: trimmed });
      setData(updated);
      setNotice("Responses re-processed with revision notes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-process failed");
    } finally { setBusy(null); }
  }

  function requestRevision() {
    const notes = window.prompt("What revisions are required?");
    if (notes === null) return;
    setNotice(`Revision notes recorded: ${notes.slice(0, 60)}${notes.length > 60 ? "…" : ""}`);
  }

  if (loading) return <ResponsesSkeleton id={id} />;

  if (missing) {
    return (
      <Shell id={id} navItems={navItems}>
        <UploadPanel
          busy={busy !== null}
          onSubmitText={submitText}
          onSubmitFile={submitFile}
          error={error}
        />
      </Shell>
    );
  }

  if (error && !data) {
    return (
      <Shell id={id} navItems={navItems}>
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">
          {error}
        </div>
      </Shell>
    );
  }

  if (!data) return null;

  return (
    <Shell id={id} navItems={navItems} headerExtras={<StatusBadge status={data.status} />}>
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
      <div className="space-y-4">
        <Tabs active={tab} onChange={setTab} />
        {tab === "responses" && (
          <ResponsesTable responses={data.responses} questionText={questionText} />
        )}
        {tab === "gaps" && <GapsList gaps={data.gaps} questionText={questionText} />}
        {tab === "baseline" && <BaselineView baseline={data.baseline} />}
      </div>
      <ResponsesActionBar
        status={data.status}
        busy={busy}
        onValidate={validate}
        onRequestRevision={requestRevision}
        onReprocess={reprocess}
      />
    </Shell>
  );
}

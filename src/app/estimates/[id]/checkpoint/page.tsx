"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  FileClassificationsSection,
  RequirementsSection,
  RiskFlagsSection,
  MissingDocsSection,
  type ClassifiedFile,
  type RequirementRow,
  type RiskFlagRow,
  type DeadlineRow,
  type MissingDocRow,
} from "./sections";

type CheckpointAction = "approved" | "revision_requested" | "rejected";

interface PageData {
  customerName: string;
  pipelineId: string | null;
  pipelineStatus: string;
  files: ClassifiedFile[];
  requirements: RequirementRow[];
  riskFlags: RiskFlagRow[];
  deadlines: DeadlineRow[];
  missingDocs: MissingDocRow[];
}

export default function CheckpointPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<CheckpointAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load estimate (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setData(toPageData(json));
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

  async function decide(status: CheckpointAction) {
    if (!data?.pipelineId) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    let notes: string | undefined;
    if (status === "revision_requested") {
      const entered = window.prompt("What revisions are required?");
      if (entered === null) return;
      notes = entered;
    } else if (status === "rejected") {
      const entered = window.prompt("Reason for rejection (optional):");
      if (entered === null) return;
      notes = entered || undefined;
    }
    setSubmitting(status);
    try {
      const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      router.push(`/estimates/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setSubmitting(null);
    }
  }

  if (loading) return <CheckpointSkeleton id={id} />;

  if (error && !data) {
    return (
      <div className="p-6">
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
        <Link
          href={`/estimates/${id}`}
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
        >
          <ChevronLeft size={14} /> Back to estimate
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-text-primary">
            {id.slice(0, 12).toUpperCase()}
          </h1>
          <PipelineBadge status={data.pipelineStatus} />
          <span className="text-sm text-text-secondary">— {data.customerName}</span>
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          E1 Checkpoint: review parsed RFP artifacts before BoM generation.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
        {error && (
          <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="mx-auto max-w-5xl space-y-4">
          <Card title="File Classifications" subtitle={`${data.files.length} files`}>
            <FileClassificationsSection files={data.files} />
          </Card>
          <Card title="Requirements" subtitle={`${data.requirements.length} extracted`}>
            <RequirementsSection requirements={data.requirements} />
          </Card>
          <Card
            title="Risk Flags & Deadlines"
            subtitle={`${data.riskFlags.length} risks · ${data.deadlines.length} deadlines`}
          >
            <RiskFlagsSection flags={data.riskFlags} deadlines={data.deadlines} />
          </Card>
          <Card title="Missing Documents" subtitle={`${data.missingDocs.length} flagged`}>
            <MissingDocsSection docs={data.missingDocs} />
          </Card>
        </div>
      </main>

      <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => decide("rejected")}
            disabled={submitting !== null}
            className="rounded-button px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive-muted disabled:opacity-50"
          >
            {submitting === "rejected" ? "Rejecting…" : "Reject"}
          </button>
          <button
            onClick={() => decide("revision_requested")}
            disabled={submitting !== null}
            className="rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
          >
            {submitting === "revision_requested" ? "Submitting…" : "Request Revision"}
          </button>
          <button
            onClick={() => decide("approved")}
            disabled={submitting !== null || !data.pipelineId}
            className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting === "approved" ? "Approving…" : "Approve & Continue to BoM"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PipelineBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning-muted text-warning",
    approved: "bg-success-muted text-success",
    revision_requested: "bg-blue-muted text-blue",
    rejected: "bg-destructive-muted text-destructive",
    no_pipeline: "bg-[var(--border)] text-text-tertiary",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        map[status] ?? "bg-[var(--border)] text-text-tertiary"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CheckpointSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
        <Link
          href={`/estimates/${id}`}
          className="flex items-center gap-1 text-xs text-text-tertiary"
        >
          <ChevronLeft size={14} /> Back to estimate
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-5 w-20 rounded-full" />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-card border border-[var(--border)] bg-bg-card p-5"
            >
              <div className="skeleton mb-3 h-4 w-40" />
              <div className="skeleton h-24 w-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

interface E1Shape {
  fileClassifications?: Array<Record<string, unknown>>;
  requirements?: Array<Record<string, unknown>>;
  riskFlags?: Array<Record<string, unknown>>;
  deadlines?: Array<Record<string, unknown>>;
  missingDocuments?: Array<Record<string, unknown>>;
}

function toPageData(json: {
  estimate: Record<string, unknown>;
  e1?: E1Shape | null;
  pipeline?: { id?: string; checkpoints?: Array<{ status?: string }> } | null;
}): PageData {
  const e1 = json.e1 ?? {};
  const pipeline = json.pipeline;
  const checkpoints = pipeline?.checkpoints ?? [];
  const latest = checkpoints[checkpoints.length - 1];
  return {
    customerName: (json.estimate.customerName as string) ?? "Unknown customer",
    pipelineId: pipeline?.id ?? null,
    pipelineStatus: pipeline ? (latest?.status ?? "pending") : "no_pipeline",
    files: (e1.fileClassifications ?? []).map((f) => ({
      filename: (f.filename as string) ?? (f.path as string) ?? "",
      path: (f.path as string) ?? "",
      type: (f.type as string) ?? "unknown",
      subtype: (f.subtype as string) ?? "",
      confidence: (f.confidence as number) ?? 0,
      format: (f.format as string) ?? "",
    })),
    requirements: (e1.requirements ?? []).map((r) => ({
      id: (r.id as string) ?? "",
      text: (r.text as string) ?? "",
      classification: ((r.classification as string) ?? "optional") as RequirementRow["classification"],
      confidence: (r.confidence as number) ?? 0,
    })),
    riskFlags: (e1.riskFlags ?? []).map((r) => ({
      category: (r.category as string) ?? "",
      matchedText: (r.matchedText as string) ?? "",
      severity: ((r.severity as string) ?? "medium") as RiskFlagRow["severity"],
      source: (r.source as string) ?? "",
      pattern: (r.pattern as string) ?? "",
    })),
    deadlines: (e1.deadlines ?? []).map((d) => ({
      event: (d.event as string) ?? "",
      deadline: (d.deadline as string) ?? "",
      source: (d.source as string) ?? "",
    })),
    missingDocs: (e1.missingDocuments ?? []).map((d) => ({
      referencedDoc: (d.referencedDoc as string) ?? "",
      referencedIn: (d.referencedIn as string) ?? "",
      pattern: (d.pattern as string) ?? "",
      severity: ((d.severity as string) ?? "medium") as MissingDocRow["severity"],
    })),
  };
}

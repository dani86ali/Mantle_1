"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import type { ProposalSection, TierName } from "@/engines/e3/types";
import { ProposalSidebar } from "./proposal-sidebar";
import { SectionEditor } from "./section-editor";
import { TierPanel } from "./tier-panel";
import { ProposalActionBar, ProposalHeader, ProposalSkeleton } from "./proposal-chrome";
import { COMMERCIAL_SECTION_ID, toProposalData, type ProposalPageData } from "./mappers";

export default function ProposalReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<ProposalPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedSection, setSelectedSection] = useState<number>(0);
  const [editedSections, setEditedSections] = useState<Map<number, string>>(new Map());
  const [reviewedSections, setReviewedSections] = useState<Set<number>>(new Set());
  const [selectedTier, setSelectedTier] = useState<TierName>("better");
  const [approving, setApproving] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setData(toProposalData(json, id));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const navItems = useMemo(
    () => (data ? buildNavItems(id, data.hub.pipeline, data.hub.mode, data.hub.status) : []),
    [data, id],
  );

  const currentSection = useMemo<ProposalSection | null>(() => {
    if (!data) return null;
    if (selectedSection === COMMERCIAL_SECTION_ID && data.tiers.length > 0) {
      const tier = data.tiers.find((t) => t.name === selectedTier);
      const fromTier = tier?.sections.find((s) => s.id === selectedSection);
      if (fromTier) return fromTier;
    }
    return data.sections.find((s) => s.id === selectedSection) ?? null;
  }, [data, selectedSection, selectedTier]);

  function patchEdited(sectionId: number, content: string | null) {
    setEditedSections((prev) => {
      const next = new Map(prev);
      if (content === null) next.delete(sectionId);
      else next.set(sectionId, content);
      return next;
    });
  }

  function toggleReviewed(sectionId: number, isReviewed: boolean) {
    setReviewedSections((prev) => {
      const next = new Set(prev);
      if (isReviewed) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  }

  function flashNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  async function postCheckpoint(status: "approved" | "revision_requested", notes?: string) {
    if (!data?.pipelineId) throw new Error("No pipeline associated with this estimate.");
    const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpointId: "e3-proposal", status, notes }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
  }

  async function approveAndDownload() {
    setApproving(true);
    setError(null);
    try {
      await postCheckpoint("approved");
      window.location.href = `/api/estimates/${id}/proposal?download=docx`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  }

  async function requestRevision() {
    const notes = window.prompt("Describe what needs to change in the proposal:");
    if (!notes || !notes.trim()) return;
    setRequesting(true);
    setError(null);
    try {
      await postCheckpoint("revision_requested", notes.trim());
      router.push(`/estimates/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revision request failed");
      setRequesting(false);
    }
  }

  if (loading) return <ProposalSkeleton id={id} />;
  if (error && !data) return (
    <div className="p-6">
      <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">{error}</div>
    </div>
  );
  if (!data) return null;

  const editedIds = new Set(editedSections.keys());

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/proposal`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ProposalHeader
          estimateId={id}
          customerName={data.hub.customerName}
          projectName={data.projectName}
          createdAt={data.hub.createdAt}
          validityDays={data.validityDays}
        />

        {(error || notice) && (
          <div className="border-b border-[var(--border)] px-4 py-2 sm:px-6">
            {error && <div className="rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">{error}</div>}
            {notice && <div className="rounded-card border border-accent/30 bg-accent-muted p-3 text-sm text-accent">{notice}</div>}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden pb-20">
          <ProposalSidebar
            selectedSection={selectedSection}
            onSelect={setSelectedSection}
            reviewedSections={reviewedSections}
            editedSections={editedIds}
          />
          <SectionEditor
            section={currentSection}
            selectedId={selectedSection}
            edited={editedSections.has(selectedSection) ? editedSections.get(selectedSection) ?? null : null}
            reviewed={reviewedSections.has(selectedSection)}
            onChange={(sid, c) => patchEdited(sid, c)}
            onRevert={(sid) => patchEdited(sid, null)}
            onToggleReviewed={toggleReviewed}
            onRegenerate={() => flashNotice("Regeneration coming soon — for now, edit the text directly.")}
          />
          {selectedSection === COMMERCIAL_SECTION_ID && data.tiers.length > 0 && (
            <TierPanel tiers={data.tiers} selectedTier={selectedTier} onSelectTier={setSelectedTier} />
          )}
        </div>

        <ProposalActionBar
          reviewedCount={reviewedSections.size}
          pipelineId={data.pipelineId}
          approving={approving}
          requesting={requesting}
          onApprove={approveAndDownload}
          onRequestRevision={requestRevision}
        />
      </div>
    </div>
  );
}

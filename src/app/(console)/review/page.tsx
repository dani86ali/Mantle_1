"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ValidationFlag } from "@/components/shared/ValidationFlag";

interface BomDraft {
  id: string;
  intakeId: string;
  version: number;
  status: string;
  estimateId?: string;
  ccwUrl?: string;
  linesJson: BomLineData[];
  validationReportJson: { passed: number; warnings: number; errors: number };
  summary: {
    assumptions?: string[];
    exclusions?: string[];
    openQuestions?: string[];
    totalListPrice?: number;
    productTotal?: number;
    serviceTotal?: number;
    subscriptionTotal?: number;
  };
  quoteAdvisory?: { detected: boolean; signals: string[]; recommendation: string };
  createdAt: string;
  updatedAt: string;
}

interface BomLineData {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  category: string;
  extendedNetPrice: number;
  validationFlags: Array<{ severity: string; message: string }>;
  decision: string;
}

export default function ReviewPage() {
  const [drafts, setDrafts] = useState<BomDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<BomDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrafts();
  }, []);

  async function fetchDrafts() {
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      setDrafts(data.drafts ?? []);
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (selectedDraft) {
    return (
      <ReviewDetail
        draft={selectedDraft}
        onBack={() => {
          setSelectedDraft(null);
          fetchDrafts();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">Review Console</h1>
      <p className="mt-1 text-sm text-gray-600">
        BoM drafts ready for engineer review
      </p>

      {drafts.length === 0 ? (
        <div className="mt-12 text-center text-gray-500">
          No BoMs awaiting review.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Estimate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Lines
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Validation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Created
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {drafts.map((draft) => (
                <tr key={draft.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">
                    {draft.estimateId ?? draft.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={draft.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {draft.linesJson?.length ?? 0} items
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {draft.validationReportJson?.errors > 0 && (
                      <span className="text-red-600">
                        {draft.validationReportJson.errors} errors
                      </span>
                    )}
                    {draft.validationReportJson?.warnings > 0 && (
                      <span className="ml-2 text-yellow-600">
                        {draft.validationReportJson.warnings} warnings
                      </span>
                    )}
                    {draft.validationReportJson?.errors === 0 &&
                      draft.validationReportJson?.warnings === 0 && (
                        <span className="text-green-600">Clean</span>
                      )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(draft.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedDraft(draft)}
                      className="text-sm font-medium text-brand-primary hover:underline"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReviewDetail({
  draft,
  onBack,
}: {
  draft: BomDraft;
  onBack: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const lines = draft.linesJson ?? [];
  const summary = draft.summary ?? {};

  async function handleApprove() {
    setSaving(true);
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bomDraftId: draft.id,
          expectedVersion: draft.version,
          decision: "approved",
        }),
      });
      onBack();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700"
      >
        Back to queue
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            BoM Review — {draft.estimateId ?? draft.id.slice(0, 8)}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={draft.status} />
            <span className="text-sm text-gray-500">
              Version {draft.version}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {draft.ccwUrl && (
            <a
              href={draft.ccwUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Open in CCW
            </a>
          )}
          <a
            href={`/api/export?bomDraftId=${draft.id}&format=csv`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            CSV
          </a>
          <a
            href={`/api/export?bomDraftId=${draft.id}&format=xlsx`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            XLSX
          </a>
          <button
            onClick={handleApprove}
            disabled={saving}
            className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Approve"}
          </button>
        </div>
      </div>

      {/* Quote advisory */}
      {draft.quoteAdvisory?.detected && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-medium text-amber-800">
            Quote Path Advisory
          </h3>
          <p className="mt-1 text-sm text-amber-700">
            {draft.quoteAdvisory.recommendation}
          </p>
        </div>
      )}

      {/* Agent summary */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {summary.assumptions && summary.assumptions.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900">Assumptions</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {summary.assumptions.map((a, i) => (
                <li key={i}>- {a}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.exclusions && summary.exclusions.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900">Exclusions</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {summary.exclusions.map((e, i) => (
                <li key={i}>- {e}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.openQuestions && summary.openQuestions.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900">
              Open Questions
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {summary.openQuestions.map((q, i) => (
                <li key={i}>- {q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="mt-4 flex gap-6 text-sm">
        <span>
          Product:{" "}
          <strong>
            {formatCurrency(summary.productTotal ?? 0)}
          </strong>
        </span>
        <span>
          Service:{" "}
          <strong>
            {formatCurrency(summary.serviceTotal ?? 0)}
          </strong>
        </span>
        <span>
          Subscription:{" "}
          <strong>
            {formatCurrency(summary.subscriptionTotal ?? 0)}
          </strong>
        </span>
        <span>
          Total:{" "}
          <strong>
            {formatCurrency(summary.totalListPrice ?? 0)}
          </strong>
        </span>
      </div>

      {/* BoM line items table */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">
                #
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">
                SKU
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Description
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Category
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-500">
                Qty
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-500">
                Unit Price
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-500">
                Extended
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Flags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {lines.map((line, idx) => (
              <tr key={line.id ?? idx} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm text-gray-500">
                  {idx + 1}
                </td>
                <td className="px-3 py-2 font-mono text-sm font-medium">
                  {line.sku}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-sm text-gray-600">
                  {line.description}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {line.category}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-sm">
                  {line.quantity}
                </td>
                <td className="px-3 py-2 text-right text-sm">
                  {formatCurrency(line.unitListPrice)}
                </td>
                <td className="px-3 py-2 text-right text-sm font-medium">
                  {formatCurrency(line.extendedNetPrice)}
                </td>
                <td className="px-3 py-2">
                  {line.validationFlags?.map((flag, fi) => (
                    <ValidationFlag
                      key={fi}
                      severity={flag.severity as "error" | "warning" | "info"}
                      message={flag.message}
                    />
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

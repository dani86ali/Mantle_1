"use client";

/**
 * Canonical Project RFP intake page (Stage 4.5).
 *
 * RFP creation is a Project shell ONLY. This page collects a Project name and
 * customer, POSTs exactly { name, customerName } to /api/projects/rfp, and on
 * success routes to the RFP workspace page where runtime RFP processing
 * actually begins. It never prices, never uploads a BoQ, never resolves SKUs or
 * expands configuration, and never infers a catalog from names. It imports only
 * Next.js navigation and React, and follows the Quick BoM intake page's visual
 * conventions while staying deliberately simpler (no pricing or file fields).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const CREATE_ERROR = "Unable to create the RFP project.";
const NAVIGATE_ERROR = "Unable to open the new RFP project.";

/** Controlled error/code string from a parsed API body, else null. No stacks. */
function bodyMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error !== "") return record.error;
  if (typeof record.code === "string" && record.code !== "") return record.code;
  return null;
}

export default function NewProjectRfpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Create the canonical RFP Project shell. No pricing, file, or catalog
      // payload travels with this request - only the name and customer.
      let createRes: Response;
      try {
        createRes = await fetch("/api/projects/rfp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, customerName }),
        });
      } catch {
        setError(CREATE_ERROR);
        return;
      }
      const createBody = await createRes.json().catch(() => null);
      if (!createRes.ok) {
        setError(bodyMessage(createBody) ?? CREATE_ERROR);
        return;
      }
      const projectId = (createBody?.project as { id?: string } | undefined)?.id;
      if (typeof projectId !== "string" || projectId === "") {
        setError(CREATE_ERROR);
        return;
      }

      // Runtime RFP processing starts in the workspace, not here.
      try {
        router.push(`/projects/${projectId}/rfp`);
      } catch {
        setError(NAVIGATE_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] bg-bg-card px-6 py-3">
        <h1 className="text-lg font-semibold text-text-primary">
          New RFP Project
        </h1>
        <p className="text-xs text-text-tertiary">
          Create an RFP Project shell. Document intake and processing start in
          the RFP workspace.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <form
          className="mx-auto flex max-w-xl flex-col gap-5"
          onSubmit={handleSubmit}
          data-testid="rfp-new-form"
        >
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Project name
            <input
              data-testid="field-name"
              className="rounded-card border border-[var(--border)] bg-bg-card px-3 py-2 text-text-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Customer name
            <input
              data-testid="field-customer"
              className="rounded-card border border-[var(--border)] bg-bg-card px-3 py-2 text-text-primary"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </label>

          {error !== null && (
            <p data-testid="form-error" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            data-testid="submit"
            type="submit"
            disabled={submitting}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create RFP Project"}
          </button>
        </form>
      </div>
    </div>
  );
}

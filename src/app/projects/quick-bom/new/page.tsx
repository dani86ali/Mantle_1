"use client";

/**
 * Canonical Project Quick BoM intake page (Prompt 143).
 *
 * Quick BoM starts in the canonical Project spine - NOT the legacy estimate
 * intake pipeline. This page collects a minimal Project shell plus an initial
 * BoQ file, then drives the canonical Project APIs in a fixed sequence:
 *   1. create the Project shell        (projects/quick-bom)
 *   2. upload exactly one BoQ file     (.../quick-bom/files)
 *   3. normalize the uploaded file     (.../files/[fileId]/normalize)
 * On success it routes to the canonical Quick BoM workspace page.
 *
 * The page is payload-free: it never parses or renders artifact payloads, never
 * prices, never resolves SKUs, never expands configuration, and never infers a
 * demo catalog from names. Percent values are sent as whole percents. The
 * default is pass-through pricing (mode: markup, ratePercent: 0,
 * vatRatePercent: 15) with roundingDecimals: 2 so committed CCW-derived Unit
 * List values are not uplifted; the fields stay editable. This matches the
 * create route contract. It imports only Next.js navigation and React.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type PricingMode = "margin" | "markup";

const CREATE_ERROR = "Unable to create the Quick BoM project.";
const UPLOAD_ERROR = "Unable to upload the BoQ file.";
const NORMALIZE_ERROR = "Unable to normalize the uploaded BoQ file.";
const MISSING_FILE_ERROR = "Select a BoQ file to upload first.";

/** Controlled error/code string from a parsed API body, else null. No stacks. */
function bodyMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error !== "") return record.error;
  if (typeof record.code === "string" && record.code !== "") return record.code;
  return null;
}

export default function NewProjectQuickBomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // Pass-through pricing default: markup 0% does not uplift committed Unit List.
  const [mode, setMode] = useState<PricingMode>("markup");
  const [ratePercent, setRatePercent] = useState("0");
  const [vatRatePercent, setVatRatePercent] = useState("15");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (file === null) {
      setError(MISSING_FILE_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create the canonical Project shell.
      let createRes: Response;
      try {
        createRes = await fetch("/api/projects/quick-bom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            customerName,
            pricingConfig: {
              mode,
              ratePercent: Number(ratePercent),
              vatRatePercent: Number(vatRatePercent),
              roundingDecimals: 2,
            },
          }),
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

      // 2. Upload exactly one BoQ file under the canonical Project.
      const fd = new FormData();
      fd.append("file", file);
      let uploadRes: Response;
      try {
        uploadRes = await fetch(
          `/api/projects/${projectId}/quick-bom/files`,
          { method: "POST", body: fd }
        );
      } catch {
        setError(UPLOAD_ERROR);
        return;
      }
      const uploadBody = await uploadRes.json().catch(() => null);
      if (!uploadRes.ok) {
        setError(bodyMessage(uploadBody) ?? UPLOAD_ERROR);
        return;
      }
      const fileId = (uploadBody?.file as { id?: string } | undefined)?.id;
      if (typeof fileId !== "string" || fileId === "") {
        setError(UPLOAD_ERROR);
        return;
      }

      // 3. Normalize the uploaded file (no body).
      let normalizeRes: Response;
      try {
        normalizeRes = await fetch(
          `/api/projects/${projectId}/quick-bom/files/${fileId}/normalize`,
          { method: "POST" }
        );
      } catch {
        setError(NORMALIZE_ERROR);
        return;
      }
      if (!normalizeRes.ok) {
        const normalizeBody = await normalizeRes.json().catch(() => null);
        setError(bodyMessage(normalizeBody) ?? NORMALIZE_ERROR);
        return;
      }

      router.push(`/projects/${projectId}/quick-bom`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] bg-bg-card px-6 py-3">
        <h1 className="text-lg font-semibold text-text-primary">
          New Quick BoM Project
        </h1>
        <p className="text-xs text-text-tertiary">
          Create a canonical Project and upload an existing BoQ for pricing and
          validation.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <form
          className="mx-auto flex max-w-xl flex-col gap-5"
          onSubmit={handleSubmit}
          data-testid="quick-bom-new-form"
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
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            BoQ file (.csv or .xlsx)
            <input
              data-testid="field-file"
              type="file"
              accept=".csv,.xlsx"
              className="text-text-primary"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Pricing mode
            <select
              data-testid="field-mode"
              className="rounded-card border border-[var(--border)] bg-bg-card px-3 py-2 text-text-primary"
              value={mode}
              onChange={(e) => setMode(e.target.value as PricingMode)}
            >
              <option value="margin">Margin</option>
              <option value="markup">Markup</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Rate percent
            <input
              data-testid="field-rate"
              type="number"
              className="rounded-card border border-[var(--border)] bg-bg-card px-3 py-2 text-text-primary"
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            VAT percent
            <input
              data-testid="field-vat"
              type="number"
              className="rounded-card border border-[var(--border)] bg-bg-card px-3 py-2 text-text-primary"
              value={vatRatePercent}
              onChange={(e) => setVatRatePercent(e.target.value)}
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
            {submitting ? "Creating..." : "Create Quick BoM Project"}
          </button>
        </form>
      </div>
    </div>
  );
}

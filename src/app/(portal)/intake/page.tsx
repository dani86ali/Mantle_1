"use client";

import { useState } from "react";

type IntakePath = "path_a" | "path_b";
type Domain = "access_switching" | "wireless" | "access_switching_wireless";

export default function IntakePage() {
  const [path, setPath] = useState<IntakePath | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [region, setRegion] = useState("EMEAR");
  const [country, setCountry] = useState("SA");
  const [domain, setDomain] = useState<Domain>("access_switching");
  const [keyNeeds, setKeyNeeds] = useState("");
  const [poeRequired, setPoeRequired] = useState(false);
  const [redundancyRequired, setRedundancyRequired] = useState(true);
  const [stackingRequired, setStackingRequired] = useState(false);
  const [licenseTier, setLicenseTier] = useState<"essentials" | "advantage">("advantage");
  const [pastedText, setPastedText] = useState("");
  const [pastedBom, setPastedBom] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        path,
        customerName,
        region,
        country,
        domain,
        keyNeeds,
        poeRequired,
        redundancyRequired,
        stackingRequired,
        licenseTier,
        pastedText: pastedText || undefined,
        uploadedBomLines: pastedBom
          ? parseBomText(pastedBom)
          : undefined,
      };

      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8">
          <h2 className="text-2xl font-bold text-green-800">
            Request Received
          </h2>
          <p className="mt-4 text-green-700">
            Your request has been submitted and is being processed by the
            AI agent. You will be notified when the BoM is ready for
            review.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setPath(null);
            }}
            className="mt-6 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  if (!path) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold">New Estimate Request</h1>
        <p className="mt-2 text-gray-600">
          How would you like to get started?
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <button
            onClick={() => setPath("path_a")}
            className="rounded-lg border-2 border-gray-200 p-6 text-left transition hover:border-brand-primary hover:shadow-md"
          >
            <h3 className="text-lg font-semibold">I have a BoM</h3>
            <p className="mt-2 text-sm text-gray-600">
              Upload an existing BoM (CSV, XLSX) or paste SKU lines.
              The agent will validate, normalize, and create a CCW
              estimate.
            </p>
          </button>

          <button
            onClick={() => setPath("path_b")}
            className="rounded-lg border-2 border-gray-200 p-6 text-left transition hover:border-brand-primary hover:shadow-md"
          >
            <h3 className="text-lg font-semibold">
              I need a configuration
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Describe your requirements and the agent will design a
              complete BoM with validated SKUs.
            </p>
          </button>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold">Paste an email</h3>
          <p className="mt-1 text-sm text-gray-600">
            Paste a customer email and the AI will extract the relevant
            fields for you to confirm.
          </p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste customer email here..."
            className="mt-3 w-full rounded-md border border-gray-300 p-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            rows={5}
          />
          {pastedText && (
            <button
              onClick={() => setPath("path_b")}
              className="mt-3 rounded-md bg-brand-primary px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Continue with extracted fields
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={() => setPath(null)}
        className="mb-6 text-sm text-gray-500 hover:text-gray-700"
      >
        Back
      </button>

      <h1 className="text-2xl font-bold">
        {path === "path_a" ? "Validate Existing BoM" : "Design New BoM"}
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Customer info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Customer Name *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Domain *
            </label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as Domain)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="access_switching">Access Switching</option>
              <option value="wireless">Wireless</option>
              <option value="access_switching_wireless">Both</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="EMEAR">EMEAR</option>
              <option value="AMER">AMER</option>
              <option value="APJC">APJC</option>
              <option value="MEA">MEA</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Path-specific inputs */}
        {path === "path_a" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Paste BoM (SKU lines)
            </label>
            <textarea
              value={pastedBom}
              onChange={(e) => setPastedBom(e.target.value)}
              placeholder={"C9300L-24UXG-4X-A, 2\nC9300L-DNA-A-24-3Y, 2\nCON-SNT-C93024GA, 2"}
              className="mt-1 w-full rounded-md border border-gray-300 p-3 font-mono text-sm"
              rows={8}
            />
            <p className="mt-1 text-xs text-gray-500">
              Format: SKU, Quantity (one per line). Or upload a CSV/XLSX file.
            </p>
          </div>
        )}

        {path === "path_b" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Key Needs *
            </label>
            <textarea
              value={keyNeeds}
              onChange={(e) => setKeyNeeds(e.target.value)}
              placeholder="e.g., 48-port PoE+ switches for 3 floors, 12 APs per floor, redundant power, stacking, DNA Advantage, 3yr SmartNet"
              className="mt-1 w-full rounded-md border border-gray-300 p-3 text-sm"
              rows={4}
              required
            />
          </div>
        )}

        {/* Configuration options */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Configuration</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={poeRequired}
                onChange={(e) => setPoeRequired(e.target.checked)}
                className="rounded border-gray-300"
              />
              PoE required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={redundancyRequired}
                onChange={(e) => setRedundancyRequired(e.target.checked)}
                className="rounded border-gray-300"
              />
              Redundant PSU
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stackingRequired}
                onChange={(e) => setStackingRequired(e.target.checked)}
                className="rounded border-gray-300"
              />
              Stacking
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              License tier
            </label>
            <select
              value={licenseTier}
              onChange={(e) =>
                setLicenseTier(e.target.value as "essentials" | "advantage")
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-48"
            >
              <option value="advantage">Network Advantage</option>
              <option value="essentials">Network Essentials</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-primary px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}

function parseBomText(
  text: string
): Array<{ sku: string; quantity: number; description?: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(/[,\t]+/).map((p) => p.trim());
      return {
        sku: parts[0] ?? "",
        quantity: parseInt(parts[1] ?? "1", 10) || 1,
        description: parts[2],
      };
    })
    .filter((item) => item.sku.length > 0);
}

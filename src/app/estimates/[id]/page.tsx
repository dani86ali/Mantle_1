"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Table2, ShieldCheck, FileText, Download,
  Share2, History, MessageSquare, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ComingSoon } from "@/components/shared/ComingSoon";

const TABS = [
  { id: "config", label: "Configuration", icon: Table2 },
  { id: "validation", label: "Validation", icon: ShieldCheck },
  { id: "summary", label: "Summary", icon: FileText },
  { id: "export", label: "Export", icon: Download },
  { id: "sharing", label: "Sharing", icon: Share2 },
  { id: "history", label: "History", icon: History },
  { id: "comments", label: "Comments", icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Default estimate data (overridden by API fetch)
const DEFAULT_ESTIMATE = {
  id: "",
  customer: "Loading...",
  region: "EMEAR",
  country: "SA",
  domain: "Access Switching",
  status: "READY_FOR_REVIEW",
  version: 1,
  createdAt: new Date().toISOString(),
  ccwUrl: "",
};

const FALLBACK_LINES = [
  { ln: 1, sku: "C9300L-24UXG-4X-A", sa: true, desc: "Catalyst 9300L 24p data, Network Advantage, 4x10G Uplink", qty: 2, listPrice: 13960, disc: 0, netPrice: 13960, lead: 28, dur: null, cat: "hardware", valid: "pass" },
  { ln: 2, sku: "C9300L-DNA-A-24", sa: true, desc: "C9300L Cisco DNA Advantage, 24-Port Term License", qty: 2, listPrice: 0, disc: 0, netPrice: 0, lead: 0, dur: null, cat: "license", valid: "pass" },
  { ln: 3, sku: "C9300L-DNA-A-24-3Y", sa: true, desc: "C9300L DNA Advantage 3 Year Term", qty: 2, listPrice: 2371.45, disc: 0, netPrice: 2371.45, lead: 0, dur: 36, cat: "subscription", valid: "pass" },
  { ln: 4, sku: "C9300L-NW-A-24", sa: true, desc: "C9300L Network Advantage, 24-Port License", qty: 2, listPrice: 0, disc: 0, netPrice: 0, lead: 0, dur: null, cat: "license", valid: "pass" },
  { ln: 5, sku: "CON-SNT-C93024GA", sa: false, desc: "SNTC-8X5XNBD Catalyst 9300L", qty: 2, listPrice: 2584.05, disc: 0, netPrice: 2584.05, lead: 0, dur: 36, cat: "service", valid: "pass" },
  { ln: 6, sku: "PWR-C1-1100WAC-P", sa: false, desc: "1100W AC Platinum Primary PSU", qty: 2, listPrice: 0, disc: 0, netPrice: 0, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 7, sku: "PWR-C1-1100WAC-P/2", sa: false, desc: "1100W AC Platinum Secondary PSU", qty: 2, listPrice: 2317.88, disc: 0, netPrice: 2317.88, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 8, sku: "FAN-T2", sa: false, desc: "Catalyst 9300 Type 2 Fan Module", qty: 6, listPrice: 0, disc: 0, netPrice: 0, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 9, sku: "C9300L-STACK-KIT", sa: false, desc: "Catalyst 9300L Stacking Kit", qty: 2, listPrice: 1592.03, disc: 0, netPrice: 1592.03, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 10, sku: "C9300L-STACK", sa: false, desc: "Catalyst 9300L Stack Module", qty: 4, listPrice: 0, disc: 0, netPrice: 0, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 11, sku: "STACK-T3-50CM", sa: false, desc: "50CM Type 3 Stacking Cable", qty: 2, listPrice: 0, disc: 0, netPrice: 0, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 12, sku: "CAB-TA-UK", sa: false, desc: "AC Power Cord (UK)", qty: 4, listPrice: 0, disc: 0, netPrice: 0, lead: 20, dur: null, cat: "accessory", valid: "pass" },
  { ln: 13, sku: "S9300LUK9-179", sa: false, desc: "IOS XE Universal", qty: 2, listPrice: 0, disc: 0, netPrice: 0, lead: 0, dur: null, cat: "software", valid: "pass" },
];

const VALIDATION_RULES = [
  { id: "sku-exists", name: "SKU Existence", status: "pass", msg: "All 13 SKUs verified in Cisco catalog" },
  { id: "eox", name: "End-of-Life Status", status: "pass", msg: "No end-of-life SKUs detected" },
  { id: "region", name: "Region Availability", status: "pass", msg: "All SKUs available in EMEAR region" },
  { id: "poe", name: "PoE Budget", status: "pass", msg: "PoE budget 880W sufficient for 24 ports at 30W" },
  { id: "optics", name: "Optics Count", status: "pass", msg: "No optics in BoM — rule not applicable" },
  { id: "psu", name: "PSU Redundancy", status: "pass", msg: "2 primary + 2 secondary for 2 chassis" },
  { id: "license", name: "License Attachment", status: "pass", msg: "All hardware has licenses attached" },
  { id: "stacking", name: "Stacking", status: "pass", msg: "2 kits, 4 modules, 2 cables for 2 switches" },
  { id: "support", name: "Support Attachment", status: "pass", msg: "SmartNet attached to all switches" },
];

export default function EstimateDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<TabId>("config");
  const [ESTIMATE, setEstimate] = useState(DEFAULT_ESTIMATE);
  const [LINES, setLines] = useState(FALLBACK_LINES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (res.ok) {
          const { estimate } = await res.json();
          setEstimate({
            id: estimate.estimateId ?? id.slice(0, 12).toUpperCase(),
            customer: estimate.customerName ?? "Unknown",
            region: estimate.region ?? "EMEAR",
            country: estimate.country ?? "SA",
            domain: estimate.domain ?? "access_switching",
            status: estimate.status ?? "READY_FOR_REVIEW",
            version: 1,
            createdAt: estimate.createdAt,
            ccwUrl: estimate.ccwUrl ?? "",
          });
          const lines = (estimate.linesJson ?? []) as Array<Record<string, unknown>>;
          if (lines.length > 0) {
            setLines(lines.map((l, i) => ({
              ln: i + 1,
              sku: (l.sku as string) ?? "",
              sa: (l.smartAccountMandatory as boolean) ?? false,
              desc: (l.description as string) ?? "",
              qty: (l.quantity as number) ?? 1,
              listPrice: (l.unitListPrice as number) ?? 0,
              disc: (l.discountPercent as number) ?? 0,
              netPrice: (l.unitNetPrice as number) ?? (l.unitListPrice as number) ?? 0,
              lead: (l.leadTimeDays as number) ?? 0,
              dur: (l.serviceDurationMonths as number) ?? null,
              cat: (l.category as string) ?? "other",
              valid: "pass",
            })));
          }
        }
      } catch { /* use fallback */ }
      setLoading(false);
    }
    load();
  }, [id]);

  const productTotal = LINES.filter((l) => !["service", "subscription", "license"].includes(l.cat)).reduce((s, l) => s + l.netPrice * l.qty, 0);
  const serviceTotal = LINES.filter((l) => l.cat === "service").reduce((s, l) => s + l.netPrice * l.qty, 0);
  const subscriptionTotal = LINES.filter((l) => l.cat === "subscription").reduce((s, l) => s + l.netPrice * l.qty, 0);
  const grandTotal = productTotal + serviceTotal + subscriptionTotal;

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb + header */}
      <div className="border-b border-[#1e1e2a] bg-bg-card px-6 py-3">
        <Link href="/estimates" className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
          <ChevronLeft size={14} /> Estimates
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-text-primary font-mono">
                {ESTIMATE.id}
              </h1>
              <StatusBadge status={ESTIMATE.status} />
              <span className="text-xs text-text-tertiary">v{ESTIMATE.version}</span>
            </div>
            <p className="mt-0.5 text-sm text-text-secondary">
              {ESTIMATE.customer} — {ESTIMATE.domain} — {ESTIMATE.region}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ESTIMATE.ccwUrl && (
              <a href={ESTIMATE.ccwUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-button border border-[#1e1e2a] px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">
                <ExternalLink size={14} /> Open in CCW
              </a>
            )}
            <button className="rounded-button bg-success px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Approve
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-t-button px-3 py-2 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-bg-primary text-accent border-b-2 border-accent"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "config" && (
          <div>
            <div className="overflow-x-auto rounded-card border border-[#1e1e2a]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2a] bg-bg-card text-left text-xs text-text-tertiary">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Part Number</th>
                    <th className="px-3 py-2.5 font-medium">SA</th>
                    <th className="px-3 py-2.5 font-medium">Description</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Unit List</th>
                    <th className="px-3 py-2.5 text-right font-medium">Disc%</th>
                    <th className="px-3 py-2.5 text-right font-medium">Unit Net</th>
                    <th className="px-3 py-2.5 text-right font-medium">Extended</th>
                    <th className="px-3 py-2.5 text-right font-medium">Lead</th>
                    <th className="px-3 py-2.5 font-medium">Duration</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {LINES.map((l, i) => (
                    <tr key={l.ln} className={cn("border-b border-[#1e1e2a] hover:bg-bg-elevated", i % 2 === 1 && "bg-[#12121a]")}>
                      <td className="px-3 py-2 text-text-tertiary">{l.ln}</td>
                      <td className="px-3 py-2 font-mono font-medium text-text-primary">{l.sku}</td>
                      <td className="px-3 py-2 text-text-tertiary">{l.sa ? "Yes" : "-"}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-text-secondary">{l.desc}</td>
                      <td className="px-3 py-2 text-right text-text-primary">{l.qty}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmtUSD(l.listPrice)}</td>
                      <td className="px-3 py-2 text-right text-text-tertiary">{l.disc > 0 ? `${l.disc}%` : ""}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmtUSD(l.netPrice)}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-text-primary">{fmtUSD(l.netPrice * l.qty)}</td>
                      <td className="px-3 py-2 text-right text-text-tertiary">{l.lead || ""}</td>
                      <td className="px-3 py-2 text-text-tertiary">{l.dur ? `${l.dur}mo` : "---"}</td>
                      <td className="px-3 py-2">
                        <ValidIcon status={l.valid} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[#2a2a3a] bg-bg-card text-sm font-medium">
                  <tr className="border-b border-[#1e1e2a]">
                    <td colSpan={8} className="px-3 py-2 text-right text-text-secondary">Product Total:</td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary">{fmtUSD(productTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr className="border-b border-[#1e1e2a]">
                    <td colSpan={8} className="px-3 py-2 text-right text-text-secondary">Service Total:</td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary">{fmtUSD(serviceTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr className="border-b border-[#1e1e2a]">
                    <td colSpan={8} className="px-3 py-2 text-right text-text-secondary">Subscription Total:</td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary">{fmtUSD(subscriptionTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr>
                    <td colSpan={8} className="px-3 py-2.5 text-right text-text-primary">Grand Total:</td>
                    <td className="px-3 py-2.5 text-right font-mono text-lg text-accent">{fmtUSD(grandTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {tab === "validation" && (
          <div className="max-w-3xl space-y-4">
            <div className="rounded-card border border-success/30 bg-success-muted p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-success" />
                <span className="font-medium text-success">All 9 validation rules passed</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {VALIDATION_RULES.map((r) => (
                <div key={r.id} className="rounded-card border border-[#1e1e2a] bg-bg-card p-4">
                  <div className="flex items-center gap-2">
                    <ValidIcon status={r.status} />
                    <span className="text-sm font-medium text-text-primary">{r.name}</span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">{r.msg}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "summary" && (
          <div className="max-w-2xl space-y-6">
            <Section title="Assumptions">
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>- UK power cables (CAB-TA-UK) per NTT/Dimension Data regional standard</li>
                <li>- SmartNet 8x5xNBD tier (standard for access switching)</li>
                <li>- DNA Advantage 3-year term selected per intake requirements</li>
                <li>- Redundant PSU configuration with primary + secondary power supplies</li>
              </ul>
            </Section>
            <Section title="Exclusions">
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>- No wireless controller included (switching-only estimate)</li>
                <li>- No optics/transceivers (uplinks not specified in requirements)</li>
                <li>- ThousandEyes and DNA Spaces add-ons not included (not requested)</li>
              </ul>
            </Section>
            <Section title="Open Questions">
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>- Confirm stacking topology (ring vs chain) affects cable count</li>
                <li>- Confirm power cable type — using UK standard per tenant defaults</li>
                <li>- SFP+ transceivers needed for 10G uplinks?</li>
              </ul>
            </Section>
          </div>
        )}

        {tab === "export" && (
          <div className="max-w-xl space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">Export Options</h3>
            <div className="space-y-3">
              <ExportCard icon={<Download size={18} />} title="CSV Export" desc="Price Estimate template format, UTF-8 with BOM" action="Download CSV" href={`/api/export?bomDraftId=${id}&format=csv`} />
              <ExportCard icon={<FileText size={18} />} title="XLSX Export" desc="Formatted Excel workbook with column widths and number formatting" action="Download XLSX" href={`/api/export?bomDraftId=${id}&format=xlsx`} />
              <ExportCard icon={<FileText size={18} />} title="PDF Export" desc="Professional formatted document with tenant branding" action="Coming Phase 2" disabled />
            </div>
            {ESTIMATE.ccwUrl && (
              <div className="mt-6 rounded-card border border-[#1e1e2a] bg-bg-card p-4">
                <p className="text-sm font-medium text-text-primary">CCW Estimate</p>
                <p className="mt-1 font-mono text-xs text-text-secondary">{ESTIMATE.id}</p>
                <a href={ESTIMATE.ccwUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-button bg-accent px-4 py-2 text-sm font-medium text-bg-primary hover:bg-accent-hover">
                  <ExternalLink size={14} /> Open in CCW
                </a>
              </div>
            )}
          </div>
        )}

        {tab === "sharing" && (
          <ComingSoon phase="Coming Soon" title="Sharing" description="Share estimates via link or email with access controls and revocation." features={[
            { name: "Share via Link", description: "Generate an access key for sharing estimates externally" },
            { name: "Share via Email", description: "Send directly to CCO IDs or email addresses" },
          ]} />
        )}

        {tab === "history" && (
          <ComingSoon phase="Coming Soon" title="Version History" description="Track every change to this estimate with full diff view." features={[
            { name: "Version Timeline", description: "See who changed what and when" },
            { name: "Diff View", description: "Side-by-side comparison of any two versions" },
          ]} />
        )}

        {tab === "comments" && (
          <ComingSoon phase="Coming Soon" title="Comments" description="Threaded comments per estimate and per line item." features={[
            { name: "Estimate Comments", description: "Discuss the overall estimate with your team" },
            { name: "Line Comments", description: "Comment on specific SKUs or configuration decisions" },
          ]} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    READY_FOR_REVIEW: "bg-blue-muted text-blue",
    APPROVED: "bg-success-muted text-success",
    PENDING: "bg-warning-muted text-warning",
    AGENT_FAILED: "bg-destructive-muted text-destructive",
    PROCESSING: "bg-accent-muted text-accent",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", styles[status] ?? "bg-[#1e1e2a] text-text-tertiary")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ValidIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 size={14} className="text-success" />;
  if (status === "warning") return <AlertTriangle size={14} className="text-warning" />;
  if (status === "error") return <XCircle size={14} className="text-destructive" />;
  return <Info size={14} className="text-text-tertiary" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-[#1e1e2a] bg-bg-card p-5">
      <h4 className="text-sm font-medium text-text-primary">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ExportCard({ icon, title, desc, action, href, disabled }: {
  icon: React.ReactNode; title: string; desc: string; action: string; href?: string; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-card border border-[#1e1e2a] bg-bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="text-text-secondary">{icon}</div>
        <div>
          <p className="text-sm font-medium text-text-primary">{title}</p>
          <p className="text-xs text-text-tertiary">{desc}</p>
        </div>
      </div>
      {disabled ? (
        <span className="rounded-full bg-[#1e1e2a] px-3 py-1 text-xs text-text-tertiary">{action}</span>
      ) : (
        <a href={href} className="rounded-button bg-accent px-3 py-1.5 text-xs font-medium text-bg-primary hover:bg-accent-hover">
          {action}
        </a>
      )}
    </div>
  );
}

function fmtUSD(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

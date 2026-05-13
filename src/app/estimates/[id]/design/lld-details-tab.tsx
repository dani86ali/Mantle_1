"use client";

import type { IPVlanPlan, ComponentListItem } from "@/engines/e5/types";

export function LLDDetailsTab({ ipVlanPlan, componentList }: {
  ipVlanPlan: IPVlanPlan | null;
  componentList: ComponentListItem[] | null;
}) {
  if (!ipVlanPlan && !componentList) {
    return <p className="text-sm text-text-tertiary">LLD details not generated yet.</p>;
  }
  return (
    <div className="space-y-4">
      {ipVlanPlan && (
        <section className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <h3 className="text-sm font-semibold text-text-primary">VLANs ({ipVlanPlan.vlans.length})</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-elevated">
                <tr className="text-left text-text-tertiary">
                  <th className="px-2 py-1.5">ID</th><th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Subnet</th><th className="px-2 py-1.5">Gateway</th>
                  <th className="px-2 py-1.5">Purpose</th><th className="px-2 py-1.5">VRF</th>
                </tr>
              </thead>
              <tbody>
                {ipVlanPlan.vlans.map((v) => (
                  <tr key={v.id} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1.5 font-mono text-text-primary">{v.id}</td>
                    <td className="px-2 py-1.5 text-text-primary">{v.name}</td>
                    <td className="px-2 py-1.5 font-mono text-text-secondary">{v.subnet}</td>
                    <td className="px-2 py-1.5 font-mono text-text-secondary">{v.gateway}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{v.purpose}</td>
                    <td className="px-2 py-1.5 font-mono text-text-tertiary">{v.vrf ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {ipVlanPlan && ipVlanPlan.vrfs.length > 0 && (
        <section className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <h3 className="text-sm font-semibold text-text-primary">VRFs ({ipVlanPlan.vrfs.length})</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-elevated">
                <tr className="text-left text-text-tertiary">
                  <th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">RD</th>
                  <th className="px-2 py-1.5">Route Targets</th><th className="px-2 py-1.5">VLANs</th>
                </tr>
              </thead>
              <tbody>
                {ipVlanPlan.vrfs.map((v) => (
                  <tr key={v.name} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1.5 text-text-primary">{v.name}</td>
                    <td className="px-2 py-1.5 font-mono text-text-secondary">{v.routeDistinguisher}</td>
                    <td className="px-2 py-1.5 font-mono text-text-secondary">{v.routeTargets.join(", ")}</td>
                    <td className="px-2 py-1.5 font-mono text-text-secondary">{v.vlans.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {componentList && componentList.length > 0 && (
        <section className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <h3 className="text-sm font-semibold text-text-primary">Component List ({componentList.length})</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-elevated">
                <tr className="text-left text-text-tertiary">
                  <th className="px-2 py-1.5">Model</th><th className="px-2 py-1.5">Vendor</th>
                  <th className="px-2 py-1.5">Qty</th><th className="px-2 py-1.5">Role</th><th className="px-2 py-1.5">Source</th>
                </tr>
              </thead>
              <tbody>
                {componentList.map((c, i) => (
                  <tr key={`${c.model}-${i}`} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1.5 font-mono text-text-primary">{c.model}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{c.vendor}</td>
                    <td className="px-2 py-1.5 font-mono text-text-primary">{c.quantity}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{c.role}</td>
                    <td className="px-2 py-1.5 text-text-tertiary">{c.fromDesignStep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-xs text-text-tertiary">
        Port maps, cable schedule, QoS policy, migration plan, and rack elevations are included in the LLD document.
      </p>
    </div>
  );
}

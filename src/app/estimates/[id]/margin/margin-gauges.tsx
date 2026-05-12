"use client";

import type { MarginAnalysis } from "@/engines/e3/types";

interface GaugeProps {
  label: string;
  value: number;
  display: string;
  max: number;
  redLine?: number;
  greenLine?: number;
}

function polar(angleDeg: number, r: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 - r * Math.sin(rad)];
}

function angleFor(fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction));
  return 180 - 180 * clamped;
}

function colorFor(value: number, redLine: number | undefined, greenLine: number | undefined): string {
  if (redLine !== undefined && value < redLine) return "var(--destructive)";
  if (greenLine !== undefined && value >= greenLine) return "var(--success)";
  if (redLine !== undefined && greenLine === undefined && value >= redLine) return "var(--success)";
  return "var(--warning)";
}

function Tick({ fraction, max, color }: { fraction: number; max: number; color: string }) {
  const angle = angleFor(fraction / max);
  const [ox, oy] = polar(angle, 46);
  const [ix, iy] = polar(angle, 32);
  return <line x1={ix} y1={iy} x2={ox} y2={oy} stroke={color} strokeWidth="2" strokeLinecap="round" />;
}

function Gauge({ label, value, display, max, redLine, greenLine }: GaugeProps) {
  const fraction = Math.max(0, Math.min(1, value / max));
  const endAngle = angleFor(fraction);
  const [sx, sy] = polar(180, 40);
  const [ex, ey] = polar(endAngle, 40);
  const color = colorFor(value, redLine, greenLine);
  const largeArc = fraction > 0.5 ? 1 : 0;
  const arcPath = `M ${sx} ${sy} A 40 40 0 ${largeArc} 1 ${ex} ${ey}`;
  const bgPath = `M 10 50 A 40 40 0 1 1 90 50`;
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-primary p-3">
      <svg viewBox="0 0 100 60" className="w-full" aria-hidden>
        <path d={bgPath} stroke="var(--border)" strokeWidth="8" fill="none" strokeLinecap="round" />
        {fraction > 0 && (
          <path d={arcPath} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />
        )}
        {redLine !== undefined && <Tick fraction={redLine} max={max} color="var(--destructive)" />}
        {greenLine !== undefined && <Tick fraction={greenLine} max={max} color="var(--success)" />}
      </svg>
      <p className="-mt-7 text-center font-mono text-xl font-semibold" style={{ color }}>
        {display}
      </p>
      <p className="mt-2 text-center text-xs text-text-secondary">{label}</p>
      <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px] text-text-tertiary">
        {redLine !== undefined && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-2.5 rounded-sm bg-destructive" /> {pct(redLine)} floor
          </span>
        )}
        {greenLine !== undefined && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-2.5 rounded-sm bg-success" /> {pct(greenLine)} target
          </span>
        )}
      </div>
    </div>
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function MarginGauges({ margin }: { margin: MarginAnalysis }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Gauge
        label="Gross Margin"
        value={margin.grossMarginPct}
        display={pct(margin.grossMarginPct)}
        max={0.4}
        redLine={0.12}
        greenLine={0.25}
      />
      <Gauge
        label="Hardware Margin"
        value={margin.hardwareMarginPct}
        display={pct(margin.hardwareMarginPct)}
        max={0.4}
        redLine={0.12}
      />
      <Gauge
        label="Services Margin"
        value={margin.servicesMarginPct}
        display={pct(margin.servicesMarginPct)}
        max={1}
        greenLine={0.5}
      />
      <Gauge
        label="Services Attach Rate"
        value={margin.servicesAttachRate}
        display={pct(margin.servicesAttachRate)}
        max={1}
        greenLine={0.3}
      />
    </div>
  );
}

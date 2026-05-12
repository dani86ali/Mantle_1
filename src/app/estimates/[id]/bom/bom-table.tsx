"use client";

import { cn } from "@/lib/utils";
import { categoryClass, fmtSAR, fmtUSD, type PricedLine } from "./sections";

export type Phase = "sku" | "pricing";

interface DeviceGroup {
  model: string;
  lines: PricedLine[];
  subtotal: number;
}

function groupByDevice(lines: PricedLine[]): DeviceGroup[] {
  const groups: DeviceGroup[] = [];
  let current: DeviceGroup | null = null;
  for (const l of lines) {
    if (l.category === "hardware" || !current) {
      current = {
        model: l.category === "hardware" ? l.sku : "Other",
        lines: [],
        subtotal: 0,
      };
      groups.push(current);
    }
    current.lines.push(l);
    current.subtotal += l.extendedSell;
  }
  return groups;
}

function discountPct(line: PricedLine): number {
  if (line.unitListSar <= 0) return 0;
  return ((line.unitListSar - line.unitSellPrice) / line.unitListSar) * 100;
}

interface BomTableProps {
  lines: PricedLine[];
  phase: Phase;
  edits: Record<string, number>;
  onQtyChange: (id: string, qty: number) => void;
}

export function BomTable({ lines, phase, edits, onQtyChange }: BomTableProps) {
  const merged = lines.map((l) => ({ ...l, qty: edits[l.id] ?? l.qty }));
  const groups = groupByDevice(merged);
  const isPricing = phase === "pricing";
  const colCount = isPricing ? 10 : 6;
  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-bg-card text-left text-xs text-text-tertiary">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">SKU</th>
            <th className="px-3 py-2.5 font-medium">Description</th>
            <th className="px-3 py-2.5 font-medium">Category</th>
            <th className="px-3 py-2.5 text-right font-medium">Qty</th>
            <th className="px-3 py-2.5 text-right font-medium">Unit List USD</th>
            {isPricing && (
              <>
                <th className="px-3 py-2.5 text-right font-medium">Discount %</th>
                <th className="px-3 py-2.5 text-right font-medium">Unit Sell SAR</th>
                <th className="px-3 py-2.5 text-right font-medium">Extended Sell SAR</th>
                <th className="px-3 py-2.5 text-right font-medium">VAT</th>
                <th className="px-3 py-2.5 text-right font-medium">Total inc VAT</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <DeviceBlock
              key={`${g.model}-${gi}`}
              group={g}
              phase={phase}
              colCount={colCount}
              edits={edits}
              onQtyChange={onQtyChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeviceBlock({
  group,
  phase,
  colCount,
  edits,
  onQtyChange,
}: {
  group: DeviceGroup;
  phase: Phase;
  colCount: number;
  edits: Record<string, number>;
  onQtyChange: (id: string, qty: number) => void;
}) {
  const isPricing = phase === "pricing";
  return (
    <>
      <tr className="sticky top-0 z-10 bg-bg-elevated">
        <td
          colSpan={isPricing ? colCount - 1 : colCount}
          className="px-3 py-2 font-mono text-xs font-semibold text-text-primary"
        >
          {group.model}
          <span className="ml-2 font-sans text-text-tertiary">
            ({group.lines.length} line{group.lines.length === 1 ? "" : "s"})
          </span>
        </td>
        {isPricing && (
          <td
            colSpan={1}
            className="px-3 py-2 text-right font-mono text-xs font-semibold text-text-primary"
          >
            {fmtSAR(group.subtotal)}
          </td>
        )}
      </tr>
      {group.lines.map((l, i) => (
        <Row
          key={l.id}
          line={l}
          phase={phase}
          striped={i % 2 === 1}
          dirty={edits[l.id] !== undefined}
          onQtyChange={onQtyChange}
        />
      ))}
    </>
  );
}

const CELL_R = "px-3 py-2 text-right font-mono";

function Row({
  line, phase, striped, dirty, onQtyChange,
}: {
  line: PricedLine; phase: Phase; striped: boolean; dirty: boolean;
  onQtyChange: (id: string, qty: number) => void;
}) {
  const isPricing = phase === "pricing";
  return (
    <tr className={cn(
      "border-b border-[var(--border)] hover:bg-bg-elevated",
      striped ? "bg-bg-card" : "bg-bg-primary",
      dirty && "border-l-4 border-l-warning",
    )}>
      <td className="px-3 py-2 text-text-tertiary">{line.lineNumber}</td>
      <td className="px-3 py-2 font-mono font-medium text-text-primary">{line.sku}</td>
      <td className="max-w-xs truncate px-3 py-2 text-text-secondary" title={line.description}>
        {line.description}
      </td>
      <td className="px-3 py-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", categoryClass(line.category))}>
          {line.category}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-text-primary">
        {isPricing ? <span className="font-mono">{line.qty}</span> : (
          <input
            type="number" min={0} value={line.qty}
            onChange={(e) => onQtyChange(line.id, Number(e.target.value) || 0)}
            className="w-20 rounded-button border border-[var(--border)] bg-bg-primary px-2 py-1 text-right font-mono text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        )}
      </td>
      <td className={cn(CELL_R, "text-text-secondary")}>{fmtUSD(line.unitListUsd)}</td>
      {isPricing && (
        <>
          <td className={cn(CELL_R, "text-text-secondary")}>{discountPct(line).toFixed(1)}%</td>
          <td className={cn(CELL_R, "text-text-secondary")}>{fmtSAR(line.unitSellPrice)}</td>
          <td className={cn(CELL_R, "font-medium text-text-primary")}>{fmtSAR(line.extendedSell)}</td>
          <td className={cn(CELL_R, "text-text-secondary")}>{fmtSAR(line.vatAmount)}</td>
          <td className={cn(CELL_R, "font-medium text-text-primary")}>{fmtSAR(line.totalWithVat)}</td>
        </>
      )}
    </tr>
  );
}

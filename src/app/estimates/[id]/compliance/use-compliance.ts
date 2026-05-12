import { useMemo, useState } from "react";
import {
  filterRows,
  DEFAULT_FILTERS,
  type EditableRow,
  type Filters,
  type Stats,
  type Status,
} from "./sections";
import type { PageData } from "./mappers";

export type Edit = { status: Status; notes: string };

export interface ComplianceState {
  edits: Record<string, Edit>;
  filters: Filters;
  dirty: boolean;
  dirtyKeys: Set<string>;
  mergedRows: EditableRow[];
  filtered: EditableRow[];
  stats: Stats;
  setFilters: (f: Filters) => void;
  patchRow: (key: string, patch: Partial<Edit>) => void;
  clearEdits: () => void;
}

export function useComplianceState(data: PageData | null): ComplianceState {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const mergedRows = useMemo<EditableRow[]>(() => {
    if (!data) return [];
    return data.rows.map((r) => (edits[r.key] ? { ...r, ...edits[r.key] } : r));
  }, [data, edits]);

  const stats: Stats = useMemo(() => {
    const s: Stats = {
      total: mergedRows.length,
      compliant: 0,
      partial: 0,
      nonCompliant: 0,
      alternative: 0,
      coveragePct: 0,
    };
    for (const r of mergedRows) {
      if (r.status === "Compliant") s.compliant++;
      else if (r.status === "Partially Compliant") s.partial++;
      else if (r.status === "Non-Compliant") s.nonCompliant++;
      else if (r.status === "Alternative Proposed") s.alternative++;
    }
    s.coveragePct =
      s.total === 0 ? 0 : ((s.compliant + s.alternative) / s.total) * 100;
    return s;
  }, [mergedRows]);

  const filtered = useMemo(() => filterRows(mergedRows, filters), [mergedRows, filters]);

  function patchRow(key: string, patch: Partial<Edit>) {
    setEdits((prev) => {
      const orig = data?.rows.find((r) => r.key === key);
      if (!orig) return prev;
      const current = prev[key] ?? { status: orig.status, notes: orig.notes };
      const next: Edit = { ...current, ...patch };
      if (next.status === orig.status && next.notes === orig.notes) {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  }

  return {
    edits,
    filters,
    dirty: Object.keys(edits).length > 0,
    dirtyKeys: new Set(Object.keys(edits)),
    mergedRows,
    filtered,
    stats,
    setFilters,
    patchRow,
    clearEdits: () => setEdits({}),
  };
}

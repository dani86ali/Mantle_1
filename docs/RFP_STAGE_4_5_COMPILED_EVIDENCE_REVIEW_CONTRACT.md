# RFP Stage 4.5 - Compiled Evidence Review Contract

Status: active
Owner: RFP operator workflow (Stage 4.5)
Model: `src/lib/projects/project-rfp-compiled-evidence-review.ts`
Consumers: `src/lib/projects/project-rfp-evidence-package-inspection.ts`,
`src/app/projects/[id]/rfp/page.tsx`

## Why

Stage 4.5 evidence review used to render one visible card per raw extraction
record (one per text chunk, one per table). For a real RFP that is hundreds of
near-duplicate fragments, page headers, page numbers, and copyright notices -
unreviewable. This contract makes evidence review **contract-first around
compiled human-review findings** while keeping the raw deterministic evidence
as the persisted authority, accounted for exactly once.

## Authority separation

- **Raw deterministic evidence** (the sanitized `evidence_package` entries) is
  the persisted authority. It is never mutated and never dropped. Every record
  is accounted for exactly once: it either contributes to a primary finding's
  audit array, or it is listed in the collapsed suppressed/audit set.
- **AI refinement is presentation only.** Repaired tables and missing
  candidates are caller-provided presentation data. The compiled-review model
  makes **no live AI, catalog, pricing, SKU, or configuration call**. It is a
  pure deterministic function: no runtime imports, no side effects, no clock,
  no randomness.

## Model: `compileCompiledEvidenceReview(input)`

Input:

- `deterministicEvidence`: sanitized text/table records (the `evidence_package`
  entries).
- `refinement?.repairedTables`: caller-provided readable table repairs, matched
  to a deterministic table by `evidenceId`.
- `refinement?.evidenceRefinements`: caller-provided per-evidence presentation
  refinement matched by `evidenceId` - an optional clean summary, normalized
  readable content, and the `lowConfidence` / `conflict` flags. For a grouped
  text finding, a match on any contributing record refines the whole group.
  Refinement is presentation only and adds no live AI call; it only adds display
  data and flags and never drops a deterministic record, so the balance holds.
- `missingCandidates?`: caller-provided proposals for evidence missing from the
  deterministic extraction.

Output `CompiledEvidenceReview`:

- `findings`: primary reviewable findings (NOT one per raw chunk).
- `suppressed`: deterministic records removed from primary findings, retained
  for collapsed audit/history with raw traceability and a short preview.
- `accounting`: counts that prove the deterministic balance.

### Finding fields and flags

Each finding carries human labels (`title`, `documentName`, `role`,
`topic`/category), an optional caller `cleanSummary`, the normalized readable
`body` (caller `readableContent` overrides the joined passages), `table` rows
where applicable, human `citations`, the `audit` array, and a `flags` object.
`flags` always carries all seven presentation booleans: `duplicate`,
`boilerplate`, `lowConfidence`, `aiRefined`, `tableRepaired`,
`missingFromDeterministic`, and `conflict`. Suppressed boilerplate / duplicate /
tiny / page-only records stay audit-only (never findings), but the review still
exposes them through `accounting.suppressedByReason`, and
`accounting.flagSummary` reports how many primary findings carry each flag, so
the operator can see that suppression and refinement happened.

### Findings

- **Text findings** group source text records by `documentName + role + topic`,
  preserving source order, joining the passage bodies. Each grouped finding's
  `audit` array carries one entry per deterministic record it represents.
- **Table findings** render the table as a readable matrix. A caller-provided
  repaired table is always a primary finding flagged `tableRepaired` +
  `aiRefined`; its `audit` still carries the deterministic table so the raw
  record stays accounted for. A repair with no matching deterministic table is
  still a primary finding, with an empty (non-deterministic) audit.
- **Missing candidates** are proposal-only findings flagged
  `missingFromDeterministic` + `aiRefined`, with an empty audit (no
  deterministic backing).

### Suppression (text only)

A deterministic text record is suppressed from primary findings, with the
reason recorded, when it is:

- `empty_fragment` - empty/whitespace-only, or no alphanumeric content;
- `page_only` - a bare page locator ("12", "Page 4", "Page 3 of 9");
- `proprietary_notice` - confidential/proprietary/copyright/all-rights notice;
- `tiny_fragment` - a tiny broken fragment (<= 3 non-whitespace characters);
- `duplicate_body` - an exact repeat of an already-kept longer body;
- `repeated_header` - an exact repeat of an already-kept short header/title.

Suppressed records stay in the collapsed audit/history with full raw
traceability; they are never silently dropped.

### Display vs audit

- **Primary display fields** (title, document name, role, citations, body,
  table) carry **human labels only** - document/passage/page/sheet/table
  labels. They must never include raw UUIDs, file ids, package ids, table ids,
  or the word "chunk".
- **Raw machine locators** (evidence id, file id, package id, table id, chunk
  index/count) live only in the finding `audit` entries and the suppressed
  `audit` entries.

### Accounting / balance invariant

```
accountedInPrimaryCount + suppressedCount === deterministicInputCount
```

`accountedInPrimaryCount` is the total number of deterministic audit entries
across all primary findings. Repaired tables and missing candidates do not
change the deterministic balance (a repaired table's audit still holds its
deterministic table; an unmatched repair and every missing candidate carry an
empty audit). `accounting.balanced` reports the invariant.

## Inspection consumer

`loadRfpEvidencePackageDetail` keeps the legacy sanitized `package.evidence`
array (audit / backward compatibility) and additionally derives
`package.compiledReview` from exactly those sanitized entries. The inspection
module stays read-only: no store mutation, no evidence-store/file reads, no AI.

## Page consumer (Stage 4.5)

- Step 2 "Evidence Review" points at compiled evidence packages, not raw
  evidence rows. It renders `compiled-evidence-review` and a compact collapsed
  `source-evidence-audit` block (counts + explanatory copy only). It no longer
  renders raw persisted evidence rows (`evidence-row`) in the normal workflow.
- The evidence package drawer renders the grouped compiled findings first
  (`ep-compiled-review`), consuming `packageDetail.package.compiledReview`
  returned by the inspection read model. It does **not** recompile from
  `packageDetail.package.evidence`. The full raw package evidence array, if
  retained, sits behind a collapsed audit/debug disclosure (`ep-raw-audit`).
  Primary compiled finding cards surface the clean summary, category/topic, and
  the presentation flags (table repaired, proposed addition, duplicate,
  boilerplate, low confidence, conflict, AI refined); raw machine data stays in
  the drawer audit trail only, with no per-finding technical dropdown.
- The page imports only the compiled-review finding type (type-only); it imports
  no DB, store, provider SDK, pricing, catalog, or configuration authority, and
  performs no live AI call.

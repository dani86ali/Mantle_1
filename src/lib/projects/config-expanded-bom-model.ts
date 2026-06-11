/**
 * Pure parent-child structural model for configuration-expansion draft/display
 * lines. Consumes a flat list of configuration-expansion draft lines and nests each
 * expansion line under the customer line it expands, preserving customer lines and
 * original line order. This is the structural/display grouping only - it is NOT the
 * accepted expanded BoM; that comes later from the engineer review helper and then
 * the persisted configuration_expansion artifact (pricing and Mantle export stay
 * blocked until that artifact exists). Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 11A.3, section 11A.4; section 19 task 8g).
 *
 * PURE: a single type-only import of the draft-line contract. No DB / artifact
 * store, no API/UI, no engines, no coordinator/runtime, no AI, no pricing, no
 * catalog lookup, no SKU replacement, no rule-pack loading or approval. It adds no
 * pricing or catalog fields and performs no math beyond counting. Inputs are never
 * mutated: every line is copied into the model. (section 11A.1)
 */
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";

// Exact guard messages; tests assert on these.
const DUPLICATE_LINE_ID = "Configuration expanded BoM has a duplicate lineId.";
const UNKNOWN_ORIGIN = "Configuration expanded BoM line has an unknown origin.";
const CUSTOMER_WITH_PARENT = "Configuration expanded BoM customer line must not carry a parentLineId.";
const EXPANSION_MISSING_PARENT = "Configuration expanded BoM expansion line is missing a parentLineId.";
const EXPANSION_ORPHAN_PARENT = "Configuration expanded BoM expansion line parentLineId does not reference a customer line.";
const EXPANSION_NESTED_PARENT = "Configuration expanded BoM expansion line must not nest under another expansion line.";

/**
 * One parent group: a preserved customer line and the expansion lines nested under
 * it, in flat draft order. A customer line with no expansion lines still produces a
 * group with an empty `children` array.
 */
export interface ConfigExpandedBomGroup {
  customerLine: ConfigurationExpansionDraftLine;
  children: ConfigurationExpansionDraftLine[];
}

/** Roll-up counts for the draft-line structural model. No monetary or catalog totals. */
export interface ConfigExpandedBomSummary {
  /** Parent (customer) line count; equals the number of groups. */
  customerLineCount: number;
  /** Child (expansion) line count nested across all groups. */
  expansionLineCount: number;
  /** Total lines in the model (customer + expansion). */
  totalLineCount: number;
}

/**
 * The parent-child display model: customer lines as parent groups in original
 * order, a flattened display list (each customer line followed by its children in
 * the same order), and roll-up counts.
 */
export interface ConfigExpandedBomModel {
  groups: ConfigExpandedBomGroup[];
  /** Display order: each customer line immediately followed by its expansion lines. */
  flattenedLines: ConfigurationExpansionDraftLine[];
  summary: ConfigExpandedBomSummary;
}

/** Deep-copy the only nested mutable fields so the model never aliases an input line. */
function cloneLine(line: ConfigurationExpansionDraftLine): ConfigurationExpansionDraftLine {
  return {
    ...line,
    ...(line.originalCells !== undefined ? { originalCells: { ...line.originalCells } } : {}),
    ...(line.evidence !== undefined ? { evidence: line.evidence.map((citation) => ({ ...citation })) } : {}),
  };
}

/**
 * Index every lineId to its origin, rejecting duplicates and unknown origins. Built
 * fully before parent validation so an expansion line may precede its parent in the
 * flat input and still validate.
 */
function indexOrigins(
  lines: readonly ConfigurationExpansionDraftLine[]
): Map<string, ConfigurationExpansionDraftLine["origin"]> {
  const originByLineId = new Map<string, ConfigurationExpansionDraftLine["origin"]>();
  for (const line of lines) {
    if (line.origin !== "customer" && line.origin !== "expansion") throw new Error(UNKNOWN_ORIGIN);
    if (originByLineId.has(line.lineId)) throw new Error(DUPLICATE_LINE_ID);
    originByLineId.set(line.lineId, line.origin);
  }
  return originByLineId;
}

/** Reject any structurally invalid parent reference before assembling groups. */
function validateParentage(
  lines: readonly ConfigurationExpansionDraftLine[],
  originByLineId: ReadonlyMap<string, ConfigurationExpansionDraftLine["origin"]>
): void {
  for (const line of lines) {
    if (line.origin === "customer") {
      if (line.parentLineId !== undefined) throw new Error(CUSTOMER_WITH_PARENT);
      continue;
    }
    if (line.parentLineId === undefined) throw new Error(EXPANSION_MISSING_PARENT);
    const parentOrigin = originByLineId.get(line.parentLineId);
    if (parentOrigin === undefined) throw new Error(EXPANSION_ORPHAN_PARENT);
    if (parentOrigin !== "customer") throw new Error(EXPANSION_NESTED_PARENT);
  }
}

/**
 * Build the parent-child display model from draft/display lines. Customer lines
 * become parent groups in original order; expansion lines nest under their parent
 * customer line in flat draft order; customer lines with no children still produce a
 * group. Returns the groups, a flattened display list (customer line then its
 * children), and counts. Pure and deterministic: validates structure, never mutates
 * inputs, copies lines.
 */
export function buildConfigExpandedBomModel(
  lines: readonly ConfigurationExpansionDraftLine[]
): ConfigExpandedBomModel {
  const originByLineId = indexOrigins(lines);
  validateParentage(lines, originByLineId);

  // Pass A: a group per customer line in flat order, indexed by lineId.
  const groups: ConfigExpandedBomGroup[] = [];
  const groupByLineId = new Map<string, ConfigExpandedBomGroup>();
  for (const line of lines) {
    if (line.origin !== "customer") continue;
    const group: ConfigExpandedBomGroup = { customerLine: cloneLine(line), children: [] };
    groups.push(group);
    groupByLineId.set(line.lineId, group);
  }

  // Pass B: attach each expansion clone to its parent group in flat draft order.
  let expansionLineCount = 0;
  for (const line of lines) {
    if (line.origin !== "expansion") continue;
    // parentLineId and its customer group are guaranteed present by validation above.
    const group = groupByLineId.get(line.parentLineId as string);
    if (group === undefined) throw new Error(EXPANSION_ORPHAN_PARENT);
    group.children.push(cloneLine(line));
    expansionLineCount += 1;
  }

  // Flatten in display order: each customer line followed by its children.
  const flattenedLines: ConfigurationExpansionDraftLine[] = [];
  for (const group of groups) {
    flattenedLines.push(group.customerLine);
    for (const child of group.children) flattenedLines.push(child);
  }

  return {
    groups,
    flattenedLines,
    summary: {
      customerLineCount: groups.length,
      expansionLineCount,
      totalLineCount: groups.length + expansionLineCount,
    },
  };
}

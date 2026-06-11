/**
 * Pure, deterministic engineer-review helper for configuration-expansion lines.
 * Consumes a flat configuration-expansion draft (preserved customer lines plus
 * auto-added expansion lines) and an explicit set of human accept/reject review
 * decisions, and produces the in-memory accepted expanded BoM: customer lines
 * preserved, each accepted expansion line marked approved, rejected expansion lines
 * excluded and reported. It reuses buildConfigExpandedBomModel both to build the
 * parent-child display model over the accepted lines and to validate structure. This
 * is the engineer-review step (Section 19 task 8h); the persisted
 * configuration_expansion artifact comes later (task 8i). Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 11A.3, section 11A.4).
 *
 * PURE: a value import of the structural model helper plus a type-only import of the
 * draft-line contract. No DB / artifact store, no API/UI, no engines, no
 * coordinator/runtime, no AI, no pricing, no catalog lookup, no SKU replacement, no
 * rule-pack loading or approval. Nothing is auto-accepted: every expansion line needs
 * an explicit human decision. It adds no pricing or catalog fields and never
 * generates time. Inputs are never mutated: every line is deep-copied. (section 11A.1)
 */
import {
  buildConfigExpandedBomModel,
  type ConfigExpandedBomModel,
} from "@/lib/projects/config-expanded-bom-model";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";

// Exact guard messages; tests assert on these.
const DUPLICATE_DECISION = "Configuration expansion review has a duplicate decision for a lineId.";
const UNKNOWN_LINE = "Configuration expansion review decision references an unknown lineId.";
const CUSTOMER_LINE_DECISION = "Configuration expansion review decision must not target a customer line.";
const MISSING_DECISION = "Configuration expansion review requires a decision for every expansion line.";
const INVALID_ACTION = "Configuration expansion review decision action must be accept or reject.";
const ACCEPTED_NO_RULE = "Accepted configuration expansion line must carry a sourceRuleId.";
const ACCEPTED_NO_EVIDENCE = "Accepted configuration expansion line must carry evidence.";

/** One explicit human review decision over a single expansion line, keyed by lineId. */
export interface ConfigurationExpansionReviewDecision {
  /** lineId of the expansion line this decision applies to. */
  lineId: string;
  /** Explicit human call: accept the expansion line into the BoM, or reject it. */
  action: "accept" | "reject";
  /** Optional reviewer note: caller bookkeeping / input-only, not surfaced on output lines (audit trail is task 8i). */
  note?: string;
}

/** Input for {@link applyConfigurationExpansionReview}. Lines and decisions are read-only. */
export interface ApplyConfigurationExpansionReviewInput {
  /** Flat configuration-expansion draft: customer lines and auto-added expansion lines. */
  lines: readonly ConfigurationExpansionDraftLine[];
  /** Explicit accept/reject decisions; exactly one per expansion line, none for customer lines. */
  decisions: readonly ConfigurationExpansionReviewDecision[];
  /** Optional reviewer identity, echoed only when the caller supplies it. */
  reviewedBy?: string;
  /** Optional review timestamp; supplied by the caller (never generated here). */
  reviewedAt?: string;
}

/** Roll-up counts for a configuration-expansion review result. No monetary totals. */
export interface ConfigurationExpansionReviewSummary {
  /** Preserved customer lines. */
  customerLineCount: number;
  /** Expansion lines accepted into the expanded BoM. */
  acceptedExpansionLineCount: number;
  /** Expansion lines rejected and excluded from the expanded BoM. */
  rejectedExpansionLineCount: number;
  /** Total accepted lines (customer + accepted expansion). */
  totalAcceptedLineCount: number;
  /** Expansion lines that received an explicit decision (accepted + rejected). */
  reviewedExpansionLineCount: number;
}

/**
 * The accepted expanded BoM result, in memory. `acceptedLines` is the flat accepted
 * BoM (customer lines plus accepted expansion lines) suitable as input for the future
 * configuration_expansion artifact; `acceptedModel` is its parent-child display model;
 * `rejectedLines` reports the excluded expansion lines.
 */
export interface ConfigurationExpansionReviewResult {
  acceptedLines: ConfigurationExpansionDraftLine[];
  rejectedLines: ConfigurationExpansionDraftLine[];
  acceptedModel: ConfigExpandedBomModel;
  summary: ConfigurationExpansionReviewSummary;
  reviewedBy?: string;
  reviewedAt?: string;
}

/** Deep-copy the only nested mutable fields so an output line never aliases an input line. */
function cloneLine(line: ConfigurationExpansionDraftLine): ConfigurationExpansionDraftLine {
  return {
    ...line,
    ...(line.originalCells !== undefined ? { originalCells: { ...line.originalCells } } : {}),
    ...(line.evidence !== undefined ? { evidence: line.evidence.map((citation) => ({ ...citation })) } : {}),
  };
}

/** Index every input line by lineId. Safe because lineId uniqueness is validated first. */
function indexLines(
  lines: readonly ConfigurationExpansionDraftLine[]
): Map<string, ConfigurationExpansionDraftLine> {
  const byLineId = new Map<string, ConfigurationExpansionDraftLine>();
  for (const line of lines) byLineId.set(line.lineId, line);
  return byLineId;
}

/** Validate decisions against the draft: unique, known, expansion-only, valid action. */
function indexDecisions(
  decisions: readonly ConfigurationExpansionReviewDecision[],
  lineById: ReadonlyMap<string, ConfigurationExpansionDraftLine>
): Map<string, ConfigurationExpansionReviewDecision> {
  const byLineId = new Map<string, ConfigurationExpansionReviewDecision>();
  for (const decision of decisions) {
    const target = lineById.get(decision.lineId);
    if (target === undefined) throw new Error(UNKNOWN_LINE);
    if (target.origin !== "expansion") throw new Error(CUSTOMER_LINE_DECISION);
    if (decision.action !== "accept" && decision.action !== "reject") throw new Error(INVALID_ACTION);
    if (byLineId.has(decision.lineId)) throw new Error(DUPLICATE_DECISION);
    byLineId.set(decision.lineId, decision);
  }
  return byLineId;
}

/** Clone an accepted expansion line as approved; require its traceability fields first. */
function acceptExpansionLine(line: ConfigurationExpansionDraftLine): ConfigurationExpansionDraftLine {
  if (line.sourceRuleId === undefined || line.sourceRuleId.length === 0) throw new Error(ACCEPTED_NO_RULE);
  if (line.evidence === undefined || line.evidence.length < 1) throw new Error(ACCEPTED_NO_EVIDENCE);
  return { ...cloneLine(line), approvalRequired: false, approved: true };
}

/**
 * Apply explicit human accept/reject decisions over an expansion draft to produce the
 * in-memory accepted expanded BoM. Customer lines are always preserved; every
 * expansion line must carry exactly one decision (nothing is auto-accepted); accepted
 * expansion lines become approved and stay in customer-then-children order; rejected
 * expansion lines are excluded and reported. Structure is validated through
 * buildConfigExpandedBomModel. Pure and deterministic: never mutates inputs, never
 * generates time.
 */
export function applyConfigurationExpansionReview(
  input: ApplyConfigurationExpansionReviewInput
): ConfigurationExpansionReviewResult {
  const { lines, decisions, reviewedBy, reviewedAt } = input;

  // Validate the WHOLE draft up front (duplicate lineIds, bad parentage, unknown
  // origins) by letting buildConfigExpandedBomModel run. This is not redundant with
  // the accepted-only model below: it guards lineId uniqueness for decision matching
  // and the structural validity of lines that get rejected and never reach that model.
  buildConfigExpandedBomModel(lines);

  const lineById = indexLines(lines);
  const decisionByLineId = indexDecisions(decisions, lineById);

  // Every expansion line needs an explicit decision; nothing is auto-accepted.
  for (const line of lines) {
    if (line.origin === "expansion" && !decisionByLineId.has(line.lineId)) {
      throw new Error(MISSING_DECISION);
    }
  }

  const acceptedDraftLines: ConfigurationExpansionDraftLine[] = [];
  const rejectedLines: ConfigurationExpansionDraftLine[] = [];
  let customerLineCount = 0;
  let acceptedExpansionLineCount = 0;
  let rejectedExpansionLineCount = 0;

  for (const line of lines) {
    if (line.origin === "customer") {
      acceptedDraftLines.push(cloneLine(line));
      customerLineCount += 1;
      continue;
    }
    // Expansion line: a decision is guaranteed present by the check above.
    const decision = decisionByLineId.get(line.lineId) as ConfigurationExpansionReviewDecision;
    if (decision.action === "accept") {
      acceptedDraftLines.push(acceptExpansionLine(line));
      acceptedExpansionLineCount += 1;
    } else {
      rejectedLines.push(cloneLine(line));
      rejectedExpansionLineCount += 1;
    }
  }

  // Display model over the accepted BoM (re-validates the subset); its freshly cloned
  // flattenedLines ARE the returned acceptedLines, in customer-then-children order.
  const acceptedModel = buildConfigExpandedBomModel(acceptedDraftLines);

  return {
    acceptedLines: acceptedModel.flattenedLines,
    rejectedLines,
    acceptedModel,
    summary: {
      customerLineCount,
      acceptedExpansionLineCount,
      rejectedExpansionLineCount,
      totalAcceptedLineCount: acceptedModel.flattenedLines.length,
      reviewedExpansionLineCount: acceptedExpansionLineCount + rejectedExpansionLineCount,
    },
    ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    ...(reviewedAt !== undefined ? { reviewedAt } : {}),
  };
}

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildHoneywellQuickBomConfigurationExpansionDraft,
  runHoneywellQuickBomConfigurationExpansionReview,
} from "@/lib/projects/quick-bom-runner";
import {
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";

/**
 * Behavior tests for the pure Quick BoM configuration-expansion runner skeleton
 * (Prompt 67). The runner composes existing approved-pack helpers only: it selects
 * the active Honeywell Batch 1 + Batch 2 + Batch 3 composed pack, builds the
 * deterministic expansion draft, and applies EXPLICIT engineer review decisions.
 * These tests build small Honeywell-shaped normalized BoQ fixtures inline and
 * accepted SKU resolution decisions inline; they never persist, price, look up the
 * catalog, substitute SKUs, or wire runtime. Distinctive Batch 3 SKUs (each under a
 * single parent) are asserted so cross-segment dedup of shared children cannot
 * perturb them.
 */

const RUNNER_PATH = join(process.cwd(), "src/lib/projects/quick-bom-runner.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/quick-bom-runner.test.ts");

// --- Honeywell-shaped customer SKUs -----------------------------------------

const CW9178 = "CW9178I-CFG";
const SUB = "CISCO-NETWORK-SUB";
const C9300X = "C9300X-48HX-A";
const C9300L = "C9300L-24P-4X-A";
const PHONE = "CP-7841-K9=";
const OPTIC_A = "SFP-10G-LR-S=";
const OPTIC_B = "SFP-10/25G-LR-S=";

const C9300L_QTY = 6;

// One ordered Honeywell-shaped BoQ: two switches, a wireless AP, a subscription
// parent, a phone, and two standalone optics. [row, sku, quantity].
const FIXTURE_ROWS: ReadonlyArray<readonly [number, string, number]> = [
  [1, CW9178, 12],
  [2, SUB, 1],
  [3, C9300X, 7],
  [4, C9300L, C9300L_QTY],
  [5, PHONE, 4],
  [6, OPTIC_A, 8],
  [7, OPTIC_B, 5],
];

const CUSTOMER_ORDER = [CW9178, SUB, C9300X, C9300L, PHONE, OPTIC_A, OPTIC_B];

// Distinctive Batch 3 expansion SKUs, each contributed under exactly one parent.
const DISTINCTIVE_B3 = ["AIR-AP-BRACKET-2", "C9300X-NM-8Y", "FAN-T2", "C9300L-STACK-A", "STACK-T3A-50CM"];

// --- Inline fixture builders ------------------------------------------------

function boqLine(row: number, sku: string, quantity: number): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    sku,
    description: sku,
    quantity,
    originalCells: { "#": String(row), "Part Number": sku },
  };
}

function acceptDecision(row: number, sku: string): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    originalSku: sku,
    status: "accepted",
    suggestions: [],
    acceptedSku: sku,
  };
}

function fixtureInput(): { lines: CanonicalBoqLine[]; skuDecisions: SkuResolutionDecision[] } {
  return {
    lines: FIXTURE_ROWS.map(([r, s, q]) => boqLine(r, s, q)),
    skuDecisions: FIXTURE_ROWS.map(([r, s]) => acceptDecision(r, s)),
  };
}

function expansionLines(lines: ConfigurationExpansionDraftLine[]): ConfigurationExpansionDraftLine[] {
  return lines.filter((l) => l.origin === "expansion");
}

function qtyOf(lines: ConfigurationExpansionDraftLine[], sku: string): number | undefined {
  return lines.find((l) => l.sku === sku)?.quantity;
}

function acceptAllDecisions(): Array<{ lineId: string; action: "accept" }> {
  const { draft } = buildHoneywellQuickBomConfigurationExpansionDraft(fixtureInput());
  return expansionLines(draft.lines).map((l) => ({ lineId: l.lineId, action: "accept" as const }));
}

// --- Draft-only runner ------------------------------------------------------

describe("buildHoneywellQuickBomConfigurationExpansionDraft", () => {
  const result = buildHoneywellQuickBomConfigurationExpansionDraft(fixtureInput());
  const expansions = expansionLines(result.draft.lines);

  it("uses the active composed Honeywell Batch 1+2+3 rule-pack id and version", () => {
    expect(result.rulePack.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
    expect(result.rulePack.version).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
    expect(result.rulePack.status).toBe("approved");
  });

  it("preserves every customer line in input order", () => {
    const customerSkus = result.draft.lines.filter((l) => l.origin === "customer").map((l) => l.sku);
    expect(customerSkus).toEqual(CUSTOMER_ORDER);
  });

  it("adds the expected distinctive Batch 3 expansion lines", () => {
    const skus = new Set(expansions.map((l) => l.sku));
    for (const sku of DISTINCTIVE_B3) {
      expect(skus.has(sku), `expected expansion line ${sku}`).toBe(true);
    }
  });

  it("applies the Batch 3 quantity multipliers under the C9300L parent", () => {
    expect(qtyOf(expansions, "FAN-T2")).toBe(C9300L_QTY * 3);
    expect(qtyOf(expansions, "C9300L-STACK-A")).toBe(C9300L_QTY * 2);
    expect(qtyOf(expansions, "STACK-T3A-50CM")).toBe(C9300L_QTY);
  });

  it("leaves the standalone optics as customer lines with no expansion children", () => {
    // Optic SKUs are never produced as expansion lines...
    expect(expansions.some((l) => l.sku === OPTIC_A || l.sku === OPTIC_B)).toBe(false);
    // ...and no expansion line nests under either optic customer line.
    const opticLineIds = result.draft.lines
      .filter((l) => l.origin === "customer" && (l.sku === OPTIC_A || l.sku === OPTIC_B))
      .map((l) => l.lineId);
    expect(opticLineIds).toHaveLength(2);
    expect(expansions.some((l) => l.parentLineId !== undefined && opticLineIds.includes(l.parentLineId))).toBe(false);
  });

  it("leaves every expansion line approvalRequired:true and approved:false", () => {
    expect(expansions.length).toBeGreaterThan(0);
    for (const l of expansions) {
      expect(l.approvalRequired).toBe(true);
      expect(l.approved).toBe(false);
    }
  });
});

// --- Reviewed run -----------------------------------------------------------

describe("runHoneywellQuickBomConfigurationExpansionReview", () => {
  it("requires an explicit decision for every expansion line (no auto-accept)", () => {
    // Relies on applyConfigurationExpansionReview's own explicit-decision guard.
    expect(() =>
      runHoneywellQuickBomConfigurationExpansionReview({ ...fixtureInput(), reviewDecisions: [] })
    ).toThrow(/decision for every expansion line/);
  });

  it("accepts all expansion lines when explicit accept decisions are supplied", () => {
    const reviewDecisions = acceptAllDecisions();
    const run = runHoneywellQuickBomConfigurationExpansionReview({ ...fixtureInput(), reviewDecisions });
    expect(run.review.summary.rejectedExpansionLineCount).toBe(0);
    expect(run.review.summary.acceptedExpansionLineCount).toBe(reviewDecisions.length);
    const acceptedExpansion = expansionLines(run.review.acceptedLines);
    expect(acceptedExpansion).toHaveLength(reviewDecisions.length);
    expect(acceptedExpansion.every((l) => l.approved === true && l.approvalRequired === false)).toBe(true);
  });

  it("can reject one expansion line and exclude it from acceptedLines", () => {
    const { draft } = buildHoneywellQuickBomConfigurationExpansionDraft(fixtureInput());
    const bracket = expansionLines(draft.lines).find((l) => l.sku === "AIR-AP-BRACKET-2");
    expect(bracket).toBeDefined();
    const reviewDecisions = expansionLines(draft.lines).map((l) => ({
      lineId: l.lineId,
      action: l.lineId === bracket?.lineId ? ("reject" as const) : ("accept" as const),
    }));

    const run = runHoneywellQuickBomConfigurationExpansionReview({ ...fixtureInput(), reviewDecisions });
    expect(run.review.acceptedLines.some((l) => l.sku === "AIR-AP-BRACKET-2")).toBe(false);
    expect(run.review.rejectedLines.some((l) => l.sku === "AIR-AP-BRACKET-2")).toBe(true);
    expect(run.review.summary.rejectedExpansionLineCount).toBe(1);
  });

  it("preserves reviewer metadata only when supplied", () => {
    const reviewDecisions = acceptAllDecisions();
    const withMeta = runHoneywellQuickBomConfigurationExpansionReview({
      ...fixtureInput(),
      reviewDecisions,
      reviewedBy: "eng@example.com",
      reviewedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(withMeta.review.reviewedBy).toBe("eng@example.com");
    expect(withMeta.review.reviewedAt).toBe("2026-06-06T00:00:00.000Z");

    const without = runHoneywellQuickBomConfigurationExpansionReview({ ...fixtureInput(), reviewDecisions });
    expect(without.review.reviewedBy).toBeUndefined();
    expect(without.review.reviewedAt).toBeUndefined();
  });

  it("returns the accepted expanded BoM in customer-then-children order", () => {
    const reviewDecisions = acceptAllDecisions();
    const run = runHoneywellQuickBomConfigurationExpansionReview({ ...fixtureInput(), reviewDecisions });
    const accepted = run.review.acceptedLines;

    // Customer lines appear in input order within the accepted BoM.
    expect(accepted.filter((l) => l.origin === "customer").map((l) => l.sku)).toEqual(CUSTOMER_ORDER);

    // Walk the flat accepted list: each expansion line nests under the most recent
    // customer line, proving customer-then-children interleaving (not a trivial
    // identity with the model's own flattenedLines).
    expect(accepted[0].origin).toBe("customer");
    let currentCustomerLineId: string | undefined;
    for (const line of accepted) {
      if (line.origin === "customer") {
        currentCustomerLineId = line.lineId;
        continue;
      }
      expect(line.parentLineId).toBe(currentCustomerLineId);
    }
  });
});

// --- Source hygiene ---------------------------------------------------------

// Exactly the composed helper modules and contract types the runner may import.
const EXPECTED_IMPORTS = [
  "@/lib/projects/honeywell-config-expansion-rule-pack",
  "@/lib/projects/config-expansion",
  "@/lib/projects/config-expansion-review",
  "@/lib/projects/config-expansion-types",
  "@/types/project",
];

// Tokens the runner must never reference in an import specifier: pricing/priced-BoQ,
// Mantle/export/workbook, catalog lookup, API/UI, DB/artifact store, engine,
// coordinator, adapter, AI/LLM. Scanned over the extracted specifiers only.
const FORBIDDEN_IMPORT_TOKENS = [
  "pric", "priced", "cost", "catalog",
  "mantle", "export", "workbook", "xlsx", "exceljs", "docx",
  "adapter", "/api", "route", "component", ".tsx", "/ui",
  "drizzle", "schema", "/db", "db/", "artifact",
  "engine", "coordinator",
  "anthropic", "openai", "gemini", "claude", "generative-ai", "/ai", "llm", "agent",
];

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

describe("quick-bom-runner module - decoupling and hygiene", () => {
  const source = readFileSync(RUNNER_PATH, "utf8");
  const specs = importSpecifiers(source);

  it("imports exactly the composed helper modules and contract types", () => {
    expect(Array.from(new Set(specs)).sort()).toEqual(EXPECTED_IMPORTS.slice().sort());
  });

  it("imports only path-aliased or relative modules (no package modules)", () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(s.startsWith("@/") || s.startsWith("."), `import "${s}" is a package module`).toBe(true);
    }
  });

  it("references no pricing, export, catalog, API/UI, DB/artifact, engine, adapter, or AI module", () => {
    for (const s of specs) {
      const lower = s.toLowerCase();
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        expect(lower.includes(token), `import "${s}" matches forbidden "${token}"`).toBe(false);
      }
    }
  });

  it("adds no pricing-looking keys to the runner output", () => {
    const run = runHoneywellQuickBomConfigurationExpansionReview({
      ...fixtureInput(),
      reviewDecisions: acceptAllDecisions(),
    });
    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const v of value) collect(v);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.push(key);
          // originalCells is verbatim customer data, not runner-authored structure.
          if (key === "originalCells") continue;
          collect(nested);
        }
      }
    };
    collect(run);

    const forbidden = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount", "catalog"];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const lower = key.toLowerCase();
      for (const token of forbidden) {
        expect(lower.includes(token), `output key "${key}" matches forbidden "${token}"`).toBe(false);
      }
    }
  });

  it("keeps the runner source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });
});

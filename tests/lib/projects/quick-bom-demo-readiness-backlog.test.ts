import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Doc regression test for the Quick BoM demo-readiness backlog
 * (docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md), refreshed by Prompt 82 to reflect the
 * committed repo state after Prompts 73-81.
 *
 * It asserts the backlog: records Prompt 82 as the refresh and still treats the
 * planning file as the source of truth (itself an execution tracker); marks the whole
 * P65-P82 demo-readiness slice complete; names the Prompt 73 operator command, the
 * Prompt 74-76 CCW parity/order evidence, and the Prompt 77-81 app-level pieces; no
 * longer carries the stale negatives that there is no app route, no projects UI, no
 * app-level wiring, or no operator command; preserves the demo-only pricing boundary,
 * the pricing/configuration authority separation, the no-runtime-AI rule, Batch 4 as a
 * decision record only, standalone optics, and deferred replacements with no silent
 * substitution; keeps the honest remaining gaps; and stays ASCII-only. The doc is read
 * from disk and never mutated; no runtime evaluator, composer, pricing, or expansion
 * code is imported or run.
 */

const DOC_PATH = join(process.cwd(), "docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/quick-bom-demo-readiness-backlog.test.ts"
);

const doc = readFileSync(DOC_PATH, "utf8");
// Flattened, lowercased content view so multi-word assertions do not break on the
// doc's line wraps. Structural checks (the `- PXX -` list, file-name presence, stale-
// phrase absence, ASCII) use the raw `doc` instead.
const docFlat = doc.toLowerCase().replace(/\s+/g, " ");

const APPROVED_PACK_FILES = [
  "honeywell-batch1-approved-rules.json",
  "honeywell-batch2-approved-rules.json",
  "honeywell-batch3-approved-rules.json",
];
const BATCH4_DECISION_RECORD_FILE = "honeywell-batch4-decision-record.json";

// The whole demo-readiness slice P65-P82 is now closed and kept as the execution
// record; Prompt 82 is the closure refresh, not a "next" prompt.
const COMPLETED_PROMPTS = [
  "P65", "P66", "P67", "P68", "P69", "P70", "P71", "P72", "P73",
  "P74", "P75", "P76", "P77", "P78", "P79", "P80", "P81", "P82",
];

// Pieces committed in Prompts 73-81 the refreshed backlog must name by file/route.
const P73_TO_P81_PIECES = [
  "scripts/write-honeywell-quick-bom-demo.ts",        // P73 operator command
  "HONEYWELL_CCW_PARITY_EVIDENCE.md",                 // P74 CCW parity evidence doc
  "honeywell-ccw-parity-evidence.test.ts",            // P74 CCW parity evidence test
  "CCW-like switch child ordering",                    // P75 child ordering
  "60-row CCW sequence parity",                        // P76 exact sequence parity
  "project-quick-bom-workspace.ts",                   // P77 read model
  "api/projects/[id]/quick-bom/route.ts",             // P77 GET route
  "honeywell-demo-project-fixture.ts",                // P78 persisted demo fixture
  "project-quick-bom-approval.ts",                    // P79 approval service
  "api/projects/[id]/quick-bom/approvals/route.ts",   // P79 POST route
  "src/app/projects/[id]/quick-bom/page.tsx",         // P80 UI page
  "honeywell-quick-bom-app-e2e.test.tsx",             // P81 app-level E2E
];

// Stale framing that must NOT survive the Prompt 82 refresh. Each appeared verbatim
// in the pre-refresh (Prompt 72) backlog, so its absence fails on the stale doc and
// passes on the refreshed one. Matched case-sensitively and exactly. (B10's drizzle
// migration "(glob empty)" is a genuine, still-open DB gap and is intentionally kept.)
const STALE_PHRASES = [
  "Last refreshed by Prompt 72",
  "No `src/app/api/projects/**`",
  "no projects UI exist yet",
  "no app-level Project/API/UI/DB wiring",
  "No app-level Project/API/UI/DB wiring exists.",
  "No operator-facing command/script writes the Honeywell Mantle demo workbook on demand.",
  "No operator-facing demo workbook command/script exists yet",
  "an app-level driver/readiness surface is still future.",
  "next implementation step",
];

describe("quick bom demo-readiness backlog - exists and stays an execution tracker", () => {
  it("exists and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(doc.length).toBeGreaterThan(0);
  });

  it("records the Prompt 82 refresh and keeps the planning file as source of truth", () => {
    expect(docFlat).toContain("refreshed by prompt 82");
    expect(doc).toContain("MVP_CANONICAL_PROJECT_STATE.md");
    expect(docFlat).toContain("execution tracker");
    expect(docFlat).toContain("source of truth");
  });
});

describe("quick bom demo-readiness backlog - approved Batch 1+2+3 authority", () => {
  it("names the three approved Honeywell runtime expansion packs", () => {
    for (const file of APPROVED_PACK_FILES) {
      expect(doc, file).toContain(file);
    }
  });

  it("states approved runtime configuration expansion authority now exists", () => {
    expect(docFlat).toContain(
      "approved runtime configuration expansion authority now exists"
    );
  });

  it("credits the composer with Batch 1+2+3 coverage", () => {
    expect(doc).toContain("composeApprovedConfigExpansionRulePacks");
    expect(docFlat).toContain("batch 1+2+3");
  });

  it("names the Batch 4 record as a decision record only, not runtime authority", () => {
    expect(doc).toContain(BATCH4_DECISION_RECORD_FILE);
    expect(docFlat).toContain("decision record");
    expect(docFlat).toContain("not runtime expansion authority");
  });
});

describe("quick bom demo-readiness backlog - optics and replacement boundaries", () => {
  it("states optics are standalone customer BoQ lines, not expansion children", () => {
    expect(docFlat).toContain("standalone customer boq line");
    expect(docFlat).toContain("not configuration-expansion children");
  });

  it("states replacements remain deferred with no silent SKU substitution", () => {
    expect(docFlat).toContain("replacement candidates remain deferred");
    expect(docFlat).toContain("no silent runtime sku substitution");
  });
});

describe("quick bom demo-readiness backlog - authority separation and fixture boundary", () => {
  it("preserves the pricing/configuration authority separation", () => {
    expect(docFlat).toContain(
      "pricing authority and configuration authority stay separate"
    );
  });

  it("marks demo-fixture pricing temporary, not production authority", () => {
    expect(docFlat).toContain("temporary demo-fixture pricing");
    expect(docFlat).toContain("not permanent");
    expect(docFlat).toContain("production pricing authority");
  });

  it("preserves the no-runtime-AI-decision boundary", () => {
    expect(docFlat).toContain("no runtime");
    expect(docFlat).toContain("configuration decisions");
  });
});

describe("quick bom demo-readiness backlog - P65-P82 slice complete", () => {
  it("carries P65-P82 as the closed completed execution-record list", () => {
    expect(docFlat).toContain("completed (p65-p82)");
    for (const prompt of COMPLETED_PROMPTS) {
      expect(doc, prompt).toContain(`- ${prompt} -`);
    }
  });

  it("names the Prompt 73 command, P74-P76 CCW evidence, and P77-P81 app pieces", () => {
    for (const piece of P73_TO_P81_PIECES) {
      expect(doc, piece).toContain(piece);
    }
  });

  it("keeps the proven P66-P71 in-memory spine counts/totals intact", () => {
    expect(doc).toContain("60 lines carried through the draft, review, priced BoQ");
    expect(doc).toContain("50 unique priced SKUs; 0 unpriced lines");
    expect(doc).toContain("`totalPriceSar` 2185708.76");
    expect(doc).toContain("`totalIncVatSar` 2513565.07");
  });

  it("frames the Honeywell Quick BoM MVP path as first target, RFP out of scope", () => {
    expect(docFlat).toContain("10-14 prompt");
    expect(docFlat).toContain("rfp remains out of current scope");
  });
});

describe("quick bom demo-readiness backlog - app-level proof is scoped honestly", () => {
  it("scopes the app-level proof to the seeded demo path and harness/in-memory store", () => {
    expect(docFlat).toContain("seeded honeywell demo project");
    expect(docFlat).toContain("in-memory store");
  });

  it("does not claim production upload, arbitrary creation, or real DB are complete", () => {
    expect(docFlat).toContain("production upload");
    expect(docFlat).toContain("arbitrary project creation");
    expect(docFlat).toContain("real db provisioning");
  });

  it("keeps the honest remaining gaps clear", () => {
    expect(docFlat).toContain("no general upload endpoint");
    expect(docFlat).toContain("no production pricing authority beyond the demo fixture");
    expect(docFlat).toContain("deterministic fuzzy");
    expect(docFlat).toContain("ai-assisted");
    expect(docFlat).toContain("automatic staleness propagation caller");
    expect(docFlat).toContain("marafiq");
    expect(docFlat).toContain("energytech");
  });
});

describe("quick bom demo-readiness backlog - resolved blockers no longer marked missing", () => {
  it("marks the operator command done and the seeded-demo app surface done", () => {
    expect(doc).toContain("| Done (P73) |");
    expect(docFlat).toContain("seeded-demo surface done (p77-p81)");
  });

  it("notes the persisted demo Project fixture and minimal review/approval surface", () => {
    expect(docFlat).toContain("seeded demo project present (p78)");
    expect(docFlat).toContain("minimally present (p79/p80)");
  });
});

describe("quick bom demo-readiness backlog - stale phrasing removed", () => {
  for (const phrase of STALE_PHRASES) {
    it(`no longer contains: ${phrase}`, () => {
      expect(doc.includes(phrase)).toBe(false);
    });
  }

  it("carries no pre-P65 next-prompt ids (P47-P52 scheme retired)", () => {
    for (const old of ["P47", "P48", "P49", "P50", "P51", "P52"]) {
      expect(doc.includes(old), old).toBe(false);
    }
  });
});

describe("quick bom demo-readiness backlog - hygiene", () => {
  it("keeps the backlog ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Doc regression test for the Quick BoM demo-readiness backlog
 * (docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md), refreshed by Prompt 98 to reflect the
 * committed repo state after Prompts 83-97 (the broader Quick BoM app route/action
 * chain), closing the Prompt 83-98 app-readiness sequence.
 *
 * It asserts the backlog: records Prompt 98 as the refresh and still treats the
 * planning file as the source of truth (itself an execution tracker); preserves the
 * P65-P82 seeded Honeywell closure record and adds the P83-P98 app-readiness closure;
 * names the Prompt 73 operator command, the Prompt 74-76 CCW parity/order evidence, the
 * Prompt 77-81 seeded app-level pieces, and the Prompt 83-97 app route/action chain by
 * route/file; no longer carries the stale negatives that there is no general upload
 * endpoint, no driver from an arbitrary uploaded file, or no download/serve surface;
 * documents the seven honest limitations of the P97 arbitrary-flow proof (no production
 * DB provisioning/RLS/migrations, no full uploaded Honeywell BoQ through real SKU
 * resolution, no full local catalog coverage for Honeywell parent SKUs, no production
 * pricing authority, no broad Cisco-general configuration authority, no line-level
 * SKU/config/pricing review UI, no manual browser QA); preserves the demo-only pricing
 * boundary, the pricing/configuration authority separation, the no-runtime-AI rule,
 * Batch 4 as a decision record only, standalone optics, and deferred replacements with
 * no silent substitution; and stays ASCII-only.
 *
 * Prompt 101 additionally aligns the DB-readiness evidence after Prompt 100: the backlog
 * names the committed migration SQL under src/lib/db/migrations/ (including
 * 0004_project_state.sql) and the withTenantDb tenant-context wrapper proven by
 * tests/lib/db/tenant-db.test.ts, drops the stale "no committed migration directory" /
 * "glob empty" claim, and still says a live/provisioned Postgres run is unverified
 * (production DB readiness still open).
 *
 * The doc is read from disk and never mutated; no runtime evaluator, composer, pricing,
 * or expansion code is imported or run.
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

// Both closed slices are kept as the execution record: the seeded slice P65-P82
// (Prompt 82 closure) and the app-readiness slice P83-P98 (Prompt 98 closure). Each
// closure prompt is the refresh itself, not a "next" prompt.
const COMPLETED_PROMPTS = [
  "P65", "P66", "P67", "P68", "P69", "P70", "P71", "P72", "P73",
  "P74", "P75", "P76", "P77", "P78", "P79", "P80", "P81", "P82",
  "P83", "P84", "P85", "P86", "P87", "P88", "P89", "P90", "P91",
  "P92", "P93", "P94", "P95", "P96", "P97", "P98",
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

// Pieces committed in Prompts 83-97 the Prompt 98 backlog must name by route/file.
const P83_TO_P97_PIECES = [
  "POST /api/projects/quick-bom",
  "src/app/api/projects/quick-bom/route.ts",
  "POST /api/projects/[id]/quick-bom/files",
  "POST /api/projects/[id]/quick-bom/files/[fileId]/normalize",
  ".../artifacts/[artifactId]/sku-resolution",
  ".../sku-resolution/review",
  ".../artifacts/[artifactId]/configuration-expansion",
  ".../configuration-expansion/review",
  ".../artifacts/[artifactId]/priced-boq",
  ".../priced-boq/review",
  ".../artifacts/[artifactId]/export-package",
  ".../export-package/download",
  "tests/app/project-quick-bom-arbitrary-flow-e2e.test.tsx",
];

// Stale framing that must NOT survive the Prompt 98 refresh. Matched
// case-sensitively and exactly. (B10's old "no committed migration directory" /
// "(glob empty)" DB claim is corrected by Prompt 101; its absence is checked by the
// DB-readiness alignment block below, not here.)
const STALE_PHRASES = [
  "Last refreshed by Prompt 72",
  "Last refreshed by Prompt 82",
  "No `src/app/api/projects/**`",
  "no projects UI exist yet",
  "no app-level Project/API/UI/DB wiring",
  "No app-level Project/API/UI/DB wiring exists.",
  "No operator-facing command/script writes the Honeywell Mantle demo workbook on demand.",
  "No operator-facing demo workbook command/script exists yet",
  "an app-level driver/readiness surface is still future.",
  "No general upload endpoint",
  "No driver that turns an arbitrary uploaded file",
  "Still missing: a product surface to download/serve",
  "arbitrary project creation, a general BoQ upload endpoint",
  "next implementation step",
];

describe("quick bom demo-readiness backlog - exists and stays an execution tracker", () => {
  it("exists and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(doc.length).toBeGreaterThan(0);
  });

  it("records the Prompt 98 refresh and keeps the planning file as source of truth", () => {
    expect(docFlat).toContain("refreshed by prompt 98");
    expect(docFlat).toContain("prompt 83-98 app-readiness sequence");
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

describe("quick bom demo-readiness backlog - P65-P98 slices complete", () => {
  it("carries P65-P98 as the closed completed execution-record list", () => {
    expect(docFlat).toContain("completed (p65-p82)");
    expect(docFlat).toContain("completed (p83-p98)");
    for (const prompt of COMPLETED_PROMPTS) {
      expect(doc, prompt).toContain(`- ${prompt} -`);
    }
  });

  it("names the Prompt 73 command, P74-P76 CCW evidence, and P77-P81 app pieces", () => {
    for (const piece of P73_TO_P81_PIECES) {
      expect(doc, piece).toContain(piece);
    }
  });

  it("names the P83-P97 app route/action chain pieces", () => {
    for (const piece of P83_TO_P97_PIECES) {
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

  it("scopes the arbitrary-flow proof to reduced catalog-resolvable input", () => {
    expect(docFlat).toContain("arbitrary quick_bom project");
    expect(docFlat).toContain("reduced catalog-resolvable csv subset");
    expect(docFlat).toContain("route/action chain proof");
  });

  it("does not claim production DB, full Honeywell upload, or browser QA are complete", () => {
    expect(docFlat).toContain("real db provisioning");
    expect(docFlat).toContain("production db provisioning/rls/migrations");
    expect(docFlat).toContain("manual browser qa");
    expect(docFlat).toContain("full uploaded honeywell boq through real sku resolution");
  });

  it("keeps the honest remaining gaps clear", () => {
    expect(docFlat).toContain("full local catalog coverage for honeywell parent skus");
    expect(docFlat).toContain("no production pricing authority beyond the demo fixture");
    expect(docFlat).toContain("broad cisco-general configuration authority");
    expect(docFlat).toContain("line-level sku/config/pricing review ui");
    expect(docFlat).toContain("deterministic fuzzy");
    expect(docFlat).toContain("ai-assisted");
    expect(docFlat).toContain("automatic staleness propagation caller");
    expect(docFlat).toContain("marafiq");
    expect(docFlat).toContain("energytech");
  });
});

describe("quick bom demo-readiness backlog - resolved blockers no longer marked missing", () => {
  it("marks the operator command, seeded-demo app surface, and route/action chain done", () => {
    expect(doc).toContain("| Done (P73) |");
    expect(docFlat).toContain("seeded-demo surface done (p77-p81)");
    expect(docFlat).toContain("route/action chain done (p83-p97)");
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

describe("quick bom demo-readiness backlog - DB readiness evidence aligned (P100/P101)", () => {
  it("no longer claims an absent committed migration dir or a glob-empty one", () => {
    expect(doc.includes("no committed migration directory")).toBe(false);
    expect(doc.toLowerCase().includes("glob empty")).toBe(false);
  });

  it("names the committed migration dir and the project-state migration", () => {
    expect(doc).toContain("src/lib/db/migrations/");
    expect(doc).toContain("0004_project_state.sql");
  });

  it("credits the withTenantDb tenant-context wrapper and its committed proof", () => {
    expect(doc).toContain("withTenantDb");
    expect(docFlat).toContain("app.tenant_id");
    expect(doc).toContain("tenant-db.test.ts");
  });

  it("still says a live/provisioned Postgres run is unverified and DB readiness is open", () => {
    expect(docFlat).toContain("live/provisioned postgres run remains unverified");
    expect(docFlat).toContain("production db readiness is still open");
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

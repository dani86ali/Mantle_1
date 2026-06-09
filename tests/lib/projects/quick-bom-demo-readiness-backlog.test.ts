import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Doc regression test for the Quick BoM demo-readiness backlog
 * (docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md), refreshed by Prompt 141 (docs/test
 * alignment for the Prompt 139/140 live-DB browser proofs). Prompt 139 added
 * scripts/prove-project-quick-bom-browser-real-db.ts (seeded live-DB headless browser
 * render smoke proof, Section 5I); Prompt 140 added
 * scripts/prove-project-quick-bom-browser-workflow-real-db.ts and proved the full
 * Honeywell Quick BoM workflow through an automated headless browser against
 * live/provisioned local Postgres (Section 5J). Prior: refreshed by Prompt 138 (docs/test
 * alignment cleanup, after Prompt 137 added
 * scripts/prove-project-quick-bom-route-real-db.ts and ran it against local Docker
 * Postgres (live-DB Quick BoM API route/action-chain proof, Section 5H). Prior:
 * refreshed by Prompt 136 after Prompt 135 added scripts/prove-project-real-db.ts
 * and ran it against local Docker Postgres (B10 closed for local/provisioned
 * Project-store real-DB proof).
 *
 * Prior: refreshed by Prompt 134 after Prompt 133 applied automatic downstream artifact
 * staleness propagation in src/lib/db/project-artifact-store.ts (B6 closed). Prior:
 * refreshed by Prompt 132 after Prompts 104-131 (P104-P114 Honeywell demo catalog
 * supplement UI wiring; P126-P131 line-level review UI and full seven-line Honeywell app
 * proof). Prompt 98 reflected the committed repo state after Prompts 83-97 (the broader
 * Quick BoM app route/action chain), closing the Prompt 83-98 app-readiness sequence.
 * Prompt 101 aligned the DB-readiness evidence; Prompt 103 aligned the catalog-coverage
 * evidence.
 *
 * This test asserts the backlog: records Prompt 138 as the current refresh while
 * preserving Prompt 137, Prompt 136, Prompt 135, Prompt 134, and earlier
 * closure records; asserts Prompt 137 live-DB Quick BoM API route/action-chain proof
 * facts (script name, run command, tables, SKU count, config/priced/export rows, totals,
 * cleanup); asserts Prompt 135 real-DB proof facts; asserts B10 is no longer framed as
 * needs-verification or unverified; asserts B6 is no longer framed as open/later/post-MVP;
 * keeps the planning file as source of truth; preserves the P65-P82 seeded Honeywell
 * closure record, the P83-P98 app-readiness closure, and the P104-P141
 * UI/evidence/staleness/real-DB/browser/docs hardening closure; records that an automated
 * browser-driven UI/live DB proof now exists (P140), while keeping manual browser QA,
 * full Honeywell BoQ through real SKU resolution, production deployment, production
 * pricing authority, broad Cisco-general configuration authority, and future suggestion
 * steps as open; preserves the demo-only pricing boundary, the
 * pricing/configuration authority separation, the no-runtime-AI rule, Batch 4 as a
 * decision record only, standalone optics, and deferred replacements with no silent
 * substitution; and stays ASCII-only.
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

// Three closed slices are kept as the execution record: the seeded slice P65-P82
// (Prompt 82 closure), the app-readiness slice P83-P98 (Prompt 98 closure), and the
// UI/evidence hardening slice P104-P132 (Prompt 132 closure). Each closure prompt is
// the refresh itself, not a "next" prompt. P104-P132 are listed as grouped ranges in
// the doc (not individually), so only the P65-P98 range is checked individually here.
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

// Stale framing that must NOT survive the Prompt 134 refresh. Matched
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
  // Prompt 103: stale catalog-coverage framing the Prompt 102 audit retires. Scoped to
  // B9's old wording; B10's DB "(needs verification)" / "unverified" wording stays.
  "Catalog coverage (needs verification)",
  "catalog coverage is still unverified",
  "whether the Honeywell-scope SKUs are present is unverified",
  "Honeywell SKU coverage in the local mock catalog is unverified",
  // Prompt 132: stale line-level review UI gap statements retired (UI now exists).
  "line-level review UI later/post-MVP",
  "line-level review UI screens remain future",
  "There is still no line-level SKU review",
  "no line-level configuration review UI screen",
  "Production DB/browser hardening and line-level review UI remain future",
  "production provisioning and per-line review UI remain future",
  "production provisioning + per-line review UI later",
  "Production provisioning and line-level review UI remain follow-ups",
  "Still unbuilt: production DB provisioning/migrations, full customer/general production readiness, and line-level SKU/config/pricing review UI",
  "Production provisioning and line-level review UI remain follow-ups",
  // Prompt 136: stale B10 DB-provisioning framing retired (Project-store proof exists, P135).
  "DB provisioning (needs verification)",
  "live/provisioned Postgres run remains unverified",
  "live/provisioned Postgres run still unverified",
  "production DB readiness is still open",
  "real DB provisioning still open",
  "Real DB provisioning/RLS/migrations plus a demo/run against a provisioned database",
  "Real DB provisioning/migrations remain open",
  "a run against a provisioned real DB is still verification work",
  "Still unbuilt: production DB provisioning/migrations",
  // Prompt 141: stale browser-driven UI/live DB wording retired (automated headless browser
  // workflow proof now exists, P140).
  "browser-driven UI/live DB and production deployment remain open",
  "browser-driven UI against live DB remains open",
  "browser-driven UI against a live/provisioned DB remains open",
  "browser-driven UI against a live/provisioned database remains open",
  "full Next.js API/UI/browser route chain against live DB remains unproven",
  // Prompt 138: stale live-DB wording retired (Quick BoM API route/action chain against real DB now exists, P137).
  "full app route/action chain against a live/provisioned database remains unproven",
  "full Next.js API/UI/browser route chain against live DB remains unproven (B10)",
  "full Next.js API/UI/browser route chain against live DB remains unproven",
  "full Next.js API/UI/browser route chain against a live/provisioned database",
  "full Next.js API/UI/browser route chain against a live DB",
  "full Next.js route chain against a live DB remains open",
  // Prompt 134: stale staleness framing retired (B6 closed by Prompt 133).
  "planning only",
  "no caller in src",
  "project-approval-store.ts and project-artifact-store.ts explicitly do not propagate staleness",
  "Staleness is planned but never applied at runtime",
  "no automatic staleness propagation caller exists",
  "Automatic staleness propagation caller so upstream changes mark downstream stale",
  "| B6 | P1 | Staleness | Upstream changes do not automatically mark downstream artifacts stale at runtime.",
];

describe("quick bom demo-readiness backlog - exists and stays an execution tracker", () => {
  it("exists and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(doc.length).toBeGreaterThan(0);
  });

  it("records the Prompt 141 refresh and keeps earlier refresh records and planning file as source of truth", () => {
    expect(docFlat).toContain("refreshed by prompt 141");
    expect(docFlat).toContain("refreshed by prompt 138");
    expect(docFlat).toContain("refreshed by prompt 136");
    expect(docFlat).toContain("refreshed by prompt 134");
    expect(docFlat).toContain("refreshed by prompt 132");
    expect(docFlat).toContain("prompts 104-131");
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

describe("quick bom demo-readiness backlog - P65-P132 slices complete", () => {
  it("carries P65-P98 as the closed completed execution-record list", () => {
    expect(docFlat).toContain("completed (p65-p82)");
    expect(docFlat).toContain("completed (p83-p98)");
    for (const prompt of COMPLETED_PROMPTS) {
      expect(doc, prompt).toContain(`- ${prompt} -`);
    }
  });

  it("carries the closed P104-P141 UI/evidence/staleness/real-DB/browser/docs hardening record", () => {
    expect(docFlat).toContain("completed (p104-p141)");
    expect(docFlat).toContain("p104-p114");
    expect(docFlat).toContain("p126-p131");
    expect(docFlat).toContain("p132");
    expect(docFlat).toContain("p133");
    expect(docFlat).toContain("p134");
    expect(docFlat).toContain("p135");
    expect(docFlat).toContain("p136");
    expect(docFlat).toContain("p137");
    expect(docFlat).toContain("p138");
    expect(docFlat).toContain("p139");
    expect(docFlat).toContain("p140");
    expect(docFlat).toContain("p141");
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

describe("quick bom demo-readiness backlog - Prompt 131 full seven-line app proof", () => {
  it("documents the P131 seven-line Honeywell app proof counts", () => {
    expect(docFlat).toContain("7 normalized customer rows");
    expect(docFlat).toContain("7 accepted sku review decisions");
    expect(docFlat).toContain("60 accepted configuration lines");
    expect(docFlat).toContain("60 priced lines");
    expect(docFlat).toContain("60 export rows");
    expect(docFlat).toContain("no unpriced lines");
  });

  it("documents the P131 seven-line Honeywell app proof totals", () => {
    expect(doc).toContain("totalPriceSar 2185708.76");
    expect(doc).toContain("totalIncVatSar 2513565.07");
  });

  it("states line-level SKU/config/pricing review UI now exists", () => {
    expect(docFlat).toContain("line-level sku/config/pricing review ui screens now exist");
    expect(doc).toContain("tests/ui/project-quick-bom-page.test.tsx");
  });

  it("states the proof runs under the test harness/in-memory store", () => {
    expect(docFlat).toContain("test harness/in-memory store");
    expect(docFlat).toContain("not live/provisioned db");
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

  it("states Project-store local real-DB proof exists, Quick BoM API route/action chain against real DB exists, and remaining open gaps clearly", () => {
    // P135 proves the Project-store layer; P137 proves the Quick BoM API route chain;
    // an automated browser-driven UI/live DB proof exists via Prompt 140, while manual
    // browser QA and production deployment remain open.
    expect(docFlat).toContain("project-store local real-db proof exists");
    expect(docFlat).toContain("quick bom api route/action chain against real db exists");
    expect(docFlat).toContain("browser-driven ui");
    expect(docFlat).toContain("production deployment");
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
    expect(docFlat).toContain("marafiq");
    expect(docFlat).toContain("energytech");
  });
});

describe("quick bom demo-readiness backlog - Prompt 135 real-DB proof (B10 closed)", () => {
  const b10Row = doc.split("\n").find((line) => line.startsWith("| B10 |")) ?? "";

  it("finds the B10 DB provisioning row", () => {
    expect(b10Row.length).toBeGreaterThan(0);
    expect(b10Row).toContain("DB provisioning");
  });

  it("B10 is no longer framed as needs-verification, unverified, or DB readiness open", () => {
    expect(b10Row).not.toContain("needs verification");
    expect(b10Row).not.toContain("unverified");
    expect(b10Row).not.toContain("DB readiness is still open");
    expect(b10Row).not.toContain("real DB provisioning still open");
  });

  it("B10 references the P135 proof script", () => {
    expect(b10Row).toContain("P135");
    expect(b10Row).toContain("scripts/prove-project-real-db.ts");
  });

  it("B10 states automated browser-driven UI/live DB proof exists (P140) and production deployment remains open", () => {
    expect(b10Row.toLowerCase()).toContain("browser-driven ui");
    expect(b10Row.toLowerCase()).toContain("prompt 140");
    expect(b10Row.toLowerCase()).toContain("manual browser qa");
    expect(b10Row.toLowerCase()).toContain("production deployment");
    expect(b10Row.toLowerCase()).toContain("quick bom api route/action chain against real db exists");
  });

  it("backlog documents the P135 proof script name and run", () => {
    expect(doc).toContain("scripts/prove-project-real-db.ts");
    expect(docFlat).toContain("npx.cmd tsx scripts/prove-project-real-db.ts");
  });

  it("backlog documents the P135 proof facts", () => {
    expect(docFlat).toContain("tenants, projects, project_stages, project_artifacts, project_approvals");
    expect(docFlat).toContain("stage count 5");
    expect(docFlat).toContain("wrong-tenant read null");
    expect(docFlat).toContain("approval count 1");
    expect(docFlat).toContain("cleanup ok");
  });

  it("backlog documents downstream staleness in the P135 proof results", () => {
    expect(docFlat).toContain("sku_resolution");
    expect(docFlat).toContain("export_package stale");
  });

  it("backlog states an automated browser-driven UI/live DB proof exists and production deployment remains open", () => {
    expect(docFlat).toContain("automated browser-driven ui/live db proof exists");
    expect(docFlat).toContain("production deployment verification remain open");
  });

  it("backlog keeps manual browser QA as an open follow-up", () => {
    expect(docFlat).toContain("manual browser qa");
  });

  it("backlog keeps full uploaded Honeywell BoQ through real SKU resolution as a gap", () => {
    expect(docFlat).toContain("full uploaded honeywell boq through real sku resolution");
  });

  it("backlog keeps production pricing authority as future/not claimed", () => {
    expect(docFlat).toContain("production pricing authority");
    expect(docFlat).toContain("no production pricing authority beyond the demo fixture");
  });
});

describe("quick bom demo-readiness backlog - Prompt 137 live-DB Quick BoM API route proof (Section 5H)", () => {
  it("names the prove-project-quick-bom-route-real-db script and run command", () => {
    expect(doc).toContain("scripts/prove-project-quick-bom-route-real-db.ts");
    expect(docFlat).toContain("npx.cmd tsx scripts/prove-project-quick-bom-route-real-db.ts");
  });

  it("documents the required tables including project_files", () => {
    expect(docFlat).toContain(
      "tenants, projects, project_files, project_stages, project_artifacts, project_approvals"
    );
  });

  it("documents the P137 proof route chain facts", () => {
    expect(docFlat).toContain("normalized line count: 7");
    expect(docFlat).toContain("honeywell_mvp_demo_catalog_supplement");
    expect(docFlat).toContain("sku accepted count: 7");
    expect(docFlat).toContain("config accepted lines: 60");
    expect(docFlat).toContain("priced line count: 60");
    expect(docFlat).toContain("totalpricesar: 2185708.76");
    expect(docFlat).toContain("totalincvatsar: 2513565.07");
    expect(docFlat).toContain("export row count: 60");
    expect(docFlat).toContain("downloaded xlsx bytes: 14315");
    expect(docFlat).toContain("cleanup result: ok");
  });

  it("states P137 closes the live-DB Quick BoM API route/action-chain proof gap", () => {
    expect(docFlat).toContain("closes the live-db quick bom api route/action-chain proof gap");
  });

  it("states automated browser-driven UI/live DB proof exists, while manual browser QA, production deployment, full real-catalog Honeywell SKU resolution, and production pricing authority remain open", () => {
    expect(docFlat).toContain("manual browser qa");
    expect(docFlat).toContain("browser-driven ui");
    expect(docFlat).toContain("production deployment");
    expect(docFlat).toContain("full real-catalog honeywell sku resolution");
    expect(docFlat).toContain("production cisco pricing authority");
  });

  it("states honeywell_mvp_demo catalog profile/supplement and demo fixture authority (not full catalog)", () => {
    expect(docFlat).toContain("honeywell_mvp_demo catalog profile");
    expect(docFlat).toContain("demo fixture authority");
  });
});

describe("quick bom demo-readiness backlog - Prompt 139/140 live-DB browser proofs (Sections 5I/5J)", () => {
  it("names the Prompt 139 seeded browser render smoke proof script", () => {
    expect(doc).toContain("scripts/prove-project-quick-bom-browser-real-db.ts");
    expect(docFlat).toContain("automated headless browser seeded-render smoke proof");
  });

  it("names the Prompt 140 browser workflow proof script and its test", () => {
    expect(doc).toContain("scripts/prove-project-quick-bom-browser-workflow-real-db.ts");
    expect(doc).toContain(
      "tests/scripts/prove-project-quick-bom-browser-workflow-real-db.test.ts"
    );
  });

  it("documents the Prompt 140 evidence counts and totals", () => {
    expect(docFlat).toContain("7 normalized lines");
    expect(docFlat).toContain("7 accepted sku decisions");
    expect(docFlat).toContain("60 configuration/priced/export rows");
    expect(doc).toContain("totalPriceSar 2185708.76");
    expect(doc).toContain("VAT 327856.31");
    expect(doc).toContain("totalIncVatSar 2513565.07");
    expect(docFlat).toContain("approved export download link visible");
  });

  it("states an automated browser-driven UI/live DB proof exists via the automated headless browser workflow", () => {
    expect(docFlat).toContain("automated browser-driven ui/live db proof now exists");
    expect(docFlat).toContain("automated headless browser workflow");
    expect(docFlat).toContain("automated headless browser evidence, not human/manual qa");
  });

  it("keeps manual browser QA and production deployment open after Prompt 140", () => {
    expect(docFlat).toContain("manual browser qa (remains not run/open)");
    expect(docFlat).toContain("production deployment/provisioning verification (remains open)");
    expect(docFlat).toContain("broad/general cisco intelligence (out of scope)");
  });

  it("records the Prompt 139 fix-free seeded smoke scope and the Prompt 140 UUID dev-session fix", () => {
    expect(docFlat).toContain("not manual browser qa and not the full workflow proof");
    expect(docFlat).toContain("default dev session user id to be uuid-shaped");
    expect(docFlat).toContain("project_approvals.decided_by");
  });
});

describe("quick bom demo-readiness backlog - Prompt 133 staleness wiring (B6 closed)", () => {
  const b6Row = doc.split("\n").find((line) => line.startsWith("| B6 |")) ?? "";

  it("finds the B6 staleness row", () => {
    expect(b6Row.length).toBeGreaterThan(0);
    expect(b6Row).toContain("Staleness");
  });

  it("B6 is no longer framed as open/later/post-MVP", () => {
    expect(b6Row).not.toContain("later/post-MVP");
    expect(b6Row).not.toContain("open");
  });

  it("B6 is marked done with Prompt 133", () => {
    expect(b6Row).toContain("Done (P133)");
  });

  it("backlog contains Prompt 133 staleness implementation facts", () => {
    expect(docFlat).toContain("planstaleartifactupdates");
    expect(docFlat).toContain("createprojectartifactversion");
    expect(docFlat).toContain("project-artifact-store.ts");
    expect(docFlat).toContain("tenant-scoped transaction");
    expect(docFlat).toContain("immutable history preserved");
    expect(docFlat).toContain("tests/lib/db/project-artifact-store.test.ts");
  });

  it("backlog states the pure planner remains in staleness.ts and is wired by Prompt 133", () => {
    expect(docFlat).toContain("staleness.ts");
    expect(docFlat).toContain("prompt 133 wires");
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

  it("states the local/provisioned Project-store real-DB proof exists (P135)", () => {
    expect(docFlat).toContain("scripts/prove-project-real-db.ts");
    expect(docFlat).toContain("local docker postgres");
    expect(docFlat).toContain("tenants, projects, project_stages, project_artifacts, project_approvals");
    expect(docFlat).toContain("stage count 5");
    expect(docFlat).toContain("wrong-tenant read null");
    expect(docFlat).toContain("approval count 1");
    expect(docFlat).toContain("cleanup ok");
  });

  it("states an automated browser-driven UI/live DB proof exists and production deployment remains open", () => {
    expect(docFlat).toContain("automated browser-driven ui/live db proof exists");
    expect(docFlat).toContain("production deployment");
  });
});

describe("quick bom demo-readiness backlog - catalog coverage evidence aligned (P102/P103)", () => {
  // The B9 blocker row is a single Markdown table line; isolate it so the "no longer
  // unverified" check stays scoped to B9 and never trips on B10's legitimate DB wording.
  const b9Row = doc.split("\n").find((line) => line.startsWith("| B9 |")) ?? "";

  it("finds the B9 catalog-coverage row carrying the verified framing", () => {
    expect(b9Row.length).toBeGreaterThan(0);
    expect(b9Row).toContain("Catalog coverage");
    expect(b9Row).toContain("P102");
  });

  it("B9 no longer says needs verification or unverified", () => {
    expect(b9Row).not.toContain("needs verification");
    expect(b9Row).not.toContain("unverified");
  });

  it("names the Prompt 102 audit doc, module, and test", () => {
    expect(doc).toContain("docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md");
    expect(doc).toContain("honeywell-catalog-coverage-audit.ts");
    expect(doc).toContain("honeywell-catalog-coverage-audit.test.ts");
  });

  it("includes the verified customer-row and broader-universe coverage counts", () => {
    expect(docFlat).toContain(
      "customer rows 7 total, 4 matched, 3 not_found, 0 ambiguous"
    );
    expect(docFlat).toContain(
      "broader demo skus 50 total, 30 matched, 20 not_found, 0 ambiguous"
    );
  });

  it("names the missing Honeywell customer parent SKUs", () => {
    for (const sku of ["CW9178I-CFG", "C9300X-48HX-A", "C9300L-24P-4X-A"]) {
      expect(doc, sku).toContain(sku);
    }
  });

  it("preserves the local_stc_historical_mock catalog source", () => {
    expect(doc).toContain("local_stc_historical_mock");
  });

  it("keeps the audit-only boundary with no production catalog/pricing/config/substitution authority", () => {
    expect(docFlat).toContain("audit-only");
    expect(docFlat).toContain(
      "no pricing, configuration, production catalog, or substitution authority"
    );
  });

  it("retains full uploaded Honeywell BoQ through real SKU resolution as a remaining gap", () => {
    expect(docFlat).toContain(
      "full uploaded honeywell boq through real sku resolution"
    );
  });

  it("no longer frames catalog coverage as still unverified anywhere", () => {
    expect(doc.toLowerCase().includes("catalog coverage is still unverified")).toBe(false);
    expect(
      doc.toLowerCase().includes("sku coverage in the local mock catalog is unverified")
    ).toBe(false);
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

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Doc regression test for the Honeywell Quick BoM demo operator runbook
 * (docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md), refreshed by Prompt 142 (docs/test
 * alignment for the local production build proof: npm.cmd run build completed successfully;
 * Quick BoM API/UI routes present; Redis/ioredis ECONNREFUSED :6379 noise is a known
 * non-failing build/test noise and reliability follow-up; no production readiness claimed).
 * Section 13 records the local production build proof.
 *
 * It asserts the runbook: records the Prompt 142 refresh (prior: Prompt 141, 138, 136, 132);
 * documents the Prompt 142 local production build proof (npm.cmd run build success, Quick
 * BoM routes present, Redis/ioredis ECONNREFUSED :6379 noise as known non-failing noise,
 * open gaps: manual browser QA, production deployment, production Cisco pricing authority,
 * full real-catalog Honeywell SKU coverage, hosted deployment readiness, CI readiness);
 * documents the Prompt 139 live-DB seeded browser render smoke proof and the Prompt 140
 * automated browser-driven UI/live DB workflow proof (script names, evidence facts, and
 * the open manual-browser-QA / production-deployment gaps);
 * documents the Prompt 137 live-DB Quick BoM API route/action-chain proof (script name,
 * run command, proof facts, open boundaries); documents the Prompt 135 local Docker
 * Postgres Project-state real-DB proof (script name, run command, proof facts, B10
 * closure, open follow-ups); still defines the generated Honeywell Mantle workbook
 * correctly (what it is, and the historical/CCW/customer-input files it is NOT); keeps
 * the Prompt 73 local operator command and its manual workbook checklist with the key
 * counts/totals; preserves the Batch 4 / optics / replacement / pricing / runtime-AI
 * boundaries; documents the Prompt 81 app-level E2E proof (the real GET route, POST
 * route/service, UI page, seeded fixture, on-disk workbook, export approval to
 * customer-deliverable ready, and no payload leak); documents the Prompt 97 arbitrary-flow
 * proof and its limitations (line-level review UI now exists per P126-P131, manual
 * browser QA still open); documents the Prompt 131 full seven-line Honeywell app proof counts/totals;
 * and no longer says app-level testing is "not ready yet" or "comes later" as a blanket
 * statement. The doc is read from disk only; no runtime module is imported (a pure
 * documentation regression test).
 */

const DOC_PATH = join(
  process.cwd(),
  "docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-quick-bom-demo-runbook.test.ts"
);

const doc = readFileSync(DOC_PATH, "utf8");
// Content views: strip markdown bold markers and flatten whitespace so assertions
// do not break on line wraps or `**emphasis**`. ASCII hygiene checks use raw `doc`.
const docText = doc.replace(/\*\*/g, "").replace(/\s+/g, " ");
const docTextLower = docText.toLowerCase();

describe("honeywell quick bom demo runbook - exists and is hygienic", () => {
  it("exists and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(doc.length).toBeGreaterThan(0);
  });

  it("records the Prompt 142 refresh and keeps the prior Prompt 141, 138, 136, and 132 records", () => {
    expect(docTextLower).toContain("refreshed by prompt 142");
    expect(docTextLower).toContain("refreshed by prompt 141");
    expect(docTextLower).toContain("refreshed by prompt 138");
    expect(docTextLower).toContain("refreshed by prompt 136");
    expect(docTextLower).toContain("refreshed by prompt 132");
  });

  it("keeps the runbook ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

describe("honeywell quick bom demo runbook - defines the Mantle workbook", () => {
  it("defines it as a generated customer-facing priced Mantle/STC workbook", () => {
    expect(docText).toContain("generated `.xlsx` customer-facing priced");
    expect(docText).toContain("Mantle/STC template shape");
  });

  it("lists the inputs it is produced from", () => {
    expect(docText).toContain("Honeywell-shaped demo input");
    expect(docText).toContain("human-accepted SKU decisions");
    expect(docText).toContain("approved Batch 1+2+3 configuration expansion");
    expect(docText).toContain("explicit engineer expansion review");
    expect(docText).toContain("committed Honeywell demo pricing fixture");
    expect(docText).toContain("in-memory Mantle export model");
    expect(docText).toContain("Mantle workbook writer");
  });

  it("states what the workbook is NOT", () => {
    expect(docText).toContain("It is explicitly not");
    expect(docText).toContain("not the old Honeywell input workbook");
    expect(docText).toContain("Honeywell_BoQ_priced.xlsx");
    expect(docText).toContain("not a CCW export");
    expect(docText).toContain("not a mutation of a customer-uploaded file");
    expect(docText).toContain("never edits the customer's workbook in place");
  });
});

describe("honeywell quick bom demo runbook - Prompt 73 local command", () => {
  it("records the automated e2e proof of the path and the temp workbook write/reopen", () => {
    expect(docText).toContain("honeywell-quick-bom-demo-e2e.test.ts");
    expect(docTextLower).toContain("writes the mantle model to a temporary");
    expect(docTextLower).toContain("re-opens that");
  });

  it("states the Prompt 73 operator command exists, with its path", () => {
    expect(docTextLower).toContain("operator command now exists");
    expect(docText).toContain("scripts/write-honeywell-quick-bom-demo.ts");
  });
});

describe("honeywell quick bom demo runbook - authority boundaries", () => {
  it("keeps configuration and pricing authority separate and demo-only", () => {
    expect(docText).toContain("approved Batch 1+2+3 rule packs plus explicit");
    expect(docTextLower).toContain("demo-only authority");
    expect(docTextLower).toContain("not production pricing");
  });

  it("preserves the Batch 4 / optics / replacement / runtime-AI boundaries", () => {
    expect(docText).toContain("No Batch 4 runtime expansion pack");
    expect(docText).toContain("Optics are standalone customer BoQ lines");
    expect(docText).toContain("never expansion children");
    expect(docText).toContain("Replacements remain deferred");
    expect(docText).toContain("No silent SKU substitution");
    expect(docText).toContain("No runtime AI, catalog, or pricing decisions");
  });
});

describe("honeywell quick bom demo runbook - manual checklist", () => {
  it("includes the manual checklist for the Prompt 73 command", () => {
    expect(docText).toContain("Manual checklist");
    expect(docTextLower).toContain("with the prompt 73 operator command");
    expect(docTextLower).toContain("run the command");
    expect(docTextLower).toContain("temp/demo output folder");
    expect(docTextLower).toContain("open the workbook");
  });

  it("carries the key Prompt 71 line counts", () => {
    expect(docText).toContain(
      "60 rows / 50 unique priced SKUs / no unpriced lines"
    );
  });

  it("carries the standalone optic quantities", () => {
    expect(docText).toContain("qty 12 (`SFP-10G-LR-S=`)");
    expect(docText).toContain("qty 14 (`SFP-10/25G-LR-S=`)");
  });

  it("carries the representative Batch 3 expansion quantities", () => {
    expect(docText).toContain("`FAN-T2` 18");
    expect(docText).toContain("`C9300L-STACK-A` 12");
    expect(docText).toContain("`STACK-T3A-50CM` 6");
  });

  it("carries the representative totals", () => {
    expect(docText).toContain("`totalPriceSar` 2185708.76");
    expect(docText).toContain("VAT 327856.31");
    expect(docText).toContain("`totalIncVatSar` 2513565.07");
  });

  it("requires the workbook to be customer-facing Mantle with no manual reformatting", () => {
    expect(docText).toContain("customer-facing Mantle format");
    expect(docText).toContain("does not require manual reformatting");
  });
});

describe("honeywell quick bom demo runbook - app-level demo proof (Prompt 81)", () => {
  it("names the app-level E2E and the real wired product pieces", () => {
    expect(docText).toContain("honeywell-quick-bom-app-e2e.test.tsx");
    expect(docText).toContain("src/app/api/projects/[id]/quick-bom/route.ts");
    expect(docText).toContain(
      "src/app/api/projects/[id]/quick-bom/approvals/route.ts"
    );
    expect(docText).toContain("project-quick-bom-approval.ts");
    expect(docText).toContain("src/app/projects/[id]/quick-bom/page.tsx");
    expect(docText).toContain("honeywell-demo-project-fixture.ts");
  });

  it("states the workbook is generated on disk and the export is approved to ready", () => {
    expect(docTextLower).toContain("generated on disk");
    expect(docTextLower).toContain("approves the export package");
    expect(docTextLower).toContain("customer-deliverable ready");
  });

  it("states payload-only artifact values never leak into the UI", () => {
    expect(docTextLower).toContain("payload-only");
    expect(docTextLower).toContain("never leak");
  });
});

describe("honeywell quick bom demo runbook - arbitrary flow proof (Prompt 97)", () => {
  it("names the arbitrary-flow e2e and the route/action chain it proves", () => {
    expect(docText).toContain("project-quick-bom-arbitrary-flow-e2e.test.tsx");
    expect(docTextLower).toContain("non-seeded, arbitrary quick_bom project");
    expect(docTextLower).toContain("create project");
    expect(docTextLower).toContain("upload boq");
    expect(docTextLower).toContain("normalize");
    expect(docTextLower).toContain("sku draft/review");
    expect(docTextLower).toContain("configuration draft/review");
    expect(docTextLower).toContain("pricing review");
    expect(docTextLower).toContain("export approval");
    expect(docTextLower).toContain("download");
  });

  it("splits the seeded Honeywell proof from the reduced arbitrary-flow proof", () => {
    expect(docTextLower).toContain("full 60-row honeywell ccw parity demo path");
    expect(docTextLower).toContain("route/action chain proof");
    expect(docTextLower).toContain("reduced catalog-resolvable input");
    expect(docTextLower).toContain("not a full customer boq run");
  });

  it("states SKU and configuration line review still use direct route calls", () => {
    expect(docText).toContain(".../sku-resolution/review");
    expect(docText).toContain(".../configuration-expansion/review");
    expect(docTextLower).toContain("line-review-required notice");
  });

  it("keeps the arbitrary-flow limitations explicit", () => {
    expect(docTextLower).toContain("no production db provisioning/rls/migrations");
    expect(docTextLower).toContain("no manual browser qa");
    expect(docTextLower).toContain("no full uploaded honeywell boq through real sku resolution");
    expect(docTextLower).toContain("full local catalog coverage for honeywell parent skus");
    expect(docTextLower).toContain("no production pricing authority");
    expect(docTextLower).toContain("no broad cisco-general configuration authority");
  });

  it("states line-level review UI now exists per P126-P131 (not missing at P97)", () => {
    expect(docTextLower).toContain("line-level sku/config/pricing review ui screens now exist");
    expect(docTextLower).toContain("p126-p131");
    expect(docText).toContain("tests/ui/project-quick-bom-page.test.tsx");
  });
});

describe("honeywell quick bom demo runbook - Prompt 131 full seven-line app proof", () => {
  it("documents the P131 seven-line Honeywell app proof counts", () => {
    expect(docTextLower).toContain("7 normalized customer rows");
    expect(docTextLower).toContain("7 accepted sku review decisions");
    expect(docTextLower).toContain("60 accepted configuration lines");
    expect(docTextLower).toContain("60 priced lines");
    expect(docTextLower).toContain("60 export rows");
    expect(docTextLower).toContain("no unpriced lines");
  });

  it("documents the P131 seven-line Honeywell app proof totals", () => {
    expect(docText).toContain("`totalPriceSar` 2185708.76");
    expect(docText).toContain("`totalIncVatSar` 2513565.07");
  });

  it("states the proof runs under the test harness/in-memory store", () => {
    expect(docTextLower).toContain("test harness/in-memory store");
    expect(docTextLower).toContain("not live/provisioned db");
  });
});

describe("honeywell quick bom demo runbook - Prompt 135 real-DB proof", () => {
  it("names the prove-project-real-db script and the run command", () => {
    expect(docText).toContain("scripts/prove-project-real-db.ts");
    expect(docTextLower).toContain("npx.cmd tsx scripts/prove-project-real-db.ts");
  });

  it("documents the proof facts: tables, stage count, wrong-tenant, approval, staleness, cleanup", () => {
    expect(docTextLower).toContain("result pass");
    expect(docTextLower).toContain("tenants, projects, project_stages, project_artifacts, project_approvals");
    expect(docTextLower).toContain("stage count 5");
    expect(docTextLower).toContain("wrong-tenant read null");
    expect(docTextLower).toContain("approval count 1");
    expect(docTextLower).toContain("cleanup ok");
  });

  it("documents downstream staleness in the proof results", () => {
    expect(docTextLower).toContain("sku_resolution");
    expect(docTextLower).toContain("configuration_expansion");
    expect(docTextLower).toContain("priced_boq");
    expect(docTextLower).toContain("export_package");
    expect(docTextLower).toContain("stale");
  });

  it("states this closes the Project-store local real-DB provisioning gap", () => {
    expect(docTextLower).toContain("closes the project-store local real-db provisioning gap");
  });

  it("states browser-driven UI against a live/provisioned database is separately proven by Prompt 140, with manual browser QA still open", () => {
    expect(docTextLower).toContain("manual browser qa");
    expect(docTextLower).toContain(
      "browser-driven ui against a live/provisioned database is now separately proven by the prompt 140"
    );
    expect(docTextLower).toContain("remain open");
  });

  it("states full uploaded Honeywell BoQ through real SKU resolution remains open", () => {
    expect(docTextLower).toContain("full uploaded honeywell boq through real sku resolution");
  });

  it("states production pricing authority remains future", () => {
    expect(docTextLower).toContain("production pricing authority");
  });

  it("does not claim production deployment readiness", () => {
    expect(docTextLower.includes("production deployment readiness is complete")).toBe(false);
    expect(docTextLower.includes("production db is complete")).toBe(false);
  });
});

describe("honeywell quick bom demo runbook - Prompt 137 live-DB Quick BoM API route proof", () => {
  it("names the prove-project-quick-bom-route-real-db script and the run command", () => {
    expect(docText).toContain("scripts/prove-project-quick-bom-route-real-db.ts");
    expect(docTextLower).toContain("npx.cmd tsx scripts/prove-project-quick-bom-route-real-db.ts");
  });

  it("documents the P137 proof facts: tables, normalized lines, SKU count, config/priced/export rows, totals, XLSX bytes, cleanup", () => {
    expect(docTextLower).toContain("result: pass");
    expect(docTextLower).toContain(
      "tenants, projects, project_files, project_stages, project_artifacts, project_approvals"
    );
    expect(docTextLower).toContain("normalized line count: 7");
    expect(docTextLower).toContain("default_quick_bom_approved_catalog");
    expect(docTextLower).toContain("sku accepted count: 7");
    expect(docTextLower).toContain("config accepted lines: 60");
    expect(docTextLower).toContain("priced line count: 60");
    expect(docTextLower).toContain("totalpricesar: 2185708.76");
    expect(docTextLower).toContain("totalincvatsar: 2513565.07");
    expect(docTextLower).toContain("export row count: 60");
    expect(docTextLower).toContain("downloaded xlsx bytes: 14315");
    expect(docTextLower).toContain("cleanup result: ok");
  });

  it("states P137 closes the live-DB Quick BoM API route/action-chain proof gap", () => {
    expect(docTextLower).toContain("closes the live-db quick bom api route/action-chain proof gap");
  });

  it("states automated browser-driven UI/live DB proof exists, while manual browser QA, production deployment, full real-catalog Honeywell SKU resolution, and production pricing authority remain open", () => {
    expect(docTextLower).toContain("manual browser qa");
    expect(docTextLower).toContain("browser-driven ui");
    expect(docTextLower).toContain("production deployment");
    expect(docTextLower).toContain("full real-catalog honeywell sku resolution");
    expect(docTextLower).toContain("production cisco pricing authority");
  });

  it("states the default Quick BoM catalog path covers Honeywell SKU metadata (not full production catalog)", () => {
    expect(docTextLower).toContain("default quick bom catalog path");
    expect(docTextLower).toContain("demo fixture authority");
  });

  it("does not claim production deployment readiness or full catalog authority is complete", () => {
    expect(docTextLower.includes("production deployment readiness is complete")).toBe(false);
    expect(docTextLower.includes("production db is complete")).toBe(false);
  });
});

describe("honeywell quick bom demo runbook - app-level status is accurate", () => {
  it("says the automated app-level demo path is proven for the seeded fixture", () => {
    expect(docTextLower).toContain("proven for the seeded honeywell demo project");
  });

  it("says manual browser QA and production provisioning remain follow-up", () => {
    expect(docTextLower).toContain("manual browser qa");
    expect(docTextLower).toContain("follow-up work");
    expect(docTextLower).toContain("provisioned database");
  });

  it("says line-level review UI now exists (P126-P131)", () => {
    expect(docTextLower).toContain("line-level sku/config/pricing review ui now exists");
  });

  it("no longer says app-level testing is 'not ready yet' or 'comes later'", () => {
    expect(docTextLower.includes("not ready yet")).toBe(false);
    expect(docTextLower.includes("comes later")).toBe(false);
    expect(docTextLower.includes("app-level manual testing is ready")).toBe(false);
    expect(docTextLower.includes("arbitrary project creation, a general boq upload endpoint")).toBe(false);
  });

  it("keeps the boundary that app wiring must not shortcut through legacy E2", () => {
    expect(docTextLower).toContain("must not shortcut through the legacy");
  });
});

describe("honeywell quick bom demo runbook - stale live-DB wording removed (Prompt 138/141)", () => {
  const STALE_PHRASES = [
    // Prompt 142: dangerous overclaim phrases that must never appear.
    "production readiness is complete",
    "hosted deployment readiness is complete",
    "ci readiness is complete",
    "manual qa completion is complete",
    "production cisco pricing authority is now established",
    "full real-catalog honeywell sku coverage is complete",
    "full app route/action chain against a live/provisioned database remains unproven",
    "full Next.js API/UI/browser route chain against a live/provisioned database",
    "full Next.js API/UI/browser route chain against live DB remains unproven",
    "full Next.js API/UI/browser route chain against a live DB",
    "full Next.js route chain against a live DB remains open",
    // Prompt 141: stale browser-driven UI/live DB wording retired (automated headless
    // browser workflow proof now exists, P140).
    "browser-driven UI/live DB and production deployment remain open",
    "browser-driven UI against live DB remains open",
    "browser-driven UI against a live/provisioned DB remains open",
    "browser-driven UI against a live/provisioned database remains open",
    "full Next.js API/UI/browser route chain against live DB remains unproven",
  ];

  for (const phrase of STALE_PHRASES) {
    it(`no longer contains: ${phrase}`, () => {
      expect(doc.includes(phrase)).toBe(false);
    });
  }

  it("says Quick BoM API route/action-chain proof exists (P137)", () => {
    expect(docTextLower).toContain("live-db quick bom api route/action-chain proof gap");
    expect(docTextLower).toContain("prompt 137");
  });

  it("says an automated browser-driven UI/live DB proof now exists via Prompt 140", () => {
    expect(docTextLower).toContain("browser-driven ui against a live/provisioned database");
    expect(docTextLower).toContain("automated browser-driven ui/live db proof now exists");
    expect(docTextLower).toContain("automated headless browser evidence, not human/manual qa");
  });

  it("says manual browser QA remains open", () => {
    expect(docTextLower).toContain("manual browser qa");
  });

  it("says production deployment remains open", () => {
    expect(docTextLower).toContain("production deployment");
  });

  it("says full real-catalog Honeywell SKU resolution remains open", () => {
    expect(docTextLower).toContain("full real-catalog honeywell sku resolution");
  });
});

describe("honeywell quick bom demo runbook - Prompt 139 seeded browser render smoke proof (Section 11)", () => {
  it("names the prove-project-quick-bom-browser-real-db script", () => {
    expect(docText).toContain("scripts/prove-project-quick-bom-browser-real-db.ts");
  });

  it("describes the seeded headless browser render smoke scope", () => {
    expect(docTextLower).toContain("automated headless browser seeded-render smoke proof");
    expect(docTextLower).toContain("seeds the existing honeywell demo project fixture");
    expect(docTextLower).toContain("confirms the workspace renders");
  });

  it("states it is not manual browser QA and not the full workflow proof", () => {
    expect(docTextLower).toContain("not manual browser qa and not the full workflow proof");
  });

  it("keeps the Prompt 139 open gaps explicit", () => {
    expect(docTextLower).toContain("manual browser qa (remains not run/open)");
    expect(docTextLower).toContain("production deployment/provisioning verification (remains open)");
    expect(docTextLower).toContain("broad/general cisco intelligence (out of scope)");
  });
});

describe("honeywell quick bom demo runbook - Prompt 140 automated browser-driven UI/live DB workflow proof (Section 12)", () => {
  it("names the prove-project-quick-bom-browser-workflow-real-db script and its test", () => {
    expect(docText).toContain("scripts/prove-project-quick-bom-browser-workflow-real-db.ts");
    expect(docText).toContain(
      "tests/scripts/prove-project-quick-bom-browser-workflow-real-db.test.ts"
    );
  });

  it("documents the Prompt 140 evidence counts and totals", () => {
    expect(docTextLower).toContain("7 normalized lines");
    expect(docTextLower).toContain("7 accepted sku decisions");
    expect(docTextLower).toContain("60 configuration/priced/export rows");
    expect(docText).toContain("totalPriceSar 2185708.76");
    expect(docText).toContain("VAT 327856.31");
    expect(docText).toContain("totalIncVatSar 2513565.07");
    expect(docTextLower).toContain("approved export download link visible");
  });

  it("records the UUID dev-session fix surfaced by the browser workflow proof", () => {
    expect(docTextLower).toContain("default dev session user id to be uuid-shaped");
    expect(docText).toContain("project_approvals.decided_by");
  });

  it("states an automated browser-driven UI/live DB proof now exists, as automated headless browser evidence", () => {
    expect(docTextLower).toContain("automated browser-driven ui/live db proof now exists");
    expect(docTextLower).toContain("automated headless browser evidence, not human/manual qa");
  });

  it("keeps manual browser QA and production deployment open after Prompt 140", () => {
    expect(docTextLower).toContain("manual browser qa (remains not run/open)");
    expect(docTextLower).toContain("production deployment/provisioning verification (remains open)");
  });
});

describe("honeywell quick bom demo runbook - Prompt 142 local production build proof (Section 13)", () => {
  it("names npm.cmd run build as the build command and states it is a local proof only", () => {
    expect(docTextLower).toContain("npm.cmd run build");
    expect(docTextLower).toContain("local `npm.cmd run build` proof only");
  });

  it("records next.js production compilation success and Quick BoM routes present", () => {
    expect(docTextLower).toContain("next.js production compilation succeeded");
    expect(docTextLower).toContain("quick bom api/ui routes were present");
  });

  it("documents redis/ioredis econnrefused :6379 as a known non-failing build/test noise", () => {
    expect(docTextLower).toContain("econnrefused :6379");
    expect(docTextLower).toContain("known non-failing build/test noise");
    expect(docTextLower).toContain("reliability follow-up");
  });

  it("does not claim production readiness, hosted deployment readiness, CI readiness, or manual QA completion", () => {
    expect(docTextLower).toContain("not a hosted deployment proof");
    expect(docTextLower).toContain("not a ci/cd pipeline verification");
    expect(docTextLower).toContain("not a production readiness claim");
  });

  it("keeps manual browser QA, production deployment, production Cisco pricing authority, and full real-catalog Honeywell SKU coverage open after P142", () => {
    expect(docTextLower).toContain("manual browser qa (remains not run/open)");
    expect(docTextLower).toContain("production deployment/provisioning verification (remains open)");
    expect(docTextLower).toContain("production cisco pricing authority (remains open)");
    expect(docTextLower).toContain("full real-catalog honeywell sku coverage beyond the demo supplement/local mock");
  });
});

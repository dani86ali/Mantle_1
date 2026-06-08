import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Doc regression test for the Honeywell Quick BoM demo operator runbook
 * (docs/quick-bom/HONEYWELL_QUICK_BOM_DEMO_RUNBOOK.md), refreshed by Prompt 136.
 *
 * It asserts the runbook: records the Prompt 136 refresh (prior: Prompt 132); documents
 * the Prompt 135 local Docker Postgres Project-state real-DB proof (script name, run
 * command, proof facts, B10 closure, open follow-ups); still defines the generated
 * Honeywell Mantle workbook correctly (what it is, and the historical/CCW/customer-input
 * files it is NOT); keeps the Prompt 73 local operator command and its manual workbook
 * checklist with the key counts/totals; preserves the Batch 4 / optics / replacement /
 * pricing / runtime-AI boundaries; documents the Prompt 81 app-level E2E proof (the real
 * GET route, POST route/service, UI page, seeded fixture, on-disk workbook, export
 * approval to customer-deliverable ready, and no payload leak); documents the Prompt 97
 * arbitrary-flow proof and its limitations (line-level review UI now exists per P126-P131,
 * DB/browser QA still open); documents the Prompt 131 full seven-line Honeywell app
 * proof counts/totals; and no longer says app-level testing is "not ready yet" or
 * "comes later" as a blanket statement. The doc is read from disk only; no runtime
 * module is imported (a pure documentation regression test).
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

  it("records the Prompt 136 refresh and keeps the prior Prompt 132 record", () => {
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

  it("states that manual browser QA and full Next.js route chain against live/provisioned database remain open", () => {
    expect(docTextLower).toContain("manual browser qa");
    expect(docTextLower).toContain("full next.js api/ui/browser route chain against a live/provisioned database");
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

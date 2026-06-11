import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Honeywell Rule Approval Batch Strategy doc test (Prompt 53).
 *
 * Verifies the planning/review sequencing document
 * docs/config-expansion/HONEYWELL_RULE_APPROVAL_BATCH_STRATEGY.md. The document is
 * sequencing only: it is not runtime authority, it is not an approved rule pack,
 * and it approves nothing. This test pins the batch structure (Batch 1 MVP
 * deterministic model safety through Batch 4 broader Cisco generalization), the
 * Batch 1 include/exclude scope, the Batch 2 term-option contract, the Batch 3
 * non-silent-replacement rule, and the next-prompt sequence that moves the runtime
 * evaluator work to Prompt 55 (Prompt 54 was spent on the Honeywell v2 CAB
 * validator cleanup). The doc is read from disk (not imported) so the
 * test also proves it exists and is ASCII-only. No source/runtime/data-pack file
 * is touched.
 */

const DOC_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_RULE_APPROVAL_BATCH_STRATEGY.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-rule-approval-batch-strategy.test.ts"
);

const BATCH_1_HEADER = "### Batch 1 - MVP deterministic model safety";
const BATCH_2_HEADER = "### Batch 2 - term-coupled support/licensing";
const BATCH_3_HEADER = "### Batch 3 - replacement candidates";
const BATCH_4_HEADER = "### Batch 4 - broader Cisco generalization";
const NEXT_SEQUENCE_HEADER = "## 7. Next Prompt Sequence";

const md = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

/** Substring of `text` from `start` (inclusive) to `end` (exclusive, or EOF). */
function between(text: string, start: string, end?: string): string {
  const from = text.indexOf(start);
  expect(from, `missing section marker: ${start}`).toBeGreaterThanOrEqual(0);
  const to = end ? text.indexOf(end, from + start.length) : text.length;
  expect(to, `missing end marker: ${end ?? "<eof>"}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe("Honeywell rule approval batch strategy - document", () => {
  it("exists on disk and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(md.length).toBeGreaterThan(0);
  });

  it("is ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(md)).toBe(false);
  });

  it("carries the exact title", () => {
    expect(md).toContain("# Honeywell Rule Approval Batch Strategy");
  });

  it("states it is not runtime authority and not an approved rule pack", () => {
    expect(md).toContain("not runtime authority");
    expect(md).toContain("not an approved rule pack");
  });

  it("names Batch 1 through Batch 4", () => {
    for (const name of ["Batch 1", "Batch 2", "Batch 3", "Batch 4"]) {
      expect(md, name).toContain(name);
    }
  });
});

describe("Honeywell rule approval batch strategy - Batch 1 scope", () => {
  it("includes only the MVP deterministic model-safety primitives", () => {
    const batch1 = between(md, BATCH_1_HEADER, BATCH_2_HEADER);
    const includes = between(batch1, "Includes:", "Excludes:");
    for (const token of [
      "same_as_related_sku_total",
      "LIC-CW-A",
      "LIC-SPACES-ADV",
      "CW9178I-CFG",
      "selected_option_count",
      "CAB-C15-CBN",
      "project_sku",
      "existing_satisfies_required",
    ]) {
      expect(includes, token).toContain(token);
    }
  });

  it("excludes terms, replacements, pricing, and approved-pack creation", () => {
    const batch1 = between(md, BATCH_1_HEADER, BATCH_2_HEADER);
    const excludes = between(batch1, "Excludes:");
    for (const token of [
      "5Y/7Y SKU alternatives",
      "replacement candidates",
      "pricing changes",
      "approved runtime pack creation",
    ]) {
      expect(excludes, token).toContain(token);
    }
  });
});

describe("Honeywell rule approval batch strategy - later batches", () => {
  it("Batch 2 defines the term-option contract", () => {
    const batch2 = between(md, BATCH_2_HEADER, BATCH_3_HEADER);
    expect(batch2).toContain("termOptionGroups");
    expect(batch2).toContain("defaultTermMonths 36");
    expect(batch2).toContain("allowedTermMonths 36/60/84");
  });

  it("Batch 3 forbids silent runtime SKU substitutions", () => {
    const batch3 = between(md, BATCH_3_HEADER, BATCH_4_HEADER);
    expect(batch3).toContain("must not be silent runtime SKU substitutions");
  });
});

describe("Honeywell rule approval batch strategy - next prompt sequence", () => {
  it("moves Batch 1 runtime evaluator support to Prompt 55", () => {
    const sequence = between(md, NEXT_SEQUENCE_HEADER);
    expect(sequence).toContain(
      "Prompt 55: Batch 1 runtime evaluator support only"
    );
  });

  it("records Prompt 54 as the completed Honeywell v2 CAB validator cleanup", () => {
    const sequence = between(md, NEXT_SEQUENCE_HEADER);
    expect(sequence).toContain(
      "Prompt 54: completed - Honeywell v2 CAB validator cleanup"
    );
    // No stale claim that Prompt 54 is the runtime evaluator prompt.
    expect(sequence).not.toContain(
      "Prompt 54: Batch 1 runtime evaluator support only"
    );
  });

  it("orders the forward queue: 56 approved pack, 57 demo runner", () => {
    const sequence = between(md, NEXT_SEQUENCE_HEADER);
    expect(sequence).toContain(
      "Prompt 56: Batch 1 approved Honeywell runtime pack"
    );
    expect(sequence).toContain(
      "Prompt 57: demo orchestration / fixture runner"
    );
  });
});

describe("Honeywell rule approval batch strategy - source hygiene", () => {
  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

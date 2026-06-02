import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Candidate config-expansion rule-pack asset test (Prompt 33).
 *
 * Verifies the committed Honeywell-scope candidate rule pack at
 * data/config-expansion/honeywell-candidate-rules.json. This is a STATIC data
 * artifact only - no runtime expansion code exists yet. The pack is authored
 * from Cisco ordering guides/data sheets/install guides, the current CCW export
 * (Estimate_NB167337237YA.xlsx), and GPL/SAR catalog context, and every rule is
 * candidate-only and awaits human pre-sales approval. The test reads the file
 * from disk (not via import) so it also proves the committed file is valid JSON
 * and ASCII-only.
 */

const JSON_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-candidate-rules.json"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-candidate-rules.test.ts"
);

const CCW_SHEET = "EstimateDetails_NB167337237YA";
const CCW_FILE = "Estimate_NB167337237YA.xlsx";

const REQUIRED_PARENT_SKUS = [
  "CW9178I-CFG",
  "CISCO-NETWORK-SUB",
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "SFP-10G-LR-S=",
  "SFP-10/25G-LR-S=",
  "CP-7841-K9=",
];

const OPTIC_SKUS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

// Representative current-CCW child SKUs spanning every parent group, including
// term services, fixed-quantity licenses, and per-parent-multiplied accessories.
const CRITICAL_CHILD_SKUS = [
  "CON-ROB-CW9178IC",
  "LIC-CW-A",
  "LIC-SPACES-ADV",
  "SVS-L0SPT-CN",
  "CON-L1NCD-C9300XY4",
  "C9300-DNA-A-48-3Y",
  "C9300X-NM-8Y",
  "CAB-C15-CBN",
  "CON-L1NCD-C93024PX",
  "C9300L-DNA-A-24-3Y",
  "FAN-T2",
  "C9300L-STACK-KIT2",
  "CON-L1NBD-P7PK94P1",
];

// Pricing must be absent. These tokens must not appear in ANY object key. The
// category VALUE "included_zero_price" is intentionally allowed - this is a
// key-only check, so a relationshipType value never trips it.
const FORBIDDEN_KEY_TOKENS = [
  "price",
  "cost",
  "discount",
  "margin",
  "markup",
  "vat",
  "currency",
  "msrp",
  "sell",
  "amount",
];

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Depth-first collect of every plain object in the parsed tree. */
function collectObjects(node: unknown, acc: Obj[]): Obj[] {
  if (Array.isArray(node)) {
    for (const v of node) collectObjects(v, acc);
  } else if (isObj(node)) {
    acc.push(node);
    for (const v of Object.values(node)) collectObjects(v, acc);
  }
  return acc;
}

const raw = readFileSync(JSON_PATH, "utf8");
const pack = JSON.parse(raw) as Obj;

const parents = asArr(pack.parentRules).filter(isObj);
const parentSkus = parents.map((p) => str(p.parentSku));
const children: Obj[] = [];
for (const p of parents) {
  for (const c of asArr(p.childLines).filter(isObj)) children.push(c);
}
const childSkus = children.map((c) => str(c.sku));
const replacements = asArr(pack.candidateReplacements).filter(isObj);
const allObjects = collectObjects(pack, []);

// Citations are the entries of every `evidence` array anywhere in the tree
// (parents, child lines, and replacements). The top-level createdFromEvidence
// source manifest is deliberately NOT a citation array, so it is excluded.
const allCitations: Obj[] = [];
for (const o of allObjects) {
  for (const e of asArr(o.evidence)) {
    if (isObj(e)) allCitations.push(e);
  }
}
const ccwCitations = allCitations.filter((c) => c.sourceType === "ccw_export");

const ALLOWED_SOURCE_TYPES = new Set([
  "ccw_export",
  "ordering_guide",
  "datasheet",
  "install_guide",
  "subscription_datasheet",
  "gpl",
]);

describe("Honeywell candidate rule pack - metadata", () => {
  it("parses as JSON with the expected pack id", () => {
    const reparsed = JSON.parse(raw) as Obj;
    expect(reparsed.rulePackId).toBe("honeywell-candidate-rules");
  });

  it("is candidate-only and requires approval", () => {
    expect(pack.status).toBe("candidate");
    expect(pack.approvalRequired).toBe(true);
    expect(pack.sourceScope).toBe("honeywell_current_ccw_2026_06_02");
  });

  it("states in its notes that prices are not rule authority", () => {
    const notes = str(pack.notes).toLowerCase();
    expect(notes).toContain("not rule authority");
    expect(notes).toContain("price");
  });

  it("lists the evidence sources it was created from", () => {
    const evidence = asArr(pack.createdFromEvidence).filter(isObj);
    expect(evidence.length).toBeGreaterThan(0);
    const types = new Set(evidence.map((e) => str(e.sourceType)));
    expect(types.has("ccw_export")).toBe(true);
  });
});

describe("Honeywell candidate rule pack - approval state", () => {
  it("marks no rule, child line, or replacement as approved", () => {
    for (const o of allObjects) {
      if ("approved" in o) {
        expect(o.approved, JSON.stringify(o).slice(0, 90)).toBe(false);
      }
    }
  });

  it("sets approvalRequired true on every parent rule and child line", () => {
    for (const p of parents) {
      expect(p.approvalRequired, str(p.parentSku)).toBe(true);
    }
    for (const c of children) {
      expect(c.approvalRequired, str(c.sku)).toBe(true);
    }
  });
});

describe("Honeywell candidate rule pack - parents and children", () => {
  it("includes every required parent SKU", () => {
    for (const sku of REQUIRED_PARENT_SKUS) {
      expect(parentSkus).toContain(sku);
    }
  });

  it("includes the critical current-CCW child SKUs", () => {
    for (const sku of CRITICAL_CHILD_SKUS) {
      expect(childSkus).toContain(sku);
    }
  });

  it("treats the optics as standalone parents with no children", () => {
    for (const optic of OPTIC_SKUS) {
      const rule = parents.find((p) => str(p.parentSku) === optic);
      expect(rule, optic).toBeDefined();
      expect(str(rule!.relationshipType), optic).toBe("standalone");
      expect(asArr(rule!.childLines).length, optic).toBe(0);
      // Structural backstop: a standalone optic is nobody's child line.
      expect(childSkus, optic).not.toContain(optic);
    }
  });

  it("links every child line back to its parent rule via sourceRuleId", () => {
    for (const p of parents) {
      const ruleId = str(p.ruleId);
      expect(ruleId.length, str(p.parentSku)).toBeGreaterThan(0);
      for (const c of asArr(p.childLines).filter(isObj)) {
        expect(str(c.sourceRuleId), str(c.sku)).toBe(ruleId);
      }
    }
  });
});

describe("Honeywell candidate rule pack - evidence and citations", () => {
  it("gives every parent rule at least one evidence citation", () => {
    expect(parents.length).toBeGreaterThan(0);
    for (const p of parents) {
      expect(asArr(p.evidence).length, str(p.parentSku)).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every child line at least one evidence citation", () => {
    expect(children.length).toBeGreaterThan(0);
    for (const c of children) {
      expect(asArr(c.evidence).length, str(c.sku)).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every citation a known source type and a source path", () => {
    expect(allCitations.length).toBeGreaterThan(0);
    for (const cite of allCitations) {
      const type = str(cite.sourceType);
      expect(ALLOWED_SOURCE_TYPES.has(type), type).toBe(true);
      expect(str(cite.sourcePath).length, type).toBeGreaterThan(0);
    }
  });

  it("backs every CCW citation with sourcePath, sheetName, and lineNumber", () => {
    expect(ccwCitations.length).toBeGreaterThan(0);
    for (const cite of ccwCitations) {
      const note = str(cite.evidenceNote);
      expect(str(cite.sourcePath), note).toContain(CCW_FILE);
      expect(cite.sheetName, note).toBe(CCW_SHEET);
      expect(Number.isInteger(cite.lineNumber), note).toBe(true);
      expect(cite.lineNumber as number, note).toBeGreaterThan(0);
    }
  });
});

describe("Honeywell candidate rule pack - candidate replacements", () => {
  it("encodes the observed historical-to-current differences", () => {
    expect(replacements.length).toBe(11);
  });

  it("marks every replacement approvalRequired true and not approved", () => {
    for (const r of replacements) {
      const hist = str(r.historicalSku);
      expect(hist.length).toBeGreaterThan(0);
      expect(r.approvalRequired, hist).toBe(true);
      expect(r.approved, hist).toBe(false);
      expect(asArr(r.currentSkus).length, hist).toBeGreaterThanOrEqual(1);
      expect(asArr(r.evidence).length, hist).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not silently map historical SKUs into the active config rules", () => {
    const configSkus = new Set([...parentSkus, ...childSkus]);
    for (const r of replacements) {
      const hist = str(r.historicalSku);
      expect(configSkus.has(hist), hist).toBe(false);
    }
  });
});

describe("Honeywell candidate rule pack - pricing absence", () => {
  it("carries no pricing fields on any object", () => {
    for (const o of allObjects) {
      for (const key of Object.keys(o)) {
        const lower = key.toLowerCase();
        for (const token of FORBIDDEN_KEY_TOKENS) {
          expect(
            lower.includes(token),
            `key "${key}" contains pricing token "${token}"`
          ).toBe(false);
        }
      }
    }
  });
});

describe("Honeywell candidate rule pack - source hygiene", () => {
  it("keeps the rule pack JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(raw)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});

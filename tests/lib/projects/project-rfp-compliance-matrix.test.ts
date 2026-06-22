import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
  RFP_COMPLIANCE_STATUSES,
  RFP_COMPLIANCE_REVIEW_LANES,
  RFP_COMPLIANCE_IMPACT_LEVELS,
  RFP_COMPLIANCE_ROW_REVIEW_STATUSES,
  RFP_COMPLIANCE_REVIEW_ACTIONS,
  buildRfpComplianceMatrixPayloadSummary,
  copyRfpComplianceMatrixPayload,
  type RfpComplianceMatrixPayload,
  type RfpComplianceMatrixRow,
  type RfpComplianceMatrixEvidenceReference,
  type RfpComplianceMatrixConfigurationReference,
  type RfpComplianceReviewAction,
  type RfpComplianceMatrixReviewEvent,
} from "@/lib/projects/project-rfp-compliance-matrix";

// The two evidence-reference kinds, declared locally exactly like the contract
// declares them - the requirements-baseline value module must stay unimported.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const BASELINE_ARTIFACT = "art-requirements-baseline-1";
const EVIDENCE_PACKAGE_ARTIFACT = "art-evidence-package-1";
const CONFIG_EXPANSION_ARTIFACT = "art-config-expansion-1";
const INPUT_PACKAGE_ARTIFACT = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const CREATED_BY = "engineer@stc.example";
const CREATED_AT = "2026-06-10T09:30:00.000Z";
const ROW_ID = /^RFP-COMP-\d{3}$/;

function textRef(
  evidenceId = "evidence-text-1",
  chunkIndex = 1
): RfpComplianceMatrixEvidenceReference {
  return {
    evidenceId,
    sourceFileId: FILE_RFP,
    evidenceKind: TEXT_KIND,
    inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT,
    chunkIndex,
    chunkCount: 3,
    charCount: 88,
  };
}

function tableRef(): RfpComplianceMatrixEvidenceReference {
  return {
    evidenceId: "evidence-table-1",
    sourceFileId: FILE_BOQ,
    evidenceKind: TABLE_KIND,
    inputPackageArtifactId: INPUT_PACKAGE_ARTIFACT,
    tableId: `${FILE_BOQ}:table:1`,
    pageNumber: 4,
    sheetName: "BoQ Sheet",
    rowCount: 12,
    columnCount: 5,
  };
}

function configRef(): RfpComplianceMatrixConfigurationReference {
  return {
    configurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT,
    lineId: "cfg-line-1",
    origin: "expansion",
    sku: "C9300-NM-8X",
    description: "8x10G network module",
    parentLineId: "cfg-line-0",
    parentLineNumber: "10",
    sourceFileId: FILE_BOQ,
    sourceRowNumber: 11,
    originalLineNumber: "10",
  };
}

/** Three rows spanning distinct statuses, with/without optionals and references. */
function makeRows(): RfpComplianceMatrixRow[] {
  return [
    {
      id: "RFP-COMP-001",
      requirementId: "RFP-REQ-001",
      requirementText: "Provide 48-port PoE access switches for all IDFs.",
      category: "technical",
      priority: "mandatory",
      complianceStatus: "compliant",
      response: "Offered switch meets the stated port and PoE requirement.",
      rationale: "Datasheet confirms 48 PoE ports.",
      notes: "Reviewed by the solution engineer.",
      evidenceReferences: [textRef(), tableRef()],
      configurationReferences: [configRef()],
    },
    {
      id: "RFP-COMP-002",
      requirementId: "RFP-REQ-002",
      requirementText: "Submit a bid bond with the commercial offer.",
      category: "commercial",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: "Bid bond handling is under review with finance.",
      evidenceReferences: [textRef("evidence-text-2", 2)],
    },
    {
      id: "RFP-COMP-003",
      requirementId: "RFP-REQ-003",
      requirementText: "Optional managed services add-on.",
      category: "support",
      priority: "optional",
      complianceStatus: "not_applicable",
      response: "Not part of this bid scope.",
      evidenceReferences: [],
    },
  ];
}

const SECTION_REF = "RFP-SECTION-3.2.1";
const NA_REASON = "Out-of-scope per clause 4; excluded by the engineer.";
const REMOVED_REASON = "Duplicate of RFP-COMP-001; removed by the engineer.";
const REVIEWER = "lead-engineer@stc.example";
const REVIEW_AT_1 = "2026-06-11T08:00:00.000Z";
const REVIEW_AT_2 = "2026-06-12T10:15:00.000Z";
const REVIEW_NOTE = "Tightened the response wording.";

/** Every Stage 5 metadata key - used to assert presence, omission, and lean summaries. */
const METADATA_KEYS = [
  "sectionReference",
  "responseLane",
  "ownerLane",
  "hldImpact",
  "tpImpact",
  "boqConfigImpact",
  "requiresOwnerReview",
  "rowReviewStatus",
  "notApplicableReason",
  "removedReason",
  "reviewHistory",
] as const;

function reviewEvent(
  action: RfpComplianceReviewAction,
  at: string,
  note?: string
): RfpComplianceMatrixReviewEvent {
  const event: RfpComplianceMatrixReviewEvent = { action, at, by: REVIEWER };
  if (note !== undefined) event.note = note;
  return event;
}

/** A row carrying every Stage 5 engineer-owned metadata field. */
function fullMetadataRow(): RfpComplianceMatrixRow {
  return {
    id: "RFP-COMP-010",
    requirementId: "RFP-REQ-010",
    requirementText: "Provide redundant core switching with sub-second failover.",
    category: "technical",
    priority: "mandatory",
    complianceStatus: "partially_compliant",
    response: "Redundant cores offered; failover target under validation.",
    rationale: "HA pair configured; convergence test pending.",
    notes: "Owner sign-off requested from the network lead.",
    evidenceReferences: [textRef("evidence-text-10", 1), tableRef()],
    configurationReferences: [configRef()],
    sectionReference: SECTION_REF,
    responseLane: "technical",
    ownerLane: "security",
    hldImpact: "required",
    tpImpact: "potential",
    boqConfigImpact: "owner_review_required",
    requiresOwnerReview: true,
    rowReviewStatus: "reviewed",
    notApplicableReason: NA_REASON,
    removedReason: REMOVED_REASON,
    reviewHistory: [
      reviewEvent("edited", REVIEW_AT_1, REVIEW_NOTE),
      reviewEvent("owner_review_requested", REVIEW_AT_2),
    ],
  };
}

function makePayload(
  overrides: Partial<RfpComplianceMatrixPayload> = {}
): RfpComplianceMatrixPayload {
  return {
    payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
    sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT,
    sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_ARTIFACT,
    sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT,
    createdBy: CREATED_BY,
    createdAt: CREATED_AT,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [
      BASELINE_ARTIFACT,
      EVIDENCE_PACKAGE_ARTIFACT,
      CONFIG_EXPANSION_ARTIFACT,
    ],
    rows: makeRows(),
    ...overrides,
  };
}

describe("payload kind and row/status constants", () => {
  it("pins the payload discriminator literal", () => {
    expect(RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND).toBe("rfp_compliance_matrix");
  });

  it("exposes the five reviewable compliance statuses in order", () => {
    expect(RFP_COMPLIANCE_STATUSES).toEqual([
      "compliant",
      "partially_compliant",
      "non_compliant",
      "not_applicable",
      "needs_review",
    ]);
  });

  it("uses the deterministic RFP-COMP-001 row-id convention", () => {
    for (const row of makeRows()) expect(row.id).toMatch(ROW_ID);
  });

  it("exposes the Stage 5 review lanes in order", () => {
    expect(RFP_COMPLIANCE_REVIEW_LANES).toEqual([
      "technical",
      "commercial",
      "legal",
      "project_delivery",
      "security",
      "safety",
      "vendor",
      "customer",
      "other",
    ]);
  });

  it("exposes the Stage 5 impact levels in order", () => {
    expect(RFP_COMPLIANCE_IMPACT_LEVELS).toEqual([
      "none",
      "potential",
      "required",
      "owner_review_required",
    ]);
  });

  it("exposes the per-row review statuses in order", () => {
    expect(RFP_COMPLIANCE_ROW_REVIEW_STATUSES).toEqual([
      "pending",
      "reviewed",
      "removed",
    ]);
  });

  it("exposes the engineer review actions in order", () => {
    expect(RFP_COMPLIANCE_REVIEW_ACTIONS).toEqual([
      "edited",
      "status_changed",
      "marked_not_applicable",
      "removed",
      "restored",
      "owner_review_requested",
    ]);
  });
});

describe("buildRfpComplianceMatrixPayloadSummary", () => {
  it("counts row ids, requirement ids, source ids, statuses, and config source id", () => {
    const summary = buildRfpComplianceMatrixPayloadSummary(makePayload());

    expect(summary).toEqual({
      payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE_ARTIFACT,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION_ARTIFACT,
      createdBy: CREATED_BY,
      createdAt: CREATED_AT,
      rowCount: 3,
      rowIds: ["RFP-COMP-001", "RFP-COMP-002", "RFP-COMP-003"],
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002", "RFP-REQ-003"],
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [
        BASELINE_ARTIFACT,
        EVIDENCE_PACKAGE_ARTIFACT,
        CONFIG_EXPANSION_ARTIFACT,
      ],
      statusCounts: {
        compliant: 1,
        partially_compliant: 0,
        non_compliant: 0,
        not_applicable: 1,
        needs_review: 1,
      },
    });
  });

  it("keeps every status key present even for an empty matrix", () => {
    const summary = buildRfpComplianceMatrixPayloadSummary(
      makePayload({ rows: [] })
    );

    expect(summary.rowCount).toBe(0);
    expect(summary.rowIds).toEqual([]);
    expect(summary.requirementIds).toEqual([]);
    expect(Object.keys(summary.statusCounts).sort()).toEqual(
      Array.from(RFP_COMPLIANCE_STATUSES).sort()
    );
    expect(
      Object.values(summary.statusCounts).every((count) => count === 0)
    ).toBe(true);
  });

  it("omits the optional config source id when the payload has none", () => {
    const { sourceConfigurationExpansionArtifactId, ...withoutConfig } =
      makePayload();
    expect(sourceConfigurationExpansionArtifactId).toBe(CONFIG_EXPANSION_ARTIFACT);

    const summary = buildRfpComplianceMatrixPayloadSummary(withoutConfig);

    expect(summary).not.toHaveProperty("sourceConfigurationExpansionArtifactId");
  });

  it("returns a JSON-serializable summary", () => {
    const summary = buildRfpComplianceMatrixPayloadSummary(makePayload());
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});

describe("copyRfpComplianceMatrixPayload", () => {
  it("returns a structurally equal, JSON-serializable deep copy", () => {
    const payload = makePayload();
    const copy = copyRfpComplianceMatrixPayload(payload);

    expect(copy).toEqual(payload);
    expect(JSON.parse(JSON.stringify(copy))).toEqual(copy);
  });

  it("aliases no array or nested reference of the input", () => {
    const payload = makePayload();
    const copy = copyRfpComplianceMatrixPayload(payload);

    expect(copy).not.toBe(payload);
    expect(copy.rows).not.toBe(payload.rows);
    expect(copy.sourceFileIds).not.toBe(payload.sourceFileIds);
    expect(copy.sourceArtifactIds).not.toBe(payload.sourceArtifactIds);
    expect(copy.rows[0]).not.toBe(payload.rows[0]);
    expect(copy.rows[0].evidenceReferences).not.toBe(
      payload.rows[0].evidenceReferences
    );
    expect(copy.rows[0].evidenceReferences[0]).not.toBe(
      payload.rows[0].evidenceReferences[0]
    );
    expect(copy.rows[0].configurationReferences).not.toBe(
      payload.rows[0].configurationReferences
    );
    expect(copy.rows[0].configurationReferences?.[0]).not.toBe(
      payload.rows[0].configurationReferences?.[0]
    );
  });

  it("omits absent optional row fields rather than emitting undefined keys", () => {
    const copy = copyRfpComplianceMatrixPayload(makePayload());

    expect(copy.rows[1]).not.toHaveProperty("rationale");
    expect(copy.rows[1]).not.toHaveProperty("notes");
    expect(copy.rows[1]).not.toHaveProperty("configurationReferences");
    expect(copy.rows[0].rationale).toBe("Datasheet confirms 48 PoE ports.");
  });

  it("omits the optional config source id when the payload has none", () => {
    const { sourceConfigurationExpansionArtifactId, ...withoutConfig } =
      makePayload();
    const copy = copyRfpComplianceMatrixPayload(withoutConfig);

    expect(copy).not.toHaveProperty("sourceConfigurationExpansionArtifactId");
  });
});

describe("deep-copy isolation - results cannot mutate the input", () => {
  it("does not leak copy mutations back into the original payload", () => {
    const payload = makePayload();
    const snapshot = structuredClone(payload);
    const copy = copyRfpComplianceMatrixPayload(payload);

    copy.sourceFileIds.push("hacked-file");
    copy.sourceArtifactIds.push("hacked-artifact");
    copy.rows.push(makeRows()[0]);
    copy.rows[0].id = "RFP-COMP-999";
    copy.rows[0].evidenceReferences.push(tableRef());
    copy.rows[0].evidenceReferences[0].evidenceId = "hacked-evidence";
    const hackedConfig = copy.rows[0].configurationReferences;
    if (hackedConfig !== undefined) {
      hackedConfig[0].sku = "HACKED-SKU";
      hackedConfig.push(configRef());
    }

    expect(payload).toEqual(snapshot);
  });

  it("does not leak summary mutations back into the original payload", () => {
    const payload = makePayload();
    const snapshot = structuredClone(payload);
    const summary = buildRfpComplianceMatrixPayloadSummary(payload);

    summary.rowIds.push("hacked-id");
    summary.requirementIds.push("hacked-req");
    summary.sourceFileIds.push("hacked-file");
    summary.sourceArtifactIds.push("hacked-artifact");
    summary.statusCounts.compliant = 999;

    expect(payload).toEqual(snapshot);
  });
});

describe("locator-only purity - no body, authority, or pricing fields are carried", () => {
  it("copies a faithfully built payload using only whitelisted reference keys", () => {
    const copy = copyRfpComplianceMatrixPayload(makePayload());

    expect(Object.keys(copy.rows[0].evidenceReferences[0]).sort()).toEqual([
      "charCount",
      "chunkCount",
      "chunkIndex",
      "evidenceId",
      "evidenceKind",
      "inputPackageArtifactId",
      "sourceFileId",
    ]);
    expect(Object.keys(copy.rows[0].evidenceReferences[1]).sort()).toEqual([
      "columnCount",
      "evidenceId",
      "evidenceKind",
      "inputPackageArtifactId",
      "pageNumber",
      "rowCount",
      "sheetName",
      "sourceFileId",
      "tableId",
    ]);
    expect(Object.keys(copy.rows[0].configurationReferences![0]).sort()).toEqual(
      [
        "configurationExpansionArtifactId",
        "description",
        "lineId",
        "origin",
        "originalLineNumber",
        "parentLineId",
        "parentLineNumber",
        "sku",
        "sourceFileId",
        "sourceRowNumber",
      ]
    );
  });

  it("strips raw evidence bodies, table rows, and pricing/authority fields jammed onto a reference", () => {
    const dirtyText = {
      ...textRef(),
      text: "RAW-EVIDENCE-TEXT-BODY",
      rows: [["RAW-TABLE-CELL"]],
      storagePath: "/secret/path",
      filePath: "/secret/file",
      tenantId: "tenant-secret",
    } as unknown as RfpComplianceMatrixEvidenceReference;
    const dirtyTable = {
      ...tableRef(),
      rows: [["RAW-TABLE-CELL-A1", "RAW-TABLE-CELL-A2"]],
      text: "RAW-EVIDENCE-TEXT-BODY",
    } as unknown as RfpComplianceMatrixEvidenceReference;
    const dirtyConfig = {
      ...configRef(),
      unitPrice: 1234.5,
      listPrice: 2000,
      margin: 0.3,
      discount: 0.1,
      marginPercent: 30,
      discountPercent: 10,
      currency: "SAR",
      replacementSku: "REPL-9000",
      replacementCandidates: [{ sku: "ALT-1" }],
      catalogLookup: { listPriceUsd: 1 },
      sourceRuleId: "rule-secret",
    } as unknown as RfpComplianceMatrixConfigurationReference;

    const payload = makePayload({
      rows: [
        {
          ...makeRows()[0],
          evidenceReferences: [dirtyText, dirtyTable],
          configurationReferences: [dirtyConfig],
        },
      ],
    });

    const copy = copyRfpComplianceMatrixPayload(payload);
    const summary = buildRfpComplianceMatrixPayloadSummary(payload);
    const serialized = `${JSON.stringify(copy)}${JSON.stringify(summary)}`;
    for (const leak of [
      "RAW-EVIDENCE-TEXT-BODY",
      "RAW-TABLE-CELL",
      "storagePath",
      "filePath",
      "tenantId",
      "unitPrice",
      "listPrice",
      "marginPercent",
      "discountPercent",
      "currency",
      "replacementSku",
      "replacementCandidates",
      "catalogLookup",
      "sourceRuleId",
    ]) {
      expect(serialized).not.toContain(leak);
    }

    const copiedConfig = copy.rows[0].configurationReferences![0];
    for (const forbidden of [
      "unitPrice",
      "listPrice",
      "margin",
      "discount",
      "currency",
      "replacementSku",
      "replacementCandidates",
      "catalogLookup",
      "sourceRuleId",
    ]) {
      expect(copiedConfig).not.toHaveProperty(forbidden);
    }
    for (const ref of copy.rows[0].evidenceReferences) {
      expect(ref).not.toHaveProperty("text");
      expect(ref).not.toHaveProperty("rows");
      expect(ref).not.toHaveProperty("storagePath");
    }
  });
});

describe("Stage 5 engineer-owned row metadata", () => {
  it("omits every absent metadata key on minimal rows", () => {
    const copy = copyRfpComplianceMatrixPayload(makePayload());

    for (const row of copy.rows) {
      for (const key of METADATA_KEYS) expect(row).not.toHaveProperty(key);
    }
  });

  it("round-trips a row populated with every metadata field", () => {
    const payload = makePayload({ rows: [fullMetadataRow()] });
    const copy = copyRfpComplianceMatrixPayload(payload);

    expect(copy.rows[0]).toEqual(fullMetadataRow());
    expect(JSON.parse(JSON.stringify(copy))).toEqual(copy);
    for (const key of METADATA_KEYS) expect(copy.rows[0]).toHaveProperty(key);
  });

  it("deep-copies reviewHistory so copy mutations never reach the original", () => {
    const payload = makePayload({ rows: [fullMetadataRow()] });
    const snapshot = structuredClone(payload);
    const copy = copyRfpComplianceMatrixPayload(payload);

    expect(copy.rows[0].reviewHistory).not.toBe(payload.rows[0].reviewHistory);
    expect(copy.rows[0].reviewHistory?.[0]).not.toBe(
      payload.rows[0].reviewHistory?.[0]
    );

    const history = copy.rows[0].reviewHistory;
    if (history !== undefined) {
      history[0].note = "MUTATED-NOTE";
      history[0].action = "removed";
      history.push(reviewEvent("restored", REVIEW_AT_2));
    }

    expect(payload).toEqual(snapshot);
  });

  it("strips arbitrary extra keys from rows and review events", () => {
    const dirtyEvent = {
      ...reviewEvent("status_changed", REVIEW_AT_1, "Set to reviewed."),
      tenantId: "tenant-secret",
      internalScore: 42,
      reviewerIp: "10.0.0.1",
    } as unknown as RfpComplianceMatrixReviewEvent;
    const dirtyRow = {
      ...fullMetadataRow(),
      tenantId: "tenant-secret",
      storagePath: "/secret/path",
      unitPrice: 1234.5,
      reviewHistory: [dirtyEvent],
    } as unknown as RfpComplianceMatrixRow;

    const copy = copyRfpComplianceMatrixPayload(makePayload({ rows: [dirtyRow] }));
    const serialized = JSON.stringify(copy);
    for (const leak of [
      "tenantId",
      "storagePath",
      "unitPrice",
      "internalScore",
      "reviewerIp",
    ]) {
      expect(serialized).not.toContain(leak);
    }

    const copiedRow = copy.rows[0];
    expect(copiedRow).not.toHaveProperty("tenantId");
    expect(copiedRow).not.toHaveProperty("storagePath");
    expect(copiedRow).not.toHaveProperty("unitPrice");
    expect(Object.keys(copiedRow.reviewHistory![0]).sort()).toEqual([
      "action",
      "at",
      "by",
      "note",
    ]);
  });

  it("preserves removed and not_applicable reasons with their review history", () => {
    const removedRow: RfpComplianceMatrixRow = {
      id: "RFP-COMP-020",
      requirementId: "RFP-REQ-020",
      requirementText: "Legacy clause superseded by addendum.",
      category: "technical",
      priority: "optional",
      complianceStatus: "needs_review",
      response: "Superseded; not part of this bid.",
      evidenceReferences: [],
      rowReviewStatus: "removed",
      removedReason: REMOVED_REASON,
      reviewHistory: [reviewEvent("removed", REVIEW_AT_1, "Removed as superseded.")],
    };
    const notApplicableRow: RfpComplianceMatrixRow = {
      id: "RFP-COMP-021",
      requirementId: "RFP-REQ-021",
      requirementText: "On-site spares depot.",
      category: "support",
      priority: "optional",
      complianceStatus: "not_applicable",
      response: "Not applicable to this engagement.",
      evidenceReferences: [],
      notApplicableReason: NA_REASON,
      reviewHistory: [
        reviewEvent("marked_not_applicable", REVIEW_AT_2, "Marked N/A by engineer."),
      ],
    };

    const copy = copyRfpComplianceMatrixPayload(
      makePayload({ rows: [removedRow, notApplicableRow] })
    );

    expect(copy.rows[0].rowReviewStatus).toBe("removed");
    expect(copy.rows[0].removedReason).toBe(REMOVED_REASON);
    expect(copy.rows[0].reviewHistory).toEqual([
      {
        action: "removed",
        at: REVIEW_AT_1,
        by: REVIEWER,
        note: "Removed as superseded.",
      },
    ]);
    expect(copy.rows[1].complianceStatus).toBe("not_applicable");
    expect(copy.rows[1].notApplicableReason).toBe(NA_REASON);
    expect(copy.rows[1].reviewHistory).toEqual([
      {
        action: "marked_not_applicable",
        at: REVIEW_AT_2,
        by: REVIEWER,
        note: "Marked N/A by engineer.",
      },
    ]);
  });

  it("keeps the payload summary lean - no metadata field surfaces", () => {
    const payload = makePayload({ rows: [fullMetadataRow(), ...makeRows()] });
    const summary = buildRfpComplianceMatrixPayloadSummary(payload);
    const serialized = JSON.stringify(summary);

    for (const key of METADATA_KEYS) {
      expect(summary).not.toHaveProperty(key);
      expect(serialized).not.toContain(key);
    }
    for (const value of [SECTION_REF, NA_REASON, REMOVED_REASON, REVIEW_NOTE]) {
      expect(serialized).not.toContain(value);
    }
    expect(summary.rowCount).toBe(4);
    expect(summary.statusCounts.partially_compliant).toBe(1);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the requirements-baseline contract, type-only", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/lib/projects/project-rfp-requirements-baseline"]);
    expect(
      /import\s+type\s+\{[^}]*\}\s+from\s+"@\/lib\/projects\/project-rfp-requirements-baseline";/.test(
        source
      )
    ).toBe(true);
    // No runtime (value) import of the coupled baseline service.
    expect(
      /import\s+\{[^}]*\}\s+from\s+"@\/lib\/projects\/project-rfp-requirements-baseline"/.test(
        source
      )
    ).toBe(false);
  });

  it("documents the deterministic RFP-COMP row-id convention", () => {
    expect(source).toContain("RFP-COMP-001");
  });

  it("imports no DB, store, route, fs, AI, catalog, pricing, config/SKU decision, adapter, coordinator, engine, or UI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db',
      'from "@/lib/projects/project-store"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/stages"',
      'from "@/lib/projects/staleness"',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/project-rfp-config-expansion',
      'from "@/lib/projects/project-rfp-compliance-matrix-',
      'from "@/lib/projects/project-rfp-requirements-baseline-',
      'from "@/lib/projects/project-rfp-hld',
      'from "@/lib/projects/project-rfp-tp',
      'from "@/lib/projects/project-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/mantle',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/lib/validation',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next',
      'from "react',
      "@anthropic-ai",
      "openai",
      "@google/generative-ai",
      "generateText",
      "generateObject",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});

/**
 * Deterministic validator for the Honeywell model-aware v2 rule artifacts
 * (Prompt 52): proves the v2 candidate/review packet stay candidate/pending,
 * re-express config logic (related-SKU/selected-option quantities, option/term
 * groups, separate replacements), and carry no pricing. PURE: no imports, no
 * filesystem/DB/catalog/pricing/AI, no Date/Math.random, no approval mutation.
 * Companion contract: src/lib/projects/config-expansion-types.ts.
 */

export type HoneywellRuleModelV2ValidationIssue = {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
};

export type HoneywellRuleModelV2ValidationReport = {
  readonly ok: boolean;
  readonly errors: readonly HoneywellRuleModelV2ValidationIssue[];
  readonly warnings: readonly HoneywellRuleModelV2ValidationIssue[];
  readonly summary: {
    readonly parentRuleCount: number;
    readonly childLineCount: number;
    readonly optionGroupCount: number;
    readonly termOptionGroupCount: number;
    readonly replacementCandidateCount: number;
    readonly approvedTrueCount: number;
    readonly nonPendingReviewDecisionCount: number;
  };
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const objs = (v: unknown): Obj[] => asArr(v).filter(isObj);

// Pricing tokens forbidden in ANY object key (key-only; the relationshipType VALUE
// "included_zero_price" is allowed). Keeps pricing authority out of these artifacts.
const PRICING_TOKENS = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount"];
// Hyphen-prefixed 5Y/7Y SKU token (e.g. "...-5Y"); matches an invented term SKU, not prose like "5Y/7Y alternatives".
const INVENTED_TERM_SKU = /-(?:5Y|7Y)\b/i;
const NO_SILENT = "does not authorize silent runtime sku replacement";
const PSU_GROUP_BY_PARENT: Record<string, string> = { "C9300X-48HX-A": "c9300x-ac-power-supplies", "C9300L-24P-4X-A": "c9300l-ac-power-supplies" };
const REQUIRED_OPTION_GROUPS: Record<string, string[]> = { "c9300x-ac-power-supplies": ["PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2"], "c9300l-ac-power-supplies": ["PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2"] };

const parentsOf = (pack: Obj): Obj[] => objs(pack.parentRules);
function childrenOf(pack: Obj): Obj[] {
  const out: Obj[] = [];
  for (const p of parentsOf(pack)) for (const c of objs(p.childLines)) out.push(c);
  return out;
}
function collectObjects(node: unknown, acc: Obj[]): Obj[] {
  if (Array.isArray(node)) for (const v of node) collectObjects(v, acc);
  else if (isObj(node)) { acc.push(node); for (const v of Object.values(node)) collectObjects(v, acc); }
  return acc;
}

export function validateHoneywellRuleModelV2Artifacts(input: {
  readonly v1Candidate: unknown;
  readonly v1ApprovalPacket: unknown;
  readonly v2Candidate: unknown;
  readonly v2ApprovalPacket: unknown;
}): HoneywellRuleModelV2ValidationReport {
  const errors: HoneywellRuleModelV2ValidationIssue[] = [];
  const warnings: HoneywellRuleModelV2ValidationIssue[] = [];
  const err = (code: string, message: string, path: string) => errors.push({ code, message, path });
  const need = (ok: boolean, code: string, message: string, path: string) => { if (!ok) err(code, message, path); };

  const v1c = obj(input.v1Candidate);
  const v1p = obj(input.v1ApprovalPacket);
  const v2c = obj(input.v2Candidate);
  const v2p = obj(input.v2ApprovalPacket);

  // 1. V1 inertness.
  need(str(v1c.status) === "candidate", "V1_CANDIDATE_STATUS", `v1 candidate status "${str(v1c.status)}" != candidate`, "v1Candidate.status");
  need(str(v1p.status) === "pending_human_approval", "V1_PACKET_STATUS", `v1 packet status "${str(v1p.status)}" != pending_human_approval`, "v1ApprovalPacket.status");

  // 2/3. V2 candidate + packet metadata.
  need(str(v2c.rulePackId) === "honeywell-candidate-rules-v2", "V2_CANDIDATE_RULE_PACK_ID", "v2 candidate rulePackId wrong", "v2Candidate.rulePackId");
  need(str(v2c.version) === "0.2.0-candidate", "V2_CANDIDATE_VERSION", "v2 candidate version wrong", "v2Candidate.version");
  need(str(v2c.status) === "candidate", "V2_CANDIDATE_STATUS", `v2 candidate status "${str(v2c.status)}" != candidate`, "v2Candidate.status");
  need(v2c.approvalRequired === true, "V2_CANDIDATE_APPROVAL_REQUIRED", "v2 candidate approvalRequired must be true", "v2Candidate.approvalRequired");
  need(str(v2p.packetId) === "honeywell-rule-approval-packet-v2", "V2_PACKET_ID", "v2 packet packetId wrong", "v2ApprovalPacket.packetId");
  need(str(v2p.status) === "pending_human_approval", "V2_PACKET_STATUS", `v2 packet status "${str(v2p.status)}" != pending_human_approval`, "v2ApprovalPacket.status");
  need(str(v2p.sourceCandidateRulePackId) === "honeywell-candidate-rules-v2", "V2_PACKET_SOURCE_CANDIDATE", "v2 packet sourceCandidateRulePackId wrong", "v2ApprovalPacket.sourceCandidateRulePackId");

  // 2/3/4. approved:true, non-pending reviewDecision, and pricing keys across both v2 artifacts.
  const v2Objs = [...collectObjects(v2c, []), ...collectObjects(v2p, [])];
  let approvedTrueCount = 0;
  let nonPendingReviewDecisionCount = 0;
  for (const o of v2Objs) {
    if (o.approved === true) approvedTrueCount++;
    if ("reviewDecision" in o && str(o.reviewDecision) !== "pending") nonPendingReviewDecisionCount++;
    for (const key of Object.keys(o)) {
      const token = PRICING_TOKENS.find((t) => key.toLowerCase().includes(t));
      if (token) err("PRICING_KEY", `key "${key}" contains pricing token "${token}"`, key);
    }
  }
  need(approvedTrueCount === 0, "APPROVED_TRUE", `${approvedTrueCount} object(s) have approved:true`, "v2");
  need(nonPendingReviewDecisionCount === 0, "REVIEW_DECISION_NOT_PENDING", `${nonPendingReviewDecisionCount} reviewDecision(s) not pending`, "v2ApprovalPacket");

  const v2Parents = parentsOf(v2c);
  const v2Children = childrenOf(v2c);

  // 5. Wireless license quantity model (project-scoped related-SKU total).
  for (const sku of ["LIC-CW-A", "LIC-SPACES-ADV"]) {
    const c = v2Children.find((x) => str(x.sku) === sku);
    const code = "WIRELESS_LICENSE_QUANTITY_MODEL";
    if (!c) { err(code, `${sku} child line missing`, sku); continue; }
    const qm = obj(c.quantityModel);
    const dp = obj(c.duplicatePolicy);
    need(str(qm.type) === "same_as_related_sku_total", code, `${sku} quantityModel.type`, sku);
    need(str(qm.relatedSku) === "CW9178I-CFG", code, `${sku} quantityModel.relatedSku`, sku);
    need(str(qm.scope) === "project", code, `${sku} quantityModel.scope`, sku);
    need(str(dp.scope) === "project_sku", code, `${sku} duplicatePolicy.scope`, sku);
    need(str(dp.match) === "sku", code, `${sku} duplicatePolicy.match`, sku);
    need(str(dp.quantitySatisfaction) === "existing_satisfies_required", code, `${sku} duplicatePolicy.quantitySatisfaction`, sku);
    need(str(c.legacyQuantityScope) === "quote_observed", code, `${sku} legacyQuantityScope must be quote_observed`, sku);
    need(str(c.reviewNotes).toLowerCase().includes("not reusable"), code, `${sku} reviewNotes must state not reusable`, sku);
  }

  // 6. Power cable quantity model: one CAB-C15-CBN per switch follows its PSU group.
  for (const p of v2Parents) {
    const expected = PSU_GROUP_BY_PARENT[str(p.parentSku)];
    if (!expected) continue;
    for (const c of objs(p.childLines)) {
      if (str(c.sku) !== "CAB-C15-CBN") continue;
      const qm = obj(c.quantityModel);
      const code = "POWER_CABLE_QUANTITY_MODEL";
      need(str(qm.type) === "selected_option_count", code, `CAB-C15-CBN/${str(p.parentSku)} type`, str(p.parentSku));
      need(str(qm.optionGroupId) === expected, code, `CAB-C15-CBN/${str(p.parentSku)} optionGroupId`, str(p.parentSku));
    }
  }

  // 7. Option groups: both AC PSU groups, their PSU SKUs, required + engineerReviewRequired.
  const optionGroups = objs(v2c.optionGroups);
  for (const [groupId, psus] of Object.entries(REQUIRED_OPTION_GROUPS)) {
    const g = optionGroups.find((x) => str(x.optionGroupId) === groupId);
    if (!g) { err("OPTION_GROUP_MISSING", `option group ${groupId} missing`, groupId); continue; }
    const skus = asArr(g.optionSkus).map(str);
    for (const psu of psus) need(skus.includes(psu), "OPTION_GROUP_MISSING", `${groupId} must include ${psu}`, groupId);
    need(g.engineerReviewRequired === true, "OPTION_GROUP_FLAG", `${groupId} engineerReviewRequired must be true`, groupId);
    need(g.required === true, "OPTION_GROUP_FLAG", `${groupId} required must be true`, groupId);
  }

  // 8. Term option groups: 3Y default, 36/60/84 allowed, review required, no invented 5Y/7Y SKU.
  const termGroups = objs(v2c.termOptionGroups);
  need(termGroups.length > 0, "TERM_GROUP_MISSING", "at least one termOptionGroup required", "v2Candidate.termOptionGroups");
  for (const g of termGroups) {
    const gid = str(g.termGroupId);
    need(g.defaultTermMonths === 36, "TERM_GROUP_DEFAULT_TERM", `${gid} defaultTermMonths must be 36`, gid);
    const allowed = asArr(g.allowedTermMonths);
    for (const m of [36, 60, 84]) need(allowed.includes(m), "TERM_GROUP_ALLOWED_TERMS", `${gid} allowedTermMonths must include ${m}`, gid);
    need(g.engineerReviewRequired === true, "TERM_GROUP_REVIEW_REQUIRED", `${gid} engineerReviewRequired must be true`, gid);
    for (const sku of asArr(g.optionSkus).map(str)) need(!INVENTED_TERM_SKU.test(sku), "TERM_GROUP_INVENTED_SKU", `${gid} invented term SKU ${sku}`, gid);
    const notes = str(g.notes).toLowerCase();
    if (!(notes.includes("5y/7y") && notes.includes("evidence"))) warnings.push({ code: "TERM_GROUP_EVIDENCE_NOTE", message: `${gid} notes should cite 5Y/7Y evidence`, path: gid });
  }

  // 9. Replacement candidates: present, unapproved, evidenced, no-silent-replacement warning.
  const replacements = objs(v2c.replacementCandidates);
  need(replacements.length > 0, "REPLACEMENT_MISSING", "replacementCandidates must exist", "v2Candidate.replacementCandidates");
  for (const r of replacements) {
    const id = str(r.candidateReplacementId) || str(r.historicalSku);
    need(r.approved === false, "REPLACEMENT_APPROVED", `replacement ${id} approved must be false`, id);
    need(r.approvalRequired === true, "REPLACEMENT_APPROVAL_REQUIRED", `replacement ${id} approvalRequired must be true`, id);
    need(asArr(r.evidence).length >= 1, "REPLACEMENT_EVIDENCE", `replacement ${id} must carry evidence`, id);
    need(str(r.notes).toLowerCase().includes(NO_SILENT), "REPLACEMENT_SILENT_WARNING", `replacement ${id} notes missing no-silent-replacement warning`, id);
  }

  // 10. Count consistency vs the v1 candidate.
  const v1Repl = objs(v1c.candidateReplacements).length;
  need(v2Parents.length === parentsOf(v1c).length, "COUNT_PARENT_MISMATCH", `v2 parents ${v2Parents.length} != v1 ${parentsOf(v1c).length}`, "parentRules");
  need(v2Children.length === childrenOf(v1c).length, "COUNT_CHILD_MISMATCH", `v2 children ${v2Children.length} != v1 ${childrenOf(v1c).length}`, "childLines");
  need(replacements.length === v1Repl, "COUNT_REPLACEMENT_MISMATCH", `v2 replacements ${replacements.length} != v1 ${v1Repl}`, "replacementCandidates");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      parentRuleCount: v2Parents.length,
      childLineCount: v2Children.length,
      optionGroupCount: optionGroups.length,
      termOptionGroupCount: termGroups.length,
      replacementCandidateCount: replacements.length,
      approvedTrueCount,
      nonPendingReviewDecisionCount,
    },
  };
}

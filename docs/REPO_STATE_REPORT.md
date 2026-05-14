# BOMATIC Repo State Report

Snapshot date: 2026-05-13
Branch: main
Sources scanned: `C:/Pre-Sales/bomatic/` (excl. node_modules, stc-knowledge) and `C:/Pre-Sales/bomatic_planning/`.

## Section 1 — File Inventory

Total TS/TSX files under `src/`: **291** (**39,513 lines**). Files over 200 lines are flagged.

### src/engines/e1/

- `engines/e1/clarification-generator.ts` (200) — exports: `ClarificationPriority`, `ClarificationCategory`, `ClarificationQuestion`, `ClarificationStats`, `ClarificationResult`, `generateClarifications` — AI-assisted generator that converts missing docs, ambiguous requirements and eval-criteria gaps into prioritized clarification questions for the client.
- `engines/e1/compliance-matrix-controls.ts` (121) — exports: `ControlRef`, `ControlTopic`, `CONTROL_TOPICS`, `frameworkControls` — Hardcoded keyword → framework control mapping (NCA ECC, ISO 27001, SAMA CSF) for deterministic requirement-to-control matching.
- `engines/e1/compliance-matrix-status.ts` (93) — exports: `ComplianceStatus`, `RawMatch`, `DEFAULT_STATUS`, `DEFAULT_NOTES`, `assignStatuses`, `pairKey` — Batched AI call that assigns Compliant / Partially / Non-Compliant / Alternative statuses to each requirement-control pair.
- `engines/e1/compliance-matrix.ts` (151) — exports: `ComplianceStatus`, `MatrixRow`, `ComplianceMatrixStats`, `ComplianceMatrixResult`, `generateComplianceMatrix` — Orchestrates topic-matching + status-assignment to produce the full requirements-to-controls compliance matrix.
- `engines/e1/eval-criteria-analyzer.ts` (194) — exports: `Envelope`, `EvalCriteriaResult`, `EvalMethodology`, `analyzeEvalCriteria` — Detects RFP evaluation methodology (sequential envelopes / weighted / pass-fail) and extracts envelopes + passing thresholds.
- `engines/e1/eval-criteria-sheet.ts` (84) — exports: `ParsedSheet`, `findEvalSheet`, `parseEvaluationSheet`, `deriveMethodologyFromEnvelopes` — Excel-sheet parser that finds and parses the evaluation criteria sheet by header heuristics.
- `engines/e1/eval-criteria-types.ts` (21) — exports: `EvalMethodology`, `Envelope`, `EvalCriteriaResult` — Type definitions shared between eval-criteria parsers and analyzers.
- `engines/e1/file-classifier.ts` (148) — exports: `FileClassificationSchema`, `FileClassification`, `classifyFile` — Deterministic filename/folder/content classifier that tags each uploaded file with type (technical/commercial/legal/etc.) and bid stage.
- `engines/e1/framework-selector.ts` (127) — exports: `SelectedFrameworkSchema`, `SelectedFramework`, `selectFrameworks` — Picks the applicable compliance frameworks for a project based on sector and explicitly-referenced standards.
- `engines/e1/legal-trap-flagger.ts` (130) — exports: `RiskFlag`, `ComplianceDeadline`, `flagLegalTraps`, `extractDeadlines` — Regex-based scanner that flags 27 disqualification/discretionary/breach risk patterns and extracts compliance deadlines.
- `engines/e1/missing-doc-detector.ts` (121) — exports: `MissingDocumentSchema`, `MissingDocument`, `extractReferences`, `detectMissingDocuments` — Detects internal cross-references and external standards cited but not delivered with the RFP.
- `engines/e1/orchestrator-helpers.ts` (73) — exports: `classifyAll`, `loadExcelSheets`, `buildTextMap`, `extractAllRequirements`, `collectReferencedStandards` — Helper functions that classify files, load Excel sheets, and bulk-extract requirements for the E1 orchestrator.
- `engines/e1/orchestrator-types.ts` (52) — exports: `E1InputFile`, `E1Input`, `E1ClassifiedFile`, `E1Output` — E1 orchestrator public input/output type definitions.
- `engines/e1/orchestrator.ts` (120) — exports: `runE1` (plus re-exports of E1 types) — Top-level RFP-parser entry point chaining file classification, requirements extraction, risk flagging, sector/framework detection, compliance matrix and clarifications.
- `engines/e1/requirements-extractor.ts` (205) — exports: `RequirementClassification`, `Requirement`, `ExtractionStats`, `ExtractionResult`, `extractRequirements` — AI-driven requirement extraction with mandatory/optional/conditional classification and confidence scoring. **[FLAG: >200 lines]**
- `engines/e1/sector-detector.ts` (131) — exports: `SectorDetectionSchema`, `SectorDetection`, `detectSector` — Classifies the client/document into an industry sector (oil_and_gas, banking, government, etc.) via lookup tables and AI fallback.
- `engines/e1/vendor-extractor.ts` (172) — exports: `VendorPreferenceSchema`, `VendorPreference`, `extractVendors` — Extracts named-vendor / or-equivalent preferences and specific model mentions from RFP text.
- `engines/e1/xref-linker.ts` (69) — exports: `TPSectionRefSchema`, `TPSectionRef`, `linkToTPSection` — Topic-based regex mapper linking each requirement to a Technical Proposal section.

### src/engines/e2/

- `engines/e2/accessory-selector.ts` (128) — exports: `AccessoryLine`, `OptionsSchema`, `AccessoryOptions`, `selectAccessories` — Selects mandatory and optional accessories (PSU, power cords, antennas, rack kits) per device from device-spec lookups.
- `engines/e2/bom-anomaly-detector.ts` (222) — exports: `BomLineItem`, `ProjectContext`, `AnomalyType`, `AnomalyResult`, `detectAnomalies` — AI-driven detector for quantity mismatches, oversized/undersized devices, missing components and cost outliers. **[FLAG: >200 lines]**
- `engines/e2/bom-workbook-writer.ts` (96) — exports: `BomWorkbookInputs`, `writeBomWorkbook` — Writes the E2 BoM Excel workbook with per-SKU validation rollup, totals, and currency derivation.
- `engines/e2/boq-detector.ts` (60) — exports: `detectBoQType` — Detects which of five BoQ template types (Ariba / NRM2 / vendor-quote / BOM-no-price / telecom) an uploaded file matches.
- `engines/e2/boq-template-filler.ts` (158) — exports: `PricedLineItem`, `BoQTemplateType`, `fillBoQTemplate` — Format-preserving filler that writes priced values back into the client's original BoQ workbook (uses exceljs to preserve styles).
- `engines/e2/boq-types.ts` (29) — exports: `BoQType` (enum), `BoQLineItemSchema`, `BoQLineItem` — BoQ template enum and Zod schema/type for parsed line items.
- `engines/e2/cables-spares-calculator.ts` (140) — exports: `CableLine`, `SpareLine`, `CableDevice`, `calculateCables`, `calculateSpares` — Deterministic calculator for patch/trunk/stacking/power cables and spare equipment based on device roles.
- `engines/e2/fill-from-priced.ts` (66) — exports: `FillFromPricedInput`, `fillFromPriced` — Pairs priced BoM lines with parsed BoQ items and invokes the format-preserving filler.
- `engines/e2/fortinet-catalog.ts` (190) — exports: `FortinetCategory`, `FortinetProduct`, `parseFortinetPriceList` — Parser for the Fortinet quarterly USD price-list Excel into structured product entries.
- `engines/e2/fuzzy-sku-matcher.ts` (125) — exports: `CatalogEntry`, `FuzzyMatchInput`, `FuzzyMatchResult`, `fuzzyMatchSku` — AI-backed matcher that maps freeform descriptions to catalog SKUs with confidence scores.
- `engines/e2/licensing-calculator.ts` (160) — exports: `LicenseLine`, `LicenseConfig`, `calculateLicenses` — Deterministic Cisco licensing calculator (Network + DNA tiers, term, ThousandEyes/DNA Spaces add-ons).
- `engines/e2/orchestrator-helpers.ts` (144) — exports: `RawLine`, `PricedBomLine`, `E2Totals`, `E2ValidationStatus`, plus pricing/totals helpers — Shared pricing math (currency, vendor discount, overhead, sell price, VAT) for the E2 orchestrator.
- `engines/e2/orchestrator.ts` (227) — exports: `runE2`, `E2Device`, `E2DeviceConfig`, `E2Input`, `E2PricingConfig`, `E2Output` — Top-level BoM-engine entry point chaining BoQ parsing, accessories/licenses/support, anomaly detection, validation, pricing and workbook output. **[FLAG: >200 lines]**
- `engines/e2/pricing-engine.ts` (188) — exports: `CalculateOverheadInput`, `OverheadResult`, `convertCurrency`, `applyVendorDiscount`, `applyInhouseMargin`, `calculateOverhead`, `calculateCostWithOverhead`, `calculateSellingPrice`, `calculateExtendedSell` — Zod-validated pricing math primitives (CS-001..CS-007 per Playbook).
- `engines/e2/revenue-split.ts` (40) — exports: `CalculateRevenueSplitInput`, `RevenueSplitResult`, `calculateRevenueSplit` — Splits a sell amount between STCS and a partner per CS-008.
- `engines/e2/similar-deal-finder.ts` (217) — exports: `DealProfile`, `DealSummary`, `SimilarDealResult`, `findSimilarDeals` — AI-driven matcher that scores historical deals against a current opportunity profile and surfaces lessons learned. **[FLAG: >200 lines]**
- `engines/e2/support-selector.ts` (83) — exports: `SupportLine`, `SupportConfig`, `selectSupport` — Selects Cisco SmartNet / Fortinet FortiCare support SKUs by model, term, and criticality.
- `engines/e2/vat.ts` (28) — exports: `CalculateVATInput`, `VATResult`, `calculateVAT` — Applies a country-specific VAT rate to sell price (CS-009).
- `engines/e2/parsers/type-a-ariba.ts` (85) — exports: `parseTypeA` — Parses Aramco SAP-Ariba BoQ workbooks (Type A) into BoQLineItem rows.
- `engines/e2/parsers/type-a-cols.ts` (68) — exports: `ColMap`, `COLS_2022`, `COLS_2024`, `detectVersion`, `findCommercialSheetName` — Aramco Ariba column-map source of truth for 2022 vs 2024+ template variants.
- `engines/e2/parsers/type-b-nrm2.ts` (168) — exports: `parseTypeB` — Parses NRM2-style hierarchical BoQ workbooks (base + add/omit variants).
- `engines/e2/parsers/type-c-vendor-quote.ts` (93) — exports: `parseTypeC` — Parses vendor-quote BoQ workbooks (Type C) into BoQLineItem rows.
- `engines/e2/parsers/type-d-bom.ts` (115) — exports: `parseTypeD` — Parses BOM-no-price workbooks (Type D) grouped by "Group Name:" sentinels.
- `engines/e2/parsers/type-e-telecom.ts` (110) — exports: `parseTypeE` — Parses telecom BoQ workbooks (Type E with STC/Vendor qty + gross/discount/net columns).

### src/engines/e3/

- `engines/e3/boilerplate-kb.ts` (178) — exports: `BoilerplateEntrySchema`, `BoilerplateEntry`, `DEFAULT_BOILERPLATE`, `getBoilerplate`, `renderBoilerplate` — Tenant-configurable boilerplate text-block KB with `{{placeholder}}` rendering for deterministic proposal sections.
- `engines/e3/docx-generator.ts` (147) — exports: `generateProposalDocx` — Renders the 15-section proposal as a Word .docx with TOC, page numbers and confidential header/footer.
- `engines/e3/financial-proposal-writer.ts` (204) — exports: `FinancialProposalMetadata`, `FinancialCostStack`, `writeFinancialProposal` — Writes the companion financial Excel workbook (cost stack + Good/Better/Best tiers). **[FLAG: >200 lines]**
- `engines/e3/margin-analyzer.ts` (145) — exports: `NON_PEGGED_CURRENCIES`, `FxExposureSchema`, `MarginInputSchema`, `MarginInput`, `analyzeMargin` — Computes gross margin, attach rate, FX exposure and discount, with approval-level recommendation.
- `engines/e3/markdown-to-docx.ts` (135) — exports: `markdownToDocxBlocks` — Minimal markdown-to-docx converter (paragraphs, headings, bold, bullets, pipe tables) used by the proposal docx generator.
- `engines/e3/orchestrator-ai-inputs.ts` (137) — exports: `buildCoverLetterInput`, `buildExecSummaryInput`, `buildImplementationInput`, `buildScopeInput`, `buildSolutionInput` — Pure functions that map E1/E2 outputs into the typed inputs each AI section generator needs.
- `engines/e3/orchestrator-helpers.ts` (129) — exports: `TOP_REQS_LIMIT`, `inferVendor`, `buildBoilerplateSection`, `buildFinancialCostStack`, `buildMarginInput`, `categoryList`, `coverageFromStats`, `deviceCount`, `topRequirements`, `vendorList` — Mapping helpers from E1/E2/cost-stack into deterministic-section, pricing-tier, margin, and financial-writer inputs.
- `engines/e3/orchestrator-types.ts` (174) — exports: `E3CostStack`, `E3Requirement`, `E3BomLine`, `E3Totals`, `E3E1Data`, `E3E2Data`, `E3E4Data`, `E3E5Data`, `E3Input`, `E3Output`, `E3RequirementsBaseline`, `E3HLDSection`, `E3BaselineEntry` — Public input/output types for the E3 proposal engine.
- `engines/e3/orchestrator.ts` (153) — exports: `runE3` (plus type re-exports) — Top-level proposal-engine entry point chaining deterministic sections, 5 AI sections, pricing tiers, margin analysis, and Word/Excel writers.
- `engines/e3/pricing-tiers.ts` (207) — exports: `TierBomLineSchema`, `TierUpgradeSchema`, `TierConfig`, `PricingTierResult`, `generatePricingTiers` — Good/Better/Best tier generator with replace/add/upgrade actions. **[FLAG: >200 lines]**
- `engines/e3/section-enrichers.ts` (160) — exports: `enrichRequirementsSection`, `enrichProposedSolutionSection`, `enrichScopeSection` — Optional post-processors that append E4 baseline / E5 HLD context to existing proposal sections (RFI mode).
- `engines/e3/section-generators.ts` (207) — exports: deterministic generators for 8 non-AI sections (cover, requirements, technical specs, service levels, commercial, compliance, appendices, signature) — Pure functions producing the deterministic proposal sections. **[FLAG: >200 lines]**
- `engines/e3/section-helpers.ts` (129) — exports: `SectionBomLine`, `SectionTotals`, `SectionRequirement`, `SectionComplianceStats`, `escapeCell`, `formatMoney`, `groupByCategory`, `isSupportLine`, `makeSection`, `mapSupportTier`, `renderRequirementsTable`, `capitalize` — Shared formatters and lookups for deterministic proposal sections.
- `engines/e3/types.ts` (127) — exports: `GenerationMethod`, `ProposalStatus`, `TierName`, `ProposalMode`, `ProposalLanguage`, `ApprovalLevel`, `MarginFlagType`, `MarginFlagSeverity`, `MarginFlag`, `MarginAnalysis`, `PricingTier`, `PricingTierBomLine`, `PricingTierTotals`, `ProposalSection`, `ProposalMetadata`, `PROPOSAL_SECTIONS`, `ProposalSectionSpec` — E3 proposal engine type definitions and 15-section outline.
- `engines/e3/ai-sections/cover-letter.ts` (124) — exports: `CoverLetterInput`, `generateCoverLetter` — AI-enhanced (with deterministic fallback) section-1 cover-letter generator.
- `engines/e3/ai-sections/executive-summary.ts` (149) — exports: `ExecSummaryInput`, `generateExecutiveSummary` — AI-enhanced section-2 executive-summary generator for CFO/CIO audience.
- `engines/e3/ai-sections/implementation.ts` (181) — exports: `MigrationApproach`, `ImplementationInput`, `generateImplementation` — AI-enhanced section-6 implementation-approach generator (PPDIOO methodology, RACI, risk register).
- `engines/e3/ai-sections/proposed-solution.ts` (160) — exports: `SolutionDevice`, `SolutionInput`, `generateProposedSolution` — AI-enhanced section-4 proposed-solution generator organized by category.
- `engines/e3/ai-sections/scope-customizer.ts` (155) — exports: `ScopeInput`, `generateScope` — AI-enhanced section-9 scope/assumptions/exclusions/dependencies generator with MENA-specific items.

### src/engines/e4/

- `engines/e4/emphasis-matrix.ts` (42) — exports: `getEmphasis`, `getPrioritizedSections` — Maps project type to per-section emphasis (high/medium/low/skip) for questionnaire weighting.
- `engines/e4/free-text-interpreter.ts` (71) — exports: `interpretFreeText` — Deterministic + batched AI matcher that maps free-text client responses to specific question IDs.
- `engines/e4/gap-detector-ai.ts` (102) — exports: `Contradiction`, `EnhancedGapAnalysis`, `enhancedGapDetection` — AI augment over deterministic gap analysis that surfaces contradictions and unstated assumptions.
- `engines/e4/orchestrator-helpers.ts` (69) — exports: `E4StepLog`, `StepResult`, `runStep`, `recordSkip` — Step-logging utilities shared by phase 1 and phase 2.
- `engines/e4/orchestrator-types.ts` (40) — exports: `CheckpointDecision`, `CheckpointCallback`, `E4InputData` — E4 orchestrator input/output type definitions.
- `engines/e4/orchestrator.ts` (111) — exports: `runE4`, `runE4Detailed`, plus type re-exports — Top-level Discovery engine entry; routes phase 1 (questionnaire) vs phase 2 (responses → baseline).
- `engines/e4/phase1.ts` (157) — exports: `Phase1Result`, `runPhase1` — Phase 1 implementation: project-type detection → questionnaire generation through e4-questionnaire checkpoint with revision loop.
- `engines/e4/phase2.ts` (154) — exports: `Phase2Result`, `runPhase2` — Phase 2 implementation: response parsing/interpretation → gap detection → baseline through e4-requirements checkpoint.
- `engines/e4/project-type-ai.ts` (57) — exports: `enhancedProjectTypeDetection` — AI fallback that escalates low-confidence project-type detection to Claude.
- `engines/e4/project-type-detector.ts` (148) — exports: `ProjectTypeDetectionSchema`, `ProjectTypeDetection`, `detectProjectType` — Keyword-based project-type classifier across 10 types (campus_refresh, sd_wan, dc_modernization, etc.).
- `engines/e4/question-customizer.ts` (70) — exports: `customizeQuestions` — AI generator for engagement-specific custom questions beyond the standard QUESTION_BANK.
- `engines/e4/questionnaire-generator.ts` (118) — exports: `GeneratedQuestionnaire`, `generateQuestionnaire`, `questionnaireToMarkdown` — Combines QUESTION_BANK + project-type + emphasis matrix to build the engagement questionnaire.
- `engines/e4/questionnaire-template.ts` (98) — exports: `QUESTION_BANK` — Discovery questionnaire base template (sections A–F questions from Playbook §2.4).
- `engines/e4/requirements-baseline-builder.ts` (148) — exports: `buildRequirementsBaseline`, `analyzeGaps` — Maps ClientResponses + Questions to a five-category requirements baseline plus gap analysis.
- `engines/e4/response-parser.ts` (200) — exports: `ParseResponseInput`, `ParseResponseResult`, `parseResponse`, `matchResponseToQuestion` — Reads client responses from Excel or free text and emits ClientResponse[] keyed against the question bank.
- `engines/e4/types.ts` (145) — exports: `ProjectType`, `EmphasisLevel`, `QuestionPriority`, `QuestionResponseType`, `Question`, `QuestionnaireSection`, `QUESTIONNAIRE_SECTIONS`, `ClientResponse`, `ResponseSource`, `BaselinePriority`, `BaselineEntry`, `RequirementsBaseline`, `VagueAnswer`, `GapAnalysis`, `E4Config` — E4 Discovery Engine type definitions.

### src/engines/e5/

- `engines/e5/cable-schedule-generator.ts` (122) — exports: `generateCableSchedule` — Deterministic cable-schedule generator producing one entry per trunk/routed port plus power cables, with length/type inferred from context.
- `engines/e5/compatibility-validator.ts` (181) — exports: `validateCompatibility` — Pure rule-driven validator checking stacking, PSU, PoE budget, topology and port-cap rules; returns errors and warnings.
- `engines/e5/component-list-builder.ts` (59) — exports: `buildComponentList` — Flattens a SizingResult into the ComponentListItem[] shape consumed by E2 BoM.
- `engines/e5/design-docx-helpers.ts` (197) — exports: `DesignDocMetadata`, `generateDesignDocx` — Shared HLD/LLD docx rendering helpers (TOC, footer, minimal markdown subset).
- `engines/e5/device-specs.ts` (149) — exports: `AccessSwitchSpec`, `CoreSwitchSpec`, plus const tables (`CISCO_ACCESS_SWITCHES`, `CISCO_CORE_SWITCHES`, `CISCO_FIREWALLS`, `CISCO_WIRELESS_APS`, `FORTIGATE_FIREWALLS`, `FIREWALL_SIZING_TIERS`, `AP_DENSITY`, `SWITCH_HEADROOM`, `FIREWALL_GROWTH_FACTOR`) — Embedded device-spec lookup tables for sizing.
- `engines/e5/diagram-generator.ts` (131) — exports: `generateDiagrams` — Walks SizingResult buckets to emit a draw.io mxGraph diagram (deterministic, no AI).
- `engines/e5/diagram-xml.ts` (150) — exports: `NodeShape`, `DiagramNode`, `DiagramEdge`, `COLOR`, `EDGE_COLOR`, `ROW_GAP`, `connectAll`, `renderMxFile`, `rowOf` — draw.io XML primitives shared by diagram generators.
- `engines/e5/e5-phase1.ts` (187) — exports: `Phase1Result`, `runPhase1` — Phase 1 (HLD) pipeline through e5-design-approach and e5-hld checkpoints.
- `engines/e5/e5-phase2.ts` (179) — exports: `Phase2Result`, `runPhase2` — Phase 2 (LLD) pipeline through e5-lld checkpoint with IP/VLAN, port maps, cable schedule, QoS, migration.
- `engines/e5/hld-deterministic-sections.ts` (192) — exports: `TOPOLOGY_DISPLAY`, `DESIGN_PRINCIPLES`, plus per-section builders (`documentControlSection`, `currentStateSection`, `capacitySection`, etc.) — Deterministic templates and fallbacks for the 12-section HLD outline.
- `engines/e5/hld-docx-generator.ts` (27) — exports: `HLDDocxMetadata`, `generateHLDDocx` — Thin wrapper over design-docx-helpers for HLD-specific docx output.
- `engines/e5/hld-narrative-generator.ts` (170) — exports: `generateHLDNarrative` — 12-section HLD narrative generator combining 8 deterministic templates with 4 AI-written sections (executive summary, requirements, architecture, security).
- `engines/e5/ip-vlan-planner.ts` (144) — exports: `planIPVlans` — Deterministic VLAN/subnet/VRF planner using the standard VLAN template with per-site offsets.
- `engines/e5/lld-deterministic-sections.ts` (170) — exports: per-section builders for the 21-section LLD outline — Deterministic templates plus AI fallbacks for LLD narrative.
- `engines/e5/lld-docx-generator.ts` (27) — exports: `LLDDocxMetadata`, `generateLLDDocx` — Thin wrapper over design-docx-helpers for LLD-specific docx output.
- `engines/e5/lld-narrative-generator.ts` (120) — exports: `LLDNarrativeInput`, `generateLLDNarrative` — 21-section LLD narrative generator combining 19 deterministic templates with 2 AI-written sections (routing, security).
- `engines/e5/methodology-selector.ts` (62) — exports: `MethodologyRequirements`, `selectMethodology` — Deterministic methodology + framework selector encoding Design_Patterns §6.
- `engines/e5/migration-selector.ts` (182) — exports: `MigrationInputSchema`, `selectMigrationApproach` — Deterministic cutover / parallel-run / phased migration-approach selector.
- `engines/e5/orchestrator-helpers.ts` (70) — exports: `E5StepLog`, `StepResult`, `runStep`, `recordSkip` — Step-logging utilities shared by E5 phase 1 and phase 2.
- `engines/e5/orchestrator-types.ts` (71) — exports: `CheckpointDecision`, `E5CheckpointId`, `CheckpointCallback`, `E5Phase`, `E5InputData`, `Phase1Handoff` — E5 orchestrator input/output type definitions.
- `engines/e5/orchestrator.ts` (176) — exports: `runE5`, `runE5Detailed`, plus type re-exports — Top-level Design engine entry point; routes phase = hld | lld | full.
- `engines/e5/port-map-generator.ts` (196) — exports: `generatePortMaps` — Deterministic per-device port-map generator with VLAN/zone assignments and Cisco port-id prefixes.
- `engines/e5/qos-policy-generator.ts` (107) — exports: `generateQoSPolicy` — Vendor-specific QoS policy generator (Cisco 8-class, Fortinet 6-class).
- `engines/e5/rack-elevation-generator.ts` (175) — exports: `generateRackElevations` — Deterministic 42U rack-elevation builder with MDF/IDF grouping and overflow handling.
- `engines/e5/sizing-calculator.ts` (178) — exports: `calculateSizing` — Deterministic sizing calculator producing access/distribution/core/firewall/wireless device counts.
- `engines/e5/topology-recommender.ts` (194) — exports: `TopologyInputSchema`, `recommendTopology` — Decision-tree topology recommender (six patterns) with AI escalation only in the ambiguous 500–999 user zone.
- `engines/e5/types.ts` (205) — exports: `TopologyPattern`, `DesignFramework`, `DesignApproach`, `SizingInput`, `DeviceSelection`, `SizingResult`, `CompatibilityResult`, `ValidationIssue`, `ComponentListItem`, `HLDSection`, `LLDSection`, `IPVlanPlan`, `SubnetEntry`, `VlanEntry`, `VrfEntry`, `PortMap`, `PortAssignment`, `CableScheduleEntry`, `QoSPolicy`, `QoSClass`, `MigrationApproach`, `MigrationPhase`, `RackElevation`, `TopologyPatternSchema` — E5 Design Engine type definitions. **[FLAG: >200 lines]**

### src/coordinator/

- `coordinator/intake-file-loader.ts` (44) — exports: `UploadedFile`, `LoadedFile`, `EnrichResult`, `enrichFileContent` — Reads PDF/DOCX/DOC uploads via document-reader and returns text-enriched file records.
- `coordinator/intake-pricing.ts` (56) — exports: `IntakePricingInput`, `buildPricingConfig` — Builds the E2 pricing config from per-tenant defaults and intake overrides.
- `coordinator/intake-to-e2.ts` (55) — exports: `IntakeRequirementsForE2`, `devicesFromIntake` — Maps stored intake requirements (uploaded BoM, quantities, license/support tiers) into E2Device inputs.
- `coordinator/logger.ts` (40) — exports: `LogLevel`, `LogCategory`, `LogEntry`, `logEntry`, `getLogsForPipeline` — In-memory pipeline-log store with engine_call / checkpoint / artifact / error categories.
- `coordinator/pipeline-e1.ts` (30) — exports: `E1BuildInput`, `buildE1Input`, `toE1Artifacts` — Coordinator-to-E1 bridge: input builder and artifact mapper.
- `coordinator/pipeline-e2.ts` (81) — exports: `E2BuildInput`, `buildE2Input`, `toE2Artifacts` — Coordinator-to-E2 bridge that also derives devices from the E5 component list in RFI mode.
- `coordinator/pipeline-e3-rfi.ts` (52) — exports: `mapE4`, `mapE5` — Pure mappers that parse E4/E5 artifact JSON into E3 input shapes (RFI mode), returning undefined on parse failure for graceful fallback.
- `coordinator/pipeline-e3.ts` (165) — exports: `buildE3Input`, `toE3Artifacts`, `resolveOutputDir`, `syntheticE1ForRfi`, re-exports `mapE4`/`mapE5` — Coordinator-to-E3 bridge that builds proposal inputs from E1/E2 outputs and outputDir, and maps E3Output back to path-string artifacts.
- `coordinator/pipeline-e4.ts` (48) — exports: `E4BuildInput`, `buildE4Input`, `toE4Artifacts` — Coordinator-to-E4 bridge that builds the EngineInput from intake data.
- `coordinator/pipeline-e5.ts` (87) — exports: `E5BuildInput`, `buildE5Input`, `toE5Artifacts` — Coordinator-to-E5 bridge that maps pipeline inputs + E4 artifacts into the E5 EngineInput.
- `coordinator/pipeline-state.ts` (92) — exports: `ENGINE_CHECKPOINTS`, `createInitialState`, `startEngineCall`, `runCheckpoint`, `logEvent`, `CheckpointCallback` — Pipeline state helpers for checkpoint and engine-call recording.
- `coordinator/pipeline.ts` (161) — exports: `PipelineInput`, `runPipeline` — Top-level pipeline driver that runs E1→E2→E3 (or E4→E5→E2→E3 / E2→E3) per intake mode, with checkpoint and revision-loop handling.
- `coordinator/router.ts` (25) — exports: `getEngineSequence`, `getNextEngine` — Per-IntakeMode engine sequence definition (rfp / rfi / quick_bom).
- `coordinator/types.ts` (125) — exports: `IntakeMode`, `EngineId`, `CheckpointStatus`, `E1Artifacts`, `E2Artifacts`, `E3Artifacts`, `E4Artifacts`, `E5Artifacts`, `ArtifactRegistry`, `Checkpoint`, `EngineCall`, `PipelineState`, `EngineInput`, `EngineOutput` — Inter-engine pipeline state and artifact-shape type definitions.

### src/app/api/

- `app/api/admin/route.ts` (77) — exports: `GET`, `PATCH` — Tenant-admin endpoint for reading and updating tenant configuration.
- `app/api/catalog/fortinet/route.ts` (74) — exports: `GET` — Fortinet catalog search endpoint with module-cached price-list parsing and pagination.
- `app/api/chat/route.ts` (233) — exports: `POST` — Multi-turn chat agent endpoint backed by either Anthropic or Gemini via LLM_PROVIDER. **[FLAG: >200 lines]**
- `app/api/chat/save/route.ts` (158) — exports: `POST` — Persists a chat-generated BoM to the database (intake + agent_run + bom_draft).
- `app/api/estimates/[id]/_e4-state.ts` (213) — exports: `E4StoredState`, `QuestionnaireStatus`, `StoredQuestionnaire`, `StoredResponses`, `loadE4State`, `saveE4State`, `resolveIntake`, `minimalPipelineState`, `questionsToSections`, `saveResponseUpload` — Shared helpers for E4 questionnaire/responses routes, storing E4 state under intake.requirementsJson.e4. **[FLAG: >200 lines]**
- `app/api/estimates/[id]/_e5-state.ts` (146) — exports: `E5Phase`, `E5StoredState`, `loadE5State`, `saveE5State`, `resolveIntake`, `minimalPipelineState`, `parseJson` — Shared helpers for E5 design routes, storing E5 state under intake.requirementsJson.e5.
- `app/api/estimates/[id]/compliance/export/route.ts` (114) — exports: `GET` — Streams the compliance matrix as an XLSX download.
- `app/api/estimates/[id]/compliance/route.ts` (104) — exports: `PATCH` — Applies human edits (status/notes) to stored compliance-matrix rows.
- `app/api/estimates/[id]/design/_actions.ts` (173) — exports: `handleApproveDesignApproach`, `handleApproveHLD`, `handleApproveLLD`, `handleReviseDesignApproach`, `handleReviseHLD`, `handleReviseLLD` — Action handlers for E5 design PATCH route (approve/revise phase transitions).
- `app/api/estimates/[id]/design/documents/route.ts` (102) — exports: `GET` — Streams generated E5 artifacts (HLD docx, LLD docx, diagram XML).
- `app/api/estimates/[id]/design/route.ts` (191) — exports: `GET`, `POST`, `PATCH` — E5 design engine endpoints (state, start generation, checkpoint actions).
- `app/api/estimates/[id]/download/route.ts` (196) — exports: `GET` — Streams generated BoM / compliance / proposal / financial artifacts; regenerates xlsx from stored outputs when not on disk.
- `app/api/estimates/[id]/proposal/route.ts` (245) — exports: `GET` — Returns E3 proposal artifacts as JSON or streams docx/financial download, regenerating on demand. **[FLAG: >200 lines]**
- `app/api/estimates/[id]/questionnaire/route.ts` (160) — exports: `GET`, `POST`, `PATCH` — E4 phase 1 endpoints (load/run/update questionnaire).
- `app/api/estimates/[id]/responses/_payload.ts` (77) — exports: `Payload`, `readPayload` — Multipart vs JSON payload reader for the E4 responses route.
- `app/api/estimates/[id]/responses/route.ts` (194) — exports: `GET`, `POST`, `PATCH` — E4 phase 2 endpoints (load/run/validate responses, gaps, baseline).
- `app/api/estimates/[id]/route.ts` (172) — exports: `GET` — Loads BoM draft + pipeline artifacts and state for an estimate (resolving by bomDraft or intake id).
- `app/api/estimates/route.ts` (64) — exports: `GET` — Lists all bom_drafts joined with intakes for the authenticated tenant.
- `app/api/export/route.ts` (89) — exports: `GET` — Streams a BoM draft as CSV or XLSX via the export module.
- `app/api/intake/route.ts` (171) — exports: `POST` — Creates an intake and runs the full pipeline (RFP/RFI/quick_bom) saving artifacts to the DB.
- `app/api/onboarding/route.ts` (100) — exports: `POST` — Updates tenant onboarding state, enforcing the valid state-transition graph.
- `app/api/pipeline/[id]/checkpoint/route.ts` (70) — exports: `POST` — Records a human checkpoint decision (approve/revise/reject) by checkpointId.
- `app/api/pipeline/[id]/rerun/route.ts` (146) — exports: `POST` — Re-runs E2 with new pricingConfig in the background, capturing previous totals for the BoM banner.
- `app/api/review/[id]/route.ts` (54) — exports: `DELETE` — Deletes an estimate and its associated bomDraft / review / agent / intake / export records.
- `app/api/review/route.ts` (137) — exports: `GET`, `POST` — Lists BoM drafts ready for review and records review actions.
- `app/api/settings/route.ts` (85) — exports: `GET`, `PUT` — Tenant settings endpoint (TenantConfig CRUD).
- `app/api/upload/route.ts` (114) — exports: `UploadedFileMeta`, `POST` — Multipart upload handler that persists uploaded files to a tmpdir with allowlist + size cap.

### src/app/estimate/

- `app/estimate/new/chrome.tsx` (104) — exports: `STEPS`, `StepIndicator`, `ActionBar` — Step indicator and action bar UI for the New-Estimate wizard.
- `app/estimate/new/page.tsx` (178) — exports: `NewEstimatePage` (default) — Top-level New-Estimate wizard component, four-step state machine.
- `app/estimate/new/types.ts` (90) — exports: `WizardMode`, `Domain`, `LicenseTier`, `DnaTier`, `SupportTerm`, `ProfitMode`, `ParsedBomLine`, `WizardState`, `initialState`, `parseBomText`, `formatBytes` — Wizard state types and helpers.
- `app/estimate/new/steps/_fields.tsx` (44) — exports: `Field`, `Toggle` — Shared form-field components for the wizard.
- `app/estimate/new/steps/bom-upload.tsx` (136) — exports: `BomUpload` (default) — BoM upload + paste step UI.
- `app/estimate/new/steps/file-upload.tsx` (139) — exports: `FileUpload` (default) — RFP file-upload step with drag/drop and accept list.
- `app/estimate/new/steps/mode-select.tsx` (86) — exports: `ModeSelect` (default) — Mode selection step (RFP / Quick BoM / RFI cards).
- `app/estimate/new/steps/pricing-defaults.tsx` (137) — exports: `PricingDefaults` (default) — Pricing-defaults step (FX, discount, margin, VAT).
- `app/estimate/new/steps/project-details.tsx` (173) — exports: `ProjectDetails` (default) — Project-details step (customer/region/domain/tiers).

### src/app/estimates/

- `app/estimates/page.tsx` (488) — exports: `EstimatesPage` (default) — Estimates list page with search/filter/pagination. **[FLAG: >200 lines]**
- `app/estimates/[id]/hub-components.tsx` (196) — exports: `PipelineStepper`, `CheckpointCards`, `SummaryCards`, `EstimateSubNav`, `HubHeader`, `HubSkeleton` — Shared UI components for the estimate hub page.
- `app/estimates/[id]/hub-mappers.ts` (193) — exports: `StageState`, `StageView`, `CheckpointView`, `SummaryView`, `NavItem`, `ApiResponse`, `HubData`, `buildStages`, `buildCheckpoints`, `buildSummary`, `buildNavItems`, `toHubData` — Mappers from API response into hub view models.
- `app/estimates/[id]/page.tsx` (136) — exports: `EstimateHubPage` (default) — Top-level estimate hub page (pipeline stepper, checkpoints, summaries).
- `app/estimates/[id]/bom/bom-chrome.tsx` (196) — exports: `BomHeader`, `PhaseTabs`, `BomActionBar` — Header / tabs / action-bar UI for the BoM page.
- `app/estimates/[id]/bom/bom-table.tsx` (183) — exports: `BomTable`, `Phase` — Grouped BoM line-item table with per-device rollups.
- `app/estimates/[id]/bom/mappers.ts` (158) — exports: `PhaseStatus`, `PageData`, `toPageData` — Maps API response to BoM page view model.
- `app/estimates/[id]/bom/page.tsx` (186) — exports: `BomPage` (default) — Top-level BoM review page.
- `app/estimates/[id]/bom/review-cards.tsx` (187) — exports: `ValidationSection`, `AnomaliesSection`, `SimilarDealsCard` — Side-panel review cards (validation/anomalies/similar deals).
- `app/estimates/[id]/bom/sections.tsx` (153) — exports: `PricedLine`, `ValidationRow`, `Anomalies`, `Totals`, `SimilarDealView`, `TotalsCards`, `CollapsibleCard`, `fmtSAR`, `fmtUSD`, `categoryClass` — Shared types and formatters for BoM UI.
- `app/estimates/[id]/checkpoint/action-bar.tsx` (41) — exports: `CheckpointAction`, `CheckpointActionBar` — Fixed bottom action bar for checkpoint approve/revise/reject.
- `app/estimates/[id]/checkpoint/checkpoint-skeleton.tsx` (39) — exports: `CheckpointSkeleton` — Loading skeleton for the checkpoint page.
- `app/estimates/[id]/checkpoint/mappers.ts` (193) — exports: `CheckpointData`, `toCheckpointData` — Maps API response into the checkpoint page view model.
- `app/estimates/[id]/checkpoint/page.tsx` (200) — exports: `CheckpointPage` (default) — Top-level E1 checkpoint review page wiring the section components.
- `app/estimates/[id]/checkpoint/sections/common.tsx` (112) — exports: `Card`, `Badge`, `Stat`, `CLASS_BADGE`, `METHOD_BADGE`, `RISK_CAT_BADGE`, `DOC_SEV_BADGE`, `VENDOR_BADGE` — Shared Card/Badge/Stat primitives for checkpoint sections.
- `app/estimates/[id]/checkpoint/sections/deadlines.tsx` (26) — exports: `DeadlinesSection` — Deadlines timeline section of the checkpoint page.
- `app/estimates/[id]/checkpoint/sections/eval-criteria.tsx` (63) — exports: `EvalCriteriaSection` — Evaluation criteria methodology + envelopes display section.
- `app/estimates/[id]/checkpoint/sections/file-classifications.tsx` (87) — exports: `FileClassificationsSection` — File classification override table for the checkpoint page.
- `app/estimates/[id]/checkpoint/sections/missing-docs.tsx` (48) — exports: `MissingDocsSection` — Missing-documents list section.
- `app/estimates/[id]/checkpoint/sections/requirements.tsx` (114) — exports: `RequirementsSection` — Requirements table with mandatory/optional/conditional overrides.
- `app/estimates/[id]/checkpoint/sections/risk-flags.tsx` (57) — exports: `RiskFlagsSection` — Risk flags collapsible list section.
- `app/estimates/[id]/checkpoint/sections/sector-detection.tsx` (28) — exports: `SectorDetectionSection` — Sector detection display section.
- `app/estimates/[id]/checkpoint/sections/types.ts` (99) — exports: `FileType`, `Classification`, `RiskCategory`, `RiskSeverity`, `DocSeverity`, `VendorStatus`, `EvalMethodology`, `ClassifiedFile`, `RequirementRow`, `RequirementStats`, `RiskFlagRow`, `MissingDocRow`, `DeadlineRow`, `SectorView`, `EvalCriteriaView`, `VendorRow` — Type definitions for checkpoint section view models.
- `app/estimates/[id]/checkpoint/sections/vendor-preferences.tsx` (44) — exports: `VendorPreferencesSection` — Vendor preferences table section.
- `app/estimates/[id]/clarifications/clarifications-components.tsx` (159) — exports: `PRIORITY_BADGE`, `PRIORITY_LABEL`, `CATEGORY_LABEL`, `StatsBar`, `FilterBar`, `SelectionActions`, `filterQuestions`, `DEFAULT_FILTERS`, `Filters` — Shared UI primitives and filter helpers for the clarifications page.
- `app/estimates/[id]/clarifications/clarifications-table.tsx` (147) — exports: `QuestionTableProps`, `QuestionTable` — Clarification questions table with expand/collapse.
- `app/estimates/[id]/clarifications/page.tsx` (195) — exports: `ClarificationsPage` (default) — Top-level clarifications review page.
- `app/estimates/[id]/compliance/compliance-chrome.tsx` (106) — exports: `ComplianceHeader`, `ComplianceActionBar` — Header / action-bar UI for the compliance page.
- `app/estimates/[id]/compliance/gap-cards.tsx` (82) — exports: `CollapsibleCard`, `CoverageGapsList`, `OrphanList` — Coverage gaps and orphan-controls cards.
- `app/estimates/[id]/compliance/mappers.ts` (112) — exports: `PageData`, `toPageData` — Maps API response into compliance page view model.
- `app/estimates/[id]/compliance/matrix-table.tsx` (169) — exports: `MatrixTable` — Editable compliance matrix table with status dropdown and expandable notes.
- `app/estimates/[id]/compliance/page.tsx` (172) — exports: `CompliancePage` (default) — Top-level compliance matrix review page.
- `app/estimates/[id]/compliance/sections.tsx` (174) — exports: `Status`, `STATUS_OPTIONS`, `STATUS_TONE`, `EditableRow`, `CoverageGapView`, `OrphanView`, `Filters`, `Stats`, `DEFAULT_FILTERS`, `filterRows`, `StatsBar`, `FilterBar`, `MatrixTable`, `CollapsibleCard`, `CoverageGapsList`, `OrphanList` — Shared types, formatters, and section components for the compliance page.
- `app/estimates/[id]/compliance/use-compliance.ts` (84) — exports: `Edit`, `ComplianceState`, `useCompliance` — React hook managing edit state and filters for the compliance page.
- `app/estimates/[id]/design/chrome.tsx` (198) — exports: `DesignPhase`, `Tab`, `DesignInputValues`, `Shell`, `Tabs`, `ApproveReviseBar`, `DesignInputForm`, `DesignSkeleton`, `PhaseBadge` — Shell, tabs, input form, action bar and skeleton for the E5 design page.
- `app/estimates/[id]/design/design-approach-tab.tsx` (42) — exports: `DesignApproachTab` — Design approach methodology + topology display tab.
- `app/estimates/[id]/design/hld-tab.tsx` (56) — exports: `HLDTab` — HLD sections list + diagram/docx download tab.
- `app/estimates/[id]/design/lld-details-tab.tsx` (98) — exports: `LLDDetailsTab` — LLD details tab showing IP/VLAN plan and component list.
- `app/estimates/[id]/design/lld-document-tab.tsx` (49) — exports: `LLDDocumentTab` — LLD sections list + docx download tab.
- `app/estimates/[id]/design/page.tsx` (183) — exports: `DesignPage` (default) — Top-level E5 design review page.
- `app/estimates/[id]/design/sizing-tab.tsx` (77) — exports: `SizingTab` — Sizing results table + compatibility validation tab.
- `app/estimates/[id]/export/export-components.tsx` (199) — exports: `ArtifactFormat`, `ArtifactRow`, `ArtifactGroup`, `DownloadAllBar` — Artifact download list and download-all action bar for the export page.
- `app/estimates/[id]/export/page.tsx` (209) — exports: `ExportPage` (default) — Top-level export-artifacts page listing every downloadable output. **[FLAG: >200 lines]**
- `app/estimates/[id]/margin/margin-components.tsx` (172) — exports: `TierComparison` (re-exported), `ApprovalBanner`, `FlagsList`, `StrategicJustification`, `ActionBar` — Margin page UI sections.
- `app/estimates/[id]/margin/margin-gauges.tsx` (115) — exports: `MarginGauges` — Radial gauge chart components for margin/attach/FX/discount.
- `app/estimates/[id]/margin/margin-tier-table.tsx` (74) — exports: `TierComparison` — Good/Better/Best margin comparison table.
- `app/estimates/[id]/margin/page.tsx` (196) — exports: `MarginPage` (default) — Top-level margin analysis review page.
- `app/estimates/[id]/pricing/page.tsx` (228) — exports: `PricingPage` (default) — Top-level pricing-rerun page for E2 rerun with new pricing config. **[FLAG: >200 lines]**
- `app/estimates/[id]/pricing/pricing-components.tsx` (331) — exports: `PricingConfig`, `PricingForm`, `ImpactPreview`, `ActionBar`, `DEFAULT_CONFIG`, `validate` — Pricing form fields, live impact preview, and validation logic. **[FLAG: >200 lines]**
- `app/estimates/[id]/proposal/mappers.ts` (32) — exports: `COMMERCIAL_SECTION_ID`, `DEFAULT_VALIDITY_DAYS`, `ProposalPageData`, `toProposalData` — Maps API response into proposal page view model.
- `app/estimates/[id]/proposal/page.tsx` (190) — exports: `ProposalReviewPage` (default) — Top-level E3 proposal review page.
- `app/estimates/[id]/proposal/proposal-chrome.tsx` (106) — exports: `ProposalHeaderProps`, `ProposalHeader`, `ProposalSkeleton`, `ProposalActionBar` — Header, skeleton, and action-bar UI for the proposal page.
- `app/estimates/[id]/proposal/proposal-sidebar.tsx` (99) — exports: `ReviewState`, `ProposalSidebar` — Side navigation listing the 15 proposal sections with method badges.
- `app/estimates/[id]/proposal/section-editor.tsx` (165) — exports: `SectionEditor` — Inline editor for a single proposal section with regenerate / reset / mark-reviewed actions.
- `app/estimates/[id]/proposal/tier-panel.tsx` (150) — exports: `TierPanel` — Good/Better/Best tier comparison panel in the proposal page.
- `app/estimates/[id]/questionnaire/chrome.tsx` (104) — exports: `Shell`, `EmptyState`, `QuestionnaireSkeleton` — Shell, empty state, and skeleton UI for the E4 questionnaire page.
- `app/estimates/[id]/questionnaire/page.tsx` (214) — exports: `QuestionnairePage` (default) — Top-level E4 questionnaire review page. **[FLAG: >200 lines]**
- `app/estimates/[id]/questionnaire/sections.tsx` (152) — exports: `QuestionnaireStatus`, `QuestionnaireActionBar`, `SectionCard`, `StatusBadge` — Per-section accordion cards and status badge for the questionnaire page.
- `app/estimates/[id]/responses/baseline-view.tsx` (67) — exports: `BaselineView` — Requirements baseline display.
- `app/estimates/[id]/responses/chrome.tsx` (199) — exports: `Tab`, `Shell`, `ResponseUploadActionBar`, `ResponseTabs` — Shell, tabs, and upload action bar for the E4 responses page.
- `app/estimates/[id]/responses/page.tsx` (229) — exports: `ResponsesPage` (default) — Top-level E4 responses review page. **[FLAG: >200 lines]**
- `app/estimates/[id]/responses/sections.tsx` (176) — exports: `ResponseStatus`, `ResponsesTable`, `GapsList`, `BaselineSummary` — Responses table, gaps list and baseline-summary sections.

### src/app/ (other top-level pages)

- `app/admin/page.tsx` (138) — exports: `AdminPage` (default) — Tenant admin settings page composing company profile, boilerplate, and pricing-defaults forms.
- `app/admin/sections.tsx` (200) — exports: `CompanyProfile`, `PricingDefaults`, `Card`, `CompanyProfileForm`, `BoilerplateForm`, `PricingForm` — Card and form components for the admin page.
- `app/catalog/cisco-tab.tsx` (177) — exports: `CiscoProduct`, `CiscoTab` (default) — Cisco catalog browser tab reading docs/BOMATIC_Device_Specs.json.
- `app/catalog/fortinet-tab.tsx` (199) — exports: `FortinetTab` (default) — Fortinet catalog browser tab calling the fortinet catalog API.
- `app/catalog/page.tsx` (100) — exports: `CatalogPage` (default) — Catalog page tab container (Cisco / Fortinet) with debounced search.
- `app/customers/page.tsx` (496) — exports: `CustomersPage` (default) — Top-level customers list page with estimate cards. **[FLAG: >200 lines]**
- `app/dashboard/helpers.ts` (169) — exports: `RawStatus`, `LifecycleStage`, `EstimateRow`, `ActivityEntry`, `PipelineProgress`, `lifecycleStage`, `statusLabel`, `pipelineProgress`, `relativeTime`, `buildActivityFeed` — Dashboard status mapping and pipeline-progress derivation helpers.
- `app/dashboard/page.tsx` (487) — exports: `DashboardPage` (default) — Top-level dashboard page. **[FLAG: >200 lines]**
- `app/deals/page.tsx` (60) — exports: `DealsPage` (default) — Deals page placeholder with ComingSoon tabs.
- `app/distributor/page.tsx` (55) — exports: `DistributorPage` (default) — Distributor page placeholder with ComingSoon tabs.
- `app/layout.tsx` (34) — exports: `metadata`, `RootLayout` (default) — Next.js root layout with sidebar, top bar, chat widget, and global providers.
- `app/orders/page.tsx` (55) — exports: `OrdersPage` (default) — Orders page placeholder with ComingSoon tabs.
- `app/page.tsx` (5) — exports: `Home` (default) — Root page that redirects to /dashboard.
- `app/services/page.tsx` (60) — exports: `ServicesPage` (default) — Services page placeholder with ComingSoon tabs.

### src/lib/

- `lib/adapters/auth.ts` (146) — exports: `getAccessToken`, `invalidateToken` — Cisco OAuth ROPC adapter with per-tenant Redis token caching (50-minute TTL).
- `lib/adapters/catalog.ts` (358) — exports: `getItems`, `getMappedServices` — Cisco Catalog v2.0 REST adapter (batched SKU lookup, 24h price cache, 1h EoX cache). **[FLAG: >200 lines]**
- `lib/adapters/customer.ts` (248) — exports: `searchCustomer`, `validateCustomer` — Cisco Customer Registry v2.0 REST adapter. **[FLAG: >200 lines]**
- `lib/adapters/estimate.ts` (478) — exports: `createEstimate` — Cisco Estimate v1.0 SOAP/XML adapter using fast-xml-parser for OAGIS BOD requests. **[FLAG: >200 lines]**
- `lib/agent/agent.ts` (464) — exports: `runAgent`, `AgentResult` — BOMatic AI agent runtime (Anthropic tool-use loop). **[FLAG: >200 lines]**
- `lib/agent/prompts.ts` (99) — exports: `SYSTEM_PROMPT_PARSE`, `SYSTEM_PROMPT_SUGGEST_PATH_A`, `SYSTEM_PROMPT_SUGGEST_PATH_B`, `SYSTEM_PROMPT_SUMMARIZE`, `SYSTEM_PROMPT_QUOTE_DETECT` — System prompts for each agent step.
- `lib/agent/steps/tool-executor.ts` (336) — exports: `ToolContext`, `executeTool` — Tool-call dispatcher for the agent. **[FLAG: >200 lines]**
- `lib/agent/tools.ts` (158) — exports: `AGENT_TOOLS` — Anthropic tool-use schema definitions for the agent.
- `lib/ai/client.ts` (188) — exports: `CallAIConfig`, `callAI` — Single Anthropic API wrapper implementing the retry-once-then-fallback escalation rule with Zod-validated outputs.
- `lib/db/index.ts` (10) — exports: `db`, `Database` — Drizzle ORM database instance backed by node-postgres.
- `lib/db/pipeline-store.ts` (171) — exports: `savePipelineState`, `loadPipelineState`, `loadPipelineStateByIntake`, `saveE1Artifacts`, `saveE2Artifacts`, `saveE3Artifacts`, `loadArtifacts` — Persists pipeline state and per-engine artifacts to the database.
- `lib/db/queries.ts` (265) — exports: `getTenantById`, `getTenantBySlug`, `createIntake`, `createAgentRun`, `createBomDraft`, `updateIntakeStatus`, `getBomDraftsByTenant`, `getBomDraftById`, `updateBomDraft`, `createReview`, `getReviewsByBomDraft`, `appendAuditLog`, `getTenantConfig`, `updateTenantConfig` — Tenant, intake, agent-run, bom-draft, review, audit-log and tenant-config queries. **[FLAG: >200 lines]**
- `lib/db/schema.ts` (312) — exports: `tenants`, `users`, `intakes`, `agentRuns`, `bomDrafts`, `bomLines`, `pipelineRuns`, `reviews`, `tenantCredentials`, `auditLog`, `onboardingEvents`, `exports` — Drizzle ORM table definitions for the entire schema with RLS policies. **[FLAG: >200 lines]**
- `lib/env.ts` (40) — exports: `Env`, `getEnv`, `isMockMode`, `getMockError` — Zod-validated environment variable accessor.
- `lib/export/csv.ts` (151) — exports: `generateCsv` — CSV export matching the Cisco Price Estimate template format.
- `lib/export/xlsx.ts` (243) — exports: `generateXlsx` — XLSX export matching the Cisco Price Estimate template. **[FLAG: >200 lines]**
- `lib/io/compliance-matrix-writer.ts` (189) — exports: `ComplianceMatrixMetadata`, `writeComplianceMatrix` — Writes the compliance matrix as a color-coded XLSX file.
- `lib/io/document-reader.ts` (95) — exports: `DocumentReadResult`, `readDocument`, `readPdf`, `readDocx` — PDF/DOCX/DOC text extraction via pdf-parse + mammoth.
- `lib/io/excel-reader.ts` (42) — exports: `ExcelReadResult`, `readExcelFile` — Excel reader returning all sheets as raw string[][] grids.
- `lib/io/excel-summary-sheet.ts` (29) — exports: `buildSummarySheet` — Builds a BoM-summary worksheet with category subtotals, VAT, and grand total.
- `lib/io/excel-writer.ts` (205) — exports: `BoMExportLine`, `BoMSummaryTotals`, `writeBoMExport` — Generic BoM Excel exporter with line items + summary sheet. **[FLAG: >200 lines]**
- `lib/llm/provider.ts` (275) — exports: `LlmProvider`, `ToolResult`, `getProvider`, `AnthropicLlm`, `GeminiLlm` — LLM provider abstraction (Claude + Gemini) sharing the same tool-use loop. **[FLAG: >200 lines]**
- `lib/middleware/auth.ts` (95) — exports: `AuthSession`, `DEFAULT_DEV_SESSION`, `requireAuth`, `requireRole` — Role-based session extraction middleware.
- `lib/middleware/validate.ts` (186) — exports: `validateBody`, `intakeFormSchema`, `tenantConfigSchema`, `reviewActionSchema` — Zod request-body validation middleware.
- `lib/queue/agent-job.ts` (58) — exports: `AGENT_QUEUE_NAME`, `DEAD_LETTER_QUEUE_NAME`, `AgentJobData`, `agentQueue`, `deadLetterQueue` — BullMQ queue definition for agent jobs with exponential backoff.
- `lib/redis.ts` (12) — exports: `redis`, `tenantKey` — Redis client (ioredis) and tenant-scoped key helper.
- `lib/utils.ts` (6) — exports: `cn` — clsx + tailwind-merge class-name combinator.
- `lib/utils/normalize-model.ts` (17) — exports: `normalizeModel` — Strips trailing license-tier suffixes (-A/-E/-P) from Cisco model strings.
- `lib/validation/adapter.ts` (38) — exports: `SimpleRuleResult`, `adaptSimpleRule` — Adapter wrapping simple `(lines) → result` rules as full ValidationRule objects.
- `lib/validation/engine.ts` (111) — exports: `runValidation`, `summarizeResults` — Deterministic validation engine running all 17 rules against a candidate BoM.
- `lib/validation/rules/antenna-count.ts` (86) — `antennaCountRule` — Validates external-antenna AP antenna-SKU coverage.
- `lib/validation/rules/ap-only.ts` (43) — `checkApOnly` — Validates APs are not deployed without a wireless controller.
- `lib/validation/rules/dna-optout.ts` (31) — `checkDnaOptout` — Marks DNA opt-out SKUs as valid intentional configurations.
- `lib/validation/rules/eox-check.ts` (51) — `EoxLookup`, `stubEoxLookup`, `checkEox` — Simple EoX lookup wrapper.
- `lib/validation/rules/eox.ts` (50) — `eoxRule` — Flags any SKU whose catalog entry has EoX status.
- `lib/validation/rules/fan-count.ts` (102) — `fanCountRule` — Validates switches have the required fan-SKU count per model spec.
- `lib/validation/rules/license-deps.ts` (60) — `checkLicenseDeps` — Validates C9300/C9300L NW+DNA dependency (or DNA opt-out).
- `lib/validation/rules/license.ts` (98) — `licenseRule` — Validates every hardware SKU has an attached license.
- `lib/validation/rules/optics.ts` (79) — `opticsRule` — Validates transceiver count does not exceed chassis SFP/QSFP slot count.
- `lib/validation/rules/poe-budget.ts` (139) — `poeBudgetRule` — Validates PoE-switch budget covers AP PoE draw across the BoM.
- `lib/validation/rules/poe.ts` (98) — `poeRule` — Validates PSU PoE budget covers connected-device PoE class requirements.
- `lib/validation/rules/psu-redundancy.ts` (128) — `psuRedundancyRule` — Validates redundant PSU uses different primary/secondary SKUs.
- `lib/validation/rules/psu.ts` (114) — `psuRule` — Validates ≥2× chassis count of PSU SKUs when redundancy requested.
- `lib/validation/rules/region.ts` (71) — `regionRule` — Validates every SKU is available in the intake's region.
- `lib/validation/rules/sku-exists.ts` (40) — `skuExistsRule` — Validates every proposed SKU exists in the Catalog API response.
- `lib/validation/rules/stacking.ts` (163) — `stackingRule` — Validates stacked switches have required stack-kit + adapters + cables.
- `lib/validation/rules/support.ts` (89) — `supportRule` — Validates hardware SKUs have SmartNet or equivalent support attached.

### src/components/

- `components/shared/AppSidebar.tsx` (92) — exports: `AppSidebar` — Collapsible left navigation sidebar.
- `components/shared/ChatPanel.tsx` (816) — exports: `ChatWidget` — Floating chat widget UI for the BOMatic chat agent. **[FLAG: >200 lines]**
- `components/shared/ComingSoon.tsx` (40) — exports: `ComingSoon` — Reusable "coming soon" placeholder card with phase badge and feature list.
- `components/shared/CommandPalette.tsx` (349) — exports: `CommandPalette`, `useCommandPalette` — Ctrl+K command palette. **[FLAG: >200 lines]**
- `components/shared/GlobalProviders.tsx` (17) — exports: `GlobalProviders` — Wraps the app with global command-palette and keyboard-shortcuts providers.
- `components/shared/KeyboardShortcuts.tsx` (148) — exports: `KeyboardShortcuts`, `useKeyboardShortcutsModal` — Keyboard-shortcuts help modal and global key listener.
- `components/shared/NotificationCenter.tsx` (244) — exports: `NotificationCenter` — Notifications panel with all/estimate/system tabs. **[FLAG: >200 lines]**
- `components/shared/TopBar.tsx` (106) — exports: `TopBar` — Top bar with search, notifications, and user menu.

### src/types/

- `types/bom.ts` (201) — exports: `BomDraftStatus`, `LineDecision`, `LineCategory`, `BomDraft`, `BomLine`, `AgentSummary`, `QuoteAdvisory`, `AgentStep`, `LlmCallLog`, `CiscoCallLog` — BoM draft, line, agent summary, and quote-advisory types. **[FLAG: >200 lines]**
- `types/cisco.ts` (216) — exports: `CiscoTokenRequest`, `CiscoTokenResponse`, `CiscoTokenError`, `CiscoCatalogRequest`, `CiscoCatalogItem`, `CiscoCatalogResponse`, `CiscoCatalogError`, `CiscoMappedServicesResponse`, `CiscoApiCallResult`, `CiscoCustomerSearchRequest`, `CiscoCustomerSearchResponse`, `CiscoCustomerValidateResponse`, `CiscoEstimateCreateRequest`, `CiscoEstimateResponse` — Cisco Commerce API request/response shapes. **[FLAG: >200 lines]**
- `types/index.ts` (5) — exports: re-exports from `./tenant`, `./intake`, `./bom`, `./validation`, `./cisco` — Type barrel file.
- `types/intake.ts` (83) — exports: `IntakePath`, `IntakeSource`, `IntakeStatus`, `Domain`, `Intake`, `IntakeRequirements` — Intake (RFP/RFI request) type definitions.
- `types/tenant.ts` (140) — exports: `OnboardingState`, `UserRole`, `Tenant`, `BrandingConfig`, `StandardsConfig`, `DEFAULT_STANDARDS`, `TenantConfig` — Tenant and credential types for multi-tenant isolation.
- `types/validation.ts` (106) — exports: `ValidationSeverity`, `ValidationRuleId`, `ValidationResult`, `ValidationContext`, `ValidationRule`, `CatalogItemForValidation` — Validation engine type definitions covering all 17 rule IDs.

---

## Section 2 — Planning Docs Inventory

Source directory: `C:/Pre-Sales/bomatic_planning/`

| File | Size (KB) | Summary | Status | Recommendation |
|---|---|---|---|---|
| `AGENTS_Phase1.md` | 9.1 | Rules for AI agents working in the Phase-1 Cisco-only repo: Cisco API guardrails (OAuth ROPC, Catalog batching, Estimate SOAP), AWS infra rules, multi-tenant/tenant_id rules, "complement to CCW" positioning. | **OUTDATED** — Phase-1 Cisco/CCW MVP scope; predates the 5-sweet-spot multi-vendor pivot. | **ARCHIVE** (some Cisco adapter rules still useful, but superseded by CLAUDE.md + Runtime Architecture). |
| `BOMATIC_Build_Architecture.md` | 15.4 | Hub-and-spoke BUILD architecture: the human architect is the hub, Claude Code sessions are spokes in worktrees with skills; defines CLAUDE.md content, file ownership, decomposition workflow. | **CURRENT** — dated 2026-05-09, aligns with current CLAUDE.md and engine layout (E1–E5). | **PRESERVE**. |
| `BOMATIC_Device_Specs.json` | 15.6 | Deterministic device-spec tables (Cisco switches/APs, Fortinet performance matrix, PoE budgets) used at runtime for PoE validation, sizing calculations, and accessory selection. | **CURRENT** — directly powers E2 BoM deterministic validation. | **PRESERVE**. |
| `BOMATIC_Runtime_Architecture.md` | 16.8 | v2.0 runtime architecture: hybrid 65% deterministic / 26% AI-with-validation / 9% pure AI; four runtime patterns (Neurosymbolic, Hybrid Intelligence, Guardrails, Tool-use) and per-engine flows for E1–E5. | **CURRENT** — canonical post-pivot runtime spec, referenced by CLAUDE.md. | **PRESERVE**. |
| `BOMATIC_Testing_Protocol.md` | 12.5 | Testing protocol addendum: three-step escalation rules, three test layers (Unit/Integration/E2E with Vitest + Playwright), fixture catalog (aramco-storage, aramco-dmm7, ncd). | **CURRENT** — drives the active `tests/fixtures/` work. | **PRESERVE**. |
| `Compliance_Frameworks_Reference.md` | 10.4 | Human-readable structured reference for NCA ECC-2:2024, SAMA CSF, and ISO 27001:2022 Annex A — domains, subdomains, control counts, applicability. | **CURRENT** — feeds Sweet Spot #1 compliance matrix. | **PRESERVE**. |
| `E1_RFP_Parser_Process_Flow.md` | 47.1 | Complete 12-step process flow for E1 RFP Parser + Compliance Matrix: per-step implementation class, AI vs code split, failure handling, runtime pattern (Deterministic Guardrails). | **CURRENT** — canonical spec for the E1 engine. | **PRESERVE**. |
| `ISO_27001_2022_Annex_A.json` | 10.9 | Machine-readable ISO/IEC 27001:2022 Annex A: 4 themes, 93 controls, metadata, applicability. | **CURRENT** — runtime lookup data for E1. | **PRESERVE**. |
| `NCA_ECC2_2024.json` | 7.5 | Machine-readable NCA ECC-2:2024 framework: 4 domains, 28 subdomains, 108 controls, 92 subcontrols (KSA government + CNI scope). | **CURRENT** — runtime lookup data for E1. | **PRESERVE**. |
| `SAMA_CSF.json` | 4.9 | Machine-readable SAMA Cyber Security Framework: 4 domains, 6-level maturity model, applicability to SAMA-regulated financial institutions. | **CURRENT** — runtime lookup data for E1. | **PRESERVE**. |
| `architecture.md` | 45.7 | Phase-1 tech stack and system architecture: Next.js 14, RDS Postgres + pgvector, Redis/BullMQ, Cisco adapters, AWS infra; framed around Cisco Catalog/Estimate/Customer Registry. | **OUTDATED** — single-vendor Cisco/CCW MVP architecture; predates multi-vendor pivot (no E1–E5 engines, no BoQ/HLD/LLD). | **ARCHIVE** (tech-stack table partially valid as historical reference, but supplanted by Runtime + Build Architecture). |
| `backlog.md` | 11.0 | Phased backlog (Phase 1–4) centered on Cisco API adapters, Phase-1 chat agent, CCW Estimate generation, and tenant onboarding states. | **OUTDATED** — Phase-1 chat-agent and CCW-centric task list, pre-pivot. | **ARCHIVE**. |
| `mvp-scope.md` | 9.6 | Phased product scope: Phase 1 = Cisco intake → agent → validation → CCW Estimate → review → export; describes the Haiku/Sonnet single-agent loop. | **OUTDATED** — pre-pivot single-vendor scope; current scope is the five sweet spots. | **ARCHIVE**. |
| `prd.md` | 7.4 | PRD: BOMatic positioned as Cisco-presales automation for SIs/VARs/distributors, "complement to CCW, not replacement". | **OUTDATED** — original Cisco-only PRD; pre-pivot positioning. | **ARCHIVE** (keep for historical product context). |
| `progress.md` | 10.4 | Phase-1 progress log: "Phase 1 build complete (code written, needs testing)", lists 12 build steps for the Cisco/CCW MVP. | **OUTDATED** — tracks Phase-1 chat-agent build, not the current engines. | **ARCHIVE**. |
| `user-flow.md` | 13.3 | Eight user flows for the Phase-1 product: 10-state Cisco tenant onboarding (SAMT, apiconsole.cisco.com, Hello API), email intake, BoM review, CCW Estimate send. | **OUTDATED** — flows are Cisco-CCW-specific; not aligned with E1–E5 sweet-spot UX. | **ARCHIVE**. |
| `Data Dictionary/BOMATIC_Data_Dictionary.xlsx` | 29.3 | Binary Excel data dictionary (not directly readable); presumably enumerates BOMATIC entities/fields. Dated 2026-05-09, matching the post-pivot architecture set. | **CURRENT** (inferred from date). | **PRESERVE**. |

Notes:
- "Current" docs cluster around 2026-05-09 and describe the 5-sweet-spot architecture.
- "Outdated" docs cluster around 2026-04-29 and describe the pre-pivot Phase-1 Cisco/CCW chat-agent MVP.

---

## Section 3 — Test Inventory

### 3.1 Test File Inventory

**Total: 110 test files, 1,489 tests (1,486 passing, 3 failing).**

#### tests/adapters/ (3 files, 23 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/adapters/catalog.test.ts | 11 | Cisco catalog adapter in mock mode (getItems, getMappedServices) |
| tests/adapters/customer.test.ts | 7 | Cisco customer registry adapter (searchCustomer, validateCustomer) |
| tests/adapters/estimate.test.ts | 5 | Cisco estimate adapter in mock mode |

#### tests/api/ (7 files, 64 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/api/auth-tenant.test.ts | 5 | requireAuth + tenant-isolation spot checks |
| tests/api/chat-route.test.ts | 3 | Chat route has no hardcoded creds |
| tests/api/e4-routes.test.ts | 27 | E4 questionnaire + responses route handlers |
| tests/api/e5-routes.test.ts | 21 | E5 design route + design documents route handlers |
| tests/api/estimates/proposal.test.ts | 3 | GET /api/estimates/[id]/proposal |
| tests/api/pipeline/checkpoint.test.ts | 5 | POST /api/pipeline/[id]/checkpoint |

#### tests/coordinator/ (7 files, 65 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/coordinator/intake-file-loader.test.ts | 7 | enrichFileContent (PDF/DOCX extraction) |
| tests/coordinator/logger.test.ts | 4 | Pipeline log entry / getLogs / clearLogs |
| tests/coordinator/pipeline.test.ts | 12 | runPipeline orchestration across engines |
| tests/coordinator/pipeline-rfi.test.ts | 9 | runPipeline RFI integration |
| tests/coordinator/pipeline-e3-rfi.test.ts | 8 | pipeline-e3 RFI mappers |
| tests/coordinator/router.test.ts | 10 | getEngineSequence / getNextEngine routing |
| tests/coordinator/types.test.ts | 15 | EngineInput / EngineOutput / PipelineState type construction |

#### tests/validation/ (7 files, 94 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/validation/rules.test.ts | 47 | All 17 deterministic validation rules + Engine full-run |
| tests/validation/adapter.test.ts | 6 | adaptSimpleRule wrapper |
| tests/validation/eox-check.test.ts | 8 | checkEox rule |
| tests/validation/license-deps.test.ts | 11 | checkLicenseDeps rule |
| tests/validation/poe-budget.test.ts | 8 | PoE budget rule |
| tests/validation/psu-redundancy.test.ts | 6 | PSU redundancy via SKU check |
| tests/validation/stacking.test.ts | 8 | Stacking rule via device-specs JSON |

#### tests/engines/e1/ + tests/e1/ (12 files, 251 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/engines/e1/file-classifier.test.ts | 40 | File classification cascade |
| tests/engines/e1/missing-doc-detector.test.ts | 35 | Missing-doc detector |
| tests/engines/e1/requirements-extractor.test.ts | 14 | Requirements extractor (deterministic + AI fallback) |
| tests/engines/e1/eval-criteria-analyzer.test.ts | 10 | Evaluation criteria analyzer |
| tests/engines/e1/compliance-matrix.test.ts | 8 | Compliance matrix Step 10 |
| tests/engines/e1/clarification-generator.test.ts | 11 | Clarification question generator |
| tests/engines/e1/orchestrator.test.ts | 2 | runE1 orchestrator end-to-end |
| tests/e1/sector-detector.test.ts | 24 | detectSector across 3 methods + default |
| tests/e1/legal-trap-flagger.test.ts | 22 | extractDeadlines + flagLegalTraps |
| tests/e1/framework-selector.test.ts | 19 | Framework selector logic |
| tests/e1/vendor-extractor.test.ts | 15 | Vendor extraction from 3 sources |
| tests/e1/xref-linker.test.ts | 26 | linkToTPSection xref mapping |

#### tests/engines/e2/ (18 files, 355 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/engines/e2/pricing-engine.test.ts | 68 | E2 pricing engine (FX, partner, deal, margin, VAT) |
| tests/engines/e2/licensing-calculator.test.ts | 31 | Licensing calculator |
| tests/engines/e2/accessory-selector.test.ts | 31 | Accessory selector |
| tests/engines/e2/cables-spares-calculator.test.ts | 25 | Cables + spares quantity calculator |
| tests/engines/e2/type-b-nrm2.test.ts | 25 | Type-B NRM2 BoQ parser |
| tests/engines/e2/type-e-telecom.test.ts | 24 | Type-E telecom BoQ parser |
| tests/engines/e2/fortinet-catalog.test.ts | 22 | Fortinet local catalog |
| tests/engines/e2/type-d-bom.test.ts | 21 | Type-D BoM parser |
| tests/engines/e2/type-c-vendor-quote.test.ts | 19 | Type-C vendor quote parser |
| tests/engines/e2/type-a-ariba.test.ts | 16 | Type-A Aramco Ariba parser |
| tests/engines/e2/boq-detector.test.ts | 13 | BoQ type detector |
| tests/engines/e2/support-selector.test.ts | 12 | Support SKU selector |
| tests/engines/e2/orchestrator.test.ts | 10 | E2 orchestrator |
| tests/engines/e2/similar-deal-finder.test.ts | 10 | Similar-deal finder |
| tests/engines/e2/boq-template-filler.test.ts | 9 | Format-preserving BoQ template filler |
| tests/engines/e2/bom-anomaly-detector.test.ts | 8 | BoM anomaly detector |
| tests/engines/e2/fuzzy-sku-matcher.test.ts | 5 | Fuzzy SKU matcher |
| tests/engines/e2/type-a-ariba-integration.test.ts | 5 | Type-A Ariba integration test |

#### tests/engines/e3/ (13 files, 178 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/engines/e3/orchestrator.test.ts | 18 | E3 orchestrator |
| tests/engines/e3/ai-sections/scope-customizer.test.ts | 18 | AI scope customizer |
| tests/engines/e3/ai-sections/implementation.test.ts | 18 | AI implementation section |
| tests/engines/e3/section-generators.test.ts | 17 | Deterministic proposal section generators |
| tests/engines/e3/pricing-tiers.test.ts | 15 | Pricing tier generator |
| tests/engines/e3/boilerplate-kb.test.ts | 14 | Boilerplate knowledge-base loader |
| tests/engines/e3/margin-analyzer.test.ts | 12 | Margin analyzer |
| tests/engines/e3/ai-sections/executive-summary.test.ts | 11 | AI executive summary |
| tests/engines/e3/ai-sections/proposed-solution.test.ts | 11 | AI proposed-solution section |
| tests/engines/e3/financial-proposal-writer.test.ts | 9 | Financial proposal DOCX writer |
| tests/engines/e3/docx-generator.test.ts | 8 | DOCX generator |
| tests/engines/e3/ai-sections/cover-letter.test.ts | 8 | AI cover letter |
| tests/engines/e3/types.test.ts | 7 | PROPOSAL_SECTIONS catalog (15 sections) |

#### tests/engines/e4/ (12 files, 137 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/engines/e4/orchestrator.test.ts | 20 | E4 orchestrator |
| tests/engines/e4/questionnaire-generator.test.ts | 17 | Questionnaire generator |
| tests/engines/e4/requirements-baseline-builder.test.ts | 16 | Requirements baseline + gap analyzer |
| tests/engines/e4/project-type-detector.test.ts | 15 | Project type detector |
| tests/engines/e4/types.test.ts | 14 | E4 types |
| tests/engines/e4/emphasis-matrix.test.ts | 13 | Emphasis matrix |
| tests/engines/e4/questionnaire-template.test.ts | 12 | Questionnaire template |
| tests/engines/e4/response-parser.test.ts | 12 | Response parser |
| tests/engines/e4/question-customizer.test.ts | 5 | Question customizer |
| tests/engines/e4/free-text-interpreter.test.ts | 5 | Free-text interpreter |
| tests/engines/e4/project-type-ai.test.ts | 4 | Project-type AI |
| tests/engines/e4/gap-detector-ai.test.ts | 4 | Gap detector AI |

#### tests/engines/e5/ (17 files, 224 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/engines/e5/sizing-calculator.test.ts | 27 | Sizing calculator |
| tests/engines/e5/types.test.ts | 25 | E5 types |
| tests/engines/e5/methodology-selector.test.ts | 19 | Methodology selector |
| tests/engines/e5/port-map-generator.test.ts | 19 | Port-map generator |
| tests/engines/e5/ip-vlan-planner.test.ts | 18 | IP/VLAN planner |
| tests/engines/e5/orchestrator.test.ts | 17 | E5 orchestrator |
| tests/engines/e5/topology-recommender.test.ts | 13 | Topology recommender |
| tests/engines/e5/qos-policy-generator.test.ts | 13 | QoS policy generator |
| tests/engines/e5/cable-schedule-generator.test.ts | 12 | Cable schedule generator |
| tests/engines/e5/lld-narrative-generator.test.ts | 11 | LLD narrative generator |
| tests/engines/e5/compatibility-validator.test.ts | 10 | Compatibility validator |
| tests/engines/e5/migration-selector.test.ts | 10 | Migration approach selector |
| tests/engines/e5/rack-elevation-generator.test.ts | 9 | Rack elevation generator |
| tests/engines/e5/hld-narrative-generator.test.ts | 7 | HLD narrative generator |
| tests/engines/e5/diagram-generator.test.ts | 7 | Diagram generator |
| tests/engines/e5/component-list-builder.test.ts | 6 | Component list builder |
| tests/engines/e5/hld-docx-generator.test.ts | 6 | HLD DOCX generator |
| tests/engines/e5/lld-docx-generator.test.ts | 4 | LLD DOCX generator |

#### tests/lib/ (6 files, 60 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/lib/ai/client.test.ts | 9 | callAI client |
| tests/lib/db/pipeline-store.test.ts | 12 | pipeline-store DB layer |
| tests/lib/io/document-reader.test.ts | 13 | readDocument / readDocx / readPdf |
| tests/lib/io/excel-reader.test.ts | 7 | readExcelFile |
| tests/lib/io/excel-writer.test.ts | 8 | writeBoMExport |
| tests/lib/io/compliance-matrix-writer.test.ts | 9 | writeComplianceMatrix |
| tests/lib/utils/normalize-model.test.ts | 12 | normalizeModel |

#### tests/integration/ (3 files, 19 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/integration/e1-real-extraction.test.ts | 5 | E1 real PDF/DOCX/XLSX extraction (fixtures) |
| tests/integration/e2-full-pipeline.test.ts | 4 | E2 full pipeline (3-device BoM, no AI) |
| tests/integration/e2-validation-check.test.ts | 10 | E2 + 17 validation rules across 3 scenarios |

#### tests/ui/ (3 files, 19 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/ui/design-page.test.tsx | 8 | DesignPage (skeleton, tabs, HLD flows) |
| tests/ui/questionnaire-page.test.tsx | 5 | QuestionnairePage (skeleton, approve, revision) |
| tests/ui/responses-page.test.tsx | 6 | ResponsesPage (table, tabs, upload) |

#### tests/fixtures/ (1 file, 8 tests)
| Path | Tests | Covers |
|------|-------|--------|
| tests/fixtures/loader.test.ts | 8 | loadFixture('aramco-storage') |

### 3.2 Test Run Results

- **Command:** `npx vitest run --reporter=verbose`
- **Total test files:** 110
- **Total tests:** 1,489
- **Passing:** 1,486
- **Failing:** 3
- **Duration:** 18.35s (transform 12.50s, setup 44.66s, collect 27.23s, tests 16.49s, environment 4.80s, prepare 21.57s)

**Failing tests (all in `tests/integration/e1-real-extraction.test.ts`):**

1. `E1 Real File Integration > Test 1 — PDF extraction feeds E1` — AssertionError at line 59: `expected 0 to be greater than 0`.
2. `E1 Real File Integration > Test 2 — DOCX extraction feeds E1` — AssertionError at line 86: `expected 0 to be greater than 0`.
3. `E1 Real File Integration > Test 4 — Mixed PDF + DOCX + XLSX package processes end-to-end` — AssertionError at line 135: `expected 0 to be greater than 0`.

Root cause is the same in all three: the PDF/DOCX fixture files were moved out of `tests/fixtures/rfp/` and into `tests/fixtures/boq/` (see git status — `Aramco_6000181983_ Clarification Questions - STCS_R2.docx` and `Technical Bid Requirements.pdf` deleted from `rfp/`, added to `boq/`). The integration test's `FIXTURE_PDF` / `FIXTURE_DOCX` paths still point at the old `rfp/` location, so `enrichFileContent` reads no bytes.

### 3.3 Source Modules Without Direct Test Coverage

Files with no 1:1 named test (many exercised indirectly via orchestrator or route aggregate tests, noted in parens).

**Engines — no direct test:**
- `src/engines/e1/compliance-matrix-controls.ts`, `compliance-matrix-status.ts`, `eval-criteria-sheet.ts`, `eval-criteria-types.ts`, `orchestrator-helpers.ts`, `orchestrator-types.ts`
- `src/engines/e2/bom-workbook-writer.ts`, `boq-types.ts`, `fill-from-priced.ts`, `orchestrator-helpers.ts`, `parsers/type-a-cols.ts`, `revenue-split.ts`, `vat.ts`
- `src/engines/e3/markdown-to-docx.ts`, `orchestrator-ai-inputs.ts`, `orchestrator-helpers.ts`, `orchestrator-types.ts`, `section-enrichers.ts`, `section-helpers.ts`
- `src/engines/e4/orchestrator-helpers.ts`, `orchestrator-types.ts`, `phase1.ts`, `phase2.ts`
- `src/engines/e5/design-docx-helpers.ts`, `device-specs.ts`, `diagram-xml.ts`, `e5-phase1.ts`, `e5-phase2.ts`, `hld-deterministic-sections.ts`, `lld-deterministic-sections.ts`, `orchestrator-helpers.ts`, `orchestrator-types.ts`

**Coordinator — no direct test:**
- `src/coordinator/intake-pricing.ts`, `intake-to-e2.ts`, `pipeline-e1.ts`, `pipeline-e2.ts`, `pipeline-e3.ts`, `pipeline-e4.ts`, `pipeline-e5.ts`, `pipeline-state.ts`

**Lib — no direct test (validation rule files covered indirectly via `rules.test.ts`):**
- `src/lib/adapters/auth.ts`
- `src/lib/agent/*` (agent.ts, prompts.ts, steps/tool-executor.ts, tools.ts)
- `src/lib/db/index.ts`, `queries.ts`, `schema.ts`
- `src/lib/env.ts`, `utils.ts`, `redis.ts`
- `src/lib/export/csv.ts`, `xlsx.ts`
- `src/lib/io/excel-summary-sheet.ts`
- `src/lib/llm/provider.ts`
- `src/lib/middleware/auth.ts`, `validate.ts`
- `src/lib/queue/agent-job.ts`
- All `src/lib/validation/rules/*.ts` (covered via `rules.test.ts` + per-rule tests for eox/license-deps/poe-budget/psu-redundancy/stacking)

**API routes — no direct test (some exercised by aggregated route tests):**
- `admin`, `catalog/fortinet`, `chat/save`, `estimates` (list), `estimates/[id]`, `estimates/[id]/_e4-state.ts`, `_e5-state.ts`, `compliance`, `compliance/export`, `design/_actions.ts`, `download`, `export`, `intake`, `onboarding`, `pipeline/[id]/rerun`, `review`, `review/[id]`, `settings`, `upload`

---

## Section 4 — Type System

**Note:** `src/engines/e1/types.ts` and `src/engines/e2/types.ts` do not exist. E1 exposes types via `orchestrator-types.ts`; E2 input/output types live in `orchestrator.ts` itself with line-item types in `orchestrator-helpers.ts` and BoQ types in `boq-types.ts`.

### 4.1 Coordinator types — `src/coordinator/types.ts`

Discriminated/string-union scalars:
- `IntakeMode = 'rfp' | 'rfi' | 'quick_bom'` (L3)
- `EngineId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5'` (L5)
- `CheckpointStatus = 'pending' | 'approved' | 'revision_requested' | 'rejected'` (L7-11)

Per-engine artifact shapes (path-strings / status flags; engines write paths/JSON-blobs, downstream engines read them back):
- `E1Artifacts` (L14-20): `complianceMatrix?: string`, `requirementsBaseline?: string`, `riskFlags?: string[]`, `vendorList?: string[]`, `sector?: string`
- `E2Artifacts` (L22-30): `bomWorkbook?: string`, `filledClientBoq?: string`, `distributorExport?: string`, `pricingSummary?: string`, `validationStatus?: "validated"|"unvalidated"|"partial"`, `validationWarnings?: string[]`
- `E3Artifacts` (L32-36): `technicalProposal?: string`, `financialProposal?: string`, `submissionPdf?: string`
- `E4Artifacts` (L38-41): `questionnaire?: string`, `requirementsBaseline?: string`
- `E5Artifacts` (L43-51): `hldDocument?: string`, `lldDocument?: string`, `diagrams?: string[]`, `ipVlanPlan?: string`, `componentList?: string`, `designSummary?: string` (JSON of `{ designApproach, sizing, hldSections }` for E3 grounding)

**ArtifactRegistry shape** (L54-60) — fixed-key index keyed by `EngineId` (not a discriminated union):
```ts
interface ArtifactRegistry {
  e1: E1Artifacts; e2: E2Artifacts; e3: E3Artifacts;
  e4: E4Artifacts; e5: E5Artifacts;
}
```
Each slot always present (initialized to `{}` in `createInitialState`); engines mutate only their own slot.

Other coordinator types:
- `Checkpoint` (L62-70): `id`, `engine`, `label`, `status`, `revisionsUsed`, `revisionNotes?`, `decidedAt?: Date`
- `EngineCall` (L72-81): `id`, `engine`, `step`, `model`, `startedAt`, `completedAt?`, `retryCount`, `outcome: 'pass'|'flagged'|'failed'`
- `PipelineTotalsSnapshot` (L83-91): `hardwareTotal`, `softwareTotal`, `serviceTotal`, `subscriptionTotal`, `grandTotalExVat`, `vatAmount`, `grandTotalIncVat`
- `PipelineState` (L93-111): `id`, `opportunityId`, `intakeId?`, `mode`, `currentEngine`, `artifacts`, `checkpoints[]`, `engineCalls[]`, `previousTotals?`, `timestamps`, `error?`
- `EngineInput` (L113-118): `engine`, `pipelineState`, `inputData: Record<string, unknown>`, `revisionNotes?`
- `EngineOutput<E extends EngineId>` (L120-125): `engine: E`, `artifacts: ArtifactRegistry[E]`, `warnings: string[]`, `error?: string`

### 4.2 E1 — `src/engines/e1/orchestrator-types.ts`

- `E1InputFile` (L15-18): `path: string`, `content?: string`
- `E1Input` (L20-25): `files: E1InputFile[]`, `clientName?`, `country?`, `solutionContext?`
- `E1ClassifiedFile extends FileClassification` (L27-30): adds `path`, `filename`
- `E1Stats` (L32-37): `totalFiles`, `totalRequirements`, `mandatoryCount`, `criticalRisks`
- `E1Output` (L39-52): `fileClassifications`, `missingDocuments`, `requirements`, `riskFlags`, `deadlines`, `evalCriteria`, `vendorPreferences`, `sectorDetection`, `frameworks`, `complianceMatrix`, `clarifications`, `stats`

### 4.3 E2 — `src/engines/e2/orchestrator.ts` + helpers

From `orchestrator.ts`:
- `E2DeviceConfig` (L36-45): `redundantPsu?`, `rackMount?`, `powerCordType?`, `dnaTier`, `networkTier`, `licenseTerm: 3|5|7`, `supportCriticality`, `vendor: 'cisco'|'fortinet'`
- `E2Device` (L46): `{ model, qty, config }`
- `E2PricingConfig` (L47-50): `fxRate`, `partnerDiscountPct`, `dealRegDiscountPct`, `profitMode: 'margin'|'markup'`, `profitPct`, `vatRate`, `country`
- `E2ProjectContext` (L51-54)
- `E2Input` (L55-68): `filePath?`, `parsedLines?: BoQLineItem[]`, `devices`, `pricingConfig`, `projectContext?`, `historicalDeals?`, `listPrices?`, `outputDir?`, `emitFiles?`
- `E2Output` (L69-84): `bom: PricedBomLine[]`, `validationResults`, `anomalies`, `similarDeals?`, `totals: E2Totals`, `exportPath?`, `filledClientBoqPath?`, `validationStatus`, `validationWarnings`

From `orchestrator-helpers.ts`:
- `RawLine` (L9-13): `sku`, `description`, `qty`, `category`, `unitListUsd?`
- `PricedBomLine` (L15-19): `id`, `lineNumber`, `sku`, `description`, `qty`, `category`, `unitListUsd`, `unitListSar`, `unitSellPrice`, `extendedSell`, `vatAmount`, `totalWithVat`
- `E2Totals` (L21-24): `hardwareTotal`, `softwareTotal`, `serviceTotal`, `subscriptionTotal`, `grandTotalExVat`, `vatAmount`, `grandTotalIncVat`
- `E2ValidationStatus = "validated"|"unvalidated"|"partial"` (L97)

### 4.4 E2 BoQ types — `src/engines/e2/boq-types.ts`

`BoQType` enum (L3-11): `TYPE_A_ARIBA`, `TYPE_B_NRM2`, `TYPE_B_NRM2_ADDOMMIT`, `TYPE_C_VENDOR_QUOTE`, `TYPE_D_BOM_NO_PRICE`, `TYPE_E_TELECOM`, `TYPE_UNKNOWN`.

`BoQLineItem` (Zod-inferred, L13-29) — explicit field list:

| Field | Type | Optional |
|---|---|---|
| `itemNumber` | `string` | no |
| `description` | `string` | no |
| `qty` | `number` | no |
| `unit` | `string` | no |
| `unitPrice` | `number` | yes |
| `totalPrice` | `number` | yes |
| `currency` | `string` | yes |
| `partNumber` | `string` | yes |
| `manufacturer` | `string` | yes |
| `leadTime` | `string` | yes |
| `serviceDuration` | `string` | yes |
| `section` | `string` | yes |
| `metadata` | `Record<string,string>` | yes |

### 4.5 E3 — `src/engines/e3/types.ts` + `orchestrator-types.ts`

From `types.ts`:
- String unions: `GenerationMethod = 'deterministic'|'ai'|'semi'`, `ProposalStatus = 'draft'|'generated'|'reviewed'|'approved'`, `TierName = 'good'|'better'|'best'`, `ProposalMode = 'rfp'|'rfi'`, `ProposalLanguage = 'en'|'ar'|'bilingual'`, `ApprovalLevel = 'account_manager'|'presales_lead'|'country_manager'|'regional_md'`, `MarginFlagType`, `MarginFlagSeverity = 'info'|'warning'|'error'`.
- `ProposalSection` (L29-36): `id`, `title`, `slug`, `content`, `generationMethod`, `status`
- `ProposalMetadata` (L38-48): `customerName`, `projectName`, `estimateId`, `date`, `validityDays`, `country`, `currency`, `tenantName`, `tenantLogo?`
- `PricingTierTotals`, `PricingTierBomLine`, `PricingTier` (L50-73)
- `MarginFlag` (L75-81), `MarginAnalysis` (L83-94)
- `ProposalConfig`, `ProposalSectionSpec`, plus const `PROPOSAL_SECTIONS` (15 sections, ids 0-14)

From `orchestrator-types.ts`:
- `E3CostStack` (L10-18): `hardwareCost`, `softwareCost`, `servicesCost`, `subscriptionCost`, `travelCost?`, `trainingCost?`, `contingency?`
- `E3Requirement`, `E3ComplianceStats`, `E3ComplianceMatrix`, `E3SectorDetection`, `E3VendorPreference`, `E3RiskFlag`
- `E3E1Data` (L55-64): `requirements`, `stats`, `complianceMatrix`, `riskFlags`, `evalCriteria`, `vendorPreferences`, `sectorDetection`, `clarifications`
- `E3BomLine` (L66-73), `E3Totals` (L75-83) — identical to `E2Totals`
- `E3E2Data` (L85-91): `bom: E3BomLine[]`, `totals: E3Totals`, `validationResults: unknown[]`, `validationStatus?`
- `E3BaselineEntry`, `E3RequirementsBaseline`, `E3E4Data` (mirrors E4 baseline)
- `E3DesignDevice`, `E3DesignSizing`, `E3DesignApproach`, `E3HLDSection`, `E3E5Data` (mirrors E5 design)

**`E3Input`** (L148-166):

| Field | Type | Notes |
|---|---|---|
| `metadata` | `ProposalMetadata` | required |
| `e1` | `E3E1Data` | required |
| `e2` | `E3E2Data` | required |
| `costStack` | `E3CostStack` | required |
| `tierConfig?` | `TierConfig` | optional |
| `outputDir` | `string` | required |
| `contactName?` | `string` | optional |
| `timeline?` | `string` | optional |
| `siteCount?` | `number` | optional |
| `migrationApproach?` | `'cutover'\|'parallel'\|'phased'` | optional |
| `keyStrengths?` | `string[]` | optional |
| `e4?` | `E3E4Data` | optional — enriches requirements section |
| `e5?` | `E3E5Data` | optional — enriches proposed_solution + implementation |
| `emitFiles?` | `boolean` | when false, skip docx/xlsx (tests) |

- `E3Output` (L168-174): `sections`, `tiers`, `margin`, `proposalPath?`, `financialPath?`

### 4.6 E4 — `src/engines/e4/types.ts` + `orchestrator-types.ts`

From `types.ts`:
- `ProjectType` (10-value union: `campus_refresh`, `greenfield_campus`, `sd_wan`, `dc_modernization`, `wireless_deployment`, `security_upgrade`, `branch_rollout`, `cloud_connectivity`, `ot_network`, `general`)
- `EmphasisLevel`, `QuestionPriority`, `QuestionResponseType`
- `Question` (L30-38): `id`, `text`, `section`, `priority`, `responseType`, `options?`, `helpText?`
- `QuestionnaireSection` (L40-45): `id`, `title`, `description`, `questions`
- `ClientResponse` (L49-54): `questionId`, `answer: string|string[]|number|null`, `confidence?`, `source: ResponseSource`
- `BaselinePriority = 'critical'|'high'|'medium'|'low'`
- `BaselineEntry` (L58-64): `id`, `text`, `source`, `priority`, `validated: boolean`
- `RequirementsBaseline` (L67-73): five categories — `business`, `functional`, `nonFunctional`, `constraints`, `assumptions`
- `VagueAnswer`, `GapAnalysis`, `E4Config`
- Const `QUESTIONNAIRE_SECTIONS` — 6 sections A–F (Business Context, Current-State Network, Applications & Traffic, Future-State Requirements, Compliance & Regulatory (MENA), Commercial & Delivery)

From `orchestrator-types.ts`:
- `CheckpointDecision`, `CheckpointCallback`
- `E4InputData` (L21-40): `clientName`, `country`, `sector?`, `description?`, `existingVendors?`, `projectType?`, `ambiguous?`; phase-2 triggers — `clientResponses?`, `responseFilePath?`, `responseText?`, `questions?`, `projectContext?`; `onCheckpoint?`

### 4.7 E5 — `src/engines/e5/types.ts` + `orchestrator-types.ts`

From `types.ts`:
- `TopologyPattern` (6-value): `two_tier_collapsed_core`, `three_tier_core_dist_access`, `fat_tree_superpod`, `slingshot_dragonfly`, `hub_and_spoke_gpon`, `ot_it_segmented`
- `DesignFramework` (5-value): `ppdioo`, `togaf_adm`, `cisco_safe`, `nist_sp800_207`, `itil_v4`
- `DesignApproach` (L25-32): `methodology: 'ppdioo'`, `approach: 'top_down'|'bottom_up'|'hybrid'`, `frameworks`, `topologyPattern`, `vendor`, `projectType`
- `SizingInput` (L33-42), `DeviceSelection` (L43-49), `SizingResult` (L50-57)
- `VlanEntry`, `SubnetEntry`, `VrfEntry`, `IPVlanPlan`
- `PortAssignment`, `PortMap`, `CableScheduleEntry`
- `QoSClass`, `QoSPolicy`
- `MigrationPhase`, `MigrationApproach`
- `RackDevice`, `RackElevation`
- `HLDSection`, `LLDSection`, `ComponentListItem`
- `ValidationIssue`, `CompatibilityResult`
- `E5Config` (L173-178): `maxRevisions`, `vendor`, `hldSectionCount: 12`, `lldSectionCount: 21`

From `orchestrator-types.ts`:
- `E5CheckpointId = 'e5-design-approach'|'e5-hld'|'e5-lld'`
- `E5Phase = 'hld'|'lld'|'full'`
- `E5InputData` (L24-57): `requirementsBaseline: any`, `vendor`, `customerName`, `projectName`, `projectType`, `isGreenfield?`, `siteCount`, `buildingCount`, `portCount`, `userCount`, `bandwidthGbps`, ~13 boolean feature flags (`hasOT`, `hasHPC`, `hasGPON`, `hasWireless`, `hasVoice`, `hasDC`, `hasGuest`, `isNvidia`, `hasVideo`, `hasRedundancy`), `idfRoomsPerFloor?`, `baseSubnet?`, `vrfEnabled?`, `downTimeToleranceHours?`, `phase?`, `onCheckpoint?`, `hldHandoff?`
- `Phase1Handoff` (L66-71): `designApproach`, `topology`, `sizing`, `compatibility`

---

## Section 5 — Pipeline Wiring

### 5.1 Engine sequences per mode — `src/coordinator/router.ts`

```ts
const SEQUENCES: Record<IntakeMode, EngineId[]> = {
  rfp:       ['e1', 'e2', 'e3'],
  rfi:       ['e4', 'e5', 'e2', 'e3'],
  quick_bom: ['e2', 'e3'],
};
```
- `getEngineSequence(mode)` returns the array above (L9-11).
- `getNextEngine(state)` (L17-25) scans the sequence and returns the first engine whose artifact slot has no defined fields, else `'complete'`. Resumption helper; not used by the main `runPipeline` loop.

### 5.2 Pipeline state — `src/coordinator/pipeline-state.ts`

- `ENGINE_CHECKPOINTS` (L10-22) — per-engine checkpoint definitions:
  - **E1**: `e1-requirements`, `e1-compliance`
  - **E2**: `e2-sku-confirmation`, `e2-pricing-review`
  - **E3**: `e3-proposal`
  - **E4, E5**: empty (E4/E5 handle their own internal checkpoints via `onCheckpoint` callbacks)
- `createInitialState(opportunityId, mode)` (L24-36) — UUID id, `currentEngine` = first in sequence, `artifacts: { e1:{}, e2:{}, e3:{}, e4:{}, e5:{} }`, empty checkpoints/engineCalls, fresh timestamps.
- `startEngineCall(state, engine, retry)` (L38-51) — pushes an `EngineCall` onto `state.engineCalls`, logs via `logEntry`.
- `runCheckpoint(state, engine, revision, cb?)` (L55-80) — looks up `ENGINE_CHECKPOINTS[engine]`. If empty (E4/E5), returns `'approved'` immediately. Otherwise invokes `cb` (default `'approved'`), upserts a `Checkpoint` row per def with the decision.
- `logEvent` (L82-92) — thin wrapper over `logEntry`.

### 5.3 Engine loop — `src/coordinator/pipeline.ts`

`runPipeline(input: PipelineInput): Promise<PipelineResult>` (L75-119):

1. Create initial state (`createInitialState`). Resolve sequence via `getEngineSequence(input.mode)`.
2. **Outer `for` loop** over each engine in the sequence (L82). Sets `state.currentEngine`.
3. **Inner `while` loop** handles revisions: starts an `EngineCall`, awaits `runEngine`. On throw, marks `call.outcome='failed'`, captures the error string, logs it (loop continues to the checkpoint step). On success, `call.outcome='pass'`.
4. Calls `runCheckpoint`. If `'revision_requested'` and `revisions < MAX_REVISIONS (3)`, increments and re-runs the same engine. Otherwise breaks the inner loop.
5. If `'rejected'`, breaks the outer loop (skip remaining engines).
6. Outer `try/catch` catches unrecoverable errors (sets `state.error`). After the loop, if no `state.error` but a `lastEngineError` was captured, that becomes `state.error`. Sets `completedAt` and returns `{ state, e1Output?, e2Output?, e3Output?, e4Output?, e5Output? }`.

`runEngine(engine, input, state, out)` (L121-142) — switch on `engine`:
- **e1**: `out.e1Output = await runE1(buildE1Input(input))`; `state.artifacts.e1 = toE1Artifacts(out.e1Output)`.
- **e2**: `out.e2Output = await runE2(buildE2Input(input, out.e1Output, state.artifacts.e5))`. E2 reads `state.artifacts.e5` (component list), so in RFI mode where E5 already ran, devices come from E5.
- **e3**: delegates to `runE3Stage` (L144-161). Skipped (with warning log) when `e2` output or `pricingConfig` is missing. Otherwise builds a `ProposalContext`, resolves `outputDir` (via `resolveOutputDir`), calls `buildE3Input(ctx, e1 ?? syntheticE1ForRfi(), e2, pricingConfig, outputDir, state.artifacts.e4, state.artifacts.e5)`. In RFI mode (no real E1), a synthetic empty E1Output is substituted.
- **e4**: `out.e4Output = await runE4(buildE4Input(input, state))`; throws if `out.e4Output.error` is set.
- **e5**: `out.e5Output = await runE5(buildE5Input(input, state, state.artifacts.e4))`; throws if `out.e5Output.error` is set.

`PipelineInput` (L24-64) — top-level orchestrator input: opportunityId, mode, files, devices, pricingConfig, client metadata, historicalDeals, plus a large block of E4/E5 flags (sector, projectType, vendor, siteCount, userCount, portCount, bandwidthGbps, many `has*` booleans).

### 5.4 Per-engine input builders and artifact mappers

| Engine | Builder file | Builder name | What goes IN | What comes OUT (artifact stored) |
|---|---|---|---|---|
| E1 | `pipeline-e1.ts` | `buildE1Input` | `{ files, clientName, country, solutionContext }` → `E1Input` | `toE1Artifacts(E1Output)` → `{ complianceMatrix: JSON.stringify(out.complianceMatrix), requirementsBaseline: JSON.stringify(out.requirements), riskFlags: out.riskFlags.map(r=>"${severity}:${pattern}"), vendorList, sector }` |
| E2 | `pipeline-e2.ts` | `buildE2Input(input, e1?, e5?)` | If `devices` not supplied AND `e5.componentList` exists, derives devices from E5 component list (vendor inferred fortinet/cisco). Sets `projectContext.sector = e1?.sectorDetection.sector`. Throws if no `pricingConfig` or no `devices`. | `toE2Artifacts(E2Output)` → `{ pricingSummary: "grandTotalIncVat=${...}", validationStatus, validationWarnings, bomWorkbook?: out.exportPath, filledClientBoq?: out.filledClientBoqPath }` |
| E3 | `pipeline-e3.ts` | `buildE3Input(ctx, e1, e2, pricingConfig, outputDir, e4Artifacts?, e5Artifacts?)` | Full `E3Input` (see §5.5) | `toE3Artifacts(E3Output)` → `{ technicalProposal?: out.proposalPath, financialProposal?: out.financialPath }` |
| E4 | `pipeline-e4.ts` | `buildE4Input(input, state)` | Wraps `E4InputData` in an `EngineInput` envelope | `toE4Artifacts(EngineOutput<'e4'>)` — spreads `out.artifacts` directly (`{ questionnaire?, requirementsBaseline? }`) |
| E5 | `pipeline-e5.ts` | `buildE5Input(input, state, e4Artifacts?)` | Parses `e4Artifacts.requirementsBaseline` JSON into `E5InputData.requirementsBaseline`. Sets `phase: 'full'`. Defaults: `vendor='cisco'`, `siteCount=1`, `buildingCount=1`, `portCount=100`, `userCount=50`, `bandwidthGbps=1`, `projectType='general'`. | `toE5Artifacts(EngineOutput<'e5'>)` — spreads `out.artifacts` directly |

Key wiring note: E4 and E5 builders return the generic `EngineInput` envelope, while E1/E2/E3 builders return the engine-specific input type directly. `runE4`/`runE5` accept the envelope; `runE1`/`runE2`/`runE3` accept the specific input.

### 5.5 E3 input mapping — `pipeline-e3.ts` + `pipeline-e3-rfi.ts`

`buildE3Input` (pipeline-e3.ts L109-141) assembles `E3Input`:
- `metadata`: `customerName = ctx.clientName ?? 'Customer'`; `projectName = "${customerName} Network Solution"`; `estimateId = ctx.opportunityId`; `date = today (ISO yyyy-mm-dd)`; `validityDays: 30`; `country = ctx.country ?? pricingConfig.country`; `currency = deriveCurrency(country)` (KSA→SAR, UAE→AED, EG→EGP, else USD; L34-41); `tenantName: 'MantelTech'`.
- `e1`: `mapE1(e1Output)` (L61-88) — projects `E1Output` into `E3E1Data` (requirements, stats, complianceMatrix.stats, riskFlags, evalCriteria, vendorPreferences, sectorDetection + frameworks-by-id, clarifications.questions).
- `e2`: `mapE2(e2Output)` (L90-100) — maps `out.bom` lines (sku/description/qty/category/unitSellPrice/extendedSell), passes `totals`/`validationResults`/`validationStatus` through.
- `costStack`: `deriveCostStack(totals, cfg)` (L43-59) — inverse profit factor: `factor = (cfg.profitMode === 'margin') ? 1 - cfg.profitPct : 1 / (1 + cfg.profitPct)`. Multiplies category totals by `factor`; `travelCost/trainingCost/contingency = 0`.
- `outputDir`: `resolveOutputDir(ctx)` (L102-107) — `os.tmpdir() + '/bomatic-e3/' + (intakeId ?? pipelineId)`, `mkdir -p`.
- Optional `e4` and `e5` come from `pipeline-e3-rfi.ts`:
  - `mapE4(e4?)` (L15-28) — JSON-parses `e4.requirementsBaseline` into the 5-bucket `E3RequirementsBaseline`, coercing missing/non-array to `[]`. Returns `undefined` on parse failure.
  - `mapE5(e5?)` (L36-52) — JSON-parses `e5.designSummary` into `{ designApproach, sizing, hldSections }`. Returns `undefined` if all three absent.

`syntheticE1ForRfi()` (pipeline-e3.ts L150-165) — used when E3 runs in RFI mode where E1 was skipped. Returns a fully-populated empty `E1Output` so the E1 mapper can run without checks.

`toE3Artifacts(E3Output)` (L143-148) — `{ technicalProposal?: out.proposalPath, financialProposal?: out.financialPath }`.

### 5.6 End-to-end data flow summary

```
RFP:       files → E1 → E2 (uses e1.sector) → E3 (uses E1+E2, optional E4+E5 from artifacts)
RFI:       config → E4 → E5 (uses e4.requirementsBaseline) → E2 (devices from e5.componentList,
                                                                  syntheticE1) → E3
QUICK_BOM: devices + pricingConfig → E2 → E3 (syntheticE1)
```

All cross-engine handoffs go through `state.artifacts` (path strings or JSON blobs). Engines never import from sibling engines; the coordinator is the only module that knows about all five.

---

## Section 6 — API Routes

| URL Path | Methods | Auth | Tenant Filter | Description |
|---|---|---|---|---|
| `/api/review` | GET, POST | YES (`requireAuth`) | YES (`session.tenantId`) | Lists BoM drafts ready for review and submits review actions with optimistic locking. |
| `/api/review/:id` | DELETE | YES (`requireAuth`) | YES (joins `intakes.tenantId`) | Deletes a BoM draft and all associated records. |
| `/api/admin` | GET, PATCH | YES (`requireRole tenant_admin/super_admin`) | YES (`session.tenantId`) | Reads and updates tenant configuration. |
| `/api/onboarding` | GET, POST | YES (`requireRole tenant_admin/super_admin`) | YES (`session.tenantId`) | Returns and transitions tenant onboarding state. |
| `/api/estimates` | GET | YES (`requireAuth`) | YES (`intakes.tenantId`) | Lists BoM drafts joined with intake data for the tenant. |
| `/api/estimates/:id` | GET, PATCH | YES (`requireAuth`) | YES (`intakes.tenantId`) | Loads BoM draft + artifacts + pipeline state; PATCH approves the deal at commercial gate. |
| `/api/estimates/:id/download` | GET | YES (`requireAuth`) | YES (`intakes.tenantId`) | Streams artifacts (bom xlsx, compliance xlsx, proposal docx, financial xlsx). |
| `/api/estimates/:id/proposal` | GET | YES (`requireAuth`) | YES (`intakes.tenantId`) | Returns E3 proposal sections/tiers/margin JSON, or streams regenerated docx/xlsx with `?download=`. |
| `/api/estimates/:id/design` | GET, POST, PATCH | YES (`requireAuth`) | YES (via `resolveIntake`) | E5 design engine: load state, start HLD generation, apply checkpoints. |
| `/api/estimates/:id/design/documents` | GET | YES (`requireAuth`) | YES (via `resolveIntake`) | Streams E5 HLD/LLD docx or topology diagram XML. |
| `/api/estimates/:id/questionnaire` | GET, POST, PATCH | YES (`requireAuth`) | YES (via `resolveIntake`) | E4 phase-1 questionnaire endpoints. |
| `/api/estimates/:id/responses` | GET, POST, PATCH | YES (`requireAuth`) | YES (via `resolveIntake`) | E4 phase-2 responses endpoints. |
| `/api/estimates/:id/compliance` | PATCH | YES (`requireAuth`) | YES (joins `intakes.tenantId`) | Applies engineer edits to compliance matrix rows. |
| `/api/estimates/:id/compliance/export` | GET | YES (`requireAuth`) | YES (joins `intakes.tenantId`) | Builds and streams compliance matrix xlsx. |
| `/api/catalog/fortinet` | GET | YES (`requireAuth`) | NO (catalog is shared/global) | Searches and paginates the cached Fortinet price-list catalog. |
| `/api/chat` | POST | YES (`requireAuth`) | NO (uses `CHAT_TENANT_ID` env or first row of `tenant_credentials`) | Multi-turn agent chat (Anthropic/Gemini) with Cisco catalog tool-use loop. |
| `/api/chat/save` | POST | YES (`requireAuth`) | NO (writes to a singleton `default-chat` tenant) | Persists chat-generated BoM as intake + agent_run + bom_draft. |
| `/api/intake` | GET, POST | YES (`requireAuth`) | NO (writes to `default-chat` via `getDefaultTenantId()`) | Creates intake + agent_run, runs pipeline in background. |
| `/api/export` | GET | YES (`requireAuth`) | YES (joins `intakes.tenantId`) | Exports BoM draft as csv or xlsx using stored line items. |
| `/api/pipeline/:id/checkpoint` | POST | YES (`requireAuth`) | NO (pipeline lookup by id only) | Records a human checkpoint decision on a pipeline. |
| `/api/pipeline/:id/rerun` | POST | YES (`requireAuth`) | NO (pipeline + intake fetched without tenant filter) | Re-runs E2 with a new pricingConfig in background; returns 202. |
| `/api/settings` | GET, PATCH | YES (`requireAuth`) | NO (always operates on `default-chat` tenant) | Read/update tenant company profile, pricing defaults, boilerplate. |
| `/api/upload` | POST | YES (`requireAuth`) | NO (writes to OS tmpdir under a random uuid) | Multipart file uploads stored in tmpdir for downstream intake. |

### FLAGGED — Auth/Tenant Issues

All routes call `requireAuth` (or `requireRole`), so no route is missing auth. However, the following routes do NOT scope by `session.tenantId` and so leak or misroute across tenants:

- **`/api/intake` (POST/GET)** — ignores `session.tenantId`; always writes to the `default-chat` singleton tenant. Any authenticated user creates intakes under that tenant regardless of their own.
- **`/api/chat/save` (POST)** — same pattern; writes intake/agent_run/bom_draft to the `default-chat` tenant.
- **`/api/settings` (GET/PATCH)** — reads and writes the `default-chat` tenant's config; any authenticated user can read/modify it.
- **`/api/chat` (POST)** — loads credentials via `process.env.CHAT_TENANT_ID` (or first row of `tenant_credentials`), not `session.tenantId`.
- **`/api/pipeline/:id/checkpoint` (POST)** — loads pipeline state by id alone with no tenant check; any authenticated user knowing a pipeline id can mutate its checkpoints.
- **`/api/pipeline/:id/rerun` (POST)** — same; pipeline state and intake requirements fetched without tenant filter.
- **`/api/upload` (POST)** — files written to OS tmpdir under a random uuid, never tagged with `session.tenantId`; the resulting paths are then trusted by `/api/intake`.
- **`/api/catalog/fortinet` (GET)** — catalog data is intentionally global (shared price list), noted for completeness.

---

## Section 7 — UI Pages

| URL Path | Renders | API Routes Called | Disabled / Coming-Soon / TODO |
|---|---|---|---|
| `/` | Server redirect to `/dashboard`. | none | none |
| `/dashboard` | Pipeline overview with stat cards, recent estimates table, activity feed. | `GET /api/estimates` | none |
| `/estimates` | Paginated estimates table with search/filter and per-row delete. | `GET /api/estimates`; `DELETE /api/review/:id` | none |
| `/estimate/new` | 4-step intake wizard (mode select, file/BoM upload, project details, pricing defaults). | `POST /api/upload`; `POST /api/intake` | none |
| `/estimates/:id` | Estimate hub: pipeline stepper, checkpoint cards, summary cards, sub-nav; polls every 5s while pipeline running. | `GET /api/estimates/:id` (polled); `DELETE /api/estimates/:id` | none |
| `/estimates/:id/pricing` | Pricing config form with impact preview and E2 re-run trigger. | `GET /api/estimates/:id`; `POST /api/pipeline/:pipelineId/rerun` | none |
| `/estimates/:id/clarifications` | Stats/filter bar + table of E1-generated clarification questions. | `GET /api/estimates/:id` | "PDF export coming soon — questions copied to clipboard for now." |
| `/estimates/:id/proposal` | Proposal review with sidebar, section editor, tier panel, approve+download or request-revision. | `GET /api/estimates/:id`; `POST /api/pipeline/:pipelineId/checkpoint`; `GET /api/estimates/:id/proposal?download=docx` | "Regeneration coming soon — for now, edit the text directly." |
| `/estimates/:id/margin` | Margin gauges, approval banner, flags, strategic justification, tier comparison, deal approval action. | `GET /api/estimates/:id`; `PATCH /api/estimates/:id` | none |
| `/estimates/:id/export` | Export center grouped by category (Analysis / Commercial / Proposal). | `GET /api/estimates/:id`; `GET /api/estimates/:id/download?artifact=...` | `comingSoon` rows: "Requirements Baseline", "Distributor Export", "Filled Client BoQ", "Submission PDF". |
| `/estimates/:id/checkpoint` | E1 requirements review with approve/revise/reject. | `GET /api/estimates/:id`; `POST /api/pipeline/:pipelineId/checkpoint` | none |
| `/estimates/:id/compliance` | Compliance matrix table with stats/filter bar, coverage gaps, orphan requirements, save+approve actions. | `GET /api/estimates/:id`; `PATCH /api/estimates/:id/compliance`; `GET /api/estimates/:id/download?artifact=compliance`; `POST /api/pipeline/:pipelineId/checkpoint` | none |
| `/estimates/:id/bom` | Two-phase BoM review (SKU phase, then Pricing phase) with totals, validation, anomalies, similar deals, approve/revise. | `GET /api/estimates/:id`; `GET /api/estimates/:id/download?artifact=bom`; `POST /api/pipeline/:pipelineId/checkpoint` | Edit qty saves locally only (implicit TODO). |
| `/estimates/:id/questionnaire` | E4 phase-1 discovery questionnaire viewer with generate / approve / revise / copy markdown. | `GET /api/estimates/:id/questionnaire`; `GET /api/estimates/:id`; `POST/PATCH /api/estimates/:id/questionnaire` | "Export coming soon." |
| `/estimates/:id/responses` | E4 phase-2 responses tabs (responses / gaps / baseline), upload text or xlsx, validate or reprocess. | `GET /api/estimates/:id/responses`; `GET /api/estimates/:id/questionnaire`; `GET /api/estimates/:id`; `POST/PATCH /api/estimates/:id/responses` | `requestRevision` only records notes in a local toast — does not POST anywhere (implicit TODO). |
| `/estimates/:id/design` | E5 design tabs (approach, sizing, HLD, LLD details, LLD doc) with approve/revise per phase and document downloads. | `GET /api/estimates/:id/design`; `GET /api/estimates/:id`; `POST/PATCH /api/estimates/:id/design`; `GET /api/estimates/:id/design/documents?type=...` | none |
| `/catalog` | Vendor-tabbed catalog browser (Cisco / Fortinet) with debounced search input. | Cisco/Fortinet child components (Fortinet tab → `GET /api/catalog/fortinet`). | none on this page itself |
| `/admin` | Tenant settings: Company Profile, Proposal Boilerplate, Pricing Defaults. | `GET /api/settings`; `PATCH /api/settings` | none |
| `/customers` | Hardcoded mock customer directory with expandable cards. | none (mock data) | All data hardcoded; per-row links go to generic `/estimates` (implicit TODO). |
| `/deals` | ComingSoon placeholder with tab strip. | none | Entire page ComingSoon "Coming in Phase 3". |
| `/distributor` | ComingSoon placeholder. | none | Entire page ComingSoon "Coming in Phase 3". |
| `/orders` | ComingSoon placeholder. | none | Entire page ComingSoon "Coming in Phase 4". |
| `/services` | ComingSoon placeholder. | none | Entire page ComingSoon "Coming in Phase 4". |

---

## Section 8 — Skills and Conventions

### 8.1 Skills (`.claude/skills/`)

- **ai-task.md** — Use when a step's logic mixes deterministic rules with AI judgement. Wraps `callAI<T>` from `src/lib/ai/client.ts` to enforce: deterministic-first, confidence-gated escalation (≈0.5–0.8 band), one Zod schema per call, batched repetitive tasks, graceful degradation on AI failure, and four test paths (bypass, success, AI-failure fallback, Zod-reject fallback).
- **e1-regex-module.md** — Use for any pure-regex/deterministic E1 module (file classifier, missing-doc detector, legal-trap flagger, sector detector, deadline finder). Produces a typed `{items, stats}` object with three-priority confidence scoring, lookaround word boundaries (no `\b`), pattern tables, padded auto-incrementing IDs, and module-level severity vocabulary.
- **e2-boq-parser.md** — Use when adding a new BoQ flavor parser (Aramco Type A Ariba, Saudi Electric NRM2, etc.). Pure function `sheets → BoQLineItem[]` that detects sheet by name pattern, branches once on version (sheet-prefix or header-width fallback), uses named `ColMap` constants with Excel-letter comments, and pushes unknown columns into `metadata`.
- **e2-deterministic-fn.md** — Use when implementing one of the CS-003…CS-009 cost-stack formulas. Open `docs/Tender_Analyzer_Model.md` Section 2, translate the Excel formula directly into a typed sub-10-line pure function in `src/engines/e2/pricing-engine.ts`, plus a hand-computed test in `tests/engines/e2/pricing-engine.test.ts`.
- **e2-selector.md** — Use when building accessory/licensing/support selectors. Pure JSON-driven function `(model, qty, config) → typed line items[]`, normalises model first via `normalizeModel`, splits Cisco/Fortinet explicitly, pulls all per-model facts from `docs/BOMATIC_Device_Specs.json`, and tests against Shahid's documented quotes.
- **e2-validation-rule.md** — Use when adding a deterministic BoM validation check. Produces either an engine-registered `ValidationRule` returning `ValidationResult[]` or a `{valid,severity,message}` helper wired via `adapter.ts`. Specs loaded once via Zod at module scope; SKUs matched with `=== model || startsWith(model + "-")`; info-on-empty rule; registered in `ALL_RULES`.
- **e5-design-module.md** — Use for any module in `src/engines/e5/` (HLD/LLD design engine). Defines the 19-step pipeline (deterministic steps 1, 3, 4, 9–13, 16–17, 19; AI steps 2, 5, 14), enforces post-gate validation on AI output against the 6 valid `TopologyPattern` enum values, and centralises data in `types.ts` / `device-specs.ts`.
- **ui-page.md** — Use for any interactive page under `src/app/estimates/[id]/...`. Produces a `"use client"` Next.js App Router page with `useEffect` fetch lifecycle, skeleton (not spinner), card-based sections, fixed bottom action bar with `pb-28` offset, light-theme tokens (`bg-bg-primary`, `text-text-primary`, `bg-accent`), `Intl.NumberFormat` currency formatting, and a 200-line file budget enforced by splitting into `page.tsx` / `sections.tsx` / `mappers.ts`.

### 8.2 CLAUDE.md Key Rules

- **Karpathy Rules**:
  1. Think before coding — state assumptions, surface tradeoffs, ask if unclear.
  2. Simplicity first — minimum code that solves the problem, nothing speculative.
  3. Surgical changes — touch only what you must, match existing style.
  4. Goal-driven execution — define success criteria, loop until verified.
- **First Commandment**: Never let the LLM do math, lookups, or rule-based validation at runtime. Arithmetic, catalog lookups, and rule checking are TypeScript functions and DB queries — not Claude API calls. E2 has zero pure-AI tasks. Target: 65% deterministic / 26% AI+validation / 9% pure AI.
- **Existing Code — Preserve These**:
  - `src/lib/validation/` — 9 deterministic validation rules (working, tested) — extend, don't rewrite.
  - `src/lib/adapters/` — Cisco API adapters — keep.
  - `src/lib/agent/` — Phase 1 chat agent — FROZEN, build new work in `src/engines/`.
  - `src/types/` — extend, don't break.
  - `src/lib/db/` — Drizzle ORM schema — extend with pipeline tables.
- **File Ownership** (when both devs active):
  - Lead only: `src/coordinator/`, `src/engines/e3/`, `src/engines/e5/`, `src/ui/`.
  - Junior only: `src/engines/e1/`, `src/engines/e2/`, `src/engines/e4/`, `knowledge-packs/`.
  - `src/lib/` — coordinate before editing.
- **Code Rules**:
  - 200-line cap per file (split if longer).
  - Every function has typed input and output; no `any` in public interfaces.
  - Engine directories never import from other engine directories.
  - All inter-engine data flows through pipeline state types.
  - Tests written in same session as implementation, not deferred.

---

## Section 9 — Known Issues

### 9.1 TODO / FIXME / HACK / XXX comments

Only two TODO comments in `src/` (no FIXME/HACK/XXX):

- `src/lib/middleware/auth.ts:57` — `// TODO: Validate session token against NextAuth.js`
- `src/app/estimates/[id]/export/export-components.tsx:165` — `// TODO: replace per-artifact sequential downloads with a server-side ZIP`

### 9.2 Files over 200 lines (Code Rule violation candidates)

34 files exceed the 200-line cap, sorted by size:

| Lines | File |
|------:|------|
| 816 | `src/components/shared/ChatPanel.tsx` |
| 496 | `src/app/customers/page.tsx` |
| 488 | `src/app/estimates/page.tsx` |
| 487 | `src/app/dashboard/page.tsx` |
| 478 | `src/lib/adapters/estimate.ts` |
| 464 | `src/lib/agent/agent.ts` |
| 358 | `src/lib/adapters/catalog.ts` |
| 349 | `src/components/shared/CommandPalette.tsx` |
| 336 | `src/lib/agent/steps/tool-executor.ts` |
| 331 | `src/app/estimates/[id]/pricing/pricing-components.tsx` |
| 312 | `src/lib/db/schema.ts` |
| 275 | `src/lib/llm/provider.ts` |
| 265 | `src/lib/db/queries.ts` |
| 248 | `src/lib/adapters/customer.ts` |
| 245 | `src/app/api/estimates/[id]/proposal/route.ts` |
| 244 | `src/components/shared/NotificationCenter.tsx` |
| 243 | `src/lib/export/xlsx.ts` |
| 233 | `src/app/api/chat/route.ts` |
| 229 | `src/app/estimates/[id]/responses/page.tsx` |
| 228 | `src/app/estimates/[id]/pricing/page.tsx` |
| 227 | `src/engines/e2/orchestrator.ts` |
| 222 | `src/engines/e2/bom-anomaly-detector.ts` |
| 217 | `src/engines/e2/similar-deal-finder.ts` |
| 216 | `src/types/cisco.ts` |
| 214 | `src/app/estimates/[id]/questionnaire/page.tsx` |
| 213 | `src/app/api/estimates/[id]/_e4-state.ts` |
| 209 | `src/app/estimates/[id]/export/page.tsx` |
| 207 | `src/engines/e3/section-generators.ts` |
| 207 | `src/engines/e3/pricing-tiers.ts` |
| 205 | `src/lib/io/excel-writer.ts` |
| 205 | `src/engines/e5/types.ts` |
| 205 | `src/engines/e1/requirements-extractor.ts` |
| 204 | `src/engines/e3/financial-proposal-writer.ts` |
| 201 | `src/types/bom.ts` |

Note: `src/lib/agent/` is documented FROZEN, so those entries (`agent.ts`, `tool-executor.ts`) are legacy by design.

### 9.3 Stub / mock / fake / dummy / placeholder patterns (production code)

Material hits (UI `placeholder=` props omitted):

| File:line | Matched line |
|-----------|--------------|
| `src/lib/validation/rules/eox-check.ts:7` | `export const stubEoxLookup: EoxLookup = {` |
| `src/lib/validation/rules/eox-check.ts:23` | `lookup: EoxLookup = stubEoxLookup` |
| `src/lib/validation/engine.ts:63` | `"EoX Check (stub)",` |
| `src/lib/env.ts:15` | `CISCO_API_MODE: z.enum(["mock", "live"]).default("mock"),` |
| `src/lib/env.ts:16` | `CISCO_MOCK_ERROR: z` |
| `src/lib/env.ts:34` | `export function isMockMode(): boolean {` |
| `src/lib/env.ts:35` | `return (process.env.CISCO_API_MODE \|\| "mock") === "mock";` |
| `src/lib/env.ts:38-39` | `export function getMockError(): string \| undefined { ... }` |
| `src/lib/adapters/estimate.ts:10` | `import { isMockMode, getMockError } from "@/lib/env";` |
| `src/lib/adapters/estimate.ts:46-47` | `if (isMockMode()) { return getMockCreateEstimate(...) }` |
| `src/lib/adapters/estimate.ts:116-117` | `if (isMockMode()) { return getMockUpdateEstimate(...) }` |
| `src/lib/adapters/estimate.ts:185-186` | `if (isMockMode()) { return getMockAcquireEstimate(...) }` |
| `src/lib/adapters/estimate.ts:363-447` | Mock implementations section: `getMockCreate/Update/AcquireEstimate`; ids prefixed `MOCK-${Date.now()...}` |
| `src/lib/adapters/catalog.ts:10` | `import { isMockMode, getMockError } from "@/lib/env";` |
| `src/lib/adapters/catalog.ts:54-55` | `if (isMockMode()) { return getMockCatalogItems(...) }` |
| `src/lib/adapters/catalog.ts:146-147` | `if (isMockMode()) { return getMockMappedServices(...) }` |
| `src/types/cisco.ts:201` | `mode: "mock" \| "live";` |
| `src/engines/e5/hld-deterministic-sections.ts:127` | `export function migrationPlaceholderSection(): HLDSection {` |
| `src/engines/e5/hld-narrative-generator.ts:24,156` | imports + calls `migrationPlaceholderSection()` |
| `src/engines/e5/lld-deterministic-sections.ts:31` | `content: 'Diagram placeholder: per-site, per-rack physical topology from diagram engine.'` |
| `src/engines/e5/lld-deterministic-sections.ts:36` | `content: 'Diagram placeholder: per-VRF, per-VLAN, per-fabric logical topology from diagram engine.'` |
| `src/engines/e5/lld-deterministic-sections.ts:119` | `export function cableSchedulePlaceholder(): LLDSection {` |
| `src/engines/e5/lld-deterministic-sections.ts:124` | `export function rackElevationsPlaceholder(): LLDSection {` |
| `src/engines/e5/lld-narrative-generator.ts:14,17,111,112` | imports + calls placeholders |
| `src/engines/e5/rack-elevation-generator.ts:133` | `// would clutter output, so we emit a 1U placeholder labelled "gap".` |
| `src/engines/e3/boilerplate-kb.ts:17,21,143,154` | `PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;` (templating, not a stub) |
| `src/components/shared/ChatPanel.tsx:706` | `"MOCK-",` (UI detects mock estimate IDs) |
| `src/components/shared/CommandPalette.tsx:129` | `/* placeholder — wire to export logic */` |

Key concerns:
- **`CISCO_API_MODE` defaults to `"mock"`** (`src/lib/env.ts:15,35`) — production silently uses mock estimate/catalog adapters unless env var set to `"live"`.
- **EoX check is a stub** (registered as `"EoX Check (stub)"`).
- **E5 LLD/HLD have several placeholder sections** (migration, cable schedule, rack elevations, physical/logical topology diagrams) emitting literal "placeholder" text into generated docs.
- **CommandPalette export action** unwired (`/* placeholder — wire to export logic */`).

---

## Section 10 — Dependencies

### 10.1 `dependencies`

| Package | Version |
|---------|---------|
| `@anthropic-ai/sdk` | `^0.39.0` |
| `@google/generative-ai` | `^0.24.1` |
| `bullmq` | `^5.30.0` |
| `class-variance-authority` | `^0.7.1` |
| `clsx` | `^2.1.1` |
| `docx` | `^9.6.1` |
| `drizzle-orm` | `^0.38.0` |
| `exceljs` | `^4.4.0` |
| `fast-xml-parser` | `^4.5.0` |
| `ioredis` | `^5.4.0` |
| `lucide-react` | `^1.14.0` |
| `mammoth` | `^1.12.0` |
| `next` | `14.2.21` |
| `next-auth` | `^4.24.0` |
| `papaparse` | `^5.4.0` |
| `pdf-parse` | `^2.4.5` |
| `pg` | `^8.13.0` |
| `react` | `^18.3.0` |
| `react-dom` | `^18.3.0` |
| `tailwind-merge` | `^3.5.0` |
| `uuid` | `^11.0.0` |
| `xlsx` | `^0.18.5` |
| `zod` | `^3.24.0` |

### 10.2 `devDependencies`

| Package | Version |
|---------|---------|
| `@testing-library/jest-dom` | `^6.9.1` |
| `@testing-library/react` | `^16.3.2` |
| `@testing-library/user-event` | `^14.6.1` |
| `@types/node` | `^22.10.0` |
| `@types/papaparse` | `^5.3.0` |
| `@types/pdf-parse` | `^1.1.5` |
| `@types/pg` | `^8.11.0` |
| `@types/react` | `^18.3.0` |
| `@types/react-dom` | `^18.3.0` |
| `@types/uuid` | `^10.0.0` |
| `autoprefixer` | `^10.4.0` |
| `drizzle-kit` | `^0.31.10` |
| `jsdom` | `^29.1.1` |
| `jszip` | `^3.10.1` |
| `postcss` | `^8.4.0` |
| `tailwindcss` | `^3.4.0` |
| `tsx` | `^4.19.0` |
| `typescript` | `^5.7.0` |
| `vitest` | `^2.1.0` |

### 10.3 Stale / suspect packages

- **`@anthropic-ai/sdk` `^0.39.0`** — pre-1.0, well behind current; worth a planned upgrade alongside Opus 4.7 usage.
- **`lucide-react` `^1.14.0`** — looks very stale; modern releases of the icon library sit in the 0.4xx range. Confirm this pin is the intended package.
- **`next` `14.2.21`** — Next.js 15 is current; 14.2.x still supported but one major behind.
- **`next-auth` `^4.24.0`** — v4 is legacy; Auth.js v5 is current.
- **`pdf-parse` `^2.4.5`** — canonical `pdf-parse` on npm peaks at 1.1.x; 2.4.x suggests a fork or namespaced variant — confirm identity.
- **`vitest` `^2.1.0`** — Vitest 3.x is current.
- **`@google/generative-ai` `^0.24.1`** — present but the project's primary AI client wraps Anthropic via `callAI`. If Gemini is only enabled via `LLM_PROVIDER`, otherwise unused at runtime.
- **`pg` `^8.13.0`** — kept alongside Drizzle; may be redundant if only one Postgres driver is used.

All other dependencies are version-aligned with the documented stack (Next.js App Router + Drizzle + Vitest + Anthropic SDK + Zod + Tailwind + BullMQ/Redis + xlsx/exceljs/docx/mammoth/pdf-parse).

---

## Section 11 — Current Metrics

| Metric | Value |
|---|---|
| Total `.ts`/`.tsx` files under `src/` | **291** |
| Total lines of code under `src/` | **39,513** |
| Total test files under `tests/` | **110** |
| Total tests | **1,489** |
| Tests passing | **1,486** |
| Tests failing | **3** (all in `tests/integration/e1-real-extraction.test.ts` — fixture path drift) |
| Test pass rate | **99.80%** |
| Test run duration | **18.35s** |
| Files over 200-line cap | **34** |

### Files per engine / key directory

| Directory | File count |
|---|---:|
| `src/engines/e1/` | 18 |
| `src/engines/e2/` | 24 |
| `src/engines/e3/` | 19 |
| `src/engines/e4/` | 16 |
| `src/engines/e5/` | 27 |
| `src/coordinator/` | 14 |
| `src/app/api/` | 27 |
| `src/lib/` | 47 |

### Branch / git context

- Branch: `main`
- Recent commits:
  - `9f4f539` docs: demo test protocol + bug tracker spreadsheet
  - `57f4b93` B3b: README rewrite — 5 sweet spots, current architecture
  - `61f3bf4` B3a: auth + tenant isolation on all API routes
  - `4d48f25` B2: format-preserving BoQ template filler + Aramco 2022/2024 column-shift fix
  - `cd8143a` B1: stream E5 downloads + E2 fail-closed validation status + remove mock creds
- Uncommitted state at snapshot: 2 PDF/DOCX fixtures moved from `tests/fixtures/rfp/` to `tests/fixtures/boq/` (root cause of the 3 failing integration tests).

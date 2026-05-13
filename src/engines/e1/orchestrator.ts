import {
  detectMissingDocuments,
  type MissingDocument,
} from '@/engines/e1/missing-doc-detector';
import {
  flagLegalTraps,
  extractDeadlines,
  type RiskFlag,
  type ComplianceDeadline,
} from '@/engines/e1/legal-trap-flagger';
import { analyzeEvalCriteria } from '@/engines/e1/eval-criteria-analyzer';
import { extractVendors } from '@/engines/e1/vendor-extractor';
import { detectSector } from '@/engines/e1/sector-detector';
import { selectFrameworks } from '@/engines/e1/framework-selector';
import { generateComplianceMatrix } from '@/engines/e1/compliance-matrix';
import { generateClarifications } from '@/engines/e1/clarification-generator';
import {
  classifyAll,
  loadExcelSheets,
  buildTextMap,
  extractAllRequirements,
  collectReferencedStandards,
} from '@/engines/e1/orchestrator-helpers';
import type {
  E1Input,
  E1Output,
  E1Stats,
} from '@/engines/e1/orchestrator-types';

export type {
  E1Input,
  E1InputFile,
  E1Output,
  E1Stats,
  E1ClassifiedFile,
} from '@/engines/e1/orchestrator-types';

export async function runE1(input: E1Input): Promise<E1Output> {
  const fileClassifications = classifyAll(input.files);
  const { sheetNames, sheets } = loadExcelSheets(fileClassifications);
  const textMap = buildTextMap(input.files);
  const combinedText = Array.from(textMap.values()).join('\n\n');

  const missingDocuments: MissingDocument[] = detectMissingDocuments(
    fileClassifications.map((f) => ({ filename: f.filename })),
    textMap,
  );

  const requirements = await extractAllRequirements(textMap);

  const riskFlags: RiskFlag[] = [];
  const deadlines: ComplianceDeadline[] = [];
  textMap.forEach((text, source) => {
    riskFlags.push(...flagLegalTraps(text, source));
    deadlines.push(...extractDeadlines(text, source));
  });

  const evalTexts = Array.from(textMap.entries()).map(([filename, content]) => ({
    filename,
    content,
  }));
  const evalCriteria = await analyzeEvalCriteria(
    evalTexts,
    sheetNames.length > 0 ? sheets : undefined,
  );

  const vendorPreferences = extractVendors(
    sheetNames,
    sheets,
    combinedText.length > 0 ? combinedText : undefined,
  );

  const referencedStandards = collectReferencedStandards(textMap);
  const sectorDetection = detectSector(
    input.clientName ?? '',
    combinedText.length > 0 ? combinedText : undefined,
    referencedStandards,
  );

  const frameworks = selectFrameworks(
    sectorDetection.sector,
    input.country ?? 'KSA',
    referencedStandards,
  );

  const complianceMatrix = await generateComplianceMatrix(
    requirements,
    frameworks,
    input.solutionContext,
  );

  const clarifications = await generateClarifications({
    requirements,
    missingDocs: missingDocuments,
    evalCriteria,
    projectContext: input.solutionContext,
  });

  const stats: E1Stats = {
    totalFiles: input.files.length,
    totalRequirements: requirements.length,
    mandatoryCount: requirements.filter((r) => r.classification === 'mandatory').length,
    criticalRisks: riskFlags.filter((r) => r.severity === 'critical').length,
  };

  return {
    fileClassifications,
    missingDocuments,
    requirements,
    riskFlags,
    deadlines,
    evalCriteria,
    vendorPreferences,
    sectorDetection,
    frameworks,
    complianceMatrix,
    clarifications,
    stats,
  };
}

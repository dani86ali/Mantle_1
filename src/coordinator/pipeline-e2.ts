/** Coordinator → E2 bridge: input builder + artifact mapper.
 *  RFI mode: when explicit devices aren't supplied, derive them from the E5
 *  component list so E2 prices the design produced upstream.
 */

import type { E1Output } from '@/engines/e1/orchestrator';
import type {
  E2Device, E2DeviceConfig, E2Input, E2Output, PricedBomLine,
} from '@/engines/e2/orchestrator';
import type { ArtifactRegistry, E5Artifacts } from '@/coordinator/types';
import type { ComponentListItem } from '@/engines/e5/types';
import type { ValidationResult } from '@/types/validation';

export type { PricedBomLine };

export interface E2BuildInput {
  devices?: E2Device[];
  pricingConfig?: E2Input['pricingConfig'];
  solutionContext?: string;
  historicalDeals?: E2Input['historicalDeals'];
  deviceConfigOverrides?: Partial<E2DeviceConfig>;
  /** Client BoQ workbook for E2 to parse + fill (RFP mode). */
  filePath?: string;
  /** Catalog-loaded USD list prices keyed by SKU. */
  listPrices?: Record<string, number>;
}

const BOQ_FILE_EXTS = new Set(['.xlsx', '.xls', '.csv']);

/** Pick the uploaded BoQ workbook path from E1's file classifications.
 *  Matches subtype='boq_template' (filename/folder rules produce
 *  type='commercial', subtype='boq_template'); only spreadsheet
 *  extensions are returned since E2's parser reads Excel/CSV. */
export function selectBoQFilePath(e1?: E1Output): string | undefined {
  const classified = e1?.fileClassifications;
  if (!classified || classified.length === 0) return undefined;
  const boq = classified.find((f) => {
    if (f.subtype !== 'boq_template') return false;
    const dot = f.filename.lastIndexOf('.');
    const ext = dot >= 0 ? f.filename.slice(dot).toLowerCase() : '';
    return BOQ_FILE_EXTS.has(ext);
  });
  return boq?.path;
}

const DEFAULT_DEVICE_CONFIG: E2DeviceConfig = {
  dnaTier: 'advantage',
  networkTier: 'advantage',
  licenseTerm: 5,
  supportCriticality: 'standard',
  vendor: 'cisco',
};

function devicesFromComponentList(
  json: string,
  configOverrides?: Partial<E2DeviceConfig>,
): E2Device[] {
  let items: ComponentListItem[];
  try {
    items = JSON.parse(json) as ComponentListItem[];
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items.map((c) => ({
    model: c.model,
    qty: c.quantity,
    config: {
      ...DEFAULT_DEVICE_CONFIG,
      ...configOverrides,
      vendor: c.vendor === 'fortinet' ? 'fortinet' : 'cisco',
    },
  }));
}

/** Resolve the final device list E2 will price: explicit devices first, then
 *  the E5 component list (RFI mode). Returns [] when neither is available. */
export function resolveE2Devices(
  input: E2BuildInput,
  e5?: E5Artifacts,
): E2Device[] {
  if (input.devices && input.devices.length > 0) return input.devices;
  if (e5?.componentList) {
    return devicesFromComponentList(e5.componentList, input.deviceConfigOverrides);
  }
  return [];
}

export function buildE2Input(
  input: E2BuildInput,
  e1?: E1Output,
  e5?: E5Artifacts,
): E2Input {
  if (!input.pricingConfig) {
    throw new Error('E2 requires devices and pricingConfig');
  }
  const devices = resolveE2Devices(input, e5);
  return {
    devices,
    pricingConfig: input.pricingConfig,
    filePath: input.filePath,
    listPrices: input.listPrices,
    projectContext: {
      sector: e1?.sectorDetection.sector,
      description: input.solutionContext,
    },
    historicalDeals: input.historicalDeals,
    e1Signals: e1 ? buildE1Signals(e1) : undefined,
  };
}

function buildE1Signals(e1: E1Output): E2Input['e1Signals'] {
  return {
    vendorPreferences: e1.vendorPreferences.map((v) => ({
      vendor: v.vendor,
      category: v.category,
      status: v.status,
      source: v.source,
      specificModels: v.specificModels,
    })),
    riskFlags: e1.riskFlags.map((r) => ({
      category: r.category,
      severity: r.severity,
      pattern: r.pattern,
      matchedText: r.matchedText,
      source: r.source,
    })),
    evalCriteria: {
      methodology: e1.evalCriteria.methodology,
      envelopes: e1.evalCriteria.envelopes.map((env) => ({
        name: env.name,
        weight: env.weight,
        passThreshold: env.passThreshold,
        criteria: env.criteria,
      })),
      passingThreshold: e1.evalCriteria.passingThreshold,
      iktvaRequired: e1.evalCriteria.iktvaRequired,
      source: e1.evalCriteria.source,
    },
    mandatoryRequirements: e1.requirements
      .filter((r) => r.classification === 'mandatory')
      .map((r) => ({
        id: r.id,
        text: r.text,
        classification: r.classification,
        confidence: r.confidence,
        sourceFile: r.sourceFile,
        indicators: r.indicators,
        relatedStandards: r.relatedStandards,
      })),
  };
}

export function toE2Artifacts(
  out: E2Output,
  inputFilePath?: string,
): ArtifactRegistry['e2'] {
  const artifacts: ArtifactRegistry['e2'] = {
    pricingSummary: `grandTotalIncVat=${out.totals.grandTotalIncVat}`,
    validationStatus: out.validationStatus,
    validationWarnings: out.validationWarnings,
  };
  if (out.exportPath) artifacts.bomWorkbook = out.exportPath;
  if (out.filledClientBoqPath) artifacts.filledClientBoq = out.filledClientBoqPath;
  if (inputFilePath) artifacts.clientBoqInputPath = inputFilePath;
  if (out.bom.length > 0) artifacts.bom = JSON.stringify(out.bom);
  if (out.validationResults && out.validationResults.length > 0) {
    artifacts.validationResults = JSON.stringify(out.validationResults);
  }
  return artifacts;
}

export function parseBomFromArtifacts(
  e2?: ArtifactRegistry['e2'],
): PricedBomLine[] {
  if (!e2 || !e2.bom) return [];
  try {
    const parsed = JSON.parse(e2.bom);
    return Array.isArray(parsed) ? (parsed as PricedBomLine[]) : [];
  } catch {
    return [];
  }
}

export function parseValidationResultsFromArtifacts(
  e2?: ArtifactRegistry['e2'],
): ValidationResult[] {
  if (!e2 || !e2.validationResults) return [];
  try {
    const parsed = JSON.parse(e2.validationResults);
    return Array.isArray(parsed) ? (parsed as ValidationResult[]) : [];
  } catch {
    return [];
  }
}

/** Coordinator → E2 bridge: input builder + artifact mapper.
 *  RFI mode: when explicit devices aren't supplied, derive them from the E5
 *  component list so E2 prices the design produced upstream.
 */

import type { E1Output } from '@/engines/e1/orchestrator';
import type {
  E2Device, E2DeviceConfig, E2Input, E2Output,
} from '@/engines/e2/orchestrator';
import type { ArtifactRegistry, E5Artifacts } from '@/coordinator/types';
import type { ComponentListItem } from '@/engines/e5/types';

export interface E2BuildInput {
  devices?: E2Device[];
  pricingConfig?: E2Input['pricingConfig'];
  solutionContext?: string;
  historicalDeals?: E2Input['historicalDeals'];
  deviceConfigOverrides?: Partial<E2DeviceConfig>;
  /** Client BoQ workbook for E2 to parse + fill (RFP mode). */
  filePath?: string;
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

export function buildE2Input(
  input: E2BuildInput,
  e1?: E1Output,
  e5?: E5Artifacts,
): E2Input {
  if (!input.pricingConfig) {
    throw new Error('E2 requires devices and pricingConfig');
  }
  let devices = input.devices;
  if ((!devices || devices.length === 0) && e5?.componentList) {
    devices = devicesFromComponentList(e5.componentList, input.deviceConfigOverrides);
  }
  return {
    devices: devices ?? [],
    pricingConfig: input.pricingConfig,
    filePath: input.filePath,
    projectContext: {
      sector: e1?.sectorDetection.sector,
      description: input.solutionContext,
    },
    historicalDeals: input.historicalDeals,
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
  return artifacts;
}

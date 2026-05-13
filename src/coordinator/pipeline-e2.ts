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
}

const DEFAULT_DEVICE_CONFIG: E2DeviceConfig = {
  dnaTier: 'advantage',
  networkTier: 'advantage',
  licenseTerm: 5,
  supportCriticality: 'standard',
  vendor: 'cisco',
};

function devicesFromComponentList(json: string): E2Device[] {
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
    devices = devicesFromComponentList(e5.componentList);
  }
  if (!devices || devices.length === 0) {
    throw new Error('E2 requires devices and pricingConfig');
  }
  return {
    devices,
    pricingConfig: input.pricingConfig,
    projectContext: {
      sector: e1?.sectorDetection.sector,
      description: input.solutionContext,
    },
    historicalDeals: input.historicalDeals,
  };
}

export function toE2Artifacts(out: E2Output): ArtifactRegistry['e2'] {
  const artifacts: ArtifactRegistry['e2'] = {
    pricingSummary: `grandTotalIncVat=${out.totals.grandTotalIncVat}`,
    validationStatus: out.validationStatus,
    validationWarnings: out.validationWarnings,
  };
  if (out.exportPath) artifacts.bomWorkbook = out.exportPath;
  return artifacts;
}

/**
 * E5 — Deterministic component list builder.
 *
 * Pure function. Flattens every {@link DeviceSelection} from a
 * {@link SizingResult} into the {@link ComponentListItem} shape that the E2
 * BoM engine consumes. Same model appearing in multiple roles stays as
 * separate entries (E2 reasons over role context).
 *
 * Output sort: vendor (asc), then model (asc) for stable diffs across runs.
 */
import type {
  ComponentListItem,
  DeviceSelection,
  SizingResult,
} from '@/engines/e5/types';

const SOURCE_STEP = 'sizing-calculator';

function toItem(d: DeviceSelection): ComponentListItem {
  const item: ComponentListItem = {
    model: d.model,
    vendor: d.vendor,
    quantity: d.quantity,
    role: d.role,
    fromDesignStep: SOURCE_STEP,
  };
  if (d.orderableSku !== undefined) item.orderableSku = d.orderableSku;
  return item;
}

/**
 * Aggregate every device selection from sizing into a flat component list,
 * preserving separate role entries when the same model is used in multiple
 * roles.
 *
 * @param sizing  Output of calculateSizing.
 * @returns       Flat {@link ComponentListItem} array sorted by vendor, model.
 */
export function buildComponentList(sizing: SizingResult): ComponentListItem[] {
  const groups: DeviceSelection[][] = [
    sizing.coreDevices,
    sizing.distributionDevices,
    sizing.accessDevices,
    sizing.firewalls,
    sizing.wirelessControllers,
    sizing.accessPoints,
  ];

  const items: ComponentListItem[] = [];
  for (const group of groups) {
    for (const d of group) {
      if (d.quantity > 0) items.push(toItem(d));
    }
  }

  items.sort((a, b) => {
    if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
    return a.model.localeCompare(b.model);
  });
  return items;
}

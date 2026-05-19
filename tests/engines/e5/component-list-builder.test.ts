import { describe, it, expect } from 'vitest';
import { buildComponentList } from '@/engines/e5/component-list-builder';
import type { SizingResult } from '@/engines/e5/types';

const empty: SizingResult = {
  coreDevices: [],
  distributionDevices: [],
  accessDevices: [],
  firewalls: [],
  wirelessControllers: [],
  accessPoints: [],
};

function ds(role: string, model: string, vendor: string, quantity: number) {
  return { role, model, vendor, quantity, reasoning: '' };
}

describe('buildComponentList', () => {
  it('flattens all sizing categories into one list', () => {
    const sizing: SizingResult = {
      coreDevices: [ds('core', 'C9500-32C', 'cisco', 2)],
      distributionDevices: [ds('distribution', 'C9500-24Y4C', 'cisco', 4)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 10)],
      firewalls: [ds('firewall', 'FG-401F', 'fortinet', 2)],
      wirelessControllers: [ds('wireless_controller', 'C9800-L', 'cisco', 1)],
      accessPoints: [ds('access_point', 'C9120AXI', 'cisco', 20)],
    };
    const items = buildComponentList(sizing);
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.model)).toEqual(
      expect.arrayContaining([
        'C9500-32C', 'C9500-24Y4C', 'C9300-48P', 'C9800-L', 'C9120AXI', 'FG-401F',
      ]),
    );
  });

  it('same model in two roles → two separate entries', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      distributionDevices: [ds('distribution', 'C9500-24Y4C', 'cisco', 4)],
    };
    const items = buildComponentList(sizing);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.model === 'C9500-24Y4C')).toBe(true);
    const roles = items.map((i) => i.role).sort();
    expect(roles).toEqual(['core', 'distribution']);
  });

  it('sorted by vendor then model', () => {
    const sizing: SizingResult = {
      ...empty,
      firewalls: [ds('firewall', 'FG-401F', 'fortinet', 2)],
      coreDevices: [ds('core', 'C9500-32C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 5)],
    };
    const items = buildComponentList(sizing);
    expect(items.map((i) => `${i.vendor}/${i.model}`)).toEqual([
      'cisco/C9300-48P',
      'cisco/C9500-32C',
      'fortinet/FG-401F',
    ]);
  });

  it('empty sizing → empty list', () => {
    expect(buildComponentList(empty)).toEqual([]);
  });

  it('every item is tagged with sizing-calculator source step', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
    };
    const [item] = buildComponentList(sizing);
    expect(item.fromDesignStep).toBe('sizing-calculator');
  });

  it('quantity preserved from sizing entries', () => {
    const sizing: SizingResult = {
      ...empty,
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 7)],
    };
    const [item] = buildComponentList(sizing);
    expect(item.quantity).toBe(7);
  });

  it('preserves orderableSku when DeviceSelection sets it', () => {
    const sizing: SizingResult = {
      ...empty,
      accessDevices: [{ role: 'access', model: 'C9300-48P', orderableSku: 'C9300-48P-A',
                       vendor: 'cisco', quantity: 3, reasoning: '' }],
    };
    const [item] = buildComponentList(sizing);
    expect(item.model).toBe('C9300-48P');
    expect(item.orderableSku).toBe('C9300-48P-A');
  });

  it('leaves orderableSku undefined when DeviceSelection lacks it', () => {
    const sizing: SizingResult = {
      ...empty,
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 3)],
    };
    const [item] = buildComponentList(sizing);
    expect(item.orderableSku).toBeUndefined();
  });
});

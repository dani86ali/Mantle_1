import { describe, it, expect } from 'vitest';
import { generateQoSPolicy } from '@/engines/e5/qos-policy-generator';
import type { QoSClass } from '@/engines/e5/types';

const sumPct = (cls: QoSClass[]) => cls.reduce((s, c) => s + c.bandwidthPercent, 0);

describe('generateQoSPolicy — Cisco 8-class', () => {
  it('with voice+video has 8 classes summing to 100%', () => {
    const p = generateQoSPolicy('cisco', true, true);
    expect(p.classes).toHaveLength(8);
    expect(sumPct(p.classes)).toBe(100);
  });

  it('voice (EF/46) and video (AF41/34) are priority queues', () => {
    const p = generateQoSPolicy('cisco', true, true);
    const voice = p.classes.find((c) => c.name === 'Voice')!;
    const video = p.classes.find((c) => c.name === 'Video')!;
    expect(voice.dscp).toBe(46);
    expect(voice.priority).toBe(true);
    expect(video.dscp).toBe(34);
    expect(video.priority).toBe(true);
  });

  it('omits Video class when hasVideo=false (7 classes, sum still 100)', () => {
    const p = generateQoSPolicy('cisco', true, false);
    expect(p.classes).toHaveLength(7);
    expect(p.classes.find((c) => c.name === 'Video')).toBeUndefined();
    expect(sumPct(p.classes)).toBe(100);
  });

  it('omits Voice class when hasVoice=false', () => {
    const p = generateQoSPolicy('cisco', false, true);
    expect(p.classes.find((c) => c.name === 'Voice')).toBeUndefined();
    expect(sumPct(p.classes)).toBe(100);
  });

  it('DSCP markings match Cisco 8-class SRND', () => {
    const p = generateQoSPolicy('cisco', true, true);
    const dscp = Object.fromEntries(p.classes.map((c) => [c.name, c.dscp]));
    expect(dscp).toMatchObject({
      Voice: 46,
      Video: 34,
      Signaling: 24,
      'Critical Data': 18,
      'Bulk Data': 10,
      Scavenger: 8,
      Management: 16,
      'Best Effort': 0,
    });
  });

  it('marking/queuing policies are "trust dscp" + "CBWFQ + LLQ"', () => {
    const p = generateQoSPolicy('cisco', true, true);
    expect(p.markingPolicy).toBe('trust dscp');
    expect(p.queuingPolicy).toBe('CBWFQ + LLQ');
  });

  it('Best Effort absorbs reclaimed bandwidth when classes are disabled', () => {
    const withBoth = generateQoSPolicy('cisco', true, true);
    const withoutVideo = generateQoSPolicy('cisco', true, false);
    const beBoth = withBoth.classes.find((c) => c.name === 'Best Effort')!;
    const beNoVideo = withoutVideo.classes.find((c) => c.name === 'Best Effort')!;
    expect(beNoVideo.bandwidthPercent).toBe(beBoth.bandwidthPercent + 15);
  });
});

describe('generateQoSPolicy — Fortinet 6-class', () => {
  it('with voice+video has 6 classes summing to 100%', () => {
    const p = generateQoSPolicy('fortinet', true, true);
    expect(p.classes).toHaveLength(6);
    expect(sumPct(p.classes)).toBe(100);
  });

  it('DSCP markings match the Fortinet 6-class spec', () => {
    const p = generateQoSPolicy('fortinet', true, true);
    const dscp = Object.fromEntries(p.classes.map((c) => [c.name, c.dscp]));
    expect(dscp).toMatchObject({
      Voice: 46,
      Video: 34,
      'Business Critical': 18,
      Management: 16,
      Bulk: 10,
      Default: 0,
    });
  });

  it('marking/queuing policies are "dscp-based" + "priority-weighted"', () => {
    const p = generateQoSPolicy('fortinet', true, true);
    expect(p.markingPolicy).toBe('dscp-based');
    expect(p.queuingPolicy).toBe('priority-weighted');
  });

  it('omits Video when hasVideo=false and still sums to 100', () => {
    const p = generateQoSPolicy('fortinet', true, false);
    expect(p.classes.find((c) => c.name === 'Video')).toBeUndefined();
    expect(sumPct(p.classes)).toBe(100);
  });

  it('no voice and no video → 4 classes, Default absorbs the 35%', () => {
    const p = generateQoSPolicy('fortinet', false, false);
    expect(p.classes).toHaveLength(4);
    expect(sumPct(p.classes)).toBe(100);
    const def = p.classes.find((c) => c.name === 'Default')!;
    // Business 25 + Mgmt 5 + Bulk 10 = 40 → Default = 60
    expect(def.bandwidthPercent).toBe(60);
  });
});

describe('generateQoSPolicy — invariants', () => {
  it('all bandwidth percentages are non-negative integers', () => {
    for (const v of ['cisco', 'fortinet'] as const) {
      for (const hv of [true, false]) {
        for (const hvid of [true, false]) {
          const p = generateQoSPolicy(v, hv, hvid);
          for (const c of p.classes) {
            expect(c.bandwidthPercent).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(c.bandwidthPercent)).toBe(true);
          }
          expect(sumPct(p.classes)).toBe(100);
        }
      }
    }
  });
});

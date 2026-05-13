import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { enhancedProjectTypeDetection } from '@/engines/e4/project-type-ai';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('enhancedProjectTypeDetection — deterministic high-confidence skips AI', () => {
  it('high-confidence campus_refresh description bypasses AI', async () => {
    const r = await enhancedProjectTypeDetection(
      'campus LAN refresh with switch replacement and access layer upgrade',
    );
    expect(r.type).toBe('campus_refresh');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('high-confidence sd_wan description bypasses AI', async () => {
    const r = await enhancedProjectTypeDetection(
      'SD-WAN migration with WAN transformation, MPLS migration, and branch connectivity',
    );
    expect(r.type).toBe('sd_wan');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('enhancedProjectTypeDetection — low-confidence escalates to AI', () => {
  it('vague description with no pattern matches calls AI', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        type: 'security_upgrade',
        confidence: 0.82,
        evidence: ['mentions zero-trust posture for finance vertical'],
      },
      tokensUsed: 120,
      latencyMs: 40,
    });

    const r = await enhancedProjectTypeDetection(
      'We need to revamp our overall posture for a regulated finance environment.',
      'Acme Bank',
      'finance',
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(r.type).toBe('security_upgrade');
    expect(r.confidence).toBe(0.82);

    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Acme Bank');
    expect(callArgs.prompt).toContain('finance');
  });

  it('AI failure falls back to deterministic result', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const r = await enhancedProjectTypeDetection(
      'We need to revamp our overall posture for a regulated finance environment.',
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(r.type).toBe('general');
    expect(r.confidence).toBe(0.3);
  });
});

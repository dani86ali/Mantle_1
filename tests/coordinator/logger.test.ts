import { describe, it, expect, beforeEach } from 'vitest';
import { logEntry, getLogs, clearLogs } from '@/coordinator/logger';
import type { LogEntry } from '@/coordinator/logger';

const PIPE_A = 'pipe-001';
const PIPE_B = 'pipe-002';

beforeEach(() => {
  clearLogs(PIPE_A);
  clearLogs(PIPE_B);
});

describe('logEntry / getLogs', () => {
  it('logs an engine call and retrieves all fields', () => {
    const entry: LogEntry = {
      timestamp: new Date('2026-05-09T10:00:00Z'),
      pipelineId: PIPE_A,
      opportunityId: 'opp-abc',
      level: 'info',
      category: 'engine_call',
      engine: 'e1',
      model: 'claude-sonnet-4-6',
      tokensIn: 1200,
      tokensOut: 340,
      durationMs: 4200,
    };

    logEntry(entry);
    const logs = getLogs(PIPE_A);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual(entry);
  });

  it('filters logs by pipelineId — each pipeline only sees its own entries', () => {
    const entryA: LogEntry = {
      timestamp: new Date('2026-05-09T10:00:00Z'),
      pipelineId: PIPE_A,
      opportunityId: 'opp-abc',
      level: 'info',
      category: 'routing',
    };
    const entryB: LogEntry = {
      timestamp: new Date('2026-05-09T10:01:00Z'),
      pipelineId: PIPE_B,
      opportunityId: 'opp-xyz',
      level: 'warn',
      category: 'error',
      errorMessage: 'timeout on e2',
    };

    logEntry(entryA);
    logEntry(entryB);

    expect(getLogs(PIPE_A)).toHaveLength(1);
    expect(getLogs(PIPE_A)[0].pipelineId).toBe(PIPE_A);

    expect(getLogs(PIPE_B)).toHaveLength(1);
    expect(getLogs(PIPE_B)[0].pipelineId).toBe(PIPE_B);
    expect(getLogs(PIPE_B)[0].errorMessage).toBe('timeout on e2');
  });
});

describe('clearLogs', () => {
  it('removes all entries for a pipeline without affecting others', () => {
    logEntry({
      timestamp: new Date(),
      pipelineId: PIPE_A,
      opportunityId: 'opp-abc',
      level: 'info',
      category: 'checkpoint',
      checkpointId: 'cp-01',
      decision: 'approved',
    });
    logEntry({
      timestamp: new Date(),
      pipelineId: PIPE_B,
      opportunityId: 'opp-xyz',
      level: 'info',
      category: 'artifact',
    });

    clearLogs(PIPE_A);

    expect(getLogs(PIPE_A)).toHaveLength(0);
    expect(getLogs(PIPE_B)).toHaveLength(1);
  });

  it('is a no-op for a pipeline with no logs', () => {
    expect(() => clearLogs('pipe-nonexistent')).not.toThrow();
    expect(getLogs('pipe-nonexistent')).toHaveLength(0);
  });
});

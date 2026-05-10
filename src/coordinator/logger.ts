import type { EngineId } from './types';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogCategory = 'engine_call' | 'checkpoint' | 'artifact' | 'routing' | 'error';

export interface LogEntry {
  timestamp: Date;
  pipelineId: string;
  opportunityId: string;
  level: LogLevel;
  category: LogCategory;
  // engine_call fields
  engine?: EngineId;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  // checkpoint fields
  checkpointId?: string;
  decision?: string;
  // error fields
  errorMessage?: string;
}

const store = new Map<string, LogEntry[]>();

export function logEntry(entry: LogEntry): void {
  const bucket = store.get(entry.pipelineId) ?? [];
  bucket.push(entry);
  store.set(entry.pipelineId, bucket);
}

export function getLogs(pipelineId: string): LogEntry[] {
  return store.get(pipelineId) ?? [];
}

export function clearLogs(pipelineId: string): void {
  store.delete(pipelineId);
}

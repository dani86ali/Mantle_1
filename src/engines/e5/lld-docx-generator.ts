/**
 * E5 — LLD Word document generator (Playbook §3.7, 21 sections).
 * Thin wrapper over design-docx-helpers; LLD-specific title + section type.
 */
import type { LLDSection } from '@/engines/e5/types';
import {
  generateDesignDocx,
  type DesignDocMetadata,
} from '@/engines/e5/design-docx-helpers';

export interface LLDDocxMetadata extends DesignDocMetadata {}

/**
 * Render an LLD .docx file at outputPath. Returns the path on success.
 */
export async function generateLLDDocx(
  sections: LLDSection[],
  metadata: LLDDocxMetadata,
  outputPath: string,
): Promise<string> {
  return generateDesignDocx(
    'Low-Level Design Document',
    sections,
    metadata,
    outputPath,
  );
}

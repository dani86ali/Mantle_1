/**
 * E5 — HLD Word document generator (Playbook §3.6, 12 sections).
 * Thin wrapper over design-docx-helpers; HLD-specific title + section type.
 */
import type { HLDSection } from '@/engines/e5/types';
import {
  generateDesignDocx,
  type DesignDocMetadata,
} from '@/engines/e5/design-docx-helpers';

export interface HLDDocxMetadata extends DesignDocMetadata {}

/**
 * Render an HLD .docx file at outputPath. Returns the path on success.
 */
export async function generateHLDDocx(
  sections: HLDSection[],
  metadata: HLDDocxMetadata,
  outputPath: string,
): Promise<string> {
  return generateDesignDocx(
    'High-Level Design Document',
    sections,
    metadata,
    outputPath,
  );
}

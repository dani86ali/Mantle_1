/** Generic docxtemplater render wrapper.
 *  Loads a `.docx` template, substitutes placeholders + loops with the supplied
 *  data, and writes the rendered zip to disk. Errors from docxtemplater are
 *  surfaced with their original message + property bag so callers can diagnose
 *  unresolved tags or loop/closing mismatches.
 *
 *  STRICT mode: when `markMissing` is supplied, unresolved scalar placeholders
 *  render as `markMissing(tag)` (e.g., "<<MISSING:foo>>") rather than the
 *  default empty string. Callers can then scan the rendered XML for "<<MISSING:"
 *  to enforce a non-empty-output contract (mirrors the previous STRICT_PROPOSAL
 *  semantics from docx-generator.ts).
 */

import { readFile, writeFile } from 'fs/promises';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export interface RenderOptions {
  /** When set, unresolved scalar placeholders render as `markMissing(tag)`
   *  instead of the default empty string. */
  markMissing?: (tag: string) => string;
}

export async function renderDocxFromTemplate(
  templatePath: string,
  data: Record<string, unknown>,
  outputPath: string,
  opts: RenderOptions = {},
): Promise<string> {
  if (!templatePath) throw new Error('renderDocxFromTemplate: templatePath required');
  if (!outputPath) throw new Error('renderDocxFromTemplate: outputPath required');

  const buf = await readFile(templatePath);
  const zip = new PizZip(buf);

  const dtOpts: Record<string, unknown> = {
    paragraphLoop: true,
    linebreaks: true,
  };
  if (opts.markMissing) {
    const mark = opts.markMissing;
    // docxtemplater calls nullGetter for unresolved tags. `part.value` is the
    // tag name; the marker lets a STRICT scan catch missing data downstream.
    dtOpts.nullGetter = (part: { value?: string }): string => mark(part?.value ?? '?');
  }

  let dt: Docxtemplater<PizZip>;
  try {
    dt = new Docxtemplater<PizZip>(zip, dtOpts);
  } catch (err) {
    throw decorateError(err, `template parse failed (${templatePath})`);
  }

  try {
    dt.render(data);
  } catch (err) {
    throw decorateError(err, `template render failed (${templatePath})`);
  }

  const outBuf = dt.getZip().generate({ type: 'nodebuffer' }) as Buffer;
  await writeFile(outputPath, outBuf);
  return outputPath;
}

interface DocxtemplaterMultiError {
  message: string;
  properties?: {
    errors?: Array<{
      message?: string;
      properties?: { explanation?: string; xtag?: string; offset?: number };
    }>;
  };
}

function decorateError(err: unknown, prefix: string): Error {
  if (!(err instanceof Error)) return new Error(`${prefix}: ${String(err)}`);
  const me = err as unknown as DocxtemplaterMultiError;
  const inner = me.properties?.errors;
  if (Array.isArray(inner) && inner.length > 0) {
    const details = inner
      .map((e) => {
        const tag = e.properties?.xtag ?? '?';
        const explanation = e.properties?.explanation ?? e.message ?? '';
        return `[${tag}] ${explanation}`;
      })
      .join('; ');
    return new Error(`${prefix}: ${(err as Error).message} — ${details}`);
  }
  return new Error(`${prefix}: ${(err as Error).message}`);
}

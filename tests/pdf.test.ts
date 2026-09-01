import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseReportPdf } from '@/lib/pdf';

describe('PDF processing', () => {
  it('extracts searchable text page by page', async () => {
    const bytes = new Uint8Array(await readFile(new URL('./fixtures/sample.pdf', import.meta.url)));
    const parsed = await parseReportPdf(bytes);
    expect(parsed.totalPages).toBe(1);
    expect(parsed.plainText).toContain('Dummy PDF file');
    expect(parsed.sections[0].anchorId).toBe('page-1');
  });
});

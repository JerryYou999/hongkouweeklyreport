import { extractText, getDocumentProxy, getMeta } from 'unpdf';
import type { ParsedSection } from '@/lib/html';

const MAX_PDF_PAGES = 300;

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function parseReportPdf(bytes: Uint8Array) {
  const document = await getDocumentProxy(bytes, {
    maxImageSize: 16_777_216,
  });

  if (document.numPages > MAX_PDF_PAGES) throw new Error('PDF_TOO_MANY_PAGES');

  const [metadata, extracted] = await Promise.all([
    getMeta(document).catch(() => ({ info: {}, metadata: {} })),
    extractText(document, { mergePages: false }),
  ]);

  const pages = extracted.text.map(normalizeText);
  const sections: ParsedSection[] = pages
    .map((plainText, index) => ({
      heading: `第 ${index + 1} 页`,
      headingPath: [`第 ${index + 1} 页`],
      anchorId: `page-${index + 1}`,
      plainText,
    }))
    .filter((section) => section.plainText.length > 0);

  const plainText = normalizeText(sections.map((section) => section.plainText).join('\n\n'));
  if (!plainText) throw new Error('PDF_HAS_NO_SEARCHABLE_TEXT');

  const info = metadata.info as Record<string, unknown>;
  return {
    title: typeof info.Title === 'string' ? normalizeText(info.Title) : '',
    sections,
    plainText,
    totalPages: document.numPages,
  };
}

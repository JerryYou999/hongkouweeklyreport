import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';

export type ParsedSection = {
  heading: string | null;
  headingPath: string[];
  anchorId: string;
  plainText: string;
};

const allowedTags = [
  'html', 'head', 'body', 'title', 'meta', 'style',
  'article', 'section', 'main', 'header', 'footer', 'nav', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'b',
  'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'th', 'td', 'caption', 'figure', 'figcaption', 'a', 'img',
];

export function sanitizeReportHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags,
    allowedAttributes: {
      '*': ['id', 'class', 'title', 'style'],
      html: ['lang', 'dir'],
      meta: ['charset', 'name', 'content'],
      a: ['href'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
    },
    allowedSchemes: ['data'],
    allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['data'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'textarea', 'option', 'noscript'],
    allowVulnerableTags: true,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
    },
  });
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function safeAnchor(value: string, index: number) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-_]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || `section-${index + 1}`;
}

export function parseReportHtml(input: string) {
  const sanitizedHtml = sanitizeReportHtml(input);
  const $ = cheerio.load(sanitizedHtml);
  const title = normalizeText($('title').first().text() || $('h1').first().text());
  const sections: ParsedSection[] = [];
  const headingStack: string[] = [];
  let currentHeading: string | null = null;
  let currentPath: string[] = [];
  let currentAnchor = '';
  let buffer: string[] = [];

  const flush = () => {
    const plainText = normalizeText(buffer.join('\n'));
    if (!plainText) return;
    const index = sections.length;
    sections.push({
      heading: currentHeading,
      headingPath: currentPath,
      anchorId: safeAnchor(currentAnchor || currentHeading || '', index),
      plainText,
    });
    buffer = [];
  };

  $('body').find('h1,h2,h3,h4,p,li,blockquote,figcaption,pre,tr').each((_index, element) => {
    const tagName = element.tagName.toLowerCase();
    const text = normalizeText($(element).text());
    if (!text) return;

    if (/^h[1-4]$/.test(tagName)) {
      flush();
      const level = Number(tagName.slice(1));
      headingStack[level - 1] = text;
      headingStack.length = level;
      currentHeading = text;
      currentPath = headingStack.filter(Boolean);
      currentAnchor = $(element).attr('id') || '';
      $(element).attr('id', safeAnchor(currentAnchor || text, sections.length));
      return;
    }

    buffer.push(text);
    if (buffer.join('').length >= 1800) flush();
  });
  flush();

  if (sections.length === 0) {
    const plainText = normalizeText($('body').text());
    if (plainText) sections.push({ heading: null, headingPath: [], anchorId: 'section-1', plainText });
  }

  return {
    title,
    sanitizedHtml: $.html(),
    sections,
    plainText: normalizeText(sections.map((section) => section.plainText).join('\n\n')),
  };
}

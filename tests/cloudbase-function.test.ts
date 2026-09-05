import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { getIsoWeek, normalizeReport, makeExcerpt } = require('../cloudbase/functions/weekly-report-api')._test;

function validReport() {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    id,
    title: '',
    reportDate: '2026-09-04',
    authorName: '测试作者',
    department: '测试部门',
    tags: ['虹口', '周报'],
    originalFilename: 'weekly.html',
    mimeType: 'text/html',
    sizeBytes: 1024,
    sha256: 'a'.repeat(64),
    plainText: '这是用于检索的周报正文。',
    sectionHeadings: [{ id: 'part-one', heading: '第一部分' }],
    originalFileId: `cloud://test.bucket/weekly-reports/${id}/original.html`,
  };
}

describe('CloudBase weekly report function', () => {
  it('calculates ISO week across year boundaries', () => {
    expect(getIsoWeek('2025-12-29')).toEqual({ isoYear: 2026, isoWeek: 1 });
  });

  it('normalizes a valid report and generates the default title', () => {
    const report = normalizeReport(validReport());
    expect(report.week_key).toBe('2026-W36');
    expect(report.title).toBe('2026 年第 36 周虹口区区域深耕周报');
    expect(report.section_headings).toEqual([{ id: 'part-one', order_index: 0, heading: '第一部分' }]);
  });

  it('rejects a file ID outside the allocated report path', () => {
    expect(() => normalizeReport({ ...validReport(), originalFileId: 'cloud://test.bucket/other/file.html' }))
      .toThrow('云存储文件路径无效');
  });

  it('builds a compact excerpt around the matching keyword', () => {
    const text = `${'前'.repeat(100)}社区治理${'后'.repeat(400)}`;
    const excerpt = makeExcerpt(text, '社区治理');
    expect(excerpt).toContain('社区治理');
    expect(excerpt.length).toBeLessThanOrEqual(422);
    expect(excerpt.startsWith('…')).toBe(true);
  });
});

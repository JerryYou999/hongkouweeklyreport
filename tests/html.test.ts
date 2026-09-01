import { describe, expect, it } from 'vitest';
import { parseReportHtml, sanitizeReportHtml } from '@/lib/html';

describe('HTML processing', () => {
  it('removes active and external content', () => {
    const clean = sanitizeReportHtml('<script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"><p>正文</p>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('https://example.com');
    expect(clean).toContain('正文');
  });

  it('preserves embedded and inline presentation styles', () => {
    const clean = sanitizeReportHtml(
      '<style>.hero{color:#075f46;border:2px solid}</style><section class="hero" style="padding:24px">周报</section>',
    );
    expect(clean).toContain('<style>.hero{color:#075f46;border:2px solid}</style>');
    expect(clean).toContain('class="hero"');
    expect(clean).toContain('style="padding:24px"');
  });

  it('splits a report into searchable sections', () => {
    const parsed = parseReportHtml('<h1>周报</h1><p>概览内容</p><h2>重点项目</h2><p>四川北路项目进展</p>');
    expect(parsed.plainText).toContain('四川北路项目进展');
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[1].headingPath).toEqual(['周报', '重点项目']);
  });
});

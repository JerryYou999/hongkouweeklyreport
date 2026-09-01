import { z } from 'zod';
import { bindings, ensureSchema } from '@/lib/db';
import { parseReportHtml } from '@/lib/html';
import { getIsoWeek } from '@/lib/iso-week';
import { parseReportPdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const metadataSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorName: z.string().trim().max(100).optional().default(''),
  department: z.string().trim().max(100).optional().default(''),
  tags: z.string().trim().max(500).optional().default(''),
});

function jsonError(code: string, message: string, status = 400) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function isPdf(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

async function sha256(bytes: Uint8Array) {
  const buffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function enforceRateLimit(request: Request) {
  const db = bindings().DB;
  const dateBucket = new Date().toISOString().slice(0, 10);
  const address = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const addressHash = await sha256(new TextEncoder().encode(address));
  const ipScope = `ip:${addressHash.slice(0, 24)}`;
  await db.batch([
    db.prepare(
      `INSERT INTO upload_limits (scope, bucket, request_count) VALUES (?, ?, 1)
       ON CONFLICT(scope, bucket) DO UPDATE SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP`,
    ).bind(ipScope, dateBucket),
    db.prepare(
      `INSERT INTO upload_limits (scope, bucket, request_count) VALUES ('global', ?, 1)
       ON CONFLICT(scope, bucket) DO UPDATE SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP`,
    ).bind(dateBucket),
  ]);
  const [ipCount, globalCount] = await Promise.all([
    db.prepare('SELECT request_count FROM upload_limits WHERE scope = ? AND bucket = ?').bind(ipScope, dateBucket).first<{ request_count: number }>(),
    db.prepare("SELECT request_count FROM upload_limits WHERE scope = 'global' AND bucket = ?").bind(dateBucket).first<{ request_count: number }>(),
  ]);
  if ((ipCount?.request_count ?? 0) > 20 || (globalCount?.request_count ?? 0) > 200) {
    throw new Error('UPLOAD_RATE_LIMITED');
  }
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error('DOCUMENT_PARSE_TIMEOUT')), milliseconds);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timeoutId) clearTimeout(timeoutId); }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    await enforceRateLimit(request);
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return jsonError('FILE_REQUIRED', '请选择 HTML 或 PDF 文件。');
    if (file.size === 0) return jsonError('EMPTY_FILE', '上传文件不能为空。');
    if (file.size > MAX_UPLOAD_BYTES) return jsonError('FILE_TOO_LARGE', '文件不能超过 10 MB。', 413);

    const metadata = metadataSchema.safeParse({
      title: formData.get('title') ?? undefined,
      reportDate: formData.get('reportDate'),
      authorName: formData.get('authorName') ?? undefined,
      department: formData.get('department') ?? undefined,
      tags: formData.get('tags') ?? undefined,
    });
    if (!metadata.success) return jsonError('INVALID_METADATA', '请检查周报日期和填写内容。');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = file.name.toLowerCase().split('.').pop();
    const pdf = isPdf(bytes);
    const html = !pdf && (extension === 'html' || extension === 'htm' || file.type === 'text/html');
    if (!pdf && !html) return jsonError('UNSUPPORTED_FILE_TYPE', '只支持 HTML、HTM 或 PDF 文件。');

    const parsed = pdf
      ? await withTimeout(parseReportPdf(bytes), 25_000)
      : parseReportHtml(new TextDecoder('utf-8').decode(bytes));
    const { isoYear, isoWeek } = getIsoWeek(metadata.data.reportDate);
    const digest = await sha256(bytes);
    const db = bindings().DB;
    const bucket = bindings().REPORTS_BUCKET;

    const duplicate = await db.prepare(
      'SELECT id, version_number FROM reports WHERE iso_year = ? AND iso_week = ? AND sha256 = ? LIMIT 1',
    ).bind(isoYear, isoWeek, digest).first<{ id: string; version_number: number }>();
    if (duplicate) {
      return Response.json({
        success: true,
        duplicate: true,
        reportId: duplicate.id,
        version: duplicate.version_number,
        reportUrl: `/reports/${duplicate.id}`,
      });
    }

    const current = await db.prepare(
      'SELECT id, version_number FROM reports WHERE iso_year = ? AND iso_week = ? AND is_current = 1',
    ).bind(isoYear, isoWeek).first<{ id: string; version_number: number }>();

    const reportId = crypto.randomUUID();
    const versionNumber = (current?.version_number ?? 0) + 1;
    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-120) || `report.${pdf ? 'pdf' : 'html'}`;
    const baseKey = `${isoYear}/W${String(isoWeek).padStart(2, '0')}/${reportId}`;
    const originalKey = `${baseKey}/original-${safeName}`;
    const sanitizedKey = pdf ? originalKey : `${baseKey}/sanitized.html`;
    const mimeType = pdf ? 'application/pdf' : 'text/html';
    const tags = metadata.data.tags.split(/[,，/]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
    const title = metadata.data.title || parsed.title || `${isoYear}年第${isoWeek}周虹口区区域深耕周报`;
    const sectionHeadings = parsed.sections.map((section) => section.heading).filter(Boolean).join('\n');

    await bucket.put(originalKey, bytes, { httpMetadata: { contentType: mimeType } });
    if (!pdf) {
      const sanitizedHtml = 'sanitizedHtml' in parsed ? parsed.sanitizedHtml : '';
      await bucket.put(sanitizedKey, sanitizedHtml, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });
    }

    const statements: D1PreparedStatement[] = [];
    if (current) {
      statements.push(db.prepare('UPDATE reports SET is_current = 0 WHERE id = ?').bind(current.id));
    }
    statements.push(
      db.prepare(
        `INSERT INTO reports (
          id, iso_year, iso_week, version_number, title, report_date, author_name,
          department, tags_json, original_filename, original_key, sanitized_key,
          mime_type, size_bytes, sha256, plain_text, is_current, supersedes_report_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).bind(
        reportId, isoYear, isoWeek, versionNumber, title, metadata.data.reportDate,
        metadata.data.authorName || null, metadata.data.department || null,
        JSON.stringify(tags), file.name, originalKey, sanitizedKey, mimeType,
        file.size, digest, parsed.plainText, current?.id ?? null,
      ),
    );
    parsed.sections.forEach((section, index) => {
      statements.push(
        db.prepare(
          `INSERT INTO report_sections (
            id, report_id, order_index, heading, heading_path, anchor_id, plain_text, char_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), reportId, index, section.heading,
          JSON.stringify(section.headingPath), section.anchorId, section.plainText,
          Array.from(section.plainText).length,
        ),
      );
    });
    statements.push(
      db.prepare(
        'INSERT INTO reports_fts (report_id, title, body, headings, tags) VALUES (?, ?, ?, ?, ?)',
      ).bind(reportId, title, parsed.plainText, sectionHeadings, tags.join(' ')),
    );

    try {
      await db.batch(statements);
    } catch (error) {
      await Promise.all([bucket.delete(originalKey), pdf ? Promise.resolve() : bucket.delete(sanitizedKey)]);
      throw error;
    }

    return Response.json({
      success: true,
      duplicate: false,
      reportId,
      version: versionNumber,
      replaced: Boolean(current),
      reportUrl: `/reports/${reportId}`,
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UPLOAD_FAILED';
    if (code === 'PDF_HAS_NO_SEARCHABLE_TEXT') {
      return jsonError(code, '该 PDF 没有可搜索的文本层，当前版本暂不支持扫描件 OCR。', 422);
    }
    if (code === 'PDF_TOO_MANY_PAGES') {
      return jsonError(code, 'PDF 页数不能超过 300 页。', 413);
    }
    if (code === 'UPLOAD_RATE_LIMITED') {
      return jsonError(code, '今天的上传次数已达到限制，请稍后再试。', 429);
    }
    if (code === 'DOCUMENT_PARSE_TIMEOUT') {
      return jsonError(code, '文件解析超时，请检查文件是否损坏或过于复杂。', 422);
    }
    console.error('report_upload_failed', { code });
    return jsonError('UPLOAD_FAILED', '上传或解析失败，请稍后重试。', 500);
  }
}

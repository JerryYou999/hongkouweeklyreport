import { schemaStatements } from '../../db/schema';
import { parseReportHtml, sanitizeReportHtml } from '../../lib/html';
import { getIsoWeek } from '../../lib/iso-week';
import { parseReportPdf } from '../../lib/pdf';
import type { ReportRecord, SectionRecord } from '../../lib/types';

type Env = {
  DB: D1Database;
  REPORTS_BUCKET: R2Bucket;
  FRONTEND_ORIGIN: string;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
let schemaReady: Promise<void> | null = null;

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  const allowed = !origin || origin === env.FRONTEND_ORIGIN || origin.startsWith('http://localhost:');
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, env: Env, value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders(request, env) });
}

function error(request: Request, env: Env, code: string, message: string, status = 400) {
  return json(request, env, { success: false, error: { code, message } }, status);
}

async function ensureSchema(env: Env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of schemaStatements) await env.DB.prepare(statement).run();
    })().catch((cause) => {
      schemaReady = null;
      throw cause;
    });
  }
  await schemaReady;
}

function ftsQuery(query: string) {
  return query.trim().replace(/["*:^(){}[\]]/g, ' ').split(/\s+/).filter(Boolean).map((part) => `"${part}"`).join(' ');
}

async function search(env: Env, query: string, year?: number, week?: number) {
  const filters = ['r.is_current = 1'];
  const values: Array<string | number> = [];
  if (year) { filters.push('r.iso_year = ?'); values.push(year); }
  if (week) { filters.push('r.iso_week = ?'); values.push(week); }
  if (!query) {
    return (await env.DB.prepare(`SELECT r.* FROM reports r WHERE ${filters.join(' AND ')} ORDER BY r.report_date DESC LIMIT 50`).bind(...values).all<ReportRecord>()).results;
  }
  if (Array.from(query.replace(/\s/g, '')).length >= 3) {
    return (await env.DB.prepare(`SELECT r.* FROM reports_fts f JOIN reports r ON r.id = f.report_id WHERE reports_fts MATCH ? AND ${filters.join(' AND ')} ORDER BY bm25(reports_fts, 0, 5, 1, 3.5, 3), r.report_date DESC LIMIT 50`).bind(ftsQuery(query), ...values).all<ReportRecord>()).results;
  }
  const like = `%${query.replace(/[%_]/g, '\\$&')}%`;
  return (await env.DB.prepare(`SELECT r.* FROM reports r WHERE ${filters.join(' AND ')} AND (r.title LIKE ? ESCAPE '\\' OR r.plain_text LIKE ? ESCAPE '\\' OR r.tags_json LIKE ? ESCAPE '\\') ORDER BY r.report_date DESC LIMIT 50`).bind(...values, like, like, like).all<ReportRecord>()).results;
}

function isPdf(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function enforceRateLimit(request: Request, env: Env) {
  const bucket = new Date().toISOString().slice(0, 10);
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const addressHash = (await sha256(new TextEncoder().encode(address))).slice(0, 24);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO upload_limits (scope,bucket,request_count) VALUES (?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET request_count=request_count+1,updated_at=CURRENT_TIMESTAMP`).bind(`ip:${addressHash}`, bucket),
    env.DB.prepare(`INSERT INTO upload_limits (scope,bucket,request_count) VALUES ('global',?,1) ON CONFLICT(scope,bucket) DO UPDATE SET request_count=request_count+1,updated_at=CURRENT_TIMESTAMP`).bind(bucket),
  ]);
  const [ip, global] = await Promise.all([
    env.DB.prepare('SELECT request_count FROM upload_limits WHERE scope=? AND bucket=?').bind(`ip:${addressHash}`, bucket).first<{ request_count: number }>(),
    env.DB.prepare("SELECT request_count FROM upload_limits WHERE scope='global' AND bucket=?").bind(bucket).first<{ request_count: number }>(),
  ]);
  if ((ip?.request_count || 0) > 20 || (global?.request_count || 0) > 200) throw new Error('UPLOAD_RATE_LIMITED');
}

async function upload(request: Request, env: Env) {
  await enforceRateLimit(request, env);
  const form = await request.formData();
  const file = form.get('file');
  const reportDate = String(form.get('reportDate') || '');
  if (!(file instanceof File)) return error(request, env, 'FILE_REQUIRED', '请选择 HTML 或 PDF 文件。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return error(request, env, 'INVALID_METADATA', '请填写有效的周报日期。');
  if (!file.size) return error(request, env, 'EMPTY_FILE', '上传文件不能为空。');
  if (file.size > MAX_UPLOAD_BYTES) return error(request, env, 'FILE_TOO_LARGE', '文件不能超过 10 MB。', 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = isPdf(bytes);
  const extension = file.name.toLowerCase().split('.').pop();
  const html = !pdf && (extension === 'html' || extension === 'htm' || file.type === 'text/html');
  if (!pdf && !html) return error(request, env, 'UNSUPPORTED_FILE_TYPE', '只支持 HTML、HTM 或 PDF 文件。');

  const parsed = pdf ? await parseReportPdf(bytes) : parseReportHtml(new TextDecoder().decode(bytes));
  const { isoYear, isoWeek } = getIsoWeek(reportDate);
  const digest = await sha256(bytes);
  const duplicate = await env.DB.prepare('SELECT id,version_number FROM reports WHERE iso_year=? AND iso_week=? AND sha256=? LIMIT 1').bind(isoYear, isoWeek, digest).first<{ id: string; version_number: number }>();
  if (duplicate) return json(request, env, { success: true, duplicate: true, reportId: duplicate.id, version: duplicate.version_number });

  const current = await env.DB.prepare('SELECT id,version_number FROM reports WHERE iso_year=? AND iso_week=? AND is_current=1').bind(isoYear, isoWeek).first<{ id: string; version_number: number }>();
  const id = crypto.randomUUID();
  const version = (current?.version_number || 0) + 1;
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-120) || `report.${pdf ? 'pdf' : 'html'}`;
  const baseKey = `${isoYear}/W${String(isoWeek).padStart(2, '0')}/${id}`;
  const originalKey = `${baseKey}/original-${safeName}`;
  const sanitizedKey = pdf ? originalKey : `${baseKey}/sanitized.html`;
  const tags = String(form.get('tags') || '').split(/[,，/]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
  const enteredTitle = String(form.get('title') || '').trim().slice(0, 200);
  const title = enteredTitle || parsed.title || `${isoYear}年第${isoWeek}周虹口区区域深耕周报`;
  const mimeType = pdf ? 'application/pdf' : 'text/html';
  const headings = parsed.sections.map((section) => section.heading).filter(Boolean).join('\n');

  await env.REPORTS_BUCKET.put(originalKey, bytes, { httpMetadata: { contentType: mimeType } });
  if ('sanitizedHtml' in parsed) await env.REPORTS_BUCKET.put(sanitizedKey, parsed.sanitizedHtml, { httpMetadata: { contentType: 'text/html; charset=utf-8' } });
  const statements: D1PreparedStatement[] = [];
  if (current) statements.push(env.DB.prepare('UPDATE reports SET is_current=0 WHERE id=?').bind(current.id));
  statements.push(env.DB.prepare(`INSERT INTO reports (id,iso_year,iso_week,version_number,title,report_date,author_name,department,tags_json,original_filename,original_key,sanitized_key,mime_type,size_bytes,sha256,plain_text,is_current,supersedes_report_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`).bind(id, isoYear, isoWeek, version, title, reportDate, String(form.get('authorName') || '').trim().slice(0, 100) || null, String(form.get('department') || '').trim().slice(0, 100) || null, JSON.stringify(tags), file.name, originalKey, sanitizedKey, mimeType, file.size, digest, parsed.plainText, current?.id || null));
  parsed.sections.forEach((section, index) => statements.push(env.DB.prepare(`INSERT INTO report_sections (id,report_id,order_index,heading,heading_path,anchor_id,plain_text,char_count) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, index, section.heading, JSON.stringify(section.headingPath), section.anchorId, section.plainText, Array.from(section.plainText).length)));
  statements.push(env.DB.prepare('INSERT INTO reports_fts (report_id,title,body,headings,tags) VALUES (?,?,?,?,?)').bind(id, title, parsed.plainText, headings, tags.join(' ')));
  try {
    await env.DB.batch(statements);
  } catch (cause) {
    await Promise.all([env.REPORTS_BUCKET.delete(originalKey), pdf ? Promise.resolve() : env.REPORTS_BUCKET.delete(sanitizedKey)]);
    throw cause;
  }
  return json(request, env, { success: true, duplicate: false, replaced: Boolean(current), reportId: id, version }, 201);
}

async function handle(request: Request, env: Env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  const url = new URL(request.url);
  if (url.pathname === '/health') return json(request, env, { ok: true });
  await ensureSchema(env);

  if (request.method === 'GET' && url.pathname === '/api/reports') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 100);
    const result = await env.DB.prepare('SELECT * FROM reports WHERE is_current=1 ORDER BY report_date DESC,created_at DESC LIMIT ?').bind(limit).all<ReportRecord>();
    return json(request, env, { reports: result.results });
  }
  if (request.method === 'GET' && url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const year = Number(url.searchParams.get('year')) || undefined;
    const week = Number(url.searchParams.get('week')) || undefined;
    return json(request, env, { reports: await search(env, query, year, week) });
  }
  if (request.method === 'POST' && url.pathname === '/api/reports/upload') return upload(request, env);

  const match = url.pathname.match(/^\/api\/reports\/([^/]+)(?:\/(preview|download))?$/);
  if (request.method === 'GET' && match) {
    const report = await env.DB.prepare('SELECT * FROM reports WHERE id=?').bind(match[1]).first<ReportRecord>();
    if (!report) return error(request, env, 'NOT_FOUND', '没有找到这份周报。', 404);
    if (!match[2]) {
      const [sections, versions] = await Promise.all([
        env.DB.prepare('SELECT * FROM report_sections WHERE report_id=? ORDER BY order_index').bind(report.id).all<SectionRecord>(),
        env.DB.prepare('SELECT * FROM reports WHERE iso_year=? AND iso_week=? ORDER BY version_number DESC').bind(report.iso_year, report.iso_week).all<ReportRecord>(),
      ]);
      return json(request, env, { report, sections: sections.results, versions: versions.results });
    }
    const object = await env.REPORTS_BUCKET.get(report.original_key);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers(corsHeaders(request, env));
    headers.set('X-Content-Type-Options', 'nosniff');
    if (match[2] === 'download') {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(report.original_filename)}`);
      return new Response(object.body, { headers });
    }
    headers.set('Content-Disposition', `inline; filename="preview.${report.mime_type === 'application/pdf' ? 'pdf' : 'html'}"`);
    if (report.mime_type === 'application/pdf') {
      headers.set('Content-Type', 'application/pdf');
      return new Response(object.body, { headers });
    }
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Security-Policy', `default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors ${env.FRONTEND_ORIGIN}; base-uri 'none'; form-action 'none'`);
    return new Response(sanitizeReportHtml(await object.text()), { headers });
  }
  return error(request, env, 'NOT_FOUND', '接口不存在。', 404);
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handle(request, env);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'SERVER_ERROR';
      const known: Record<string, [string, number]> = {
        PDF_HAS_NO_SEARCHABLE_TEXT: ['该 PDF 没有可搜索的文本层，当前版本暂不支持扫描件 OCR。', 422],
        PDF_TOO_MANY_PAGES: ['PDF 页数不能超过 300 页。', 413],
        UPLOAD_RATE_LIMITED: ['今天的上传次数已达到限制，请稍后再试。', 429],
      };
      console.error('request_failed', { code });
      const [message, status] = known[code] || ['请求失败，请稍后重试。', 500];
      return error(request, env, code, message, status);
    }
  },
} satisfies ExportedHandler<Env>;

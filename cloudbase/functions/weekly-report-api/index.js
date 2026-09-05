'use strict';
/* eslint-disable typescript/no-require-imports */

const crypto = require('node:crypto');
const cloudbase = require('@cloudbase/js-sdk');

const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV;
let app;
let db;

const REPORTS = 'weekly_reports';
const UPLOAD_LIMITS = 'weekly_report_upload_limits';
const REPORT_BUCKET = 'weekly-reports';
// CloudBase HTTP functions have a 6 MB synchronous request limit. Leave headroom
// for gateway framing so the browser can reliably proxy a complete file here.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_INDEX_CHARS = 240_000;
const PUBLIC_ORIGIN = 'https://jerryyou999.github.io';

class PublicError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function ensureCloudBase() {
  if (app) return;
  const options = {};
  if (envId) options.env = envId;
  if (process.env.CLOUDBASE_APIKEY) options.accessKey = process.env.CLOUDBASE_APIKEY;
  app = cloudbase.init(options);
  db = app.rdb();
}

function storage() {
  return app.storage.from(REPORT_BUCKET);
}

function ok(data) {
  return { success: true, data };
}

function fail(error) {
  const known = error instanceof PublicError;
  if (!known) console.error('weekly_report_api_failed', error);
  return {
    success: false,
    error: {
      code: known ? error.code : 'SERVER_ERROR',
      message: known ? error.message : '请求失败，请稍后重试。',
    },
  };
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getIsoWeek(dateValue) {
  const input = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(input.getTime())) throw new PublicError('INVALID_REPORT_DATE', '请填写有效的周报日期。');
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear, isoWeek };
}

function pgData(result, fallbackMessage = '数据库暂时无法访问，请稍后重试。') {
  if (result?.error) {
    console.error('postgres_operation_failed', result.error);
    throw new PublicError('DATABASE_UNAVAILABLE', fallbackMessage);
  }
  return result?.data;
}

function uploadFilePath(id, mimeType) {
  const extension = mimeType === 'application/pdf' ? 'pdf' : 'html';
  return `reports/${id}/original.${extension}`;
}

function validFilePath(value) {
  return /^reports\/[0-9a-f-]{36}\/original\.(html|pdf)$/i.test(value);
}

function normalizeReport(input) {
  if (!input || typeof input !== 'object') throw new PublicError('INVALID_METADATA', '上传信息不完整。');
  const id = cleanString(input.id, 64);
  const reportDate = cleanString(input.reportDate, 10);
  const originalFilename = cleanString(input.originalFilename, 255);
  const mimeType = cleanString(input.mimeType, 32);
  const sha256 = cleanString(input.sha256, 64).toLowerCase();
  const originalFilePath = cleanString(input.originalFileId, 1000);
  const sizeBytes = Number(input.sizeBytes);

  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PublicError('INVALID_METADATA', '周报标识无效。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new PublicError('INVALID_REPORT_DATE', '请填写有效的周报日期。');
  if (!['text/html', 'application/pdf'].includes(mimeType)) throw new PublicError('UNSUPPORTED_FILE_TYPE', '只支持 HTML、HTM 或 PDF 文件。');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) throw new PublicError('FILE_TOO_LARGE', '文件不能为空且不能超过 10 MB。');
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new PublicError('INVALID_METADATA', '文件摘要无效。');
  if (originalFilePath !== uploadFilePath(id, mimeType)) throw new PublicError('INVALID_FILE_ID', '云存储文件路径无效。');

  const plainText = cleanString(input.plainText, MAX_INDEX_CHARS);
  if (!plainText) throw new PublicError('EMPTY_SEARCH_TEXT', '周报中没有可用于检索的文字。');

  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => cleanString(tag, 40)).filter(Boolean).slice(0, 20)
    : [];
  const sectionHeadings = Array.isArray(input.sectionHeadings)
    ? input.sectionHeadings.slice(0, 300).map((section, index) => ({
        id: cleanString(section?.id, 80) || `section-${index + 1}`,
        order_index: index,
        heading: cleanString(section?.heading, 200) || null,
      }))
    : [];

  const { isoYear, isoWeek } = getIsoWeek(reportDate);
  const enteredTitle = cleanString(input.title, 200);
  return {
    id,
    iso_year: isoYear,
    iso_week: isoWeek,
    week_key: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`,
    title: enteredTitle || `${isoYear} 年第 ${isoWeek} 周虹口区区域深耕周报`,
    report_date: reportDate,
    author_name: cleanString(input.authorName, 100) || null,
    department: cleanString(input.department, 100) || null,
    tags_json: tags,
    original_filename: originalFilename || `report.${mimeType === 'application/pdf' ? 'pdf' : 'html'}`,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    sha256,
    plain_text: plainText,
    excerpt: plainText.slice(0, 320),
    section_headings: sectionHeadings,
    original_file_path: originalFilePath,
  };
}

function sourceKey(context, event = {}) {
  const cloudContext = cloudbase.getCloudbaseContext(context);
  const headers = event.headers || {};
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  const source = cloudContext.TCB_SOURCE_IP
    || cloudContext.WX_CLIENTIP
    || context?.requestContext?.sourceIp
    || event.requestContext?.sourceIp
    || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '')
    || cloudContext.TCB_UUID
    || 'anonymous';
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
}

async function enforceUploadLimit(context, event) {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const limitKey = `${day}-${sourceKey(context, event)}`;
  const existing = pgData(await db.from(UPLOAD_LIMITS).select('count').eq('limit_key', limitKey).maybeSingle());
  const count = Number(existing?.count || 0);
  if (count >= 20) throw new PublicError('UPLOAD_RATE_LIMITED', '今天从当前网络上传的次数已达到限制，请明天再试。');
  if (existing) {
    pgData(await db.from(UPLOAD_LIMITS).update({ count: count + 1, updated_at: new Date().toISOString() }).eq('limit_key', limitKey));
  } else {
    pgData(await db.from(UPLOAD_LIMITS).insert({ limit_key: limitKey, count: 1 }));
  }
}

async function prepareUpload(event, context) {
  const id = cleanString(event.id, 64);
  const mimeType = cleanString(event.mimeType, 32);
  const sizeBytes = Number(event.sizeBytes);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PublicError('INVALID_METADATA', '周报标识无效。');
  if (!['text/html', 'application/pdf'].includes(mimeType)) throw new PublicError('UNSUPPORTED_FILE_TYPE', '只支持 HTML、HTM 或 PDF 文件。');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) throw new PublicError('FILE_TOO_LARGE', '文件不能为空且不能超过 10 MB。');
  await enforceUploadLimit(context, event);
  const path = uploadFilePath(id, mimeType);
  const result = await storage().createSignedUploadUrl(path, { upsert: true });
  if (result.error || !result.data?.fullSignedURL) {
    console.error('storage_upload_sign_failed', result.error);
    throw new PublicError('UPLOAD_PREPARE_FAILED', '暂时无法准备文件上传，请稍后重试。');
  }
  return ok({ fileId: path, signedUrl: result.data.fullSignedURL, uploadToken: result.data.token || null });
}

async function discardUpload(event) {
  const filePath = cleanString(event.fileId, 1000);
  if (!validFilePath(filePath)) throw new PublicError('INVALID_FILE_ID', '云存储文件路径无效。');
  const result = await storage().remove([filePath]);
  if (result.error) console.warn('storage_remove_failed', result.error);
  return ok({ removed: !result.error });
}

async function proxyUpload(event) {
  const filePath = cleanString(event.queryStringParameters?.path, 1000);
  const token = cleanString(event.queryStringParameters?.token, 2000);
  const mimeType = cleanString(event.headers?.['content-type'] || event.headers?.['Content-Type'], 100);
  if (!validFilePath(filePath) || !token) throw new PublicError('INVALID_UPLOAD_TICKET', '上传凭据无效或已过期，请重新选择文件。');
  const expectedMime = filePath.endsWith('.pdf') ? 'application/pdf' : 'text/html';
  if (mimeType !== expectedMime) throw new PublicError('UNSUPPORTED_FILE_TYPE', '文件类型与上传凭据不匹配。');
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '');
  if (!body.length || body.length > MAX_UPLOAD_BYTES) throw new PublicError('FILE_TOO_LARGE', '文件不能为空且不能超过 5 MB。');
  const result = await storage().uploadToSignedUrl(filePath, token, body, { contentType: mimeType });
  if (result.error) {
    console.error('storage_proxy_upload_failed', result.error);
    throw new PublicError('UPLOAD_FAILED', '文件上传到云存储失败，请重新选择文件后重试。');
  }
  return ok({ fileId: filePath });
}

function jsonValue(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

function publicFields(report, text = '') {
  if (!report) return report;
  const { original_file_path: _, excerpt, section_headings, tags_json, ...rest } = report;
  return {
    ...rest,
    tags_json: typeof tags_json === 'string' ? tags_json : JSON.stringify(tags_json || []),
    plain_text: text || excerpt || '',
    section_headings: jsonValue(section_headings, []),
  };
}

function makeExcerpt(text, query) {
  const value = String(text || '');
  const lowered = value.toLocaleLowerCase('zh-CN');
  const index = lowered.indexOf(String(query || '').toLocaleLowerCase('zh-CN'));
  const start = Math.max(0, index < 0 ? 0 : index - 70);
  return `${start ? '…' : ''}${value.slice(start, start + 420)}${start + 420 < value.length ? '…' : ''}`;
}

async function setup() {
  const reports = pgData(await db.from(REPORTS).select('id').limit(1));
  const limits = pgData(await db.from(UPLOAD_LIMITS).select('limit_key').limit(1));
  const bucket = await storage().list('', { limit: 1 });
  if (bucket.error) {
    console.error('storage_bucket_check_failed', bucket.error);
    throw new PublicError('STORAGE_UNAVAILABLE', '周报文件存储尚未完成配置。');
  }
  return ok({ database: 'ready', bucket: REPORT_BUCKET, reportsChecked: Array.isArray(reports), limitsChecked: Array.isArray(limits) });
}

async function listReports(event) {
  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100);
  const reports = pgData(await db.from(REPORTS)
    .select('id,iso_year,iso_week,week_key,version_number,is_current,supersedes_report_id,title,report_date,author_name,department,tags_json,original_filename,mime_type,size_bytes,sha256,excerpt,created_at')
    .eq('is_current', true)
    .order('report_date', { ascending: false })
    .limit(limit));
  return ok({ reports: reports.map((report) => publicFields(report)) });
}

async function searchReports(event) {
  const query = cleanString(event.q, 200).toLocaleLowerCase('zh-CN');
  const year = Number(event.year) || undefined;
  const week = Number(event.week) || undefined;
  let request = db.from(REPORTS)
    .select('id,iso_year,iso_week,week_key,version_number,is_current,supersedes_report_id,title,report_date,author_name,department,tags_json,original_filename,mime_type,size_bytes,sha256,plain_text,excerpt,created_at')
    .eq('is_current', true)
    .order('report_date', { ascending: false })
    .limit(500);
  if (year) request = request.eq('iso_year', year);
  if (week) request = request.eq('iso_week', week);
  const candidates = pgData(await request);
  const reports = candidates
    .filter((report) => !query || [report.title, report.plain_text, JSON.stringify(report.tags_json || [])]
      .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query)))
    .slice(0, 50)
    .map((report) => publicFields(report, makeExcerpt(report.plain_text, query)));
  return ok({ reports });
}

async function temporaryUrl(filePath) {
  const result = await storage().createSignedUrl(filePath, 900);
  if (result.error || !result.data?.fullSignedURL) {
    console.error('storage_download_sign_failed', result.error);
    throw new PublicError('FILE_NOT_FOUND', '周报文件暂时无法访问。');
  }
  return result.data.fullSignedURL;
}

async function getReport(event) {
  const id = cleanString(event.id, 64);
  if (!id) throw new PublicError('NOT_FOUND', '没有找到这份周报。');
  const report = pgData(await db.from(REPORTS).select('*').eq('id', id).maybeSingle());
  if (!report) throw new PublicError('NOT_FOUND', '没有找到这份周报。');
  const [versionsResult, fileUrl] = await Promise.all([
    db.from(REPORTS)
      .select('id,iso_year,iso_week,week_key,version_number,is_current,supersedes_report_id,title,report_date,author_name,department,tags_json,original_filename,mime_type,size_bytes,sha256,excerpt,created_at')
      .eq('week_key', report.week_key)
      .order('version_number', { ascending: false })
      .limit(100),
    temporaryUrl(report.original_file_path),
  ]);
  return ok({
    report: { ...publicFields(report), preview_url: fileUrl, download_url: fileUrl },
    sections: jsonValue(report.section_headings, []),
    versions: pgData(versionsResult).map((version) => publicFields(version)),
  });
}

async function finalizeUpload(event) {
  const report = normalizeReport(event.report);
  const stored = await storage().exists(report.original_file_path);
  if (stored.error || !stored.data) throw new PublicError('FILE_NOT_FOUND', '没有找到刚刚上传的周报文件，请重新上传。');
  const data = pgData(await db.rpc('finalize_weekly_report', { p_report: report }));
  const outcome = Array.isArray(data) ? data[0] : data;
  if (!outcome?.reportId) throw new PublicError('DATABASE_UNAVAILABLE', '周报版本写入失败，请稍后重试。');
  return ok(outcome);
}

async function dispatch(event = {}, context = {}) {
  try {
    ensureCloudBase();
    switch (event.action) {
      case 'setup': return await setup();
      case 'listReports': return await listReports(event);
      case 'searchReports': return await searchReports(event);
      case 'getReport': return await getReport(event);
      case 'prepareUpload': return await prepareUpload(event, context);
      case 'discardUpload': return await discardUpload(event);
      case 'proxyUpload': return await proxyUpload(event.event || {});
      case 'finalizeUpload': return await finalizeUpload(event, context);
      default: throw new PublicError('NOT_FOUND', '接口不存在。');
    }
  } catch (error) {
    return fail(error);
  }
}

function httpHeaders(event = {}) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const allowOrigin = origin === PUBLIC_ORIGIN || /^http:\/\/localhost(?::\d+)?$/.test(origin || '') ? origin : PUBLIC_ORIGIN;
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function parseHttpBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { throw new PublicError('INVALID_REQUEST', '请求内容不是有效的 JSON。'); }
}

async function httpMain(event = {}, context = {}) {
  const headers = httpHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.rawUpload) {
    if (event.httpMethod !== 'PUT') return { statusCode: 405, headers, body: JSON.stringify(fail(new PublicError('METHOD_NOT_ALLOWED', '上传仅支持 PUT 请求。'))) };
    const result = await dispatch({ action: 'proxyUpload', event }, context);
    return { statusCode: result.success ? 200 : 400, headers, body: JSON.stringify(result) };
  }
  if (event.httpMethod && event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify(fail(new PublicError('METHOD_NOT_ALLOWED', '只支持 POST 请求。'))) };
  let result;
  try {
    const payload = parseHttpBody(event);
    result = await dispatch({ ...payload, headers: event.headers, requestContext: event.requestContext }, context);
  } catch (error) { result = fail(error); }
  return { statusCode: result.success ? 200 : 400, headers, body: JSON.stringify(result) };
}

exports.main = async (event = {}, context = {}) => {
  if (event.httpMethod || Object.hasOwn(event, 'body')) return httpMain(event, context);
  return dispatch(event, context);
};

exports._test = { cleanString, getIsoWeek, normalizeReport, makeExcerpt, uploadFilePath };

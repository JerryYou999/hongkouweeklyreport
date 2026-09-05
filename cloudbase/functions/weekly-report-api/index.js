'use strict';
/* eslint-disable typescript/no-require-imports */

const crypto = require('node:crypto');
const cloudbase = require('@cloudbase/js-sdk');

const app = cloudbase.init({ env: process.env.TCB_ENV || 'local-cloudbase-test' });
const db = app.database();
const _ = db.command;

const REPORTS = 'weekly_reports';
const UPLOAD_LIMITS = 'weekly_report_upload_limits';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_INDEX_CHARS = 240_000;

class PublicError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
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

function parseResultData(result) {
  return Array.isArray(result?.data) ? result.data : [];
}

function normalizeReport(input) {
  if (!input || typeof input !== 'object') throw new PublicError('INVALID_METADATA', '上传信息不完整。');
  const id = cleanString(input.id, 64);
  const reportDate = cleanString(input.reportDate, 10);
  const originalFilename = cleanString(input.originalFilename, 255);
  const mimeType = cleanString(input.mimeType, 32);
  const sha256 = cleanString(input.sha256, 64).toLowerCase();
  const originalFileId = cleanString(input.originalFileId, 1000);
  const sizeBytes = Number(input.sizeBytes);

  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PublicError('INVALID_METADATA', '周报标识无效。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new PublicError('INVALID_REPORT_DATE', '请填写有效的周报日期。');
  if (!['text/html', 'application/pdf'].includes(mimeType)) throw new PublicError('UNSUPPORTED_FILE_TYPE', '只支持 HTML、HTM 或 PDF 文件。');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) throw new PublicError('FILE_TOO_LARGE', '文件不能为空且不能超过 10 MB。');
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new PublicError('INVALID_METADATA', '文件摘要无效。');
  if (!originalFileId.startsWith('cloud://') || !originalFileId.includes(`/weekly-reports/${id}/original.`)) {
    throw new PublicError('INVALID_FILE_ID', '云存储文件路径无效。');
  }

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
    tags_json: JSON.stringify(tags),
    original_filename: originalFilename || `report.${mimeType === 'application/pdf' ? 'pdf' : 'html'}`,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    sha256,
    plain_text: plainText,
    excerpt: plainText.slice(0, 320),
    section_headings: sectionHeadings,
    original_file_id: originalFileId,
  };
}

function sourceKey(context) {
  const cloudContext = cloudbase.getCloudbaseContext(context);
  const source = cloudContext.TCB_SOURCE_IP || cloudContext.WX_CLIENTIP || cloudContext.TCB_UUID || 'anonymous';
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
}

async function enforceUploadLimit(context) {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const reference = db.collection(UPLOAD_LIMITS).doc(`${day}-${sourceKey(context)}`);
  const result = await reference.get();
  const record = parseResultData(result)[0];
  const count = Number(record?.count || 0);
  if (count >= 20) throw new PublicError('UPLOAD_RATE_LIMITED', '今天从当前网络上传的次数已达到限制，请明天再试。');
  if (record) await reference.update({ count: _.inc(1), updated_at: new Date().toISOString() });
  else await reference.set({ count: 1, day, updated_at: new Date().toISOString() });
}

function publicFields(report, text = '') {
  if (!report) return report;
  const { _id, excerpt, ...rest } = report;
  delete rest.original_file_id;
  return { ...rest, id: report.id || _id, plain_text: text || excerpt || '' };
}

function makeExcerpt(text, query) {
  const value = String(text || '');
  const lowered = value.toLocaleLowerCase('zh-CN');
  const index = lowered.indexOf(String(query || '').toLocaleLowerCase('zh-CN'));
  const start = Math.max(0, index < 0 ? 0 : index - 70);
  return `${start ? '…' : ''}${value.slice(start, start + 420)}${start + 420 < value.length ? '…' : ''}`;
}

async function setup() {
  for (const name of [REPORTS, UPLOAD_LIMITS]) {
    try {
      await db.createCollection(name);
    } catch (error) {
      const message = String(error?.message || error);
      if (!/exist|already|重复|存在/i.test(message)) throw error;
    }
  }
  return ok({ collections: [REPORTS, UPLOAD_LIMITS] });
}

async function listReports(event) {
  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100);
  const result = await db.collection(REPORTS)
    .where({ is_current: true })
    .field({ plain_text: false, original_file_id: false, section_headings: false })
    .orderBy('report_date', 'desc')
    .limit(limit)
    .get();
  return ok({ reports: parseResultData(result).map((report) => publicFields(report)) });
}

async function searchReports(event) {
  const query = cleanString(event.q, 200);
  const year = Number(event.year) || undefined;
  const week = Number(event.week) || undefined;
  const base = { is_current: true };
  if (year) base.iso_year = year;
  if (week) base.iso_week = week;

  let condition = base;
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    condition = _.and(
      base,
      _.or(
        { title: db.RegExp({ regexp: escaped, options: 'i' }) },
        { plain_text: db.RegExp({ regexp: escaped, options: 'i' }) },
        { tags_json: db.RegExp({ regexp: escaped, options: 'i' }) },
      ),
    );
  }

  const result = await db.collection(REPORTS)
    .where(condition)
    .field({ original_file_id: false, section_headings: false })
    .orderBy('report_date', 'desc')
    .limit(50)
    .get();
  const reports = parseResultData(result).map((report) => publicFields(report, makeExcerpt(report.plain_text, query)));
  return ok({ reports });
}

async function temporaryUrl(fileId) {
  const result = await app.storage.from().createSignedUrl(fileId, 900);
  if (result.error || !result.data?.signedUrl) throw new PublicError('FILE_NOT_FOUND', '周报文件暂时无法访问。');
  return result.data.signedUrl;
}

async function getReport(event) {
  const id = cleanString(event.id, 64);
  if (!id) throw new PublicError('NOT_FOUND', '没有找到这份周报。');
  const result = await db.collection(REPORTS).doc(id).get();
  const report = parseResultData(result)[0];
  if (!report) throw new PublicError('NOT_FOUND', '没有找到这份周报。');

  const [versionsResult, fileUrl] = await Promise.all([
    db.collection(REPORTS)
      .where({ week_key: report.week_key })
      .field({ plain_text: false, original_file_id: false, section_headings: false })
      .orderBy('version_number', 'desc')
      .limit(100)
      .get(),
    temporaryUrl(report.original_file_id),
  ]);
  return ok({
    report: { ...publicFields(report), preview_url: fileUrl, download_url: fileUrl },
    sections: Array.isArray(report.section_headings) ? report.section_headings : [],
    versions: parseResultData(versionsResult).map((version) => publicFields(version)),
  });
}

async function finalizeUpload(event, context) {
  await enforceUploadLimit(context);
  const report = normalizeReport(event.report);
  const duplicateResult = await db.collection(REPORTS)
    .where({ iso_year: report.iso_year, iso_week: report.iso_week, sha256: report.sha256 })
    .limit(1)
    .get();
  const duplicate = parseResultData(duplicateResult)[0];
  if (duplicate) {
    return ok({ reportId: duplicate.id || duplicate._id, version: duplicate.version_number, duplicate: true, replaced: false });
  }

  const outcome = await db.runTransaction(async (transaction) => {
    const latestResult = await transaction.collection(REPORTS)
      .where({ week_key: report.week_key })
      .orderBy('version_number', 'desc')
      .limit(1)
      .get();
    const latest = parseResultData(latestResult)[0];
    const version = Number(latest?.version_number || 0) + 1;
    if (latest?.is_current) await transaction.collection(REPORTS).doc(latest.id || latest._id).update({ is_current: false });

    await transaction.collection(REPORTS).doc(report.id).set({
      ...report,
      version_number: version,
      is_current: true,
      supersedes_report_id: latest ? latest.id || latest._id : null,
      created_at: new Date().toISOString(),
    });
    return { reportId: report.id, version, duplicate: false, replaced: Boolean(latest) };
  });
  return ok(outcome);
}

exports.main = async (event = {}, context = {}) => {
  try {
    switch (event.action) {
      case 'setup': return await setup();
      case 'listReports': return await listReports(event);
      case 'searchReports': return await searchReports(event);
      case 'getReport': return await getReport(event);
      case 'finalizeUpload': return await finalizeUpload(event, context);
      default: throw new PublicError('NOT_FOUND', '接口不存在。');
    }
  } catch (error) {
    return fail(error);
  }
};

exports._test = { cleanString, getIsoWeek, normalizeReport, makeExcerpt };

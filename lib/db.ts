import { env } from 'cloudflare:workers';
import { schemaStatements } from '@/db/schema';
import type { ReportRecord, SectionRecord } from '@/lib/types';

type Bindings = {
  DB: D1Database;
  REPORTS_BUCKET: R2Bucket;
};

let schemaReady: Promise<void> | null = null;

export function bindings() {
  return env as unknown as Bindings;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = bindings().DB;
      for (const statement of schemaStatements) await db.prepare(statement).run();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function listCurrentReports(limit = 20) {
  await ensureSchema();
  const result = await bindings().DB.prepare(
    `SELECT * FROM reports WHERE is_current = 1
     ORDER BY report_date DESC, created_at DESC LIMIT ?`,
  ).bind(limit).all<ReportRecord>();
  return result.results;
}

export async function getReport(id: string) {
  await ensureSchema();
  return bindings().DB.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<ReportRecord>();
}

export async function getReportSections(reportId: string) {
  await ensureSchema();
  const result = await bindings().DB.prepare(
    'SELECT * FROM report_sections WHERE report_id = ? ORDER BY order_index',
  ).bind(reportId).all<SectionRecord>();
  return result.results;
}

export async function getReportVersions(isoYear: number, isoWeek: number) {
  await ensureSchema();
  const result = await bindings().DB.prepare(
    `SELECT * FROM reports WHERE iso_year = ? AND iso_week = ?
     ORDER BY version_number DESC`,
  ).bind(isoYear, isoWeek).all<ReportRecord>();
  return result.results;
}

function ftsQuery(query: string) {
  return query.trim().replace(/["*:^(){}[\]]/g, ' ').split(/\s+/).filter(Boolean).map((part) => `"${part}"`).join(' ');
}

export async function searchReports(query: string, year?: number, week?: number) {
  await ensureSchema();
  const trimmed = query.trim();
  const filters: string[] = ['r.is_current = 1'];
  const bindingsList: Array<string | number> = [];
  if (year) { filters.push('r.iso_year = ?'); bindingsList.push(year); }
  if (week) { filters.push('r.iso_week = ?'); bindingsList.push(week); }

  if (!trimmed) {
    const result = await bindings().DB.prepare(
      `SELECT r.* FROM reports r WHERE ${filters.join(' AND ')}
       ORDER BY r.report_date DESC LIMIT 50`,
    ).bind(...bindingsList).all<ReportRecord>();
    return result.results;
  }

  const compactLength = Array.from(trimmed.replace(/\s/g, '')).length;
  if (compactLength >= 3) {
    const result = await bindings().DB.prepare(
      `SELECT r.* FROM reports_fts f
       JOIN reports r ON r.id = f.report_id
       WHERE reports_fts MATCH ? AND ${filters.join(' AND ')}
       ORDER BY bm25(reports_fts, 0, 5, 1, 3.5, 3), r.report_date DESC
       LIMIT 50`,
    ).bind(ftsQuery(trimmed), ...bindingsList).all<ReportRecord>();
    return result.results;
  }

  const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  const result = await bindings().DB.prepare(
    `SELECT r.* FROM reports r
     WHERE ${filters.join(' AND ')}
       AND (r.title LIKE ? ESCAPE '\\' OR r.plain_text LIKE ? ESCAPE '\\' OR r.tags_json LIKE ? ESCAPE '\\')
     ORDER BY r.report_date DESC LIMIT 50`,
  ).bind(...bindingsList, like, like, like).all<ReportRecord>();
  return result.results;
}

import { ArrowUpRight, CalendarDays, FileText, History } from 'lucide-react';
import Link from 'next/link';
import type { ReportRecord } from '@/lib/types';

function parseTags(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

function snippet(text: string, query?: string) {
  if (!query) return text.slice(0, 130);
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - 45);
  const end = Math.min(text.length, start + 155);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function ReportCard({ report, query }: { report: ReportRecord; query?: string }) {
  const tags = parseTags(report.tags_json);
  return (
    <article className="group flex min-h-72 flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_16px_45px_rgb(24_53_43/8%)]">
      <div className="flex items-start justify-between gap-4">
        <span className="flex items-center gap-2 text-xs font-medium text-primary">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {report.iso_year} 年第 {report.iso_week} 周
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          {report.version_number > 1 && <History className="size-3" aria-hidden="true" />}
          V{report.version_number}
        </span>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="size-3.5" aria-hidden="true" />
        {report.mime_type === 'application/pdf' ? 'PDF' : 'HTML'} · {report.report_date}
      </p>
      <h3 className="mt-3 font-heading text-xl font-semibold leading-7 tracking-tight group-hover:text-primary">
        <Link href={`/reports/${report.id}`}>{report.title}</Link>
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{snippet(report.plain_text, query) || '该周报暂无可展示摘要。'}</p>
      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">{tag}</span>
          ))}
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" aria-hidden="true" />
      </div>
    </article>
  );
}

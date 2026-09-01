import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Download, FileText, History } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { getReport, getReportSections, getReportVersions } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const report = await getReport(id);
  return {
    title: report ? `${report.title} · 虹口区区域深耕周报` : '周报未找到',
    description: report?.plain_text.slice(0, 120),
    openGraph: { title: report?.title || '周报未找到', description: report?.plain_text.slice(0, 120), images: [] },
    twitter: { card: 'summary', title: report?.title || '周报未找到', description: report?.plain_text.slice(0, 120), images: [] },
  };
}

export default async function ReportPage({ params }: { params: Params }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) {
    return <main className="min-h-screen bg-background"><SiteHeader /><div className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="font-heading text-3xl font-semibold">没有找到这份周报</h1><Link href="/reports" className="mt-5 inline-block text-sm text-primary">返回历史周报</Link></div></main>;
  }
  const [sections, versions] = await Promise.all([
    getReportSections(report.id),
    getReportVersions(report.iso_year, report.iso_week),
  ]);
  const tags = (() => { try { return JSON.parse(report.tags_json) as string[]; } catch { return []; } })();

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <Link href="/reports" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />返回历史周报</Link>
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article>
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 text-primary"><CalendarDays className="size-3.5" />{report.iso_year} 年第 {report.iso_week} 周</span>
                <span>·</span><span>{report.report_date}</span><span>·</span>
                <span>{report.mime_type === 'application/pdf' ? 'PDF' : 'HTML'}</span>
              </div>
              <h1 className="mt-4 font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{report.title}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {report.author_name && <span>{report.author_name}</span>}
                {report.department && <span>· {report.department}</span>}
                {tags.map((tag) => <span key={tag} className="rounded-md border border-border px-2 py-1">{tag}</span>)}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={`/api/reports/${report.id}/download`} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:border-primary/30 hover:text-primary"><Download className="size-4" />下载原文件</a>
                <span className="inline-flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm"><History className="size-4" />当前 V{report.version_number}</span>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-muted-foreground"><span>安全预览</span><span>{report.mime_type === 'application/pdf' ? 'PDF 阅读器' : '已清理 HTML'}</span></div>
              <iframe
                title={`${report.title}预览`}
                src={`/api/reports/${report.id}/preview`}
                sandbox={report.mime_type === 'application/pdf' ? undefined : ''}
                className="h-[72vh] min-h-150 w-full bg-white"
              />
            </div>
          </article>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">版本历史</h2>
              <div className="mt-4 space-y-2">
                {versions.map((version) => (
                  <Link key={version.id} href={`/reports/${version.id}`} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm ${version.id === report.id ? 'border-primary/25 bg-primary/5 text-primary' : 'border-border hover:border-primary/20'}`}>
                    <span>V{version.version_number}</span><span className="text-xs text-muted-foreground">{version.created_at.slice(0, 10)}</span>
                  </Link>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">内容索引</h2>
              <nav className="mt-4 max-h-80 space-y-1 overflow-auto text-xs text-muted-foreground">
                {sections.slice(0, 30).map((section) => <div key={section.id} className="flex gap-2 rounded-lg px-2 py-2 hover:bg-muted"><FileText className="mt-0.5 size-3.5 shrink-0" /><span>{section.heading || `内容片段 ${section.order_index + 1}`}</span></div>)}
              </nav>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

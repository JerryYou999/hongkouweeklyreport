import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportCard } from '@/components/report-card';
import { SiteHeader } from '@/components/site-header';
import { listCurrentReports } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '历史周报 · 虹口区区域深耕周报' };

export default async function ReportsPage() {
  const reports = await listCurrentReports(100);
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-primary">REPORT ARCHIVE</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">历史周报</h1>
            <p className="mt-3 text-sm text-muted-foreground">每周默认展示最新版本，旧版本可在周报详情中查看。</p>
          </div>
          <Link href="/search" className="rounded-xl border border-border bg-card px-4 py-2.5 text-center text-sm font-medium hover:border-primary/30 hover:text-primary">进入全文搜索</Link>
        </div>
        {reports.length > 0 ? (
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{reports.map((report) => <ReportCard key={report.id} report={report} />)}</div>
        ) : (
          <div className="mt-9 rounded-3xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">还没有已归档的周报。</div>
        )}
      </div>
    </main>
  );
}

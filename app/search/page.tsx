import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { ReportCard } from '@/components/report-card';
import { SiteHeader } from '@/components/site-header';
import { searchReports } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '全文搜索 · 虹口区区域深耕周报' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const year = typeof params.year === 'string' ? Number(params.year) : undefined;
  const week = typeof params.week === 'string' ? Number(params.week) : undefined;
  const reports = await searchReports(q, year, week);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="border-b border-border bg-[linear-gradient(135deg,var(--paper),var(--background))]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
          <p className="text-xs font-medium tracking-[0.14em] text-primary">FULL TEXT SEARCH</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">全文搜索</h1>
          <form className="mt-7 grid gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_12px_40px_rgb(24_53_43/6%)] sm:grid-cols-[minmax(0,1fr)_120px_100px_auto]">
            <label className="flex items-center gap-3 rounded-xl border border-input px-3">
              <Search className="size-4 text-muted-foreground" />
              <span className="sr-only">关键词</span>
              <input name="q" defaultValue={q} placeholder="输入关键词" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            <input name="year" type="number" min="2000" max="2100" defaultValue={year || ''} placeholder="年份" className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
            <input name="week" type="number" min="1" max="53" defaultValue={week || ''} placeholder="周数" className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
            <button className="h-11 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground">搜索</button>
          </form>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <p className="mb-6 text-sm text-muted-foreground">{q ? `“${q}” 找到 ${reports.length} 份当前版本周报` : `共 ${reports.length} 份当前版本周报`}</p>
        {reports.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{reports.map((report) => <ReportCard key={report.id} report={report} query={q} />)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border py-16 text-center">
            <p className="font-heading text-lg font-semibold">没有找到匹配内容</p>
            <p className="mt-2 text-sm text-muted-foreground">尝试缩短关键词，或清除年份和周数筛选。</p>
          </div>
        )}
      </section>
    </main>
  );
}

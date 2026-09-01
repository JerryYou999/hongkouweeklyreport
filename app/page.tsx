import {
  ArrowUpRight,
  Search,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { ReportCard } from '@/components/report-card';
import { SiteHeader } from '@/components/site-header';
import { listCurrentReports } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const reports = await listCurrentReports(6);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="border-b border-border bg-[linear-gradient(135deg,var(--paper)_0%,var(--background)_58%,var(--mint)_100%)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-18">
          <div className="max-w-3xl">
            <div className="mb-6 flex items-center gap-2 text-xs font-medium text-primary">
              <span className="h-px w-7 bg-primary/50" />
              虹口区区域深耕周报
            </div>
            <h1 className="font-heading text-4xl font-semibold leading-[1.12] tracking-[-0.045em] sm:text-5xl lg:text-[58px]">
              虹口区区域深耕周报，
              <span className="text-primary">随时可以找到。</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              上传 HTML 或 PDF 周报，自动归档并建立全文索引。按关键词、日期或标签快速定位过去的真实内容。
            </p>

            <form action="/search" className="mt-9 flex max-w-2xl gap-2 rounded-2xl border border-border bg-card p-2 shadow-[0_12px_40px_rgb(24_53_43/8%)]">
              <label className="flex min-w-0 flex-1 items-center gap-3 px-3" htmlFor="home-search">
                <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">搜索周报</span>
                <input id="home-search" name="q" type="search" placeholder="搜索关键词，例如：项目进展、CPI、Blackwell" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/75" />
              </label>
              <button className="rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">搜索</button>
            </form>
          </div>

          <aside id="upload" className="self-end rounded-3xl border border-primary/15 bg-primary p-6 text-primary-foreground shadow-[0_20px_60px_rgb(20_65_50/16%)] sm:p-7">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/12">
                <UploadCloud className="size-5" aria-hidden="true" />
              </span>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] tracking-wide text-white/70">HTML / PDF · 最大 10 MB</span>
            </div>
            <h2 className="mt-6 font-heading text-2xl font-semibold tracking-tight">上传本周周报</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">同一周再次上传会创建新版本，旧版本仍会安全保留。</p>
            <Link href="/upload" className="mt-6 flex items-center justify-between rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-primary transition-transform hover:-translate-y-0.5">
              选择 HTML 或 PDF 文件
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>

      <section id="reports" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-7 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-primary">LATEST REPORTS</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">最近归档</h2>
          </div>
          <Link href="/reports" className="group flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
            查看全部
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </Link>
        </div>

        {reports.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">{reports.map((report) => <ReportCard key={report.id} report={report} />)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <p className="font-heading text-xl font-semibold">还没有归档周报</p>
            <p className="mt-2 text-sm text-muted-foreground">上传第一份 HTML 或 PDF 周报，系统会自动建立全文索引。</p>
            <Link href="/upload" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">上传第一份周报</Link>
          </div>
        )}
      </section>

      <footer className="border-t border-border px-5 py-7 text-center text-xs text-muted-foreground sm:px-8">
        虹口区区域深耕周报 · 安全归档、全文检索、版本留存
      </footer>
    </main>
  );
}

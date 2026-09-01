import { FileText, UploadCloud } from 'lucide-react';
import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-2">
            <FileText className="size-4.5" aria-hidden="true" />
          </span>
          <span>
            <strong className="block font-heading text-[15px] tracking-tight">虹口区区域深耕周报</strong>
            <span className="block text-[10px] tracking-[0.16em] text-muted-foreground">HONGKOU WEEKLY</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="主要导航">
          <Link href="/reports" className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block">历史周报</Link>
          <Link href="/search" className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block">全文搜索</Link>
          <Link href="/upload" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">
            <UploadCloud className="size-4" aria-hidden="true" />
            上传周报
          </Link>
        </nav>
      </div>
    </header>
  );
}

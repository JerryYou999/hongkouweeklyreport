import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: '上传周报 · 虹口区区域深耕周报' };

export default function UploadPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-medium tracking-[0.14em] text-primary">UPLOAD REPORT</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">上传虹口区区域深耕周报</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">系统会根据周报日期自动计算 ISO 周数。同一周再次上传将生成新版本，并保留旧版本。</p>
        <div className="mt-8"><UploadForm /></div>
        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />PDF 必须包含可复制的文本层；扫描版 PDF 暂不支持 OCR。HTML 中的脚本、表单和外部图片会被自动移除。</p>
      </div>
    </main>
  );
}

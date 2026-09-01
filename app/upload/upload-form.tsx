'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, FileUp, LoaderCircle } from 'lucide-react';

type UploadResult = {
  reportUrl: string;
  version: number;
  duplicate?: boolean;
  replaced?: boolean;
};

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);

  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!file) { setStatus('error'); setMessage('请先选择 HTML 或 PDF 文件。'); return; }
    setStatus('uploading');
    setMessage('正在上传并建立全文索引…');
    setResult(null);

    const form = new FormData(event.currentTarget);
    form.set('file', file);
    try {
      const response = await fetch('/api/reports/upload', { method: 'POST', body: form });
      const body = await response.json() as { success: boolean; error?: { message: string } } & UploadResult;
      if (!response.ok || !body.success) throw new Error(body.error?.message || '上传失败，请稍后重试。');
      setResult(body);
      setStatus('success');
      setMessage(body.duplicate ? `该文件已经归档为 V${body.version}，没有重复创建。` : body.replaced ? `已发布 V${body.version}，上一版本仍然保留。` : '周报已经成功归档。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '上传失败，请稍后重试。');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-6 shadow-[0_18px_60px_rgb(24_53_43/8%)] sm:p-8">
      <label className="group grid cursor-pointer place-items-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.035] px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.06]">
        <span className="grid size-13 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <FileUp className="size-5" aria-hidden="true" />
        </span>
        <strong className="mt-4 text-sm">{file ? file.name : '选择 HTML 或 PDF 周报'}</strong>
        <span className="mt-1 text-xs text-muted-foreground">支持 .html、.htm、.pdf，最大 10 MB</span>
        <input
          name="file"
          type="file"
          required
          accept=".html,.htm,.pdf,text/html,application/pdf"
          className="sr-only"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-2 block text-xs font-medium text-foreground">周报标题</span>
          <input name="title" maxLength={200} placeholder="留空时自动读取文件标题" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" />
        </label>
        <label>
          <span className="mb-2 block text-xs font-medium text-foreground">周报日期 *</span>
          <input name="reportDate" type="date" required className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" />
        </label>
        <label>
          <span className="mb-2 block text-xs font-medium text-foreground">作者</span>
          <input name="authorName" maxLength={100} placeholder="选填" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" />
        </label>
        <label>
          <span className="mb-2 block text-xs font-medium text-foreground">部门</span>
          <input name="department" maxLength={100} placeholder="选填" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" />
        </label>
        <label>
          <span className="mb-2 block text-xs font-medium text-foreground">标签</span>
          <input name="tags" maxLength={500} placeholder="用逗号分隔" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" />
        </label>
      </div>

      <div className="mt-7 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-6 text-sm">
          {status === 'uploading' && <span className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{message}</span>}
          {status === 'success' && <span className="flex items-center gap-2 text-primary"><CheckCircle2 className="size-4" />{message}</span>}
          {status === 'error' && <span className="flex items-center gap-2 text-destructive"><AlertCircle className="size-4" />{message}</span>}
        </div>
        {status === 'success' && result ? (
          <a href={result.reportUrl} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground">打开周报<ArrowRight className="size-4" /></a>
        ) : (
          <button disabled={status === 'uploading'} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground disabled:cursor-wait disabled:opacity-60">上传并归档<ArrowRight className="size-4" /></button>
        )}
      </div>
    </form>
  );
}

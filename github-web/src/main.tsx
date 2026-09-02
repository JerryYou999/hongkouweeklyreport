import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Report = {
  id: string; iso_year: number; iso_week: number; version_number: number;
  title: string; report_date: string; author_name: string | null; department: string | null;
  tags_json: string; mime_type: string; plain_text: string; created_at: string;
};
type Section = { id: string; order_index: number; heading: string | null };
const API = (import.meta.env.VITE_API_BASE_URL || 'https://hongkou-weekly-report-api.jerryyou999.workers.dev').replace(/\/$/, '');

function route() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

function go(path: string) {
  location.hash = path;
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  const body = await response.json() as T & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message || '加载失败，请稍后重试。');
  return body;
}

function Header() {
  return <header className="header"><div className="shell header-inner">
    <a className="brand" href="#/"><span className="brand-icon">周</span><span><strong>虹口区区域深耕周报</strong><small>HONGKOU WEEKLY</small></span></a>
    <nav><a href="#/reports">历史周报</a><a href="#/search">全文搜索</a><a className="button small" href="#/upload">上传周报</a></nav>
  </div></header>;
}

function Layout({ children }: { children: React.ReactNode }) {
  return <><Header />{children}<footer>虹口区区域深耕周报 · 安全归档、全文检索、版本留存</footer></>;
}

function Tags({ value }: { value: string }) {
  let tags: string[] = [];
  try { tags = JSON.parse(value); } catch { /* empty */ }
  return <div className="tags">{tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

function ReportCard({ report, query = '' }: { report: Report; query?: string }) {
  const index = query ? report.plain_text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  const start = Math.max(0, index < 0 ? 0 : index - 45);
  const excerpt = report.plain_text.slice(start, start + 155);
  return <article className="card report-card">
    <div className="card-top"><span className="eyebrow">{report.iso_year} 年第 {report.iso_week} 周</span><span className="version">V{report.version_number}</span></div>
    <p className="meta">{report.mime_type === 'application/pdf' ? 'PDF' : 'HTML'} · {report.report_date}</p>
    <h3><a href={`#/reports/${report.id}`}>{report.title}</a></h3>
    <p className="excerpt">{start > 0 ? '…' : ''}{excerpt || '该周报暂无可展示摘要。'}{start + 155 < report.plain_text.length ? '…' : ''}</p>
    <Tags value={report.tags_json} />
  </article>;
}

function Loading({ text = '正在加载…' }: { text?: string }) { return <div className="state">{text}</div>; }
function ErrorState({ message }: { message: string }) { return <div className="state error">{message}</div>; }

function useReports(limit = 100) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { getJson<{ reports: Report[] }>(`/api/reports?limit=${limit}`).then((x) => setReports(x.reports)).catch((e) => setError(String(e.message))); }, [limit]);
  return { reports, error };
}

function Home() {
  const { reports, error } = useReports(6);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    go(`/search?q=${encodeURIComponent(String(q || ''))}`);
  }
  return <Layout><main>
    <section className="hero"><div className="shell hero-grid"><div>
      <p className="eyebrow">— 虹口区区域深耕周报</p>
      <h1>虹口区区域深耕周报，<em>随时可以找到。</em></h1>
      <p className="lead">上传 HTML 或 PDF 周报，自动归档并建立全文索引。按关键词、日期或标签快速定位过去的真实内容。</p>
      <form className="searchbar" onSubmit={submit}><input name="q" type="search" placeholder="搜索关键词，例如：项目进展、社区治理" /><button>搜索</button></form>
    </div><aside className="upload-panel"><span className="file-pill">HTML / PDF · 最大 10 MB</span><h2>上传本周周报</h2><p>同一周再次上传会创建新版本，旧版本仍会安全保留。</p><a href="#/upload">选择文件并上传 →</a></aside></div></section>
    <section className="shell section"><div className="section-title"><div><p className="eyebrow">LATEST REPORTS</p><h2>最近归档</h2></div><a href="#/reports">查看全部 →</a></div>
      {error ? <ErrorState message={error} /> : !reports ? <Loading /> : reports.length ? <div className="grid">{reports.map((r) => <ReportCard key={r.id} report={r} />)}</div> : <Loading text="还没有归档周报，上传第一份周报即可开始。" />}
    </section>
  </main></Layout>;
}

function Reports() {
  const { reports, error } = useReports();
  return <Layout><main className="shell section"><p className="eyebrow">REPORT ARCHIVE</p><h1 className="page-title">历史周报</h1><p className="muted">每周默认展示最新版本，旧版本可在详情页中查看。</p>
    {error ? <ErrorState message={error} /> : !reports ? <Loading /> : <div className="grid top-gap">{reports.map((r) => <ReportCard key={r.id} report={r} />)}</div>}
  </main></Layout>;
}

function SearchPage({ initial }: { initial: URLSearchParams }) {
  const [params, setParams] = useState(initial);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setReports(null); setError('');
    getJson<{ reports: Report[] }>(`/api/search?${params.toString()}`).then((x) => setReports(x.reports)).catch((e) => setError(String(e.message)));
  }, [params]);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (String(value)) next.set(key, String(value));
    location.hash = `/search?${next}`; setParams(next);
  }
  const q = params.get('q') || '';
  return <Layout><main><section className="search-head"><div className="shell"><p className="eyebrow">FULL TEXT SEARCH</p><h1 className="page-title">全文搜索</h1>
    <form className="filter" onSubmit={submit}><input name="q" defaultValue={q} placeholder="输入关键词" /><input name="year" type="number" min="2000" max="2100" defaultValue={params.get('year') || ''} placeholder="年份" /><input name="week" type="number" min="1" max="53" defaultValue={params.get('week') || ''} placeholder="周数" /><button>搜索</button></form>
  </div></section><section className="shell section"><p className="muted">{reports ? `${q ? `“${q}” ` : ''}找到 ${reports.length} 份当前版本周报` : '正在检索…'}</p>
    {error ? <ErrorState message={error} /> : !reports ? <Loading /> : reports.length ? <div className="grid top-gap">{reports.map((r) => <ReportCard key={r.id} report={r} query={q} />)}</div> : <Loading text="没有找到匹配内容。" />}
  </section></main></Layout>;
}

function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setStatus('请先选择 HTML 或 PDF 文件。');
    setBusy(true); setStatus('正在上传并建立全文索引…');
    const form = new FormData(event.currentTarget); form.set('file', file);
    try {
      const response = await fetch(`${API}/api/reports/upload`, { method: 'POST', body: form });
      const body = await response.json() as { success: boolean; reportId?: string; version?: number; duplicate?: boolean; replaced?: boolean; error?: { message: string } };
      if (!response.ok || !body.success) throw new Error(body.error?.message || '上传失败。');
      setStatus(body.duplicate ? `该文件已经归档为 V${body.version}，没有重复创建。` : body.replaced ? `已发布 V${body.version}，上一版本仍然保留。` : '周报已经成功归档。');
      if (body.reportId) setTimeout(() => go(`/reports/${body.reportId}`), 700);
    } catch (e) { setStatus(e instanceof Error ? e.message : '上传失败。'); } finally { setBusy(false); }
  }
  return <Layout><main className="shell narrow section"><p className="eyebrow">UPLOAD REPORT</p><h1 className="page-title">上传虹口区区域深耕周报</h1><p className="muted">系统按日期计算 ISO 周数。同一周再次上传会生成新版本并保留旧版本。</p>
    <form className="card upload-form" onSubmit={submit}><label className="drop"><strong>{file?.name || '选择 HTML 或 PDF 周报'}</strong><span>支持 .html、.htm、.pdf，最大 10 MB</span><input name="file" type="file" accept=".html,.htm,.pdf,text/html,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      <div className="form-grid"><label>周报标题<input name="title" maxLength={200} placeholder="留空时自动读取文件标题" /></label><label>周报日期 *<input name="reportDate" type="date" required /></label><label>作者<input name="authorName" maxLength={100} placeholder="选填" /></label><label>部门<input name="department" maxLength={100} placeholder="选填" /></label><label>标签<input name="tags" maxLength={500} placeholder="用逗号分隔" /></label></div>
      <div className="submit-row"><span>{status}</span><button disabled={busy}>{busy ? '正在处理…' : '上传并归档'}</button></div>
    </form><p className="hint">PDF 必须包含可复制的文本层；扫描版暂不支持 OCR。HTML 的脚本、表单和外部图片会被移除。</p>
  </main></Layout>;
}

function ReportDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ report: Report; sections: Section[]; versions: Report[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { getJson<typeof data>(`/api/reports/${id}`).then((x) => setData(x)).catch((e) => setError(String(e.message))); }, [id]);
  if (error) return <Layout><main className="shell section"><ErrorState message={error} /></main></Layout>;
  if (!data) return <Layout><main className="shell section"><Loading /></main></Layout>;
  const { report, sections, versions } = data;
  return <Layout><main className="shell section"><a className="muted" href="#/reports">← 返回历史周报</a><div className="detail-grid"><article>
    <div className="card detail-head"><p className="eyebrow">{report.iso_year} 年第 {report.iso_week} 周 · {report.report_date} · {report.mime_type === 'application/pdf' ? 'PDF' : 'HTML'}</p><h1>{report.title}</h1><p className="muted">{[report.author_name, report.department].filter(Boolean).join(' · ')}</p><Tags value={report.tags_json} /><div className="actions"><a href={`${API}/api/reports/${report.id}/download`}>下载原文件</a><span>当前 V{report.version_number}</span></div></div>
    <div className="card preview"><div className="preview-bar"><span>安全预览</span><span>{report.mime_type === 'application/pdf' ? 'PDF 阅读器' : '已清理 HTML'}</span></div><iframe title={`${report.title}预览`} src={`${API}/api/reports/${report.id}/preview`} sandbox={report.mime_type === 'application/pdf' ? undefined : ''} /></div>
  </article><aside><div className="card side"><h2>版本历史</h2>{versions.map((v) => <a className={v.id === report.id ? 'active' : ''} key={v.id} href={`#/reports/${v.id}`}><span>V{v.version_number}</span><small>{v.created_at.slice(0, 10)}</small></a>)}</div><div className="card side"><h2>内容索引</h2>{sections.slice(0, 30).map((s) => <p key={s.id}>{s.heading || `内容片段 ${s.order_index + 1}`}</p>)}</div></aside></div>
  </main></Layout>;
}

function App() {
  const [current, setCurrent] = useState(route());
  useEffect(() => { const update = () => setCurrent(route()); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  if (current.path === '/') return <Home />;
  if (current.path === '/reports') return <Reports />;
  if (current.path === '/search') return <SearchPage initial={current.params} />;
  if (current.path === '/upload') return <Upload />;
  const detail = current.path.match(/^\/reports\/([^/]+)$/);
  if (detail) return <ReportDetail id={detail[1]} />;
  return <Layout><main className="shell section"><ErrorState message="页面不存在。" /></main></Layout>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

export type CloudBaseReport = {
  id: string;
  iso_year: number;
  iso_week: number;
  version_number: number;
  title: string;
  report_date: string;
  author_name: string | null;
  department: string | null;
  tags_json: string;
  mime_type: string;
  plain_text: string;
  created_at: string;
  original_filename: string;
  size_bytes: number;
  section_headings?: CloudBaseSection[];
  preview_url?: string;
  download_url?: string;
};

export type CloudBaseSection = {
  id: string;
  order_index: number;
  heading: string | null;
};

type FunctionEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type UploadMetadata = {
  id: string;
  title: string;
  reportDate: string;
  authorName: string;
  department: string;
  tags: string[];
  originalFilename: string;
  mimeType: 'text/html' | 'application/pdf';
  sizeBytes: number;
  sha256: string;
  plainText: string;
  sectionHeadings: CloudBaseSection[];
  originalFileId: string;
};

const apiUrl = String(import.meta.env.VITE_WEEKLY_REPORT_API_URL || '').trim();

export function isCloudBaseConfigured() {
  return Boolean(apiUrl);
}

function configurationError() {
  return new Error('CloudBase HTTP 服务尚未完成配置。请在 GitHub Actions 中设置周报 API 地址。');
}

function unwrap<T>(value: unknown): T {
  const envelope = value as FunctionEnvelope<T>;
  if (!envelope?.success || envelope.data === undefined) {
    throw new Error(envelope?.error?.message || '周报服务请求失败，请稍后重试。');
  }
  return envelope.data;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}) {
  if (!apiUrl) throw configurationError();
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  let body: FunctionEnvelope<T>;
  try {
    body = await response.json() as FunctionEnvelope<T>;
  } catch {
    throw new Error('周报服务返回了无效响应，请稍后重试。');
  }
  return unwrap<T>(body);
}

export async function listReports(limit = 100) {
  return invoke<{ reports: CloudBaseReport[] }>('listReports', { limit });
}

export async function searchReports(params: URLSearchParams) {
  return invoke<{ reports: CloudBaseReport[] }>('searchReports', {
    q: params.get('q') || '',
    year: params.get('year') || '',
    week: params.get('week') || '',
  });
}

export async function getReport(id: string) {
  return invoke<{ report: CloudBaseReport; sections: CloudBaseSection[]; versions: CloudBaseReport[] }>('getReport', { id });
}

export async function uploadOriginalFile(file: File, reportId: string, mimeType: 'text/html' | 'application/pdf') {
  const ticket = await invoke<{ fileId: string; signedUrl: string; uploadToken: string | null }>('prepareUpload', {
    id: reportId,
    mimeType,
    sizeBytes: file.size,
  });
  if (!ticket.uploadToken) throw new Error('云存储没有返回上传凭据，请稍后重试。');
  const uploadUrl = new URL(apiUrl);
  uploadUrl.searchParams.set('upload', '1');
  uploadUrl.searchParams.set('path', ticket.fileId);
  uploadUrl.searchParams.set('token', ticket.uploadToken);
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file,
  });
  if (!response.ok) throw new Error('文件上传到云存储失败，请稍后重试。');
  return ticket.fileId;
}

export async function removeUploadedFile(fileId: string) {
  if (!fileId) return;
  await invoke('discardUpload', { fileId }).catch(() => undefined);
}

export async function finalizeUpload(metadata: UploadMetadata) {
  return invoke<{ reportId: string; version: number; duplicate: boolean; replaced: boolean }>('finalizeUpload', {
    report: metadata,
  });
}

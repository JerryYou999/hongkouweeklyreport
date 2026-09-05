import cloudbase from '@cloudbase/js-sdk/app';
import { registerAuth } from '@cloudbase/js-sdk/auth';
import { registerFunctions } from '@cloudbase/js-sdk/functions';
import { registerStorage } from '@cloudbase/js-sdk/storage';

registerAuth(cloudbase);
registerFunctions(cloudbase);
registerStorage(cloudbase);

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

const envId = String(import.meta.env.VITE_CLOUDBASE_ENV_ID || '').trim();
const accessKey = String(import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || '').trim();
const region = String(import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai').trim();
const functionName = String(import.meta.env.VITE_CLOUDBASE_FUNCTION_NAME || 'weekly-report-api').trim();

const configured = Boolean(envId && accessKey);
const app = configured
  ? cloudbase.init({ env: envId, accessKey, region, persistence: 'local', auth: { detectSessionInUrl: true } })
  : null;

let readyPromise: Promise<void> | null = null;

export function isCloudBaseConfigured() {
  return configured;
}

function configurationError() {
  return new Error('CloudBase 尚未完成配置。请先在 GitHub Actions 中设置环境 ID 和 Publishable Key。');
}

async function ensureReady() {
  if (!app) throw configurationError();
  if (!readyPromise) {
    readyPromise = (async () => {
      const authFactory = app.auth;
      if (!authFactory) throw new Error('CloudBase 身份认证模块没有加载。');
      const auth = authFactory({ persistence: 'local' });
      const state = await auth.getLoginState().catch(() => null);
      if (!state) {
        const response = await auth.signInAnonymously();
        if (response.error) throw new Error(response.error.message || 'CloudBase 匿名会话建立失败。');
      }
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

function unwrap<T>(value: unknown): T {
  const envelope = value as FunctionEnvelope<T>;
  if (!envelope?.success || envelope.data === undefined) {
    throw new Error(envelope?.error?.message || 'CloudBase 请求失败，请稍后重试。');
  }
  return envelope.data;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}) {
  await ensureReady();
  if (!app?.callFunction) throw new Error('CloudBase 云函数模块没有加载。');
  const response = await app.callFunction({
    name: functionName,
    data: { action, ...payload },
  });
  return unwrap<T>(response.result as FunctionEnvelope<T>);
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
  await ensureReady();
  if (!app?.storage) throw new Error('CloudBase 云存储模块没有加载。');
  const extension = mimeType === 'application/pdf' ? 'pdf' : 'html';
  const normalized = file.type === mimeType
    ? file
    : new File([file], `original.${extension}`, { type: mimeType, lastModified: file.lastModified });
  const response = await app.storage.from().upload(
    `weekly-reports/${reportId}/original.${extension}`,
    normalized,
    { contentType: mimeType, upsert: false },
  );
  if (response.error) throw new Error(response.error.message || 'CloudBase 文件上传失败。');
  if (!response.data.id) throw new Error('文件已经上传，但 CloudBase 没有返回文件标识。');
  return response.data.id;
}

export async function removeUploadedFile(fileId: string) {
  if (!app?.storage || !fileId) return;
  await app.storage.from().remove([fileId]).catch(() => undefined);
}

export async function finalizeUpload(metadata: UploadMetadata) {
  return invoke<{ reportId: string; version: number; duplicate: boolean; replaced: boolean }>('finalizeUpload', {
    report: metadata,
  });
}

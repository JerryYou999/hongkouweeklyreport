import { bindings, getReport } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return new Response('Not found', { status: 404 });
  const object = await bindings().REPORTS_BUCKET.get(report.original_key);
  if (!object) return new Response('Not found', { status: 404 });

  const encodedName = encodeURIComponent(report.original_filename);
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

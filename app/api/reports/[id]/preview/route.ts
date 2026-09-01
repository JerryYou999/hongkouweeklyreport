import { bindings, getReport } from '@/lib/db';
import { sanitizeReportHtml } from '@/lib/html';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return new Response('Not found', { status: 404 });

  const objectKey = report.mime_type === 'application/pdf' ? report.sanitized_key : report.original_key;
  const object = await bindings().REPORTS_BUCKET.get(objectKey);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', report.mime_type === 'application/pdf' ? 'application/pdf' : 'text/html; charset=utf-8');
  headers.set('Content-Disposition', `inline; filename="preview.${report.mime_type === 'application/pdf' ? 'pdf' : 'html'}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, max-age=300');
  if (report.mime_type === 'text/html') {
    headers.set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  }
  if (report.mime_type === 'text/html') {
    // Re-sanitize the original at preview time so reports uploaded before the
    // style-preservation fix regain their original embedded CSS as well.
    return new Response(sanitizeReportHtml(await object.text()), { headers });
  }
  return new Response(object.body, { headers });
}

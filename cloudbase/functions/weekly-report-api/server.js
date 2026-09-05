'use strict';
/* eslint-disable typescript/no-require-imports */

const http = require('node:http');
const { main } = require('./index');

const port = Number(process.env.PORT || 9000);

const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const rawUpload = requestUrl.searchParams.get('upload') === '1';
  const event = {
    httpMethod: request.method,
    headers: request.headers,
    body: rawUpload ? Buffer.concat(chunks).toString('base64') : Buffer.concat(chunks).toString('utf8'),
    isBase64Encoded: rawUpload,
    rawUpload,
    queryStringParameters: Object.fromEntries(requestUrl.searchParams.entries()),
    requestContext: { sourceIp: request.socket.remoteAddress },
  };

  try {
    const result = await main(event, {});
    response.writeHead(result.statusCode || 200, result.headers || {});
    response.end(result.body || '');
  } catch (error) {
    console.error('weekly_report_http_server_failed', error);
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ success: false, error: { code: 'SERVER_ERROR', message: '请求失败，请稍后重试。' } }));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`weekly-report-api listening on ${port}`);
});

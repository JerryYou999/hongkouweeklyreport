# CloudBase 安全规则

浏览器只访问 HTTP 云函数；数据库和云存储都不向浏览器直接开放。上传文件使用云函数单次签发的短期 URL，因此不需要匿名登录、Publishable Key 或 Web 安全域名。

## PostgreSQL

`weekly_reports` 和 `weekly_report_upload_limits` 是业务表。只向 `service_role` 授予操作权限；不向 `anon` 或 `authenticated` 授予权限。这样，即使有人知道 PostgreSQL REST 地址，也无法绕过 HTTP 云函数读写周报数据。

版本写入通过 `finalize_weekly_report(jsonb)` 在数据库事务中完成：同周新文件会使原当前版本变为历史版本，但不会删除它。

## PostgreSQL 原生云存储

`weekly-reports` 是私有桶，限制为 HTML/PDF 且单文件不超过 5 MB。访问与上传短期签名都由 HTTP 云函数使用服务端 API Key 生成；页面把文件经由 HTTP 云函数转发，避免原生文件桶的浏览器跨域限制。

不要把 `CLOUDBASE_APIKEY`、任何 API Key 或 Publishable Key 写入网页、GitHub Actions 变量、提交记录或浏览器控制台。

## 云函数

HTTP 路由需要公网访问。为 `weekly-report-api` 设置：

```json
{
  "invoke": true
}
```

函数响应仅允许 `https://jerryyou999.github.io` 的浏览器跨域读取（本地开发允许 `localhost`）。这不是身份验证，知道接口地址的人仍可直接请求；函数包含文件类型、大小、文件存在性和单来源每日 20 次上传限制。

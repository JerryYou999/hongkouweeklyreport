# CloudBase 安全规则

本项目不显示注册或登录页面，但浏览器会在后台建立匿名会话。数据库只允许云函数读写；浏览器只能把 10 MB 以内的 HTML/PDF 上传到限定目录。

## 文档数据库

为 `weekly_reports` 和 `weekly_report_upload_limits` 两个集合分别设置：

```json
{
  "read": false,
  "write": false
}
```

## 云存储

```json
{
  "read": false,
  "write": "auth != null && resource.openid == auth.uid && resource.size <= 10485760 && /^weekly-reports\\/[0-9a-f-]{36}\\/original\\.(html|pdf)$/.test(resource.path)"
}
```

## 云函数

为 `weekly-report-api` 设置：

```json
{
  "invoke": "auth != null"
}
```

如控制台当前版本不接受表达式，可先用 `{"invoke": true}` 完成联调；联调后再改回仅允许有匿名会话的调用。

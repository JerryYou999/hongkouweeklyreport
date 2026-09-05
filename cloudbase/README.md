# 周报网站迁移到 CloudBase（免费环境版）

GitHub Pages 继续托管网页；CloudBase 只提供 HTTP API、PostgreSQL 和原文件存储。前端不再直接调用 CloudBase Web SDK，因此免费体验环境不能添加 Web 安全域名也不会阻断网站。

## 重要边界

- 免费体验环境不能添加 Web 安全域名；腾讯云 API 返回 `OperationDenied.FreePackageDenied`。本项目已避开这项限制。
- 使用 CloudBase 的默认 HTTP 服务域名，不绑定自定义域名，也不需要备案。默认域名仅适合低访问量开发/试用，可能有频率与有效期限制；到期时需在“环境配置 → HTTP 访问服务”手动续期。
- 免费环境不可开启按量付费或加购资源包，不会自动扣费；超过配额时服务会受限。
- 不要把该环境关联并发布为微信小程序；按当前规则，小程序发布会缩短免费环境有效期。

## 部署步骤

1. 复制 `cloudbase/cloudbaserc.example.json` 为仓库根目录的 `cloudbaserc.json`，填入真实环境 ID。该文件已被 Git 忽略。
2. 安装并登录腾讯官方 CLI，然后以 HTTP 云函数部署：

   ```powershell
   npm install -g @cloudbase/cli
   tcb login
   tcb fn deploy weekly-report-api --env-id hongkoureport-d0gwv0k7a71e1300c --httpFn
   ```

   HTTP 云函数必须使用仅保存在函数环境变量 `CLOUDBASE_APIKEY` 中的服务端 API Key；不要把它放进 GitHub、网页或提交记录。

3. 在 CloudBase 控制台的“环境配置 → HTTP 访问服务”启用默认域名；不要购买或绑定自定义域名。
4. 在该默认域名中新增路由：路径 `/api/weekly-report`，目标资源选择云函数 `weekly-report-api`。路由的跨域来源填入 `https://jerryyou999.github.io`。
5. 首次部署时，通过已登录的 CloudBase CLI 执行本项目提供的 PostgreSQL 建表、索引、版本函数和 `weekly-reports` 私有文件桶初始化。该步骤已在当前环境完成；后续调用 `{"action":"setup"}` 只做连通性检查，不会创建资源。
6. 按 [security-rules.md](./security-rules.md) 检查 PostgreSQL 授权、原生云存储和函数边界。网页不持有 Publishable Key 或 API Key，数据库和文件桶仅由 HTTP 云函数以服务端 API Key 访问。

7. 在 GitHub 仓库的 Settings → Secrets and variables → Actions → Variables 新建：

   ```text
   WEEKLY_REPORT_API_URL=https://<CloudBase 默认域名>/api/weekly-report
   ```

8. 推送代码并手动运行 Deploy GitHub Pages；测试首页、检索、HTML 上传、PDF 上传和同周新版本覆盖。

## 本地联调

复制 `github-web/.env.cloudbase.example` 为 `github-web/.env.local`，填入第 7 步的 API 地址，再运行：

```powershell
npm run github:dev
```

## 数据与恢复

- PostgreSQL `weekly_reports`：元数据、版本、检索正文、章节标题。
- PostgreSQL `weekly_report_upload_limits`：按来源的每日上传计数。
- PostgreSQL 原生云存储桶 `weekly-reports/reports/<report-id>/`：原始 HTML/PDF。

电脑关闭、浏览器关闭和换设备不会删除数据。免费环境临近到期时，应先导出两个数据表并下载云存储桶，再按控制台规则续期。

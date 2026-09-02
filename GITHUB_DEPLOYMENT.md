# GitHub Pages 迁移与发布

## 架构

- `github-web/`：静态 React 网页，由 GitHub Pages 免费托管。
- `worker/`：Cloudflare Worker API，负责上传、HTML/PDF 解析、版本管理、全文检索与预览。
- Cloudflare D1：保存周报元数据、正文索引与版本关系。
- Cloudflare KV：保存 HTML/PDF 原文件和清理后的 HTML。当前 10 MB 单文件限制低于 KV 单值上限。

网站发布后不依赖任何个人电脑，也不要求访问者下载模型或软件。

## 首次发布

1. 在 GitHub 新建仓库，把本项目推送到 `main` 分支。
2. 在 Cloudflare 创建名为 `hongkou-weekly-report` 的 D1 数据库和文件存储 KV 命名空间。
3. 将 D1 返回的数据库 ID 写入 `worker/wrangler.toml` 的 `database_id`。
4. 将 GitHub Pages 的来源地址写入 `worker/wrangler.toml` 的 `FRONTEND_ORIGIN`。
5. 在 GitHub 仓库的 Actions secrets 添加：
   - `CLOUDFLARE_API_TOKEN`：仅授予该 Worker、D1、KV 的编辑权限。
   - `CLOUDFLARE_ACCOUNT_ID`。
6. 手动运行 `Deploy Cloudflare Worker` 工作流，记下生成的 `workers.dev` 地址。
7. 在 GitHub 仓库的 Actions variables 添加 `API_BASE_URL`，值为完整 Worker 地址，例如 `https://hongkou-weekly-report-api.example.workers.dev`。
8. 在仓库 Settings → Pages 中选择 GitHub Actions，运行 `Deploy GitHub Pages`。

## 本地验证

```powershell
npm run worker:dev
```

另开一个终端：

```powershell
npm run github:dev
```

网页默认连接 `http://localhost:8787`。生产构建通过 `VITE_API_BASE_URL` 指定云端 API。

## 数据迁移

本次迁移按确认不搬运旧站测试数据，新站从空数据库开始。旧站会保留到新站的上传、预览、下载和搜索全部验证完成。

## 可能增加的费用

| 项目 | 常见起步费用 | 何时产生 |
|---|---:|---|
| GitHub Pages | ¥0 | 公开仓库及正常访问量通常免费 |
| GitHub Actions | ¥0 | 公开仓库通常免费；私有仓库超出赠送分钟数后计费 |
| Cloudflare Workers | ¥0 或约 US$5/月 | 低频请求可用免费层；服务端解析复杂 PDF 时建议付费层以获得更高 CPU 限额 |
| Cloudflare D1 | 通常 ¥0 | 读取、写入或存储超过免费额度后计费 |
| Cloudflare KV | 通常 ¥0 | 原文件超过免费存储或请求额度后计费；当前周报规模预计处于免费额度 |
| 自定义域名 | 通常 ¥60–150/年 | 仅在不用 `github.io` 地址时需要；具体取决于后缀和注册商 |
| 数据迁移 | 一次性工程工作 | 仅迁移现有正式数据时产生；没有第三方账单，但需要实施和核对时间 |
| 滥用流量 | 不确定 | 因按要求不设登录，公开上传可能被恶意占用；当前已有单 IP 每日 20 次、全站每日 200 次限制，可显著控制风险 |

对于目前“一周一份、内部转发访问”的规模，D1 和 KV 大概率长期处于免费额度。最可能的固定成本只有自定义域名；如果 PDF 在 Worker 免费 CPU 限额内解析不稳定，再增加约 US$5/月的 Workers 付费计划。

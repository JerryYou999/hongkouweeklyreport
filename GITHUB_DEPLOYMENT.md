# GitHub Pages 发布说明

## 架构

- `github-web/`：静态 React 网页，由 GitHub Pages 托管。
- CloudBase HTTP 云函数：公开 API、上传校验、版本管理和关键词检索。
- CloudBase PostgreSQL：周报元数据、正文索引和版本关系。
- CloudBase PostgreSQL 原生云存储：私有保存原始 HTML/PDF。

网站发布后不依赖任何个人电脑；访问者也不需要下载模型或软件。

## 首次或后续发布

1. 确认 CloudBase 环境、`weekly-report-api` 函数、`/api/weekly-report` 路由和 `weekly-reports` 私有文件桶均正常。
2. 在 GitHub 仓库打开 **Settings → Secrets and variables → Actions → Variables**。
3. 新建或更新变量：

   ```text
   WEEKLY_REPORT_API_URL=https://hongkoureport-d0gwv0k7a71e1300c-1481776030.ap-shanghai.app.tcloudbase.com/api/weekly-report
   ```

4. 在 **Actions** 中运行 `Deploy GitHub Pages`，或向 `main` 推送提交。
5. 打开网站，验证首页、搜索、HTML 上传、PDF 上传、同周新版本和历史版本。

该变量是公开 API 地址，不包含 API Key；不要创建或保存任何 CloudBase 密钥到 GitHub。

## 已知限制

- HTML/PDF 单文件最大 5 MB。这是为适配 CloudBase HTTP 云函数 6 MB 同步请求上限；网页上传先经由函数再写入私有文件桶。
- PDF 需要有可复制的文本层；扫描件当前没有 OCR。
- CloudBase 免费环境到期前应导出 PostgreSQL 数据表并下载文件桶后续期。

## 成本边界

| 项目 | 当前方案 |
|---|---|
| GitHub Pages | 正常内部转发访问下免费。 |
| GitHub Actions | 公开仓库通常免费；私有仓库受 GitHub 账户包含额度约束。 |
| CloudBase 体验环境 | 不启用按量付费时不自动产生账单；超出配额会受限而非自动扣费。 |
| 自定义域名 | 可选；不购买则没有域名费用。 |

当前免费环境有效期与服务端 API Key 的续期需要单独关注。

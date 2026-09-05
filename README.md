# 虹口区区域深耕周报

一个无需账号即可上传、归档、查看和搜索周报的网站。支持 HTML 与带文本层的 PDF，同一 ISO 周再次上传时自动创建新版本并保留历史。

## 功能

- 公开上传 HTML、HTM、PDF，单文件最大 10 MB；
- HTML 原文件与原始样式完整保留，预览在浏览器沙箱中禁用脚本和表单提交；
- PDF 按页提取文本并直接预览；
- 中文、英文和中英文混合全文搜索；
- 依据周报日期计算 ISO 年份与周数；
- 同周版本化覆盖、历史版本留存；
- SHA-256 文件去重；
- 单一来源每日上传限速；
- 页面默认 `noindex`，避免搜索引擎收录。

扫描版 PDF 没有可检索文本层，V1 不提供 OCR。

## 本地开发

```powershell
npm install
npm run github:dev
```

开发服务器会打印本地访问地址。需要先按 `cloudbase/README.md` 配置本地 CloudBase 环境变量。

## 验证

```powershell
npm run typecheck
npm run lint
npm test
npm run github:build
```

## 数据与文件

- CloudBase 文档数据库：周报元数据、版本、搜索正文、章节标题和限速计数；
- CloudBase 云存储：原始 HTML/PDF；
- CloudBase 云函数：关键词包含检索、版本号分配和上传校验。

CloudBase 部署和安全配置位于 `cloudbase/`。原 Cloudflare Worker 代码暂时保留，便于迁移期间回退。

## 版本规则

当前只有一个周报系列，唯一业务维度为 `ISO 年份 + ISO 周数`。同一周上传不同文件时创建 V2、V3 等新版本；首页、历史列表和搜索仅展示当前版本，详情页保留完整历史。

## 安全边界

本项目按需求不显示登录或上传权限，因此任何知道网站地址的人都可以查看、搜索和上传。浏览器会在后台建立匿名会话，用于 CloudBase 防滥用和文件归属；用户不需要注册或操作登录。HTML 原文件只在隔离的 iframe 中预览，不会在主页面上下文中执行脚本。

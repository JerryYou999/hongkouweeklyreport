# 周报网站迁移到 CloudBase

此目录把现有 GitHub Pages 前端接到腾讯 CloudBase，替代中国内地访问不稳定的 Cloudflare Worker。GitHub 继续托管页面；CloudBase 只负责数据库、原文件存储和一个 3 秒内完成的轻量云函数。

## 重要边界

- 免费体验环境目前为 0 元、每月 3000 资源点，单次可续 6 个月；不支持自动续期。
- 0 元续期当前需要完成官方指定的内容发布任务，并提交链接与截图验证，不只是点击按钮。
- 腾讯把免费环境定位为开发测试用途，不提供生产 SLA，规则和额度可能调整。
- 不要把该环境关联并发布为微信小程序；按当前规则，小程序发布会把免费环境到期日改成上线后第 15 天。
- 免费环境不能开启按量付费，因此不会因超量自动扣费；超量时服务会受限。

## 一次性配置

1. 在腾讯云 CloudBase 控制台创建一个上海地域的免费体验环境，记录环境 ID 和实际到期日。
2. 在“身份认证 / 登录方式”开启匿名登录。用户不会看到登录界面，浏览器只在后台建立匿名会话。
3. 在“API Key 配置”创建一个 Publishable Key。它可以放在浏览器端；不要把服务端 API Key 或腾讯云 SecretKey 放进前端。
4. 在 Web 安全域名中加入 `jerryyou999.github.io`，本地联调时再加入 `localhost`。
5. 复制 `cloudbase/cloudbaserc.example.json` 为仓库根目录的 `cloudbaserc.json`，将其中环境 ID 替换为真实值。`cloudbaserc.json` 应保持本地使用，不要提交真实环境信息。
6. 安装并登录腾讯官方 CLI，然后部署云函数：

   ```powershell
   npm install -g @cloudbase/cli
   tcb login
   tcb fn deploy weekly-report-api --env-id <你的环境ID>
   ```

7. 在云函数控制台测试一次，事件内容为 `{"action":"setup"}`。它会创建 `weekly_reports` 和 `weekly_report_upload_limits` 两个集合。
8. 返回 `success: true` 后，把 [security-rules.md](./security-rules.md) 中的规则分别应用到两个集合、云存储和 `weekly-report-api` 云函数。
9. 为 `weekly_reports` 建立以下复合索引：

   - `is_current` 升序 + `report_date` 降序
   - `week_key` 升序 + `version_number` 降序
   - `iso_year` 升序 + `iso_week` 升序 + `sha256` 升序

10. 在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加：

    - Variables：`CLOUDBASE_ENV_ID` = 环境 ID
    - Variables：`CLOUDBASE_REGION` = `ap-shanghai`
    - Secrets：`CLOUDBASE_ACCESS_KEY` = Publishable Key

11. 在 GitHub Actions 手动运行一次 Deploy GitHub Pages，随后分别测试首页、检索、HTML 上传、PDF 上传和同周新版本覆盖。

## 本地联调

复制 `github-web/.env.cloudbase.example` 为 `github-web/.env.local` 并填入真实值，然后运行：

```powershell
npm run github:dev
```

## 数据位置与恢复

- 周报元数据和检索文字：CloudBase 文档数据库 `weekly_reports`。
- HTML/PDF 原文件：CloudBase 云存储 `weekly-reports/<report-id>/`。
- 浏览器关闭、电脑关闭或换设备不会删除数据。
- 套餐到期进入隔离期后必须及时续期；隔离期结束仍未处理，数据可能被销毁。续期前应导出两个集合并下载云存储目录做备份。

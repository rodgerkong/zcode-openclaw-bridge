# 更新日志

本项目的所有版本变更都记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-07-03

### 新增
- **核心插件** `openclaw-bridge` v0.1.0：让 ZCode 与 OpenClaw 实例对话和操作
- **跨平台支持**：macOS/Linux (`install.sh`)、Windows (`install.ps1`，含 UTF-8 BOM 解决 PS5.1 中文环境解析问题)
- **多 agent 协作能力**：多模型路由、定时任务(cron)、跨会话记忆、飞书通知、联网搜索、浏览器抓取
- **零外部运行时依赖**：仅需 Node.js 18+（bridge.mjs 用 Node 内置 `crypto`(ed25519) + `WebSocket` 直连）
- **会话保持**：复用 sessionKey，跨对话保持上下文
- **委派决策指南**：SKILL.md 写明何时应该委派给 OpenClaw
- **完整文档**：协议/安全/部署/排错 references
- **3 轮 Windows 回归测试通过**（详见仓库 issues）

### 安全性
- **设备签名**：ed25519 v3 签名直连 WS gateway，token 持久化在本地
- **三级安全模型**：设备配对 → 范围审批 → 执行审批
- **无 HTTP 端点暴露**：全走 WS，不开 OpenAI 兼容端点

### 已修复
- **#1** install.ps1 加 UTF-8 BOM（PS 5.1 中文 Windows 解析）
- **#2** 模板默认端口 23600 → 18789（与 OpenClaw 默认一致）
- **#3** 控制台中文乱码（脚本开头设 `Console.OutputEncoding=UTF8`）
- **#3b** Unicode 图标 → ASCII（`[OK]`/`[!]`/`[X]`/`->`，彻底解 PS5.1 字体局限）
- **#4** NativeCommandError 假报错（局部降级 `ErrorActionPreference=Continue` 调用原生 node 命令）
- **#5** 脚本退出码 = 1（best-effort 探测失败污染退出码）→ 末尾显式 `exit 0`

[0.1.0]: https://github.com/rodgerkong/zcode-openclaw-bridge/releases/tag/v0.1.0

## Unreleased

### 变更
- **docs/ 已迁移到独立私有仓库** [`rodgerkong/zcode-openclaw-bridge-internal`](https://github.com/rodgerkong/zcode-openclaw-bridge-internal)
  - 原因：研究笔记含内部网络细节（真实 IP/Tailscale 配置）、设备配对凭证（token 截断/字段名），不属于交付物
  - 公开仓库 `docs/` 目录已删除，git history 将通过 filter-repo 清理
  - 私有仓库迁移完成后，公开仓库将只含源码、协议、用户面向文档

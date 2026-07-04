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

[0.1.0]: https://github.com/rodgerkong/zcode-openclaw-bridge/releases/tag/v0.1.0

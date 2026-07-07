# zcode-openclaw-bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org)
[![ZCode Plugin](https://img.shields.io/badge/ZCode-plugin-blueviolet)](https://zcode.z.ai)

**ZCode ↔ OpenClaw 桥接插件** —— 让 ZCode 调用 OpenClaw 实例，补强单模型/单机能力。

> 多模型协作 · 定时任务 · 跨会话记忆 · 飞书通知 · 联网搜索 · 浏览器抓取

## 快速开始

把 release zip 直接发给 ZCode，让它自行安装：

> 📦 下载 [openclaw-bridge-plugin-0.1.0.zip](https://github.com/rodgerkong/zcode-openclaw-bridge/releases/tag/v0.1.0) 发给 ZCode

剩下的 ZCode 会根据 `plugin/README.md` 自行完成解压、运行 `install.sh` / `install.ps1`、自检、配置首联系人等步骤。

## 为什么需要这个插件

ZCode 是单模型、会话制、单机运行；OpenClaw 是多模型、常驻、跨平台。当任务超出 ZCode 自身能力时（如需多模型协作、定时执行、跨会话记忆、调用外部通道），即可通过本插件委派给 OpenClaw 完成。

详细委派决策指南见 `plugin/skills/openclaw-bridge/SKILL.md`。

## 仓库结构

```
zcode-openclaw-bridge/
├── README.md                    # 本文件（GitHub 入口）
├── LICENSE                      # MIT
├── CHANGELOG.md                 # 版本变更记录
├── plugin/                      # 插件源码（核心交付物）
│   ├── README.md                # 插件完整安装/使用说明
│   ├── install.sh / install.ps1 # 跨平台安装脚本
│   └── skills/openclaw-bridge/  # skill 主体
└── .gitignore
```

## 运行时依赖

| 依赖 | 必须 | 说明 |
|------|------|------|
| Node.js 18+ | ✅ | 唯一必需依赖，bridge.mjs 用 Node 内置 `crypto`(ed25519) + `WebSocket` 直连 |
| openclaw CLI | ❌ | 不需要，bridge 自行实现签名 |
| python / 任何 npm 包 | ❌ | 零外部依赖 |

⚠️ ZCode 是 Electron 应用（内部自带 node），但**不暴露到系统 PATH**。必须单独装 node 到 PATH。

## 协议

[MIT](LICENSE) © 2026 Rodger

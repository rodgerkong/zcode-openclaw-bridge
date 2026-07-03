# zcode-openclaw-bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org)
[![ZCode Plugin](https://img.shields.io/badge/ZCode-plugin-blueviolet)](https://zcode.z.ai)

**ZCode ↔ OpenClaw 桥接插件** —— 让 ZCode 调用 OpenClaw 实例，补强单模型/单机能力。

> 多模型协作 · 定时任务 · 跨会话记忆 · 飞书通知 · 联网搜索 · 浏览器抓取

## 快速开始

1. 从 [Release v0.1.0](https://github.com/rodgerkong/zcode-openclaw-bridge/releases/tag/v0.1.0) 下载 `openclaw-bridge-plugin-0.1.0.zip`
2. 解压后按系统运行安装脚本（macOS/Linux `install.sh`、Windows `install.ps1`）
3. 详见 **`plugin/README.md`**（插件的完整安装/使用文档，随源码一起维护）

```bash
# macOS / Linux
unzip openclaw-bridge-plugin-0.1.0.zip -d openclaw-bridge-plugin
cd openclaw-bridge-plugin && bash install.sh

# Windows (PowerShell)
Expand-Archive openclaw-bridge-plugin-0.1.0.zip
cd openclaw-bridge-plugin
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install.ps1
```

## 为什么需要这个插件

ZCode 是单模型、会话制、单机运行；OpenClaw 是多模型、常驻、跨平台。当任务超出 ZCode 自身能力时（如需多模型协作、定时执行、跨会话记忆、调用外部通道），即可通过本插件委派给 OpenClaw 完成。

详细委派决策指南见 `plugin/skills/openclaw-bridge/SKILL.md`。

## 仓库结构

```
zcode-openclaw-bridge/
├── README.md                    # 本文件（GitHub 入口）
├── LICENSE                      # MIT
├── CHANGELOG.md                 # 版本变更记录
├── docs/                        # 研究报告与决策记录
├── plugin/                      # 插件源码（核心交付物）
│   ├── README.md                # 插件完整安装/使用说明
│   ├── install.sh / install.ps1 # 跨平台安装脚本
│   └── skills/openclaw-bridge/  # skill 主体
└── .gitignore
```

**不进 git 的内容**（本地保留，`.gitignore` 排除）：
- `STATE.md` — 个人项目状态记录
- `sessions/` — 开发会话归档
- `plugin/poc/` — PoC 参考实现
- `plugin/.../scripts/bridge.sh`、`bridge.py` — legacy 版本

## 运行时依赖

| 依赖 | 必须 | 说明 |
|------|------|------|
| Node.js 18+ | ✅ | 唯一必需依赖，bridge.mjs 用 Node 内置 `crypto`(ed25519) + `WebSocket` 直连 |
| openclaw CLI | ❌ | 不需要，bridge 自行实现签名 |
| python / 任何 npm 包 | ❌ | 零外部依赖 |

⚠️ ZCode 是 Electron 应用（内部自带 node），但**不暴露到系统 PATH**。必须单独装 node 到 PATH。

## 测试与质量

本项目经 3 轮 Windows 原生环境回归测试，详见仓库 [Issues](https://github.com/rodgerkong/zcode-openclaw-bridge/issues)：
- #1: v1 安装测试报告（初轮发现 5 个问题）
- #2: v2 回归测试（#4 根因更正）
- #3: v3 回归测试（#4 验证修复，新发现 #6 退出码）

## 协议

[MIT](LICENSE) © 2026 Rodger

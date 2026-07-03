# 部署依赖

> 部署或迁移 openclaw-bridge 到新机器时，必须确认以下运行时已安装。

## 唯一必需依赖：node 18+

Node 版 bridge.mjs **零 npm 依赖**——仅用 Node 内置的 `crypto`（ed25519 签名）+ `WebSocket`（长连接）。不需要 python3、不需要 openclaw CLI、不需要任何 `npm install`。

- node 18+ 内置 `crypto.sign(null, payload, key)` 原生 ed25519 支持
- node 21+ 内置全局 `WebSocket`（WHATWG 标准）
- 跨平台：macOS/Linux/Windows 官方安装包都可用

**安装方式**（任选其一）：
| 平台 | 命令 |
|------|------|
| macOS | `brew install node` |
| Linux (Debian/Ubuntu) | `sudo apt install nodejs` |
| Windows | https://nodejs.org 下载 LTS |
| 通用（推荐） | nvm：`https://github.com/nvm-sh/nvm` |

### ⚠️ ZCode 自带 node 的陷阱

ZCode 是 Electron 应用，**内部确实自带 node 运行时**（约 v24.x）。但：

- Electron 内部的 node **只给 Electron 自身用**，不会暴露到系统 PATH
- 插件脚本调用 `node bridge.mjs` 或 shebang `#!/usr/bin/env node` 找的是 **PATH 里的 node**
- 因此即使装了 ZCode，如果系统 PATH 里没有 node，插件脚本仍会失败（`node: command not found`）

**结论：必须单独安装 node 到系统 PATH，不能依赖 ZCode 自带的。**

> 未来如果 ZCode 把内部 node 暴露到插件执行环境的 PATH（类似 VS Code 的做法），此依赖可去除。届时本文档会更新。

## 首次连接新 gateway：设备配对

bridge.mjs 在本机生成 ed25519 设备密钥对（配置目录下的 `device-identity.json`，macOS/Linux `~/.config/openclaw-bridge/`，Windows `%USERPROFILE%\.config\openclaw-bridge\`），首次连接某个 gateway 时需在其侧 approve 一次：

1. bridge 连接 → gateway 返回 `pairing required` + deviceId
2. 在 gateway 机器上：`openclaw devices list` 看 pending，`openclaw devices approve <requestId>`
3. approve 后，bridge 重连即可（deviceToken 自动持久化，之后无需再 approve）

这类似 SSH 的 `ssh-copy-id`——客户端自管密钥，服务端记信任，一次性配对。

## 验证依赖是否就绪

```bash
node --version      # 应 ≥ v18
node bridge.mjs help           # 自检
node bridge.mjs contacts test <contact>  # 测连通性
```

或直接运行 `install.sh`，它会自动检测 + 自检。

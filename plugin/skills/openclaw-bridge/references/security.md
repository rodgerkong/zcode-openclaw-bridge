# 安全模型

## 读放行 / 写确认

- **读操作（query）**：直接执行，无需确认。
- **写操作（operate）**：bridge.mjs 要求 `--yes` flag。**ZCode 调用前应先向用户说明动作、得到同意**，不要默认带 `--yes`。

这是技能层的二次确认，独立于 OpenClaw 自身的 exec approval（后者主要针对 `system.run` 命令执行，cron/config 写入不一定触发）。

## OpenClaw 三层安全

连接需通过三层：
1. **device pairing**（身份）— 设备首次连接需在 gateway 侧 approve（一次性，类似 ssh-copy-id）
2. **scope approval**（权限）— 授予 read/write/admin 等范围
3. **exec approval**（危险操作）— 运行时按需

本机实例（loopback）通常自动信任；远程实例需逐层审批。

## 传输方式

bridge.mjs 直连 WS gateway（ed25519 设备签名），不依赖 openclaw CLI。**不开** OpenAI 兼容 HTTP 端点——该端点把 token 持有者视为完整 owner（admin 全权），无细粒度授权，仅在 loopback/tailnet 内用才安全。

## token 管理

- token 存于配置目录的 contacts.json（macOS/Linux `~/.config/openclaw-bridge/`，Windows `%USERPROFILE%\.config\openclaw-bridge\`），文件权限 600
- 当前明文（与 OpenClaw 自身的 openclaw.json 处理方式一致）
- **不要**把 token 写进环境变量 `OPENCLAW_GATEWAY_TOKEN`——会与 config token 冲突导致 gateway 自报 unreachable

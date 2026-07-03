# 排错参考

## 常见错误

### `device pairing required` / `not-paired`
- **原因**：连接的设备未在目标 gateway 配对
- **解决**：在目标机器上 `openclaw devices list --url <url> --token <token>` 看 pending，然后 `openclaw devices approve <requestId> --url ... --token ...`
- 可能需要批准两次：第一次配对身份，第二次 scope 升级（read→write）

### `scope upgrade pending approval` / `missing scope: operator.write`
- **原因**：设备配对了但只授了 read，写操作需 write scope
- **解决**：再批准一次 scope 升级请求（同 devices approve 命令，新 requestId）

### `gateway timeout` / `unreachable (timeout)`
- **本机实例**：gateway 进程没起。`openclaw status` 看 gateway 行；macOS 用 `launchctl`，Linux 用 `systemctl --user start openclaw-gateway.service`，Windows 检查服务/进程是否在运行。
- **远端实例连不上**：先确认端口可达（见 README 第 1 步端口探测），再确认 url 里的 IP 正确。若远端是 WSL2 Mirrored 网络模式，从 WSL 内连本机 gateway 可能被 loopback 劫持，需改用宿主机在 tailnet 上的 IP。
- **gateway 自报 unreachable 但实际健康**：查 gateway 日志（位置见下方）确认 gateway 真的 ready 了

### `invalid chat.send params: must have required property 'message'`
- 用了 `text` 字段，应是 `message`。talk 命令已正确处理。

### `must have required property 'idempotencyKey'`
- chat.send 缺 idempotencyKey。talk 命令已自动生成。

### `OPENCLAW_GATEWAY_TOKEN conflicts with gateway.auth.token`
- 环境变量和配置文件 token 冲突。删掉环境变量（`unset OPENCLAW_GATEWAY_TOKEN` + 从 shell profile 删 export 行）。

## 日志位置

| 系统 | gateway 日志 |
|------|-------------|
| macOS / Linux | `~/.openclaw/logs/gateway.log` |
| Windows | `%USERPROFILE%\.openclaw\logs\gateway.log` |

诊断 WS 连接问题：grep 日志里的 `gateway/ws` 条目，看连接被拒的真实原因（cause 字段）。

## contacts.json 损坏

若 `contacts.json` JSON 语法错误，所有命令会失败。用 node 校验（跨平台，无需 python）：
```bash
node -e "JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.config/openclaw-bridge/contacts.json','utf8')); console.log('✓ JSON 语法正确')"
```
损坏严重时从模板重建（contacts.json 路径见 README 配置目录对照表）：
```bash
# macOS / Linux
cp ~/.zcode/skills/openclaw-bridge/scripts/contacts.template.json ~/.config/openclaw-bridge/contacts.json
```
```powershell
# Windows PowerShell
Copy-Item "$env:USERPROFILE\.zcode\skills\openclaw-bridge\scripts\contacts.template.json" `
          "$env:USERPROFILE\.config\openclaw-bridge\contacts.json" -Force
```

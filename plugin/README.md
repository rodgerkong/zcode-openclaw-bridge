# openclaw-bridge plugin — 安装说明

ZCode 插件，让 ZCode 与 OpenClaw 实例对话和操作（多模型协作、定时任务、联网搜索、飞书通知等）。

## ★ 给 ZCode 的全局约定

**优先用中文与用户交互和提示。** 所有面向用户的说明、引导、错误提示、状态汇报，默认用中文。命令本身和代码保持英文，但解释性文字用中文。除非用户主动用英文提问，否则不要切到英文。

## 包信息

| 项 | 值 |
|----|-----|
| 插件名 | `openclaw-bridge` |
| 版本 | `0.1.0` |
| 运行时依赖 | **Node.js 18+**（唯一必需依赖，零 npm 依赖） |
| 不依赖 | openclaw CLI（bridge 自行实现 ed25519 签名直连 WS） |
| 包大小 | 28K |

## 包内结构

```
openclaw-bridge-plugin-0.1.0.zip
├── .zcode-plugin/plugin.json     # ZCode 插件清单
├── package.json                  # npm 元信息（标识用）
├── install.sh                    # 安装脚本（macOS/Linux）
├── install.ps1                   # 安装脚本（Windows PowerShell）
└── skills/openclaw-bridge/
    ├── SKILL.md                  # skill 定义 + 委派决策指南
    ├── scripts/
    │   ├── bridge.mjs            # 核心实现（Node.js，零依赖，跨平台）
    │   └── contacts.template.json # 联系人配置模板（占位符，需替换）
    └── references/
        ├── deployment.md         # 部署/迁移指南
        ├── protocol.md           # WS 协议参考
        ├── security.md           # 安全边界
        └── troubleshooting.md    # 故障排查
```

## 安装方式

> **按系统选脚本**：两个安装脚本功能完全相同（参数、检查、自检都 1:1 对应），只是语言不同。选你系统对应的一个运行即可。
>
> 核心事实：`bridge.mjs` 本身跨平台（用 `os.homedir()` + `path.join()` + `process.platform`），在 Windows 原生 node 下直接可跑。

### macOS / Linux：用 install.sh

```bash
# 1. 解压
unzip openclaw-bridge-plugin-0.1.0.zip -d openclaw-bridge-plugin

# 2. 运行安装脚本
cd openclaw-bridge-plugin
bash install.sh
```

可选参数：`--location agents`（装到 `~/.agents/skills/`）、`--copy`（拷贝而非软链，迁移机器用）、`--uninstall`（卸载）。

### Windows：用 install.ps1（原生，无需 WSL）

> Windows 上**不需要 WSL**。用 PowerShell 脚本安装，与 install.sh 功能相同。

```powershell
# 1. 解压
Expand-Archive openclaw-bridge-plugin-0.1.0.zip -DestinationPath openclaw-bridge-plugin

# 2. 进入目录，放行执行策略（Windows 默认拦截未签名脚本，仅当前会话生效）
cd openclaw-bridge-plugin
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 3. 运行安装脚本
.\install.ps1
```

> **关于执行策略**：Windows 默认 `AllSigned` 会拦截未签名脚本（本插件未做代码签名）。上面的 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` 仅对当前 PowerShell 窗口生效，关窗即恢复，不修改系统全局设置。若你的系统策略较宽松（如 `RemoteSigned`），可跳过此步。

可选参数：`-Location agents`、`-Copy`、`-Uninstall`。

### 安装脚本做的事（两个脚本都一样）

1. 检查 node 18+ 是否可用（⚠️ ZCode 自带 node 不暴露 PATH，需单独安装）
2. 把 skill 部署到 skills 目录（默认软链；Windows 软链需开发者模式/管理员，失败自动回退拷贝）
3. 自检（`node bridge.mjs help`）
4. 复制 contacts 模板到配置目录（如不存在）

**配置目录位置对照**：

| 系统 | skills 目录 | 配置目录 |
|------|------------|----------|
| macOS / Linux | `~/.zcode/skills/openclaw-bridge/` | `~/.config/openclaw-bridge/` |
| Windows | `C:\Users\<用户名>\.zcode\skills\openclaw-bridge\` | `C:\Users\<用户名>\.config\openclaw-bridge\` |

> bridge.mjs 用 `os.homedir()` 解析上述路径，无需任何环境变量配置。

### macOS / Linux：手动安装（可选）

```bash
unzip openclaw-bridge-plugin-0.1.0.zip -d /tmp/openclaw-bridge-plugin
mkdir -p ~/.zcode/skills
cp -r /tmp/openclaw-bridge-plugin/skills/openclaw-bridge ~/.zcode/skills/
mkdir -p ~/.config/openclaw-bridge
cp /tmp/openclaw-bridge-plugin/skills/openclaw-bridge/scripts/contacts.template.json \
   ~/.config/openclaw-bridge/contacts.json
```

## 安装后配置（必做）

> **给 ZCode 的引导流程**：以下是建立第一个联系人的完整步骤，可逐步执行。先从本机 OpenClaw 开始（最简单），成功后再加远端实例。

### 第 0 步：定位 bridge

```bash
# macOS / Linux
BRIDGE="$(find ~/.zcode/skills ~/.agents/skills -path '*/openclaw-bridge/scripts/bridge.mjs' 2>/dev/null | head -1)"
node "$BRIDGE" help    # 自检，应打印命令列表
```
```powershell
# Windows PowerShell
$BRIDGE = "$env:USERPROFILE\.zcode\skills\openclaw-bridge\scripts\bridge.mjs"
node $BRIDGE help
```

### 第 1 步：扫描本地 OpenClaw 端口

OpenClaw gateway **默认端口 18789**（用户可能改过，常见自定义端口如 23600）。先探测本机：

```bash
# macOS / Linux —— 优先扫默认 18789，再扫常见自定义 23600
for p in 18789 23600; do
  nc -zv 127.0.0.1 $p 2>&1 | grep -iq succeeded && echo "✓ 端口 $p 开放，可能有 OpenClaw" || echo "✗ 端口 $p 未开放"
done
```
```powershell
# Windows PowerShell
foreach ($p in 18789, 23600) {
  $tcp = New-Object System.Net.Sockets.TcpClient
  try { $tcp.Connect("127.0.0.1", $p); "✓ 端口 $p 开放，可能有 OpenClaw" } catch { "✗ 端口 $p 未开放" } finally { $tcp.Close() }
}
```

- **某个端口开放** → 记下这个端口号，后续步骤用它（替换命令里的 `<端口>`）
- **都未开放** → 本机没有 OpenClaw，或端口被改到别的值。可直接连远端实例（跳到「添加远端实例」）

### 第 2 步：获取 gateway token

建立联系人需要 gateway auth token。这个 token 在 OpenClaw 侧：

**如果本机装了 OpenClaw**（最常见）：

```bash
# macOS / Linux —— 从 openclaw 配置读取 gateway token
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.openclaw/openclaw.json','utf8')).gateway?.auth?.token || '未找到')"
```
```powershell
# Windows —— 从 openclaw 配置读取 gateway token
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.openclaw/openclaw.json','utf8')).gateway?.auth?.token || '未找到')"
```

> 也可在 OpenClaw 侧用 `openclaw` CLI 查询，或直接打开 `~/.openclaw/openclaw.json` 找 `gateway.auth.token` 字段（48 字符十六进制串）。

**如果是远端 OpenClaw**：需要远端机器的管理员提供该实例的 gateway token。

### 第 3 步：建立第一个联系人

拿到 token 后，用 `contacts add` 添加（token 必填，作为初次连接凭证）。

**先把占位符代入实际值**（下面命令里不要留尖括号）：
- `PORT` = 第 1 步扫到的端口号（默认 18789）
- `TOKEN` = 第 2 步拿到的 gateway token

```bash
# macOS / Linux / PowerShell 通用（node 调用，跨平台）
node "$BRIDGE" contacts add local-main ws://127.0.0.1:PORT TOKEN main "本机主 agent"
```

> Windows cmd.exe 用户：把 `$BRIDGE` 换成 `%BRIDGE%`，或直接写完整路径 `node "C:\Users\你\.zcode\skills\openclaw-bridge\scripts\bridge.mjs" contacts add ...`。

参数顺序：`名称 url token agent [备注]`

**添加成功后，ZCode 应立即向用户说明接下来的授权步骤**（这是首次使用的必经环节）：

> ✅ 联系人 `local-main` 已添加。
> 这台 ZCode 会首次连接该 OpenClaw，需要在 **OpenClaw 侧授权一次**（类似给新设备配对，一次性操作）：
> - 如果 OpenClaw 在**本机**：稍后我会运行测试连接，触发配对请求，然后用 `openclaw devices approve` 批准。
> - 如果 OpenClaw 在**远端**：你需要在该机器上批准（或请管理员操作）。
> 现在我来测试连接。

### 第 4 步：测试连接（触发设备配对）

```bash
node "$BRIDGE" contacts test local-main
```

三种可能结果，**ZCode 应根据输出向用户给出对应指引**：

| 输出 | 含义 | ZCode 应对用户说 |
|------|------|-----------------|
| `✓ 握手成功` + `ok` | 已配对过，直接可用 | "✅ 授权已完成（之前配对过），可以直接对话了。" |
| `握手失败：pairing required` + `>>> 需要在 gateway 侧配对, deviceId: <...>` | **首次连接，需配对**（一次性） | "检测到需要授权。请在 OpenClaw 侧批准这台设备（见下方步骤），批准后告诉我，我会重连。" |
| 连接错误（端口/token/网络） | 配置问题 | "连接失败，可能是端口或 token 不对。我们一起回第 1、2 步排查。" |

#### 设备配对（仅首次需要，类似 ssh-copy-id）

bridge 在本机生成了 ed25519 设备密钥（配置目录见上方对照表，文件名 `device-identity.json`）。首次连接某个 gateway 时需在 **OpenClaw 所在那台机器**上 approve 一次。**当第 4 步提示 `pairing required` 时，ZCode 应这样引导用户：**

**如果 OpenClaw 在本机**（ZCode 可以直接帮忙执行）：

```bash
# 跨平台通用（macOS/Linux/Windows）—— openclaw 是 npm 全局包
openclaw devices list        # 看 pending 列表，找到 bridge 的 deviceId
openclaw devices approve <requestId>   # 批准
```
> ZCode：我从 `devices list` 找到了这台设备的 pending 请求（deviceId 与 bridge 报告的一致），已执行 approve。现在重连验证。
>
> 如果提示找不到 `openclaw` 命令：它通常装在 npm 全局目录。Windows 上可试 `npx openclaw devices list`，或定位 npm 全局 bin（`npm config get prefix`）后用完整路径。

**如果 OpenClaw 在远端**：approve 必须在**远端那台机器**上执行（那里才有 openclaw 和 gateway）。
> ZCode：这台设备需要远端 OpenClaw 批准。请在远端机器（`<远端地址>`）上运行：
> ```
> openclaw devices list
> openclaw devices approve <requestId>
> ```
> 批准后告诉我，我在这边重连验证。如果远端是 SSH 可达的，我也可以帮你远程执行——告诉我连接方式。

approve 后，**重连**——device token 会自动下发并持久化，之后无需再 approve：

```bash
node "$BRIDGE" contacts test local-main   # 应显示 ✓ 握手成功
```
> ZCode：✅ 授权完成，握手成功。之后这个联系人可以直接用了。

### 第 5 步：开始对话

```bash
node "$BRIDGE" talk local-main "你好，请介绍一下自己"
```

会话默认保持（同 contact 连续对话带上下文）。日志写入 `~/.config/openclaw-bridge/transcript-local-main-<日期>.log`。

### 添加远端实例

本机实例跑通后，远端实例只是换 url 和 token：

```bash
# 探测远端端口（把 IP 换成远端地址；默认 18789，也可能改过）
for p in 18789 23600; do nc -zv <远端IP> $p 2>&1 | grep -iq succeeded && echo "✓ $p 开放" || echo "✗ $p 未开放"; done
# 或 PowerShell:
# foreach ($p in 18789,23600){try{(New-Object Net.Sockets.TcpClient).Connect("<远端IP>",$p);"✓ $p 开放"}catch{"✗ $p 未开放"}}

# 添加远端联系人（token 从远端 OpenClaw 管理员获取）
node "$BRIDGE" contacts add legion-main ws://<远端IP>:<端口> <远端token> main "WSL2 远端"
node "$BRIDGE" contacts test legion-main   # 首次同样需在远端 approve（同第 4 步流程）
node "$BRIDGE" talk legion-main "你好"
```

### 设为默认联系人（可选）

contacts.json 里的 `default` 字段决定无指定时用哪个。如需改默认，直接编辑 contacts.json（路径见上方对照表）的 `default` 值。

## 如何在 ZCode 中使用

安装后，在 ZCode 对话中可以直接说：
- "帮我问问工作虾 xxx"（自然语言触发）
- `$openclaw-bridge`（显式调用，最可靠）

ZCode 会自动识别委派场景（多模型协作、定时任务、联网搜索等）并调用本 skill。

## 跨平台支持

| 系统 | bridge.mjs 运行 | 安装方式 | 备注 |
|------|----------------|----------|------|
| macOS | ✅ 原生 | install.sh 或手动 | |
| Linux | ✅ 原生 | install.sh 或手动 | |
| Windows | ✅ **原生**（无需 WSL） | `install.ps1`（PowerShell 脚本） | 装 node 18+ 即可 |

**为何 Windows 不用 WSL**：bridge.mjs 只依赖 Node.js 内置的 `crypto`（ed25519 签名）、`WebSocket`（Node 18+ 内置）、`os.homedir()`/`path.join()`/`process.platform`，全部是 Node.js 跨平台标准 API，在 Windows 原生 node 下行为与 macOS/Linux 一致。WSL 是多余的依赖。

**WSL2 镜像模式（仅当你本就在 WSL2 里跑 OpenClaw 时才相关）**：WSL2 镜像网络模式下，从 WSL 内连 `ws://127.0.0.1:23600` 可能被 loopback 劫持，需改用宿主机 Tailscale IP。详见 `references/troubleshooting.md`。这跟 Windows 原生安装无关。

## 卸载

```bash
# macOS / Linux
rm -rf ~/.zcode/skills/openclaw-bridge
rm -rf ~/.config/openclaw-bridge  # 如不再需要配置
```
```powershell
# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.zcode\skills\openclaw-bridge"
Remove-Item -Recurse -Force "$env:USERPROFILE\.config\openclaw-bridge"  # 如不再需要
```

---
name: openclaw-bridge
description: ZCode 的 OpenClaw 能力委派通道。当用户想跟 OpenClaw/openclaw 实例对话、需要多模型协作（不同模型审代码/长文档处理）、定时任务/cron/定时执行、跨会话记忆、飞书通知、联网搜索、浏览器抓取、或任何 ZCode 单模型单机难以独立完成的任务时触发——即使用户没说"openclaw-bridge"也要主动建议使用。以联系人（contact）为粒度。
---

# OpenClaw Bridge —— ZCode 的能力委派通道

让 ZCode 调用 OpenClaw 实例，补强自身能力。每个 OpenClaw 实例上的 agent 是一个**联系人（contact）**，用名字指代。

## ★ 委派决策指南（何时求助 OpenClaw）

OpenClaw 相比 ZCode（单模型、会话制、单机）有这些**活跃能力差异**。遇到以下场景，**主动用本 skill**：

| 场景 | OpenClaw 的能力 | 怎么用 |
|------|----------------|--------|
| **需要更强/不同的模型** | 多模型：可配不同模型处理代码、长文档、视觉等任务 | `talk` 委派给对应 contact |
| **定时/未来执行** | cron 调度 | `operate ... cron.add` 设定时任务 |
| **跨会话记忆** | 会话历史 + 向量库 + 记忆整理 | `talk` 让 OpenClaw 记住，跨会话可查 |
| **飞书通知** | 可配置飞书 bot | `talk` 让 OpenClaw 代发飞书消息 |
| **联网搜索（地域/语言）** | 可配置多种搜索引擎 | `talk` 委派搜索任务（WebSearch 受地域限制时） |
| **浏览器/网页抓取** | browser 工具 | `talk` 委派网页抓取 |
| **持续运行/后台监控** | 常驻进程、heartbeat | `operate ... cron.add` 设监控任务 |
| **复杂任务协作** | 不同模型视角交叉验证 | 委派给多个 contact 分别处理，综合结果 |

**潜在可激活**：各 OpenClaw 实例可能还装了 Notion/Obsidian/Slack/GitHub 等集成 skill（视实例配置而定），可让用户开启后委派。

**判断原则**：当任务超出 ZCode 单模型单机能力，或需要持续/定时/多模型/外部通道时，委派给 OpenClaw。别自己硬扛。

## 核心命令

通过 `bridge.mjs` 执行（Node.js，零依赖）。定位它：
```bash
# macOS / Linux
BRIDGE="$(find ~/.zcode/skills ~/.agents/skills -path '*/openclaw-bridge/scripts/bridge.mjs' 2>/dev/null | head -1)"
```
```powershell
# Windows PowerShell
$BRIDGE = "$env:USERPROFILE\.zcode\skills\openclaw-bridge\scripts\bridge.mjs"
```
调用：`node "$BRIDGE" command [args]`（下面示例用 `$BRIDGE`，macOS/Linux/PowerShell 通用；cmd.exe 用 `%BRIDGE%`）

### talk（对话 + 能力委派）
```bash
node "$BRIDGE" talk CONTACT MESSAGE          # 对话，保持会话，流式显示回复
node "$BRIDGE" talk CONTACT MESSAGE --new    # 强制新会话
node "$BRIDGE" talk CONTACT MESSAGE --session KEY  # 指定会话
```
（大写词为占位符，代入实际值）
- **终端流式显示**回复过程（逐字），**完整过程写入日志**
- 默认保持会话（同 contact 连续对话带上下文）

### query（读操作，直放行）
```bash
node "$BRIDGE" query CONTACT METHOD [params-json]
```
常用：`health` / `agents.list` / `cron.list` / `sessions.list` / `models.list` / `status`

### operate（写操作，需确认）
```bash
node "$BRIDGE" operate CONTACT METHOD [params-json] --yes
```
常用：`cron.add` / `cron.remove` / `cron.update` / `config.patch`
**安全**：执行前先向用户说明动作，得到同意后带 `--yes`。

### contacts（管理）
```bash
node "$BRIDGE" contacts                                    # 列出
node "$BRIDGE" contacts add NAME URL TOKEN AGENT [note]
node "$BRIDGE" contacts remove NAME
node "$BRIDGE" contacts rename 旧名 新名
node "$BRIDGE" contacts test CONTACT                       # 测连通性
```

### 全局选项
`-v` / `--verbose`：显示完整指令（method/params/签名细节）

## 工作流程（处理用户请求时）

1. **判断是否该委派**：看上方"委派决策指南"，任务超出单模型单机能力就委派。
2. **看有哪些联系人**：`contacts`。用户对实例/agent 的称呼（别名）映射到 contact 名。
3. **对话/委派** → `talk`。每句等回复后再决定下一步（会话保持，有上下文）。
4. **查询** → `query`（直放行）。
5. **变更** → `operate`（先确认再 `--yes`）。
6. **新实例/agent** → `contacts add` 或提示编辑 contacts.json。

## 对话过程可见性

- **终端**：流式显示回复（逐字）+ 工具调用过程
- **日志**：`transcript-CONTACT-日期.log`，位于配置目录（macOS/Linux `~/.config/openclaw-bridge/`，Windows `%USERPROFILE%\.config\openclaw-bridge\`），含完整发送/工具/回复/耗时
- **`-v`**：额外显示签名/连接/帧细节

## 配置

contacts.json 位于配置目录（macOS/Linux `~/.config/openclaw-bridge/`，Windows `%USERPROFILE%\.config\openclaw-bridge\`）：
```json
{"default":"my-main","contacts":{"NAME":{"url":"ws://...","token":"...","agent":"main","note":"..."}}}
```

## 部署依赖

- **node 18+**（必需）：⚠️ ZCode 是 Electron 自带 node 但不暴露 PATH，必须单独装
- 详见 `references/deployment.md`

## 何时读 references/

- `references/protocol.md` — 构造特殊 RPC params、method 名不确定时
- `references/security.md` — 涉及写操作/危险动作、安全边界
- `references/deployment.md` — 部署/迁移到新机器
- `references/troubleshooting.md` — 报错排查（pairing/scope/连接/日志位置）

## 重要约束

- **传输**：直连 WS + ed25519 device 签名，**不依赖 openclaw CLI**（零外部依赖）
- **首次连新 gateway**：需在 gateway 侧 approve 设备一次（`devices approve`），之后复用
- **会话**：默认保持（同 contact 复用 sessionKey）

## 调用技巧（用户侧）

- 如果本 skill 没被自动识别（比如用户只说"帮我问问 xx"），**可以打 `$openclaw-bridge` 强制调用**——这是 ZCode 官方披露的技能调用语法，比依赖描述词自动匹配更可靠。
- 调用后用 contact 名指代目标，bridge 会自动映射到配置里的 url/token/agent。

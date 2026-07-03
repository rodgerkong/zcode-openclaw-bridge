# 协议参考

> bridge.sh 经由 `openclaw gateway call` 走 WS Gateway Protocol。本文件记录易错的协议细节。

## chat.send 参数（对话）

bridge.sh 的 `talk` 内部已正确构造，但你若直接用 `operate`/`query` 调 chat.send，注意：

- **必须字段**：`sessionKey` + `idempotencyKey` + `message`
- **消息字段名是 `message`，不是 `text`**（用 `text` 会报 `unexpected property`）
- **`idempotencyKey` 必填**（缺失报 `must have required property 'idempotencyKey'`），任意唯一字符串即可
- **sessionKey 格式**：`agent:<agentId>:<scope>`，如 `agent:main:zcode-task-123`
  - 同时选定 agent 和会话作用域
  - 复用同一 sessionKey = 继续同一对话（连续会话机制）
  - 新 sessionKey = 新对话（无上下文）

## 常用 RPC method

### 读（query 直放行）
| method | 用途 | params 示例 |
|--------|------|------------|
| `health` | gateway 健康 + agent 列表 | `{}` |
| `agents.list` | 列出所有 agent | `{}` |
| `cron.list` | 列 cron 任务 | `{}` |
| `sessions.list` | 列会话 | `{}` |
| `models.list` | 列可用模型 | `{}` |
| `status` | 综合状态 | `{}` |
| `chat.history` | 读某会话历史 | `{"sessionKey":"agent:main:xxx"}` |

### 写（operate 需确认）
| method | 用途 | params 要点 |
|--------|------|------------|
| `cron.add` | 加 cron 任务 | `{name, schedule, ...}` |
| `cron.remove` | 删 cron 任务 | `{"id":"<job-id>"}` |
| `cron.update` | 改 cron 任务 | `{id, ...patch}` |
| `config.patch` | 合并配置更新 | `{...partial config}` |

## 响应格式

`--json` 输出为 OpenClaw 原始 JSON。常见：
- 成功：`{"ok":true,"result":{...}}` 或直接 `{"<data>":...}`
- chat.send：`{"runId":"...","status":"started"}`（异步，需轮询 chat.history 取回复）
- 错误：`{"ok":false,"error":{"type":"...","message":"..."}}`

talk 命令已封装"发送+轮询+取回复"，你只需调一次 talk。

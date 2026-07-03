#!/usr/bin/env node
// bridge.mjs — openclaw-bridge (Node.js 版)
// ZCode 与 OpenClaw 实例对话和操作的桥接。
// 长连接 WS + ed25519 device 签名 + 事件流回调（不轮询）。
// 零 npm 依赖：仅用 Node 内置 crypto + WebSocket + fs。
//
// 用法：node bridge.mjs <command> [args]
//   help / contacts / talk / query / operate
// 详见：node bridge.mjs help

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── 路径 ─────────────────────────────────────────────────────
const CONFIG_DIR =
  process.env.OCB_CONFIG_DIR ||
  path.join(os.homedir(), ".config", "openclaw-bridge");
const CONTACTS_FILE = path.join(CONFIG_DIR, "contacts.json");
const IDENTITY_FILE = path.join(CONFIG_DIR, "device-identity.json");
const TEMPLATE_FILE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "contacts.template.json"
);
const TRANSCRIPT_DIR = CONFIG_DIR; // transcript 日志也放配置目录

// ── 全局 ─────────────────────────────────────────────────────
let VERBOSE = false;

function err(...a) {
  console.error("[openclaw-bridge] ✗", ...a);
}
function info(...a) {
  console.error("[openclaw-bridge] →", ...a);
}
function warn(...a) {
  console.error("[openclaw-bridge] ⚠", ...a);
}
function verbose(...a) {
  if (VERBOSE) console.error("[openclaw-bridge] 🔍", ...a);
}

// ── 配置层 ───────────────────────────────────────────────────
function ensureConfig() {
  if (fs.existsSync(CONTACTS_FILE)) return true;
  if (!fs.existsSync(TEMPLATE_FILE)) {
    err("找不到配置模板：", TEMPLATE_FILE);
    return false;
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.copyFileSync(TEMPLATE_FILE, CONTACTS_FILE);
  fs.chmodSync(CONTACTS_FILE, 0o600);
  info("已从模板创建配置：", CONTACTS_FILE);
  return true;
}

function loadContacts() {
  try {
    return JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf-8"));
  } catch (e) {
    err("无法读取配置：", e.message);
    return null;
  }
}

function saveContacts(data) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

function getContact(name) {
  const d = loadContacts();
  return d?.contacts?.[name];
}

// ── 设备密钥层 ───────────────────────────────────────────────
// 从 openclaw 源码确认的格式（device-identity-CEPJolq9.js）：
//   deviceId = sha256(raw32字节公钥).hex()
//   公钥 wire 格式 = base64url(raw32)
//   私钥 PEM = PKCS8

function loadOrCreateIdentity() {
  if (fs.existsSync(IDENTITY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf-8"));
    } catch (e) {
      warn("device-identity.json 损坏，重新生成");
    }
  }
  info("生成新的 ed25519 设备密钥对...");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const deviceId = fingerprintPublicKey(publicKeyPem);
  const identity = {
    version: 1,
    deviceId,
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now(),
  };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), {
    mode: 0o600,
  });
  info("设备 deviceId:", deviceId);
  return identity;
}

// sha256(raw32字节公钥).hex()，与 openclaw device-identity 一致
function fingerprintPublicKey(publicKeyPem) {
  const der = crypto
    .createPublicKey(publicKeyPem)
    .export({ type: "spki", format: "der" });
  const raw32 = der.subarray(-32); // SPKI = 12字节前缀 + 32字节公钥
  return crypto.createHash("sha256").update(raw32).digest("hex");
}

// raw32 公钥 → base64url（wire 格式，device.publicKey 字段）
function publicKeyRawBase64Url(publicKeyPem) {
  const der = crypto
    .createPublicKey(publicKeyPem)
    .export({ type: "spki", format: "der" });
  const raw32 = der.subarray(-32);
  return raw32.toString("base64url");
}

// v3 签名载荷（从源码 client-C6EKqjh8.js L206-224 确认）
// 格式：v3|deviceId|clientId|clientMode|role|scopes逗号|signedAtMs|token|nonce|platform小写|deviceFamily小写
function buildV3Payload(p) {
  const norm = (v) =>
    typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "";
  return [
    "v3",
    p.deviceId,
    p.clientId,
    p.clientMode,
    p.role,
    (p.scopes || []).join(","),
    String(p.signedAtMs),
    p.token ?? "",
    p.nonce,
    norm(p.platform),
    norm(p.deviceFamily),
  ].join("|");
}

function signPayload(payloadStr, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  // crypto.sign(null, ...) = 原生 Ed25519（不预哈希），与 openclaw 一致
  return crypto.sign(null, Buffer.from(payloadStr, "utf8"), key).toString("base64url");
}

// ── transcript 日志 ──────────────────────────────────────────
function transcriptPath(contact) {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(TRANSCRIPT_DIR, `transcript-${contact}-${d}.log`);
}

function logTranscript(contact, line) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(transcriptPath(contact), `[${ts}] ${line}\n`);
  } catch (e) {
    /* 日志失败不影响主流程 */
  }
}

// ── GatewayClient（长连接 + 事件回调） ───────────────────────
class GatewayClient {
  constructor(identity) {
    this.identity = identity;
    this.ws = null;
    this.pending = new Map(); // id → {resolve, reject}
    this.eventHandlers = new Set();
    this.connectNonce = null;
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async connect(contact) {
    const c = getContact(contact);
    if (!c) throw new Error(`未知 contact：${contact}`);
    const url = c.url;
    const token = c.token;
    if (!url || !token) throw new Error(`contact ${contact} 缺 url 或 token`);

    verbose("连接 WS:", url);
    this.ws = new WebSocket(url);

    await new Promise((resolve, reject) => {
      const onOpen = () => {
        this.ws.removeEventListener("open", onOpen);
        resolve();
      };
      const onErr = (e) => {
        this.ws.removeEventListener("error", onErr);
        reject(new Error(`WS 连接失败：${e.message || e}`));
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onErr);
    });

    // 消息分发
    this.ws.addEventListener("message", (event) => this._onMessage(event.data));

    // 1. 收 connect.challenge
    const challenge = await this._waitFor(
      (msg) => msg.event === "connect.challenge",
      10000
    );
    const nonce = challenge.payload.nonce.trim();
    this.connectNonce = nonce;
    verbose("收到 nonce:", nonce.slice(0, 8) + "...");

    // 2. 构造 v3 签名
    const signedAt = Date.now();
    const clientId = "cli";
    const clientMode = "cli";
    const role = "operator";
    const scopes = ["operator.read", "operator.write", "operator.admin"];
    const platform = process.platform;
    const deviceFamily = "";

    const payloadStr = buildV3Payload({
      deviceId: this.identity.deviceId,
      clientId,
      clientMode,
      role,
      scopes,
      signedAtMs: signedAt,
      token,
      nonce,
      platform,
      deviceFamily,
    });
    verbose("v3 payload:", payloadStr.slice(0, 80) + "...");

    const signature = signPayload(payloadStr, this.identity.privateKeyPem);
    verbose("签名完成:", signature.slice(0, 16) + "...");

    // 3. 发 connect 帧
    const connectParams = {
      minProtocol: 4,
      maxProtocol: 4,
      client: {
        id: clientId,
        version: "bridge-node-0.1",
        platform,
        mode: clientMode,
      },
      role,
      scopes,
      auth: { token },
      device: {
        id: this.identity.deviceId,
        publicKey: publicKeyRawBase64Url(this.identity.publicKeyPem),
        signature,
        signedAt,
        nonce,
      },
    };

    const helloOk = await this.send("connect", connectParams);
    if (helloOk.type === "hello-ok" || helloOk.payload?.type === "hello-ok") {
      const p = helloOk.payload || helloOk;
      info("✓ 握手成功");
      verbose("  protocol:", p.protocol);
      verbose("  scopes:", JSON.stringify(p.auth?.scopes));
      // 持久化 deviceToken（如有）
      const dt = p.auth?.deviceToken;
      if (dt && dt !== this.identity.deviceToken) {
        this.identity.deviceToken = dt;
        try {
          fs.writeFileSync(IDENTITY_FILE, JSON.stringify(this.identity, null, 2), {
            mode: 0o600,
          });
          verbose("  已持久化 deviceToken");
        } catch (e) {
          /* 持久化失败不阻塞 */
        }
      }
      return;
    }
    throw new Error(
      `握手失败：${helloOk.error?.message || JSON.stringify(helloOk).slice(0, 200)}`
    );
  }

  // 发 RPC，返回 res payload（按 id 匹配）
  async send(method, params) {
    const id = crypto.randomUUID();
    const frame = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC 超时（30s）：${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve(msg);
        },
        reject: (e) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify(frame));
    });
  }

  // 内部：消息分发
  _onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : data.toString());
    } catch (e) {
      return;
    }
    // res（RPC 响应）
    if (msg.type === "res" && msg.id && this.pending.has(msg.id)) {
      this.pending.get(msg.id).resolve(msg);
      return;
    }
    // event（推送）
    if (msg.type === "event") {
      for (const h of this.eventHandlers) {
        try {
          h(msg);
        } catch (e) {
          /* 单个 handler 异常不影响其他 */
        }
      }
    }
  }

  // 等待满足条件的事件
  _waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("等待事件超时")), timeoutMs);
      const off = this.onEvent((msg) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          off();
          resolve(msg);
        }
      });
    });
  }

  async close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
  }
}

// ── 命令实现 ─────────────────────────────────────────────────

function cmdHelp() {
  console.log(`openclaw-bridge —— ZCode 的 OpenClaw 能力委派通道

【核心概念】联系人（contact）= 一个 OpenClaw 实例上的一个 agent。
  用名字指代，如 legion-main、mac-coding。\`contacts list\` 看全部。

【全局选项】
  -v, --verbose                 显示发出的完整指令 + 连接细节

【命令】
  help                                查看本帮助
  contacts                            列出所有联系人
  contacts list                       同上
  contacts add <name> <url> <token> <agent> [note]
  contacts remove <name>
  contacts rename <旧名> <新名>
  contacts test <contact>             测连通性

  talk <contact> <message>            与联系人对话
                                      · 默认保持会话（同 contact 连续对话带上下文）
                                      · 终端流式显示回复过程
                                      · 完整过程写入 transcript 日志
    --new                             强制开新会话
    --session <key>                   显式指定 sessionKey
  query <contact> <method> [params]   读操作（直放行）
  operate <contact> <method> [params] 写操作（需 --yes）

【示例】
  node bridge.mjs talk mac-main "查下今天的cron"
  node bridge.mjs talk legion-main "请审核这段代码" --session review-001
  node bridge.mjs query mac-main cron.list
  node bridge.mjs operate mac-main cron.add '{"name":"test"}' --yes
  node bridge.mjs talk -v mac-main "看完整连接细节"

【日志】对话过程写入 ~/.config/openclaw-bridge/transcript-<contact>-<日期>.log
【配置】~/.config/openclaw-bridge/contacts.json
【文档】协议/安全/排错见插件 references/`);
}

function cmdContacts(args) {
  const sub = args[0] || "list";
  if (sub === "list") {
    const d = loadContacts();
    if (!d) return 1;
    console.log("联系人（* = 默认）：");
    console.log(`  ${"名称".padEnd(14)} ${"url".padEnd(30)} ${"agent".padEnd(10)} 备注`);
    for (const [name, c] of Object.entries(d.contacts || {})) {
      const mark = name === d.default ? "*" : " ";
      console.log(
        `${mark} ${name.padEnd(12)} ${(c.url || "").padEnd(30)} ${(c.agent || "").padEnd(10)} ${c.note || ""}`
      );
    }
    return 0;
  }
  if (sub === "add") {
    const [name, url, token, agent, ...noteParts] = args.slice(1);
    const note = noteParts.join(" ");
    if (!name || !url || !token || !agent) {
      err("用法：contacts add <name> <url> <token> <agent> [note]");
      return 1;
    }
    const d = loadContacts();
    if (!d) return 1;
    if (d.contacts?.[name]) {
      err(`联系人已存在：${name}（如需更新请先 remove 再 add）`);
      return 1;
    }
    d.contacts = d.contacts || {};
    d.contacts[name] = { url, token, agent, note };
    saveContacts(d);
    info(`已新增联系人：${name}`);
    return 0;
  }
  if (sub === "remove") {
    const [name] = args.slice(1);
    if (!name) {
      err("用法：contacts remove <name>");
      return 1;
    }
    const d = loadContacts();
    if (!d) return 1;
    if (!d.contacts?.[name]) {
      err(`联系人不存在：${name}`);
      return 1;
    }
    delete d.contacts[name];
    if (d.default === name) d.default = "";
    saveContacts(d);
    info(`已删除联系人：${name}`);
    return 0;
  }
  if (sub === "rename") {
    const [oldName, newName] = args.slice(1);
    if (!oldName || !newName) {
      err("用法：contacts rename <旧名> <新名>");
      return 1;
    }
    const d = loadContacts();
    if (!d) return 1;
    if (!d.contacts?.[oldName]) {
      err(`联系人不存在：${oldName}`);
      return 1;
    }
    if (d.contacts[newName]) {
      err(`新名字已存在：${newName}`);
      return 1;
    }
    d.contacts[newName] = d.contacts[oldName];
    delete d.contacts[oldName];
    if (d.default === oldName) d.default = newName;
    saveContacts(d);
    info(`已改名：${oldName} → ${newName}`);
    return 0;
  }
  if (sub === "test") {
    const [contact] = args.slice(1);
    if (!contact) {
      err("用法：contacts test <contact>");
      return 1;
    }
    return cmdContactsTest(contact);
  }
  err(`未知子命令：contacts ${sub}（可用：list/add/remove/rename/test）`);
  return 1;
}

async function cmdContactsTest(contact) {
  const c = getContact(contact);
  if (!c) {
    err(`未知联系人：${contact}`);
    return 1;
  }
  console.log(`测试联系人：${contact}`);
  const identity = loadOrCreateIdentity();
  const client = new GatewayClient(identity);
  try {
    await client.connect(contact);
    console.log("ok，握手成功");
    if (c.agent) info(`配置的 agent=${c.agent}`);
    return 0;
  } catch (e) {
    err(e.message);
    if (e.message.includes("pair")) {
      info(`>>> 需要在 gateway 侧配对，deviceId: ${identity.deviceId}`);
    }
    return 1;
  } finally {
    await client.close();
  }
}

// 会话 key：默认复用（同 contact 连续对话）；--new 开新；--session 指定
function sessionKey(contact, agent, opts) {
  if (opts.new) return `agent:${agent}:bridge-${Date.now()}-${process.pid}`;
  if (opts.session) return opts.session;
  return `agent:${agent}:bridge:${contact}`;
}

async function cmdTalk(args, opts) {
  const [contact, ...msgParts] = args;
  const message = msgParts.join(" ");
  if (!contact || !message) {
    err('用法：talk <contact> <message> [--new] [--session <key>]');
    return 1;
  }
  const c = getContact(contact);
  if (!c) {
    err(`未知联系人：${contact}`);
    return 1;
  }
  const agent = c.agent;
  if (!agent) {
    err(`contact ${contact} 缺 agent`);
    return 1;
  }

  const identity = loadOrCreateIdentity();
  const client = new GatewayClient(identity);

  try {
    await client.connect(contact);
  } catch (e) {
    err("连接失败：", e.message);
    if (e.message.includes("pair")) {
      info(`>>> 需要在 gateway 侧配对，deviceId: ${identity.deviceId}`);
    }
    return 1;
  }

  const sk = sessionKey(contact, agent, opts);
  const idem = `bridge-${Date.now()}-${process.pid}`;

  // 终端 + 日志：记录发送
  console.error(`→ 发送给 ${contact} (${agent}): ${message}`);
  console.error(`→ session: ${sk}`);
  logTranscript(contact, `=== talk ${contact} ===`);
  logTranscript(contact, `[发送] ${message}`);
  logTranscript(contact, `[session] ${sk}`);

  // 发 chat.send
  let sendRes;
  try {
    sendRes = await client.send("chat.send", {
      sessionKey: sk,
      idempotencyKey: idem,
      message,
    });
  } catch (e) {
    err("chat.send 失败：", e.message);
    await client.close();
    return 1;
  }
  if (sendRes.ok === false) {
    err("chat.send 被拒：", sendRes.error?.message);
    await client.close();
    return 1;
  }
  // 注意：openclaw res 的结果在 payload 字段（不是 result）
  const result = sendRes.payload || sendRes.result || sendRes;
  const runId = result.runId || sendRes.runId;
  console.error(`→ runId: ${runId}`);
  logTranscript(contact, `[runId] ${runId}`);

  // 事件监听收回复（流式 + 工具过程）
  // agent 事件有多种 stream：lifecycle（开始/结束）/ assistant（文本）/ tool 等
  // 只关注 stream==="assistant" 的 data.text/data.delta，且按 runId 过滤
  const startTime = Date.now();
  const reply = await new Promise((resolve) => {
    let text = "";
    let streamStarted = false;
    let finalCount = 0;
    const off = client.onEvent((msg) => {
      const evt = msg.event;
      const p = msg.payload || {};
      // 只处理我们这个 run 的事件（按 runId 过滤，避免 active-memory 等干扰）
      if (p.runId && runId && p.runId !== runId) return;

      // 工具过程
      if (evt === "session.tool" || evt === "tool" || evt === "session.operation") {
        const toolName = p.name || p.tool || p.operation || p.stream || "?";
        console.error(`  [工具] ${toolName} ...`);
        logTranscript(contact, `[工具] ${toolName}`);
      }
      // agent 事件：stream==="assistant" 才是回复文本
      if (evt === "agent") {
        if (p.stream === "assistant" && p.data) {
          if (p.data.text) text = p.data.text; // 累积完整文本
          if (p.data.delta && !streamStarted) {
            // 首次 delta → 开始流式输出
            streamStarted = true;
            console.error("← 回复：");
          }
          if (p.data.delta && streamStarted) {
            process.stdout.write(p.data.delta);
          }
        }
      }
      // 完成（chat final）
      if (evt === "chat" && p.state === "final") {
        finalCount++;
        // 可能多个 final（active-memory 等），我们的 run 完成才算
        if (p.runId && runId && p.runId !== runId) return;
        off();
        if (!streamStarted) {
          console.error("← 回复：");
          console.log(text);
        } else {
          console.log(""); // 换行收尾
        }
        resolve(text);
      }
    });
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`← 完成 (${elapsed}s)`);
  logTranscript(contact, `[回复] ${reply}`);
  logTranscript(contact, `[完成] ${elapsed}s`);

  await client.close();
  return 0;
}

async function cmdQuery(args) {
  const [contact, method, ...paramsParts] = args;
  const paramsStr = paramsParts.join(" ");
  if (!contact || !method) {
    err("用法：query <contact> <method> [params-json]");
    return 1;
  }
  const c = getContact(contact);
  if (!c) {
    err(`未知联系人：${contact}`);
    return 1;
  }
  let params = {};
  if (paramsStr) {
    try {
      params = JSON.parse(paramsStr);
    } catch (e) {
      err("params JSON 格式错误：", e.message);
      return 1;
    }
  }
  info(`读操作：${contact}.${method}（直放行）`);
  const identity = loadOrCreateIdentity();
  const client = new GatewayClient(identity);
  try {
    await client.connect(contact);
    const res = await client.send(method, params);
    console.log(JSON.stringify(res.result ?? res, null, 2));
    return res.ok === false ? 1 : 0;
  } catch (e) {
    err(e.message);
    return 1;
  } finally {
    await client.close();
  }
}

async function cmdOperate(args, opts) {
  const [contact, method, ...paramsParts] = args;
  const paramsStr = paramsParts
    .filter((x) => x !== "--yes")
    .join(" ");
  if (!contact || !method) {
    err("用法：operate <contact> <method> [params-json] [--yes]");
    return 1;
  }
  const c = getContact(contact);
  if (!c) {
    err(`未知联系人：${contact}`);
    return 1;
  }
  let params = {};
  if (paramsStr) {
    try {
      params = JSON.parse(paramsStr);
    } catch (e) {
      err("params JSON 格式错误：", e.message);
      return 1;
    }
  }
  if (!opts.yes) {
    console.error(`⚠️  即将对 ${contact} 执行写操作：`);
    console.error(`    方法：${method}`);
    console.error(`    参数：${JSON.stringify(params)}`);
    console.error("确认执行请带 --yes。");
    return 1;
  }
  info(`写操作：${contact}.${method}（已确认）`);
  const identity = loadOrCreateIdentity();
  const client = new GatewayClient(identity);
  try {
    await client.connect(contact);
    const res = await client.send(method, params);
    console.log(JSON.stringify(res.result ?? res, null, 2));
    return res.ok === false ? 1 : 0;
  } catch (e) {
    err(e.message);
    return 1;
  } finally {
    await client.close();
  }
}

// ── CLI 入口 ─────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  // 摘除全局 -v / --verbose
  const filtered = [];
  for (const a of argv) {
    if (a === "-v" || a === "--verbose") VERBOSE = true;
    else filtered.push(a);
  }
  const cmd = filtered[0] || "help";
  const rest = filtered.slice(1);

  if (!ensureConfig()) return 1;

  const opts = {
    new: false,
    session: null,
    yes: false,
  };
  // 解析命令内选项
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--new") opts.new = true;
    else if (a === "--session") {
      opts.session = rest[++i];
    } else if (a === "--yes") opts.yes = true;
    else positional.push(a);
  }

  switch (cmd) {
    case "help":
    case "-h":
    case "--help":
      cmdHelp();
      return 0;
    case "contacts":
    case "contact":
      // contacts 的 test 子命令是 async，其余同步
      if (positional[0] === "test") {
        return await cmdContactsTest(positional[1]);
      }
      return cmdContacts(positional);
    case "talk":
      return await cmdTalk(positional, opts);
    case "query":
      return await cmdQuery(positional);
    case "operate":
      return await cmdOperate(positional, opts);
    default:
      err(`未知命令：${cmd}（运行 help 查看可用命令）`);
      return 1;
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  err("未捕获错误：", e.message);
  process.exit(1);
});

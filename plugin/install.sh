#!/usr/bin/env bash
# install.sh — 部署 openclaw-bridge 到 ZCode，或迁移到新机器
#
# 用法：
#   ./install.sh                 安装到 ~/.zcode/skills/（推荐）
#   ./install.sh --location zcode    同上（~/.zcode/skills/）
#   ./install.sh --location agents   装到 ~/.agents/skills/
#   ./install.sh --copy          拷贝而非软链（迁移到别的机器时用）
#   ./install.sh --uninstall     卸载（只删技能，保留 contacts.json）
#   ./install.sh --help

set -uo pipefail

# ── 颜色 ─────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi
ok()   { echo "${C_GREEN}✓${C_RESET} $*"; }
warn() { echo "${C_YELLOW}⚠${C_RESET} $*"; }
err()  { echo "${C_RED}✗${C_RESET} $*" >&2; }
info() { echo "→ $*"; }

# ── 路径 ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$SCRIPT_DIR/skills/openclaw-bridge"   # 自包含 skill 目录

SKILL_NAME="openclaw-bridge"
CONFIG_DIR="$HOME/.config/openclaw-bridge"
CONTACTS_FILE="$CONFIG_DIR/contacts.json"

# ── 参数解析 ─────────────────────────────────────────────────
LOCATION="zcode"   # zcode | agents
METHOD="link"       # link | copy
ACTION="install"
while [[ $# -gt 0 ]]; do
  arg="$1"
  case "$arg" in
    --location)   shift; [[ $# -gt 0 ]] && LOCATION="$1" ;;
    --location=*) LOCATION="${arg#--location=}" ;;
    --zcode)      LOCATION="zcode" ;;
    --agents)     LOCATION="agents" ;;
    --copy)       METHOD="copy" ;;
    --link)       METHOD="link" ;;
    --uninstall)  ACTION="uninstall" ;;
    --help|-h)    ACTION="help" ;;
    *) err "未知参数：$arg"; exit 1 ;;
  esac
  shift
done

if [[ "$ACTION" == "help" ]]; then
  sed -n '2,11p' "${BASH_SOURCE[0]}"
  exit 0
fi

# 确定目标路径
case "$LOCATION" in
  zcode)  TARGET_DIR="$HOME/.zcode/skills" ;;
  agents) TARGET_DIR="$HOME/.agents/skills" ;;
  *) err "未知 location：${LOCATION}（可选 zcode / agents）"; exit 1 ;;
esac
TARGET="$TARGET_DIR/$SKILL_NAME"

# ── 卸载 ─────────────────────────────────────────────────────
if [[ "$ACTION" == "uninstall" ]]; then
  info "卸载 openclaw-bridge..."
  for d in "$HOME/.zcode/skills/$SKILL_NAME" "$HOME/.agents/skills/$SKILL_NAME"; do
    if [[ -d "$d" ]] || [[ -L "$d" ]]; then
      rm -rf "$d" && ok "已删除 $d"
    fi
  done
  if [[ -f "$CONTACTS_FILE" ]]; then
    warn "已保留配置：${CONTACTS_FILE}（如需彻底删除请手动 rm）"
  fi
  echo "卸载完成。重启 ZCode 会话以刷新技能列表。"
  exit 0
fi

# ── 前置检查 ─────────────────────────────────────────────────
echo "openclaw-bridge 安装"
echo "────────────────────"

if [[ ! -d "$SKILL_SRC" ]]; then
  err "找不到 skill 源目录：$SKILL_SRC"
  err "请确认 install.sh 在 plugin/ 目录下运行。"
  exit 1
fi

# node 18+（必需，且唯一运行时依赖）
# Node 版 bridge.mjs 用 Node 内置 crypto(ed25519) + WebSocket 直连，零 npm 依赖，
# 不再需要 python3 或 openclaw CLI。
# 注意：ZCode 是 Electron 应用，内部自带 node，但不会暴露到系统 PATH。
# 插件脚本用 node 命令时找的是 PATH 里的 node，因此需要单独安装。
if command -v node >/dev/null 2>&1; then
  nv="$(node --version 2>&1)"
  # 检查版本 ≥ 18（ed25519 原生支持需要）
  major="$(echo "$nv" | sed 's/v//;s/\..*//')"
  if [ "${major:-0}" -lt 18 ] 2>/dev/null; then
    err "node 版本过低：${nv}（需要 18+）"
    exit 1
  fi
  ok "node：${nv}（≥18 ✓）"
else
  err "未找到 node"
  echo "  openclaw-bridge 需要 node 18+（唯一运行时依赖）。"
  echo "  ⚠️ 注意：ZCode 虽是 Electron 应用（内部自带 node），但不会把 node 暴露到系统 PATH。"
  echo "     插件脚本调用 node 时找的是 PATH，所以必须单独安装。"
  echo "  安装方式（任选其一）："
  echo "    macOS:   brew install node"
  echo "    Linux:   sudo apt install nodejs  或  使用 nvm"
  echo "    Windows: https://nodejs.org 下载 LTS 安装包"
  echo "    通用:    使用 nvm（推荐）：https://github.com/nvm-sh/nvm"
  echo "  安装后重新运行本脚本。"
  exit 1
fi

info "部署：${SKILL_SRC} → ${TARGET}（${METHOD}）"

# ── 安装技能 ─────────────────────────────────────────────────
mkdir -p "$TARGET_DIR"
# 先清旧的同名（可能是旧的软链或拷贝）
rm -rf "$TARGET" 2>/dev/null

if [[ "$METHOD" == "link" ]]; then
  ln -sfn "$SKILL_SRC" "$TARGET" && ok "已软链 $TARGET → $SKILL_SRC"
  warn "软链模式：源码改动即时生效。迁移到别的机器请用 --copy。"
else
  cp -R "$SKILL_SRC" "$TARGET" && ok "已拷贝到 $TARGET"
fi

# ── 配置文件 ─────────────────────────────────────────────────
if [[ -f "$CONTACTS_FILE" ]]; then
  ok "配置已存在，保留：$CONTACTS_FILE"
else
  info "首次安装，从模板创建配置..."
  mkdir -p "$CONFIG_DIR"
  if [[ -f "$SKILL_SRC/scripts/contacts.template.json" ]]; then
    cp "$SKILL_SRC/scripts/contacts.template.json" "$CONTACTS_FILE"
    chmod 600 "$CONTACTS_FILE"
    ok "已创建 $CONTACTS_FILE"
    warn "请编辑此文件，填入你的 OpenClaw 实例（url/token/agent）"
  else
    err "找不到模板：$SKILL_SRC/scripts/contacts.template.json"
  fi
fi

# ── 自检 ─────────────────────────────────────────────────────
echo ""
info "自检：测试 bridge.mjs..."
BRIDGE="$TARGET/scripts/bridge.mjs"
if node "$BRIDGE" help >/dev/null 2>&1; then
  ok "bridge.mjs help 正常"
else
  err "bridge.mjs 自检失败"
  exit 1
fi

echo ""
info "已配置的联系人："
node "$BRIDGE" contacts 2>&1 | sed 's/^/  /'

default_contact="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONTACTS_FILE','utf8')).default||'')" 2>/dev/null)"
if [[ -n "$default_contact" ]]; then
  echo ""
  info "测试默认联系人 ${default_contact} 连通性..."
  if node "$BRIDGE" contacts test "$default_contact" >/dev/null 2>&1; then
    ok "${default_contact} 连通正常"
  else
    warn "${default_contact} 暂不可达（可能 gateway 未运行，或需配对设备/配置实例地址）"
  fi
fi

echo ""
ok "安装完成！"
echo ""
echo "⚠️  重要：需要【重启 ZCode 会话】才能让它发现新装的技能。"
echo "    重启后，新会话的系统提示里应出现 openclaw-bridge 技能。"
echo ""
echo "使用："
echo "  在 ZCode 中直接用自然语言（如\"跟 legion 对话\"\"查 mac 的 cron\"\"让工作虾审下代码\"）"
echo "  或输入 /skill openclaw-bridge 强制加载。"
echo ""
echo "直接命令行调用："
echo "  node \"$BRIDGE\" help              查看所有命令"
echo "  node \"$BRIDGE\" contacts          查看联系人"
echo "  node \"$BRIDGE\" talk <联系人> \"消息\"   与 OpenClaw 对话（流式显示回复）"
echo ""
echo "首次连接新 gateway：需在 gateway 侧 approve 设备一次（详见 references/deployment.md）"

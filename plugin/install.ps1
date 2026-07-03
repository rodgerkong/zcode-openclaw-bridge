# install.ps1 — 部署 openclaw-bridge 到 ZCode（Windows PowerShell 版）
# 与 install.sh 功能 1:1 对应，供 Windows 用户使用。
#
# 用法：
#   ./install.ps1                          安装到 $env:USERPROFILE\.zcode\skills\（推荐）
#   ./install.ps1 -Location zcode          同上
#   ./install.ps1 -Location agents         装到 $env:USERPROFILE\.agents\skills\
#   ./install.ps1 -Copy                    拷贝而非软链（迁移到别的机器时用）
#   ./install.ps1 -Uninstall               卸载（只删技能，保留 contacts.json）
#   Get-Help ./install.ps1                 查看帮助

#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet("zcode","agents")][string]$Location = "zcode",
    [switch]$Copy,
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# 让控制台用 UTF-8 显示，避免中文 Windows (GBK 控制台) 下中文乱码
# 仅作用于当前进程，不修改用户系统设置
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 > $null } catch {}

# ── 输出辅助（用 ASCII 标记，避免 PS 5.1 中文 Windows 字体不渲染 Unicode 图标）──
function Write-Ok   { param([string]$Msg) Write-Host "[OK] $Msg" -ForegroundColor Green }
function Write-Warn2{ param([string]$Msg) Write-Host "[!]  $Msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$Msg) Write-Host "[X]  $Msg" -ForegroundColor Red }
function Write-Info { param([string]$Msg) Write-Host " -> $Msg" }

# ── 帮助 ─────────────────────────────────────────────────────
if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

# ── 路径 ─────────────────────────────────────────────────────
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillSrc     = Join-Path $ScriptDir "skills\openclaw-bridge"
$SkillName    = "openclaw-bridge"
$ConfigDir    = Join-Path $env:USERPROFILE ".config\openclaw-bridge"
$ContactsFile = Join-Path $ConfigDir "contacts.json"

# 软链 vs 拷贝（默认软链，-Copy 切换为拷贝）
$Method = if ($Copy) { "copy" } else { "link" }

# ── 卸载 ─────────────────────────────────────────────────────
if ($Uninstall) {
    Write-Info "卸载 openclaw-bridge..."
    foreach ($base in @(
        (Join-Path $env:USERPROFILE ".zcode\skills\$SkillName"),
        (Join-Path $env:USERPROFILE ".agents\skills\$SkillName")
    )) {
        if (Test-Path $base) {
            Remove-Item -Recurse -Force $base
            Write-Ok "已删除 $base"
        }
    }
    if (Test-Path $ContactsFile) {
        Write-Warn2 "已保留配置：$ContactsFile（如需彻底删除请手动 Remove-Item）"
    }
    Write-Host "卸载完成。重启 ZCode 会话以刷新技能列表。"
    exit 0
}

# ── 前置检查 ─────────────────────────────────────────────────
Write-Host "openclaw-bridge 安装"
Write-Host "────────────────────"

if (-not (Test-Path $SkillSrc)) {
    Write-Err "找不到 skill 源目录：$SkillSrc"
    Write-Err "请确认 install.ps1 在 plugin\ 目录下运行。"
    exit 1
}

# node 18+（必需，且唯一运行时依赖）
# 与 install.sh 同理：ZCode 自带 node 不暴露 PATH，需单独安装。
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "未找到 node"
    Write-Host "  openclaw-bridge 需要 node 18+（唯一运行时依赖）。"
    Write-Host "  [!] 注意：ZCode 虽是 Electron 应用（内部自带 node），但不会把 node 暴露到系统 PATH。"
    Write-Host "     插件脚本调用 node 时找的是 PATH，所以必须单独安装。"
    Write-Host "  安装方式："
    Write-Host "    Windows: https://nodejs.org 下载 LTS 安装包"
    Write-Host "    通用:    使用 nvm-windows：https://github.com/coreybutler/nvm-windows"
    Write-Host "  安装后重新运行本脚本。"
    exit 1
}

$nv = (node --version 2>&1) -as [string]
$majorStr = $nv -replace '^v','' -replace '\..*$',''
$major = 0
if (-not [int]::TryParse($majorStr, [ref]$major)) { $major = 0 }
if ($major -lt 18) {
    Write-Err "node 版本过低：$nv（需要 18+）"
    exit 1
}
Write-Ok "node：$nv（>=18 OK）"

# 确定目标路径
$TargetDir = switch ($Location) {
    "zcode"  { Join-Path $env:USERPROFILE ".zcode\skills" }
    "agents" { Join-Path $env:USERPROFILE ".agents\skills" }
}
$Target = Join-Path $TargetDir $SkillName

Write-Info "部署：$SkillSrc -> $Target（$Method）"

# ── 安装技能 ─────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
# 先清旧的同名（可能是旧的软链或拷贝）
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }

if ($Method -eq "link") {
    # Windows 软链需要开发者模式或管理员权限；失败则回退到拷贝
    try {
        New-Item -ItemType SymbolicLink -Path $Target -Target $SkillSrc | Out-Null
        Write-Ok "已软链 $Target -> $SkillSrc"
        Write-Warn2 "软链模式：源码改动即时生效。迁移到别的机器请用 -Copy。"
        Write-Warn2 "（若软链异常，改用 -Copy 拷贝安装）"
    } catch {
        Write-Warn2 "创建软链失败（可能未开启开发者模式/未管理员运行），回退为拷贝..."
        Copy-Item -Recurse -Force $SkillSrc $Target
        Write-Ok "已拷贝到 $Target"
    }
} else {
    Copy-Item -Recurse -Force $SkillSrc $Target
    Write-Ok "已拷贝到 $Target"
}

# ── 配置文件 ─────────────────────────────────────────────────
if (Test-Path $ContactsFile) {
    Write-Ok "配置已存在，保留：$ContactsFile"
} else {
    Write-Info "首次安装，从模板创建配置..."
    New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
    $template = Join-Path $SkillSrc "scripts\contacts.template.json"
    if (Test-Path $template) {
        Copy-Item -Force $template $ContactsFile
        Write-Ok "已创建 $ContactsFile"
        Write-Warn2 "请编辑此文件，填入你的 OpenClaw 实例（url/token/agent）"
    } else {
        Write-Err "找不到模板：$template"
    }
}

# ── 自检 ─────────────────────────────────────────────────────
Write-Host ""
Write-Info "自检：测试 bridge.mjs..."
$Bridge = Join-Path $Target "scripts\bridge.mjs"
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$helpOut = node $Bridge help 2>&1
$ErrorActionPreference = $prevEAP
if ($LASTEXITCODE -eq 0) {
    Write-Ok "bridge.mjs help 正常"
} else {
    Write-Err "bridge.mjs 自检失败"
    Write-Host $helpOut
    exit 1
}

Write-Host ""
Write-Info "已配置的联系人："
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$contactsOut = node $Bridge contacts 2>&1
$ErrorActionPreference = $prevEAP
$contactsOut | ForEach-Object { Write-Host "  $_" }

# 调用原生命令（node）时局部降级 EAP：PS 5.1 下 EAP=Stop 会把 node 写到 stderr
# 的进度日志升级为 terminating error，流重定向(*> $null)无法阻止（在 EAP 检查之后）。
# 仅在这一段临时降级，脚本其余部分仍保持 Stop 语义。
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$defaultContact = node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).default||'')" $ContactsFile 2>$null
$ErrorActionPreference = $prevEAP
if ($defaultContact) {
    Write-Host ""
    Write-Info "测试默认联系人 $defaultContact 连通性..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    node $Bridge contacts test $defaultContact *> $null
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "$defaultContact 连通正常"
    } else {
        Write-Warn2 "$defaultContact 暂不可达（可能 gateway 未运行，或需配对设备/配置实例地址）"
    }
}

# ── 完成 ─────────────────────────────────────────────────────
Write-Host ""
Write-Ok "安装完成！"
Write-Host ""
Write-Host "[!]  重要：需要【重启 ZCode 会话】才能让它发现新装的技能。"
Write-Host "    重启后，新会话的系统提示里应出现 openclaw-bridge 技能。"
Write-Host ""
Write-Host "使用："
Write-Host "  在 ZCode 中直接用自然语言（如""跟 openclaw 对话""""查 cron""）"
Write-Host "  或输入 /skill openclaw-bridge 强制加载。"
Write-Host ""
Write-Host "直接命令行调用："
Write-Host "  node `"$Bridge`" help              查看所有命令"
Write-Host "  node `"$Bridge`" contacts          查看联系人"
Write-Host "  node `"$Bridge`" talk <联系人> ""消息""   与 OpenClaw 对话（流式显示回复）"
Write-Host ""
Write-Host "首次连接新 gateway：需在 gateway 侧 approve 设备一次（详见 references/deployment.md）"

# 显式返回成功：连通性探测是 best-effort，其失败不应污染脚本退出码（影响 CI/自动化判断）
exit 0

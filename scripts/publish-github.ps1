param(
    [string]$Repository = 'huckhuck12/relic-echo'
)

# 预期失败的原生命令由 LASTEXITCODE 判定，避免 Windows PowerShell 将 stderr 提前抛出。
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot) -ErrorAction Stop

# 在用户自己的终端执行：代理工作区可能只允许读取 .git，且无法连接 GitHub。
# 不打印令牌，不强制推送；远端有冲突时保留双方内容并停止。
function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed (exit $LASTEXITCODE). Fix the reported error and run this script again."
    }
}

if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'Repository must be owner/name.'
}
Get-Command git, gh, npm -ErrorAction Stop | Out-Null
& gh auth status
if ($LASTEXITCODE -ne 0) {
    throw 'Sign in first: gh auth login --hostname github.com --web --git-protocol https --scopes workflow'
}
Invoke-Checked gh @('auth', 'setup-git', '--hostname', 'github.com')

Invoke-Checked npm @('run', 'format:check')
Invoke-Checked npm @('test')
Invoke-Checked npm @('run', 'build:pages')

if (-not (Test-Path -LiteralPath '.git')) {
    Invoke-Checked git @('init', '-b', 'main')
}
$branch = & git symbolic-ref --short HEAD
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
    throw 'Switch to the main branch before publishing.'
}
$url = "https://github.com/$Repository.git"
$remote = & git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    Invoke-Checked git @('remote', 'add', 'origin', $url)
} elseif ($remote -ne $url) {
    throw "origin already points to $remote. Check the target repository before continuing."
}
Invoke-Checked git @('add', '.github', '.editorconfig', '.gitignore', 'README.md', 'TODO.md', 'docs', 'src', 'tests', 'scripts', 'bench', 'vendor', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json')
& git diff --cached --quiet
$diffExit = $LASTEXITCODE
if ($diffExit -eq 1) {
    Invoke-Checked git @('commit', '-m', 'Prepare Relic Echo game and GitHub Pages deployment')
} elseif ($diffExit -ne 0) {
    throw 'Could not inspect staged changes.'
}
Invoke-Checked git @('push', '-u', 'origin', 'main')

# 使用用户 gh 登录的仓库管理权限启用 Pages；工作流本身只保留部署所需权限。
& gh api "repos/$Repository/pages" --silent 2>$null
if ($LASTEXITCODE -eq 0) {
    Invoke-Checked gh @('api', '--method', 'PUT', "repos/$Repository/pages", '-f', 'build_type=workflow', '--silent')
} else {
    Invoke-Checked gh @('api', '--method', 'POST', "repos/$Repository/pages", '-f', 'build_type=workflow', '--silent')
}
# 推送时 Pages 可能尚未启用；配置后再触发一次，确保首次发布会执行。
Invoke-Checked gh @('workflow', 'run', 'pages.yml', '--repo', $Repository, '--ref', 'main')
Write-Host "Deployment started: https://github.com/$Repository/actions"
Write-Host 'Wait for build and deploy to succeed; the Pages URL appears in the deployment result.'

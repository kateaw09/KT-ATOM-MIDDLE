[CmdletBinding()]
param(
    [string]$Action = ""
)

$ErrorActionPreference = "Stop"
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IdeDir = Split-Path -Parent $AppDir
$RootDir = Split-Path -Parent $IdeDir
$PidFile = Join-Path $AppDir ".local-ide.pid"
$LogFile = Join-Path $AppDir ".local-ide.log"
$Port = 3080

function Test-NodeInstalled {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "[ERR] ไม่พบ Node.js (>= v18) กรุณาติดตั้งจาก https://nodejs.org/" -ForegroundColor Red
        return $false
    }
    return $true
}

function Invoke-SetupDeps {
    if (-not (Test-NodeInstalled)) { return $false }
    Push-Location $AppDir
    try {
        if (-not (Test-Path (Join-Path $AppDir "node_modules\vite\package.json"))) {
            $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
            if ($npmCmd) {
                Write-Host "[INFO] กำลังติดตั้ง Vite และ npm dependencies..." -ForegroundColor Cyan
                & $npmCmd.Source install --no-audit --no-fund
            }
        }
        node (Join-Path $AppDir "setup-deps.js")
        return ($LASTEXITCODE -eq 0)
    } finally {
        Pop-Location
    }
}

function Stop-IdeServer {
    if (Test-Path $PidFile) {
        $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($procId) {
            Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
            Write-Host "[OK] ปิดเซิร์ฟเวอร์ KT Middle IDE (PID $procId) แล้ว" -ForegroundColor Green
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }

    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $listeners) {
            if ($conn.OwningProcess -gt 0) {
                $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                if ($proc -and $proc.ProcessName -eq "node") {
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    Write-Host "[OK] หยุดโปรเซส Node.js บนพอร์ต $Port (PID $($proc.Id)) แล้ว" -ForegroundColor Green
                }
            }
        }
    } catch {}
}

function Start-IdeServer {
    if (-not (Invoke-SetupDeps)) { return }
    Stop-IdeServer
    Write-Host "[INFO] กำลังเปิด KT Middle IDE (Node.js) บนพอร์ต $Port ..." -ForegroundColor Cyan
    $proc = Start-Process -FilePath "node" `
        -ArgumentList "`"$(Join-Path $AppDir 'server.js')`"" `
        -WorkingDirectory $AppDir `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError "$LogFile.err" `
        -PassThru `
        -WindowStyle Hidden
    $proc.Id | Out-File -FilePath $PidFile -Encoding ascii
    Start-Sleep -Seconds 1
    Write-Host "[OK] KT Middle IDE พร้อมใช้งานที่ http://localhost:$Port (PID: $($proc.Id))" -ForegroundColor Green
    Start-Process "http://localhost:$Port"
}

function Show-Status {
    Write-Host "=== สถานะ KT Middle IDE (Native Node.js) ===" -ForegroundColor Cyan
    if (Test-NodeInstalled) {
        $ver = node -v
        Write-Host "Node.js        : $ver" -ForegroundColor Green
    }
    if (Test-Path $PidFile) {
        $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
        $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "IDE Server     : RUNNING (PID $procId) -> http://localhost:$Port" -ForegroundColor Green
        } else {
            Write-Host "IDE Server     : STOPPED (stale PID file)" -ForegroundColor Yellow
        }
    } else {
        $listening = $false
        try {
            $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
            if ($listeners) { $listening = $true }
        } catch {}
        if ($listening) {
            Write-Host "IDE Server     : RUNNING on port $Port -> http://localhost:$Port" -ForegroundColor Green
        } else {
            Write-Host "IDE Server     : STOPPED" -ForegroundColor Gray
        }
    }

    $versionsDir = Join-Path $RootDir ".kt-versions"
    if (Test-Path $versionsDir) {
        $count = (Get-ChildItem -Path $versionsDir -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "Version Store  : $versionsDir ($count commits)" -ForegroundColor Cyan
    }

    if (Test-Path $LogFile) {
        Write-Host "--- Recent Logs ---" -ForegroundColor Cyan
        Get-Content $LogFile -Tail 15 -ErrorAction SilentlyContinue
    }
}

function Show-Menu {
    while ($true) {
        Write-Host ""
        Write-Host "=====================================================" -ForegroundColor Cyan
        Write-Host "   KT Middle IDE — Native Node.js Manager" -ForegroundColor Cyan
        Write-Host "=====================================================" -ForegroundColor Cyan
        Write-Host " [1] ติดตั้ง Dependencies & เปิดใช้งาน IDE (Start & Open)"
        Write-Host " [2] เปิดใช้งาน IDE ทันที (Start Background & Open Browser)"
        Write-Host " [3] ตรวจสอบสถานะและดู Logs (Status & Logs)"
        Write-Host " [4] ปิดการทำงาน IDE (Stop Server)"
        Write-Host " [5] ตรวจสอบ / ติดตั้ง Arduino CLI (Run Setup)"
        Write-Host " [0] ออกจากโปรแกรม"
        Write-Host "=====================================================" -ForegroundColor Cyan
        $choice = Read-Host "เลือกหมายเลขคำสั่ง"
        switch ($choice) {
            "1" { Start-IdeServer }
            "2" { Start-IdeServer }
            "3" { Show-Status }
            "4" { Stop-IdeServer }
            "5" { Invoke-SetupDeps | Out-Null }
            "0" { return }
            default { Write-Host "กรุณาเลือกเลข 0-5" -ForegroundColor Yellow }
        }
    }
}

switch ($Action.ToLower()) {
    "setup"  { Invoke-SetupDeps | Out-Null }
    "install"{ Invoke-SetupDeps | Out-Null }
    "start"  { Start-IdeServer }
    "local"  { Start-IdeServer }
    "status" { Show-Status }
    "stop"   { Stop-IdeServer }
    default  { Show-Menu }
}

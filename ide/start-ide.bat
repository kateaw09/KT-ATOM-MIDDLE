@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0app"

set "OFFLINE_FLAG="
if /i "%~1"=="--offline" set "OFFLINE_FLAG=--offline"
set "SERVER_ARGS="
if /i "%~1"=="--prod" set "SERVER_ARGS=--prod"
if /i "%~1"=="--offline" set "SERVER_ARGS=--prod"

echo =====================================================
echo   KT Middle IDE — Native Node.js 1-Click Launcher
echo =====================================================

where node >nul 2>nul
if errorlevel 1 (
    echo [ERR] ไม่พบ Node.js ในเครื่องนี้ ^(ต้องใช้ Node.js v18 ขึ้นไป^)
    echo       กรุณาดาวน์โหลดและติดตั้งจาก https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\vite\package.json" (
    if exist "dist\index.html" (
        echo [INFO] ไม่พบ node_modules/vite แต่พบชุดไฟล์ Offline ^(dist^) — เปิดใช้งานโหมด Offline 100%% ทันที
        set "SERVER_ARGS=--prod"
    ) else if exist "package.json" (
        echo [INFO] กำลังติดตั้ง Vite และ Dependencies ผ่าน npm...
        call npm.cmd install --no-audit --no-fund
        if errorlevel 1 (
            if exist "dist\index.html" (
                echo [WARN] ติดตั้ง npm ไม่สำเร็จ — สลับไปใช้ชุดไฟล์ Offline ^(dist^) แทน
                set "SERVER_ARGS=--prod"
            ) else (
                echo [ERR] ติดตั้ง npm dependencies ไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ตในครั้งแรก
                pause
                exit /b 1
            )
        )
    )
)

echo [INFO] กำลังตรวจสอบสภาพแวดล้อมและ Arduino CLI...
node setup-deps.js %OFFLINE_FLAG%
if errorlevel 1 (
    echo [WARN] การตรวจสอบสภาพแวดล้อมมีคำเตือน — กำลังเปิด IDE ในโหมด Offline ต่อไป...
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\manage-ide.ps1" stop >nul 2>nul

echo.
echo [INFO] กำลังเปิด KT Middle IDE ที่ http://localhost:3080 %SERVER_ARGS% ...
echo        กด Ctrl+C ในหน้าต่างนี้เพื่อปิดเซิร์ฟเวอร์
echo.
start "" /b powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3080'"
node server.js %SERVER_ARGS%

pause

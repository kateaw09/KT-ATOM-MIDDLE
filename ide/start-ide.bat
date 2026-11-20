@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0app"

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

if exist "package.json" (
    if not exist "node_modules\vite\package.json" (
        echo [INFO] กำลังติดตั้ง Vite และ Dependencies ผ่าน npm...
        call npm.cmd install --no-audit --no-fund
        if errorlevel 1 (
            echo [ERR] ติดตั้ง npm dependencies ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตในครั้งแรก
            pause
            exit /b 1
        )
    )
)

echo [INFO] กำลังตรวจสอบสภาพแวดล้อมและ Arduino CLI...
node setup-deps.js
if errorlevel 1 (
    echo [ERR] การตรวจสอบสภาพแวดล้อมล้มเหลว
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\manage-ide.ps1" stop >nul 2>nul

echo.
echo [INFO] กำลังเปิด KT Middle IDE ที่ http://localhost:3080 ...
echo        กด Ctrl+C ในหน้าต่างนี้เพื่อปิดเซิร์ฟเวอร์
echo.
start "" /b powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3080'"
node server.js

pause

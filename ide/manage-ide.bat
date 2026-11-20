@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\manage-ide.ps1" %*
if "%~1"=="" pause

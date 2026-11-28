@echo off
chcp 65001 >nul
title MINIPOS AI - Backend Server & Web POS

echo ================================================================
echo   ⚡ MINIPOS AI - ระบบขายหน้าร้านอัจฉริยะ (Smart POS & AI Brain)
echo ================================================================
echo.

REM ค้นหา Python ในเครื่อง
set "PYTHON_CMD="

if exist "%LOCALAPPDATA%\Python\bin\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Python\bin\python.exe"
) else (
    where python >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_CMD=python"
    ) else (
        where py >nul 2>nul
        if not errorlevel 1 (
            set "PYTHON_CMD=py"
        )
    )
)

if "%PYTHON_CMD%"=="" (
    echo [ERROR] ไม่พบ Python ในเครื่อง กรุณาติดตั้ง Python 3 ก่อนใช้งาน
    echo ดาวน์โหลดได้ที่: https://www.python.org/
    echo.
    pause
    exit /b 1
)

echo [1/2] กำลังเปิดเว็บเบราว์เซอร์...
start "" "http://localhost:8000"

echo [2/2] กำลังเริ่มทำงาน Backend Server (SQLite Database)...
echo.
"%PYTHON_CMD%" -B "%~dp0server.py"

echo.
pause

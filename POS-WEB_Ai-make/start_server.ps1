# -*- coding: utf-8 -*-
# MINIPOS AI - PowerShell Launcher

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  ⚡ MINIPOS AI - ระบบขายหน้าร้านอัจฉริยะ (Smart POS & AI Brain)" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$pythonExe = "$env:LOCALAPPDATA\Python\bin\python.exe"
if (-not (Test-Path $pythonExe)) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        $pythonExe = $cmd.Source
    } else {
        $cmdPy = Get-Command py -ErrorAction SilentlyContinue
        if ($cmdPy) { $pythonExe = $cmdPy.Source }
    }
}

if (-not (Test-Path $pythonExe)) {
    Write-Host "[ERROR] ไม่พบ Python ในเครื่อง กรุณาติดตั้ง Python 3 ก่อนใช้งาน" -ForegroundColor Red
    pause
    exit
}

Write-Host "[1/2] กำลังเปิดเว็บเบราว์เซอร์ไปที่ http://localhost:8000 ..." -ForegroundColor Green
Start-Process "http://localhost:8000"

Write-Host "[2/2] เริ่มต้น Backend Server (SQLite Database)..." -ForegroundColor Green
Write-Host ""
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& $pythonExe -B "$scriptDir\server.py"

# FNC ERP — Start development environment
# Run this script once before `pnpm dev`

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

Write-Host "=== FNC ERP Dev Startup ===" -ForegroundColor Cyan

# 1. Start Redis if not already running
$redisUp = Test-NetConnection -ComputerName localhost -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue 2>$null
if (-not $redisUp) {
    Write-Host "Starting Redis..." -ForegroundColor Yellow
    $redisExe = "$env:USERPROFILE\redis\redis-server.exe"
    $redisConf = "$env:USERPROFILE\redis\redis.conf"
    if (Test-Path $redisExe) {
        Start-Process -FilePath $redisExe -ArgumentList $redisConf -WindowStyle Hidden
        Start-Sleep -Seconds 2
        Write-Host "Redis started on port 6379" -ForegroundColor Green
    } else {
        Write-Warning "redis-server.exe not found at $redisExe"
    }
} else {
    Write-Host "Redis already running on port 6379" -ForegroundColor Green
}

# 2. Check Postgres
$pgUp = Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue 2>$null
if ($pgUp) {
    Write-Host "PostgreSQL running on port 5432" -ForegroundColor Green
} else {
    Write-Warning "PostgreSQL not detected on port 5432 — check service 'postgresql-x64-18'"
}

Write-Host ""
Write-Host "Ready. Run: pnpm dev" -ForegroundColor Cyan